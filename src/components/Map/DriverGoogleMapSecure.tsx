import { useEffect, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { decode } from '@googlemaps/polyline-codec';

type LatLng = { lat: number; lng: number };

type DriverGoogleMapSecureProps = {
  driver: LatLng;
  dropoff: LatLng;
  // Bump this (e.g. from a NAVIGATE button) to force follow mode back on and snap to the driver.
  followTrigger?: number;
};

const REFETCH_INTERVAL_MS = 30000; // don't hit Directions more than once per 30s
const DEVIATION_THRESHOLD_M = 150; // refetch early if the driver strays this far off the drawn route
const FOLLOW_ZOOM = 17; // close-in Bolt/Uber driving zoom
// Fraction of the map viewport height to shift the center north by, so the driver marker sits
// toward the bottom of the screen (like Bolt/Uber) instead of dead-center.
const BOTTOM_BIAS_FRACTION = 0.18;

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nearest-vertex distance to the drawn path - a cheap approximation of "has the driver left the route".
function distanceToPath(point: LatLng, path: LatLng[]): number {
  if (path.length === 0) return Infinity;
  let min = Infinity;
  for (const p of path) {
    const d = haversineMeters(point, p);
    if (d < min) min = d;
  }
  return min;
}

// Simple heading estimate between two consecutive fixes - fine over the short hops between GPS
// ticks (not a great-circle bearing, but that's what was asked for and it looks right on screen).
function computeBearing(from: LatLng, to: LatLng): number {
  return (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180) / Math.PI;
}

// Directions are fetched through /api/directions (a Vercel serverless function) so the Google
// Directions server key never reaches the browser - only the restricted browser (Maps JS) key does.
export default function DriverGoogleMapSecure({ driver, dropoff, followTrigger }: DriverGoogleMapSecureProps) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });
  const [path, setPath] = useState<LatLng[]>([]);
  const [eta, setEta] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [bearing, setBearing] = useState(0);
  const [followMode, setFollowMode] = useState(true);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverRef = useRef(driver);
  const prevDriverRef = useRef<LatLng | null>(null);
  const pathRef = useRef<LatLng[]>([]);
  const lastFetchAtRef = useRef(0);
  const lastFetchOriginRef = useRef<LatLng | null>(null);

  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  // Bolt-style follow camera: recenter (biased toward the bottom of the screen) and zoom in tight
  // on every driver GPS update, unless the driver has manually dragged the map away.
  const followDriver = (pos: LatLng) => {
    const map = mapRef.current;
    if (!map) return;
    map.panTo(pos);
    if ((map.getZoom() ?? 0) < FOLLOW_ZOOM) map.setZoom(FOLLOW_ZOOM);
    const div = map.getDiv();
    const offsetPx = (div.clientHeight || 600) * BOTTOM_BIAS_FRACTION;
    window.setTimeout(() => map.panBy(0, -offsetPx), 0);
  };

  useEffect(() => {
    if (!driver) return;
    const prev = prevDriverRef.current;
    if (prev && (prev.lat !== driver.lat || prev.lng !== driver.lng)) {
      setBearing(computeBearing(prev, driver));
    }
    prevDriverRef.current = driver;
    if (followMode) followDriver(driver);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.lat, driver.lng, followMode]);

  // NAVIGATE button (or anything else) can force follow mode back on and snap to the driver now.
  useEffect(() => {
    if (!followTrigger) return;
    setFollowMode(true);
    followDriver(driverRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followTrigger]);

  const fetchDirections = (origin: LatLng, destination: LatLng) => {
    lastFetchAtRef.current = Date.now();
    lastFetchOriginRef.current = origin;
    fetch(`/api/directions?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.polyline) {
          const decoded = decode(d.polyline).map(([lat, lng]: [number, number]) => ({ lat, lng }));
          setPath(decoded);
          if (d.distance && d.duration) setEta({ distanceText: d.distance.text, durationText: d.duration.text });
          console.log('ROUTE LIVE', decoded.length + 'pts');
        } else {
          setPath([origin, destination]); // fallback 2pts straight - Directions call failed
        }
      })
      .catch((err) => {
        console.error('Directions fetch failed:', err);
        setPath([origin, destination]); // fallback 2pts straight
      });
  };

  // Fetch once at trip start (or whenever the dropoff/target changes), then only every 30s on a
  // timer, or immediately if the driver has strayed off the currently-drawn route - never on
  // every 5s GPS tick, to keep Directions API calls to a minimum.
  useEffect(() => {
    if (!driver || !dropoff) return;
    fetchDirections(driver, dropoff);
    const intervalId = window.setInterval(() => {
      const currentDriver = driverRef.current;
      const deviated = distanceToPath(currentDriver, pathRef.current) > DEVIATION_THRESHOLD_M;
      const dueForRefresh = Date.now() - lastFetchAtRef.current >= REFETCH_INTERVAL_MS;
      if (deviated || dueForRefresh) fetchDirections(currentDriver, dropoff);
    }, 5000);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropoff.lat, dropoff.lng]);

  if (!isLoaded) return <div className="flex h-full w-full items-center justify-center bg-slate-200">Loading map...</div>;

  const carIcon: google.maps.Symbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    rotation: bearing,
    scale: 6,
    fillColor: '#0057FF',
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 2,
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={driver}
        zoom={14}
        options={{ disableDefaultUI: true, zoomControl: false }}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        onDragStart={() => setFollowMode(false)}
      >
        <Marker position={driver} icon={carIcon} />
        <Marker position={dropoff} label="🏁" />
        {path.length > 0 && (
          <Polyline
            path={path}
            options={{ strokeColor: '#0057FF', strokeWeight: 6, strokeOpacity: 1 }}
          />
        )}
      </GoogleMap>
      {eta && (
        <div className="absolute bottom-3 left-3 z-10 rounded-full bg-black/75 px-3 py-1.5 text-xs font-semibold text-white">
          {eta.distanceText} • {eta.durationText}
        </div>
      )}
      {!followMode && (
        <button
          type="button"
          onClick={() => {
            setFollowMode(true);
            followDriver(driverRef.current);
          }}
          aria-label="Recenter"
          className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-lg"
        >
          🧭
        </button>
      )}
    </div>
  );
}


