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

// Free, no-key, light basemap - readable in direct sunlight (replaces the old dark Leaflet tiles).
const VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const DEFAULT_CENTER: [number, number] = [-25.7479, 28.2293]; // Pretoria fallback
const DRIVE_PITCH = 60;
const ROUTE_SOURCE_ID = 'driver-route';
const ROUTE_LAYER_ID = 'driver-route-line';

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

type DriverMap3DProps = {
  centerBtn?: number;
  zoom?: number;
  routePath?: [number, number][];
  routeColor?: string;
  routeWeight?: number;
  markers?: DriverMapMarker[];
};

export default function DriverMap3D({
  centerBtn,
  zoom = 17,
  routePath,
  routeColor = '#2ECC71',
  routeWeight = 5,
  markers = [],
}: DriverMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const carMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pinMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const followRef = useRef(true);
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [pos, setPos] = useState<[number, number]>(DEFAULT_CENTER);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: VOYAGER_STYLE,
      center: [pos[1], pos[0]],
      zoom,
      pitch: DRIVE_PITCH,
      bearing: 0,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('dragstart', () => {
      followRef.current = false;
    });
    map.on('load', () => setStyleLoaded(true));
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
  }, [markers]);

  // Route polyline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: (routePath ?? []).map(([lat, lng]) => [lng, lat]) },
    };
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    } else {
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': routeColor, 'line-width': routeWeight, 'line-opacity': 0.85 },
      });
    }
  }, [routePath, routeColor, routeWeight, styleLoaded]);

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
    </div>
  );
}
