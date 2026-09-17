import { useEffect, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { decode } from '@googlemaps/polyline-codec';

type LatLng = { lat: number; lng: number };

type DriverGoogleMapSecureProps = {
  driver: LatLng;
  dropoff: LatLng;
};

const REFETCH_INTERVAL_MS = 30000; // don't hit Directions more than once per 30s
const DEVIATION_THRESHOLD_M = 150; // refetch early if the driver strays this far off the drawn route

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

// Directions are fetched through /api/directions (a Vercel serverless function) so the Google
// Directions server key never reaches the browser - only the restricted browser (Maps JS) key does.
export default function DriverGoogleMapSecure({ driver, dropoff }: DriverGoogleMapSecureProps) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });
  const [path, setPath] = useState<LatLng[]>([]);
  const [eta, setEta] = useState<{ distanceText: string; durationText: string } | null>(null);
  const driverRef = useRef(driver);
  const pathRef = useRef<LatLng[]>([]);
  const lastFetchAtRef = useRef(0);
  const lastFetchOriginRef = useRef<LatLng | null>(null);

  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

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

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={driver}
        zoom={14}
        options={{ disableDefaultUI: true, zoomControl: false }}
      >
        <Marker position={driver} label="🚕" />
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
    </div>
  );
}

