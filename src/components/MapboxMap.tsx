import { useEffect, useRef } from 'react';
import { initMapbox, MAPBOX_TOKEN } from '../lib/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function MapboxMap({ center = [28.0473, -26.2041] }: { center?: [number, number] }) {
  const mapContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainer.current) return;
    const mapboxgl = initMapbox();
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center,
      zoom: 12,
    });
    return () => map.remove();
  }, [center]);

  if (!MAPBOX_TOKEN) {
    return <div>Map loading...</div>;
  }
  return <div ref={mapContainer} style={{ width: '100%', height: '400px', borderRadius: '12px' }} />;
}