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
// demotiles.maplibre.org is a MapLibre-hosted style that is never blocked on Vercel; used as the reliable base for both themes.
const STYLES = {
  light: 'https://demotiles.maplibre.org/style.json',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const FALLBACK_MAP_STYLE = STYLES.light;
const ROUTE_SOURCE_ID = 'passenger-route';
const ROUTE_LAYER_ID = 'passenger-route-line';
const ROUTE_OUTLINE_LAYER_ID = 'passenger-route-line-outline';

function markerElement(marker: PassengerMapMarker) {
  const element = document.createElement('div');
  const rotation = marker.id === 'driver' ? marker.rotation ?? 0 : 0;
  const color = marker.color ?? '#111111';
  const emoji = marker.emoji ?? '📍';
  const size = marker.id === 'driver' ? 44 : 34;
  element.style.cssText = `width:${size}px;height:${size}px;transform:rotate(${rotation}deg);transition:transform 0.5s linear`;
  element.innerHTML = `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:${marker.id === 'driver' ? 22 : 15}px;box-shadow:0 4px 12px rgba(0,0,0,0.4)"><span style="transform:rotate(${-rotation}deg)">${emoji}</span></div>`;
  return element;
}

// Route source/layers must be re-added every time the style reloads (theme switch, fallback swap).
function addRouteLayer(map: maplibregl.Map) {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
    });
  }
  if (!map.getLayer(ROUTE_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_OUTLINE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 },
    });
  }
  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#111111', 'line-width': 5, 'line-opacity': 0.9 },
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
    let usingFallback = false;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? STYLES.dark : STYLES.light,
      center: [initialCenter[1], initialCenter[0]],
      zoom,
      pitch: 0,
      bearing: 0,
      antialias: true,
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
    map.on('error', () => {
      if (!usingFallback && !map.isStyleLoaded()) {
        usingFallback = true;
        setStyleLoaded(false);
        map.setStyle(FALLBACK_MAP_STYLE);
      }
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
    if (!themeInitializedRef.current || !mapRef.current) return;
    setStyleLoaded(false);
    mapRef.current.setStyle(isDark ? STYLES.dark : STYLES.light);
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