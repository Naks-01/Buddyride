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
const DARK_RASTER_STYLE = {
  version: 8,
  sources: {
    'dark-raster': {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', 'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', 'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [{ id: 'dark-raster-layer', type: 'raster', source: 'dark-raster', minzoom: 0, maxzoom: 19 }],
} as any;
const STYLES = {
  light: OSM_RASTER_STYLE,
  dark: DARK_RASTER_STYLE,
};
const DEFAULT_CENTER: [number, number] = [-23.9045, 29.4582]; // Polokwane fallback
const DRIVE_PITCH = 0;
const ROUTE_SOURCE_ID = 'driver-route';
const ROUTE_CASING_LAYER_ID = 'driver-route-casing';
const ROUTE_LAYER_ID = 'driver-route-line';
const ROUTE_INNER_LAYER_ID = 'driver-route-line-inner';
const ROUTE_ARROW_LAYER_ID = 'driver-route-arrows';

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

// Route source/layers must be re-added every time the style reloads (theme switch, fallback swap).
// Bolt-style blue nav line: darker casing, main blue line, inner highlight, then turn arrows on top.
function addRouteLayer(map: maplibregl.Map) {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    });
  }
  if (!map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#1E4DD8', 'line-width': 10, 'line-opacity': 0.4 },
    });
  }
  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#4668F2', 'line-width': 7, 'line-opacity': 1 },
    });
  }
  if (!map.getLayer(ROUTE_INNER_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_INNER_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#7A8CFF', 'line-width': 2, 'line-opacity': 0.6 },
    });
  }
  if (!map.getLayer(ROUTE_ARROW_LAYER_ID) && map.hasImage('arrow')) {
    map.addLayer({
      id: ROUTE_ARROW_LAYER_ID,
      type: 'symbol',
      source: ROUTE_SOURCE_ID,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 100,
        'icon-image': 'arrow',
        'icon-size': 0.8,
      },
      paint: { 'icon-color': '#FFFFFF' },
    });
  }
}

type DriverMap3DProps = {
  centerBtn?: number;
  zoom?: number;
  routePath?: [number, number][];
  markers?: DriverMapMarker[];
};

export default function DriverMap3D({
  centerBtn,
  zoom = 17,
  routePath,
  markers = [],
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
      style: isDark ? STYLES.dark : STYLES.light,
      center: [pos[1], pos[0]],
      zoom,
      pitch: DRIVE_PITCH,
      bearing: 0,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'bottom-right');
    map.on('dragstart', () => {
      followRef.current = false;
    });
    map.on('load', () => {
      map.resize();
      setTimeout(() => map.resize(), 1000);
    });
    map.on('style.load', () => {
      setStyleLoaded(true);
      setStyleVersion((version) => version + 1);
      addRouteLayer(map);
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
    if (!themeInitializedRef.current || !mapRef.current) return;
    setStyleLoaded(false);
    mapRef.current.setStyle(isDark ? STYLES.dark : STYLES.light);
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

  // Route polyline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    addRouteLayer(map);
    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: (routePath ?? []).map(([lat, lng]) => [lng, lat]) },
    };
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [routePath, styleLoaded, styleVersion]);

  const handleRecenter = () => {
    followRef.current = true;
    mapRef.current?.easeTo({ center: [pos[1], pos[0]], pitch: DRIVE_PITCH, zoom: Math.max(zoom, 17), duration: 600 });
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
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
