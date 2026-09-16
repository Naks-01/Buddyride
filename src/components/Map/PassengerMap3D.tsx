import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type PassengerMapMarker = {
  id: string;
  position: [number, number]; // [lat, lng]
  color?: string;
  emoji?: string;
  rotation?: number;
};

type PassengerMap3DProps = {
  center?: [number, number];
  centerBtn?: number;
  zoom?: number;
  markers?: PassengerMapMarker[];
  routePath?: [number, number][];
  onMapClick?: (lat: number, lng: number) => void;
  onUserInteraction?: () => void;
};

const DEFAULT_CENTER: [number, number] = [-23.9045, 29.4582];
// Raster OSM tiles are guaranteed to render streets everywhere (incl. Polokwane), same base as the driver map.
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
const ROUTE_SOURCE_ID = 'passenger-route';
const ROUTE_GLOW_LAYER_ID = 'passenger-route-glow';
const ROUTE_LAYER_ID = 'passenger-route-blue';

function markerElement(marker: PassengerMapMarker) {
  const element = document.createElement('div');
  const rotation = marker.id === 'driver' ? marker.rotation ?? 0 : 0;
  if (marker.id === 'driver') {
    // Bolt-style driver marker: plain car icon, no pin circle.
    element.style.cssText = `width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:28px;transform:rotate(${rotation}deg);transition:transform 0.5s linear;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.4))`;
    element.innerHTML = `<span style="transform:rotate(${-rotation}deg)">${marker.emoji ?? '🚕'}</span>`;
    return element;
  }
  const color = marker.color ?? '#111111';
  const emoji = marker.emoji ?? '📍';
  const size = 34;
  element.style.cssText = `width:${size}px;height:${size}px`;
  element.innerHTML = `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,0.4)"><span>${emoji}</span></div>`;
  return element;
}

// Route source/layers must be re-added every time the style reloads (theme switch, fallback swap).
// Bolt-style blue nav line: light-blue outline underneath a solid blue main line.
function addRouteLayer(map: maplibregl.Map) {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    });
  }
  if (!map.getLayer(ROUTE_GLOW_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_GLOW_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#8AB4FF', 'line-width': 14, 'line-opacity': 0.4 },
    });
  }
  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#1A73E8', 'line-width': 5, 'line-opacity': 0.9 },
    });
  }
}

export default function PassengerMap3D({
  center,
  centerBtn,
  zoom = 14,
  markers = [],
  routePath,
  onMapClick,
  onUserInteraction,
}: PassengerMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const onMapClickRef = useRef(onMapClick);
  const onUserInteractionRef = useRef(onUserInteraction);
  const themeInitializedRef = useRef(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onUserInteractionRef.current = onUserInteraction;
  }, [onMapClick, onUserInteraction]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('mapTheme');
    const prefersDark = savedTheme ? savedTheme === 'dark' : new Date().getHours() >= 18 || new Date().getHours() < 6;
    if (prefersDark !== isDark) {
      setIsDark(prefersDark);
      return;
    }
    themeInitializedRef.current = true;
  }, [isDark]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialCenter = center ?? DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: [initialCenter[1], initialCenter[0]],
      zoom,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), 'bottom-right');
    map.on('style.load', () => {
      setStyleLoaded(true);
      setStyleVersion((version) => version + 1);
      addRouteLayer(map);
    });
    map.on('load', () => {
      map.resize();
      setTimeout(() => map.resize(), 1000);
    });
    map.on('dragstart', () => onUserInteractionRef.current?.());
    map.on('click', (event) => onMapClickRef.current?.(event.lngLat.lat, event.lngLat.lng));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // The map is initialized once; subsequent prop updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.filter = isDark ? DARK_MAP_FILTER : 'none';
  }, [isDark]);

  useEffect(() => {
    if (!center) return;
    mapRef.current?.easeTo({ center: [center[1], center[0]], zoom, duration: 500 });
  }, [center?.[0], center?.[1], zoom]);

  useEffect(() => {
    if (!centerBtn) return;
    const currentCenter = center ?? DEFAULT_CENTER;
    mapRef.current?.easeTo({ center: [currentCenter[1], currentCenter[0]], zoom, duration: 500 });
  }, [centerBtn, center, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    markers.forEach((marker) => {
      seen.add(marker.id);
      const existing = markersRef.current.get(marker.id);
      if (existing) {
        existing.remove();
      }
      const instance = new maplibregl.Marker({ element: markerElement(marker), anchor: 'center' })
        .setLngLat([marker.position[1], marker.position[0]])
        .addTo(map);
      markersRef.current.set(marker.id, instance);
    });
    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });
  }, [markers, styleVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    addRouteLayer(map);
    const data: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: (routePath ?? []).map(([lat, lng]) => [lng, lat]) },
    };
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data);
  }, [routePath, styleLoaded, styleVersion]);

  return (
    <div className="absolute inset-0 h-full w-full">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
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