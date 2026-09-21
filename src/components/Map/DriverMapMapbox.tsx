import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { initMapbox, MAPBOX_TOKEN } from '../../lib/mapbox';

type Coordinates = { lat: number; lng: number };

type DriverMapMapboxProps = {
  driver?: Coordinates | null;
  pickup?: Coordinates | null;
  dropoff?: Coordinates | null;
  routePath?: [number, number][];
  followTrigger?: number;
};

const DEFAULT_CENTER: [number, number] = [29.458, -23.904];

export default function DriverMapMapbox({ driver, pickup, dropoff, routePath = [], followTrigger }: DriverMapMapboxProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const [isFullMap, setIsFullMap] = useState(false);
  const center = driver ? [driver.lng, driver.lat] as [number, number] : pickup ? [pickup.lng, pickup.lat] as [number, number] : DEFAULT_CENTER;

  useEffect(() => {
    if (!MAPBOX_TOKEN) {
      initMapbox();
      return;
    }
    if (!mapContainerRef.current || mapRef.current) return;
    const mapbox = initMapbox();
    const map = new mapbox.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: 13,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
    map.on('load', () => map.resize());
    mapRef.current = map;
    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [MAPBOX_TOKEN]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const updateRoute = () => {
      const coordinates = routePath.map(([lat, lng]) => [lng, lat]);
      const data: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      };
      const source = map.getSource('driver-route') as mapboxgl.GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource('driver-route', { type: 'geojson', data });
        map.addLayer({
          id: 'driver-route-line',
          type: 'line',
          source: 'driver-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#FF5500', 'line-width': 6, 'line-opacity': 0.95 },
        });
      }
    };
    if (map.isStyleLoaded()) updateRoute();
    else map.once('load', updateRoute);
  }, [routePath]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRefs.current.forEach((marker) => marker.remove());
    const markers: Array<{ position: Coordinates; color: string; label: string }> = [];
    if (driver) markers.push({ position: driver, color: '#111827', label: 'Driver' });
    if (pickup) markers.push({ position: pickup, color: '#16A34A', label: 'Pickup' });
    if (dropoff) markers.push({ position: dropoff, color: '#DC2626', label: 'Dropoff' });
    markerRefs.current = markers.map(({ position, color, label }) => new mapboxgl.Marker({ color })
      .setLngLat([position.lng, position.lat])
      .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(label))
      .addTo(map));
  }, [driver, pickup, dropoff]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.flyTo({ center, zoom: driver ? 15 : 13, essential: true });
  }, [driver?.lat, driver?.lng, pickup?.lat, pickup?.lng]);

  useEffect(() => {
    if (mapRef.current) mapRef.current.flyTo({ center, zoom: 15, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followTrigger]);

  useEffect(() => {
    if (mapRef.current) window.setTimeout(() => mapRef.current?.resize(), 400);
  }, [isFullMap]);

  if (!MAPBOX_TOKEN) {
    return <div role="alert" className="flex h-full items-center justify-center bg-slate-100 p-6 text-center text-sm text-red-700">Mapbox token missing in .env</div>;
  }

  return (
    <div className={isFullMap ? 'fixed inset-0 z-50' : 'relative h-full w-full'}>
      <div ref={mapContainerRef} className="h-full w-full" />
      <button type="button" onClick={() => setIsFullMap((value) => !value)} className="absolute left-3 top-3 z-10 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-md">
        {isFullMap ? 'Exit full map' : 'Full map'}
      </button>
    </div>
  );
}