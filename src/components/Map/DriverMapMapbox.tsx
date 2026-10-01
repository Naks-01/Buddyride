import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { initMapbox, MAPBOX_TOKEN } from '../../lib/mapbox';

type Coordinates = { lat: number; lng: number };

type Props = {
  driver?: Coordinates | null;
  pickup?: Coordinates | null;
  dropoff?: Coordinates | null;
  routePath?: [number, number][];
  followTrigger?: number;
};

const DEFAULT_CENTER: [number, number] = [29.458, -23.904]; // Polokwane

export default function DriverMapMapbox({ driver, pickup, routePath, followTrigger }: Props) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullMap, setIsFullMap] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  const center = driver? [driver.lng, driver.lat] as [number, number] : pickup? [pickup.lng, pickup.lat] as [number, number] : DEFAULT_CENTER;

  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const mapbox = initMapbox();
    const map = new mapbox.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 13,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
    map.on('load', () => {
      map.resize();
      setMapLoaded(true);
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center, zoom: 15, essential: true });
    }
  }, [followTrigger]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const route = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: (routePath ?? []).map(([lat, lng]) => [lng, lat]),
      },
    };
    const source = map.getSource('driver-route') as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(route);
      return;
    }

    map.addSource('driver-route', { type: 'geojson', data: route });
    map.addLayer({
      id: 'driver-route-line',
      type: 'line',
      source: 'driver-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#1A73E8', 'line-width': 6, 'line-opacity': 1 },
    });
  }, [mapLoaded, routePath]);

  useEffect(() => {
    if (mapRef.current) {
      window.setTimeout(() => mapRef.current?.resize(), 400);
    }
  }, [isFullMap]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex w-full h-[60vh] min-h-[450px] items-center justify-center bg-slate-100 p-6 text-center text-sm text-red-700">
        Mapbox token missing in.env.local
      </div>
    );
  }

  return (
    <div className={isFullMap? 'fixed inset-0 z-50 bg-white' : 'relative h-full w-full'}>
      <div ref={mapContainerRef} className="w-full" style={{ height: isFullMap? '100%' : '60vh', minHeight: '450px' }} />
      <button
        type="button"
        onClick={() => setIsFullMap((v) =>!v)}
        className="absolute left-3 top-3 z-10 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-md"
      >
        {isFullMap? 'Exit full map' : 'Full map'}
      </button>
    </div>
  );
}