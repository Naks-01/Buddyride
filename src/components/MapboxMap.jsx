import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function MapboxMap() {
  const mapRef = useRef(null);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !mapRef.current) return undefined;

    mapboxgl.accessToken = token;

    // Android WebView can expose this native hook to force a non-corrupt RGBA surface.
    if (typeof window.setFormat === 'function') window.setFormat('RGBA_8888');

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1',
      center: [29.46, -25.47],
      zoom: 13,
      hardwareAccelerated: true,
    });

    map.once('style.load', () => map.resize());

    return () => map.remove();
  }, []);

  return <div ref={mapRef} style={{ width: '100%', height: '100vh' }} />;
}
