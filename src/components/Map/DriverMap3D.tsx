import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type DriverMapMarker = {
  id: string;
  position: [number, number]; // [lat, lng]
  label?: string;
  color?: string;
  emoji?: string;
};

// Raster OSM tiles are guaranteed to render streets everywhere (incl. Polokwane) with no vector sprite/glyph failure modes.
const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    'osm-raster': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster', minzoom: 0, maxzoom: 19 }],
} as any;
// Dark "theme" is a CSS filter over the same free OSM tiles - no second (keyed) tile provider needed.
const DARK_MAP_FILTER = 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9)';
const DEFAULT_CENTER: [number, number] = [-23.9045, 29.4582]; // Polokwane fallback
const DRIVE_PITCH = 0;
const ROUTE_SOURCE_ID = 'driver-route';
const ROUTE_WHITE_LAYER_ID = 'driver-route-white';
const ROUTE_BLUE_LAYER_ID = 'driver-route-blue';
// Limpopo/South Africa bounding box - used only to auto-correct an accidentally swapped
// [lat,lng] pair so one bad upstream coordinate can never silently make the whole line vanish.
const SA_LNG_RANGE: [number, number] = [15, 34];
const SA_LAT_RANGE: [number, number] = [-35, -21];

// This file's convention is [lat, lng] everywhere (see DriverMapMarker/props comments). This
// converts to GeoJSON [lng, lat], falling back to the other orientation if the "lat,lng" reading
// lands outside South Africa but the swapped reading doesn't.
function toLngLatSafe([a, b]: [number, number]): [number, number] {
  const asLatLng: [number, number] = [b, a]; // treat input as [lat, lng] -> [lng, lat]
  const inRange = (lng: number, lat: number) =>
    lng >= SA_LNG_RANGE[0] && lng <= SA_LNG_RANGE[1] && lat >= SA_LAT_RANGE[0] && lat <= SA_LAT_RANGE[1];
  if (inRange(asLatLng[0], asLatLng[1])) return asLatLng;
  if (inRange(a, b)) return [a, b]; // input was already [lng, lat]
  return asLatLng; // out of range either way - keep the documented convention
}

function pinElement(color: string, emoji: string) {
  const el = document.createElement('div');
  el.style.cssText = 'width:34px;height:34px';
  el.innerHTML = `<div style="background:${color};width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg);font-size:15px;line-height:1">${emoji}</span></div>`;
  return el;
}

function carElement() {
  const el = document.createElement('div');
  el.style.cssText = 'width:48px;height:48px;transition:transform 0.3s linear';
  el.innerHTML = `<div style="background:#00C853;width:48px;height:48px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 12px rgba(0,0,0,0.4)">🚕</div>`;
  return el;
}

// Fully tears down and recreates the source + both line layers on every single call, then forces
// them to the top of the layer stack. This is deliberately more aggressive than "add if missing" -
// it guarantees there's never a stale/corrupted layer left over from a previous style reload that
// silently keeps rendering an old (or empty) line underneath a seemingly-fine new one.
// Returns a human-readable error string on failure (or null on success) so callers can surface it
// on-screen instead of requiring someone to pull phone/devtools logs.
function setRouteData(map: maplibregl.Map, coordinates: [number, number][]): string | null {
  try {
    if (map.getLayer(ROUTE_BLUE_LAYER_ID)) map.removeLayer(ROUTE_BLUE_LAYER_ID);
    if (map.getLayer(ROUTE_WHITE_LAYER_ID)) map.removeLayer(ROUTE_WHITE_LAYER_ID);
    if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);

    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
    });
    map.addLayer({
      id: ROUTE_WHITE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
      paint: { 'line-color': '#FFFFFF', 'line-width': 18, 'line-opacity': 1 },
    });
    map.addLayer({
      id: ROUTE_BLUE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
      paint: { 'line-color': '#0066FF', 'line-width': 10, 'line-opacity': 1 },
    });
    // Force both to the very top of the stack - white first, blue drawn last (on top of the halo).
    map.moveLayer(ROUTE_WHITE_LAYER_ID);
    map.moveLayer(ROUTE_BLUE_LAYER_ID);
    console.log('ROUTE SET', coordinates.length, coordinates[0]);
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('ROUTE LAYER SET FAILED', e);
    return message;
  }
}

type DriverMap3DProps = {
  centerBtn?: number;
  zoom?: number;
  routePath?: [number, number][];
  markers?: DriverMapMarker[];
  driverLocation?: [number, number]; // [lat, lng] - draws a hardcoded straight line when paired with destination
  destination?: [number, number]; // [lat, lng]
};

export default function DriverMap3D({
  centerBtn,
  zoom = 17,
  routePath,
  markers = [],
  driverLocation,
  destination,
}: DriverMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const carMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pinMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const followRef = useRef(true);
  const themeInitializedRef = useRef(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [pos, setPos] = useState<[number, number]>(DEFAULT_CENTER);
  const lastErrorRef = useRef<string | null>(null);
  const firstCoordRef = useRef<[number, number] | null>(null);
  // On-screen debug badge state - CEO/support can read this straight off the screenshot, no phone
  // logs, no devtools, no Eruda needed.
  const [debugInfo, setDebugInfo] = useState({
    routeLen: 0,
    driverPos: DEFAULT_CENTER as [number, number],
    hasSource: false,
    hasLayer: false,
    lastError: null as string | null,
    firstCoord: null as [number, number] | null,
  });
  // Collapsed to a small dot by default - tap to expand. Auto-expands itself the moment an error
  // shows up so a real problem is never hidden, but stays out of the way of the UI otherwise.
  const [badgeExpanded, setBadgeExpanded] = useState(false);
  useEffect(() => {
    if (debugInfo.lastError) setBadgeExpanded(true);
  }, [debugInfo.lastError]);
  // One-shot "ROUTE LIVE" confirmation the moment a real route is drawn successfully - visible for
  // 5s even on an otherwise clean/hidden-badge screen, so a healthy line is never silently assumed.
  const [routeLiveMsg, setRouteLiveMsg] = useState<string | null>(null);
  const routeLiveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('mapTheme');
    const prefersDark = savedTheme ? savedTheme === 'dark' : new Date().getHours() >= 18 || new Date().getHours() < 6;
    if (prefersDark !== isDark) {
      setIsDark(prefersDark);
      return;
    }
    themeInitializedRef.current = true;
  }, [isDark]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: [pos[1], pos[0]],
      zoom,
      pitch: DRIVE_PITCH,
      bearing: 0,
      attributionControl: false,
    });
    // Native zoom/geolocate controls removed - the app has its own recenter/filter buttons in the same corner.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.on('dragstart', () => {
      followRef.current = false;
    });
    map.on('load', () => {
      map.resize();
      setTimeout(() => map.resize(), 1000);
      console.log('MAP STYLE LAYERS', map.getStyle()?.layers?.map((l) => l.id));
      setStyleLoaded(true);
      setStyleVersion((version) => version + 1);
    });
    map.on('style.load', () => {
      console.log('MAP STYLE LAYERS (style.load)', map.getStyle()?.layers?.map((l) => l.id));
      setStyleLoaded(true);
      setStyleVersion((version) => version + 1);
    });
    mapRef.current = map;
    carMarkerRef.current = new maplibregl.Marker({ element: carElement() }).setLngLat([pos[1], pos[0]]).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      carMarkerRef.current = null;
      pinMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.filter = isDark ? DARK_MAP_FILTER : 'none';
  }, [isDark]);

  // Live GPS drive mode: follow position, rotate to heading, keep the 3D pitch.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const next: [number, number] = [p.coords.latitude, p.coords.longitude];
        setPos(next);
        carMarkerRef.current?.setLngLat([next[1], next[0]]);
        const map = mapRef.current;
        if (map && followRef.current) {
          map.easeTo({
            center: [next[1], next[0]],
            bearing: p.coords.heading ?? map.getBearing(),
            pitch: DRIVE_PITCH,
            duration: 800,
          });
        }
      },
      (e) => console.error('Failed to watch position:', e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // Recenter-on-me button (bumped via centerBtn counter from the parent).
  useEffect(() => {
    if (!centerBtn) return;
    followRef.current = true;
    mapRef.current?.easeTo({ center: [pos[1], pos[0]], pitch: DRIVE_PITCH, zoom: Math.max(zoom, 17), duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerBtn]);

  // Pickup/dropoff pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    markers.forEach((marker) => {
      seen.add(marker.id);
      const existing = pinMarkersRef.current.get(marker.id);
      if (existing) {
        existing.setLngLat([marker.position[1], marker.position[0]]);
        return;
      }
      const el = pinElement(marker.color ?? '#FF3B30', marker.emoji ?? '📍');
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([marker.position[1], marker.position[0]]).addTo(map);
      pinMarkersRef.current.set(marker.id, m);
    });
    pinMarkersRef.current.forEach((m, id) => {
      if (!seen.has(id)) {
        m.remove();
        pinMarkersRef.current.delete(id);
      }
    });
  }, [markers, styleVersion]);

  // Route polyline - full recreate every time so a stale/corrupted layer from a previous style
  // reload can never keep silently rendering underneath a seemingly-fine new one.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    let coords = (routePath ?? []).map(toLngLatSafe);
    if (coords.length < 2 && driverLocation && destination) {
      coords = [driverLocation, destination].map(toLngLatSafe);
    }
    firstCoordRef.current = coords[0] ?? null;
    lastErrorRef.current = setRouteData(map, coords);
    if (!lastErrorRef.current && coords.length > 1) {
      setRouteLiveMsg(`ROUTE LIVE ${coords.length}pts`);
      if (routeLiveTimerRef.current) window.clearTimeout(routeLiveTimerRef.current);
      routeLiveTimerRef.current = window.setTimeout(() => setRouteLiveMsg(null), 5000);
    }
  }, [routePath, styleLoaded, styleVersion, driverLocation, destination]);

  // V1 brute-force safety net: if the parent hasn't handed us a real routePath/driverLocation yet
  // (e.g. its own GPS state is still null), draw a straight line ourselves from this component's
  // own live GPS `pos` to the dropoff/pickup pin so a blue line is never just missing on screen.
  const routePathRef = useRef(routePath);
  useEffect(() => {
    routePathRef.current = routePath;
  }, [routePath]);
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    const drawFallbackBlue = () => {
      const map = mapRef.current;
      if (!map || !styleLoaded) return;
      if (routePathRef.current && routePathRef.current.length >= 2) return; // real route already drawn
      const pickup = markersRef.current.find((m) => m.id === 'pickup-pin');
      const dropoff = markersRef.current.find((m) => m.id === 'dropoff-pin') ?? markersRef.current.find((m) => m.id === 'nav-destination');
      if (!pickup && !dropoff) return;
      const from = posRef.current;
      // driverLocation -> pickup -> dropoff, whichever pins are actually present.
      const latLngCoords: [number, number][] = [from];
      if (pickup) latLngCoords.push(pickup.position);
      if (dropoff) latLngCoords.push(dropoff.position);
      const coords = latLngCoords.map(toLngLatSafe);
      firstCoordRef.current = coords[0] ?? null;
      lastErrorRef.current = setRouteData(map, coords);
    };
    drawFallbackBlue();
    const intervalId = window.setInterval(drawFallbackBlue, 1000);
    return () => window.clearInterval(intervalId);
  }, [styleLoaded]);

  // On-screen debug badge data - polls actual map state so it's truthful even if an effect above
  // silently no-ops; this is the only debugging surface the CEO/support needs, ever.
  useEffect(() => {
    const tick = () => {
      const map = mapRef.current;
      setDebugInfo({
        routeLen: routePathRef.current?.length ?? 0,
        driverPos: posRef.current,
        hasSource: !!map?.getSource(ROUTE_SOURCE_ID),
        hasLayer: !!map?.getLayer(ROUTE_BLUE_LAYER_ID),
        lastError: lastErrorRef.current,
        firstCoord: firstCoordRef.current,
      });
    };
    tick();
    const intervalId = window.setInterval(tick, 500);
    return () => window.clearInterval(intervalId);
  }, []);

  // V1: hardcoded straight line, no OSRM - when raw driverLocation/destination coords are passed
  // directly. The main route-polyline effect above now also consumes driverLocation/destination as
  // a length<2 fallback, but this keeps the dedicated fitBounds behavior for that call pattern.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded || !driverLocation || !destination) return;
    const coords: [number, number][] = [driverLocation, destination].map(toLngLatSafe);
    const bounds = new maplibregl.LngLatBounds();
    coords.forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, { padding: 100, maxZoom: 16 });
  }, [driverLocation, destination, styleLoaded]);

  const handleRecenter = () => {
    followRef.current = true;
    mapRef.current?.easeTo({ center: [pos[1], pos[0]], pitch: DRIVE_PITCH, zoom: Math.max(zoom, 17), duration: 600 });
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      {/* Debug status - fully hidden once the route is healthy (no error, real line drawn) for a
          clean screenshot; auto-reveals itself the instant something actually breaks. */}
      {(debugInfo.lastError || debugInfo.routeLen <= 1) && (badgeExpanded ? (
        <div
          onClick={() => setBadgeExpanded(false)}
          role="button"
          aria-label="Collapse debug status"
          style={{
            position: 'absolute',
            bottom: 110,
            left: 12,
            zIndex: 50,
            maxWidth: '85%',
            background: 'rgba(0,0,0,0.75)',
            color: debugInfo.lastError ? '#FF5252' : '#00E676',
            fontFamily: 'monospace',
            fontSize: 11,
            lineHeight: 1.4,
            padding: '6px 8px',
            borderRadius: 6,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <div>route:{debugInfo.routeLen} | src:{String(debugInfo.hasSource)} | layer:{String(debugInfo.hasLayer)}</div>
          <div>pos:{debugInfo.driverPos[0].toFixed(4)},{debugInfo.driverPos[1].toFixed(4)}</div>
          <div>first(lng,lat):{debugInfo.firstCoord ? `${debugInfo.firstCoord[0].toFixed(4)},${debugInfo.firstCoord[1].toFixed(4)}` : 'none'}</div>
          <div>err:{debugInfo.lastError ?? 'none'}</div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setBadgeExpanded(true)}
          aria-label="Show debug status"
          style={{
            position: 'absolute',
            bottom: 110,
            left: 12,
            zIndex: 50,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: debugInfo.lastError ? '#FF5252' : '#00E676',
            border: '2px solid rgba(0,0,0,0.35)',
            padding: 0,
          }}
        />
      ))}
      {/* One-shot confirmation toast - shows even on an otherwise clean/hidden-badge screen so a
          healthy route draw is never just silently assumed; auto-dismisses after 5s. */}
      {routeLiveMsg && (
        <div
          style={{
            position: 'absolute',
            bottom: 110,
            left: 12,
            zIndex: 50,
            background: 'rgba(0,102,255,0.9)',
            color: '#FFFFFF',
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            padding: '6px 10px',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          {routeLiveMsg}
        </div>
      )}
      <button
        type="button"
        aria-label="Recenter on my location"
        onClick={handleRecenter}
        className="absolute right-3 top-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-lg hover:bg-gray-100"
      >
        🧭
      </button>
      <button
        type="button"
        aria-label={isDark ? 'Switch to light map theme' : 'Switch to dark map theme'}
        onClick={() => {
          const nextTheme = !isDark;
          setIsDark(nextTheme);
          localStorage.setItem('mapTheme', nextTheme ? 'dark' : 'light');
        }}
        className="absolute right-3 top-20 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-lg hover:bg-gray-100"
      >
        {isDark ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
