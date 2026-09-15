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

const DEFAULT_CENTER: [number, number] = [-23.9045, 29.4689];
const VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const ROUTE_SOURCE_ID = 'passenger-route';
const ROUTE_LAYER_ID = 'passenger-route-line';

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
  const [styleLoaded, setStyleLoaded] = useState(false);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onUserInteractionRef.current = onUserInteraction;
  }, [onMapClick, onUserInteraction]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialCenter = center ?? DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: VOYAGER_STYLE,
      center: [initialCenter[1], initialCenter[0]],
      zoom,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => setStyleLoaded(true));
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
  }, [markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const data: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: (routePath ?? []).map(([lat, lng]) => [lng, lat]) },
    };
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      return;
    }
    map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data });
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#111111', 'line-width': 5, 'line-opacity': 0.85 },
    });
  }, [routePath, styleLoaded]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}