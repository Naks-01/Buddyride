import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const carIcon = L.divIcon({
  html: `<div style="background:#00C853;width:48px;height:48px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 12px rgba(0,0,0,0.4)">🚕</div>`,
  className: '',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

function Recenter({ pos }: { pos: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(pos, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);
  return null;
}

export default function AppMap({ centerBtn }: { centerBtn: number }) {
  const [pos, setPos] = useState<[number, number]>([-25.7479, 28.2293]); // Pretoria default
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => setPos([p.coords.latitude, p.coords.longitude]),
      (e) => console.log(e),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  useEffect(() => {
    if (centerBtn && map) map.flyTo(pos, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerBtn]);

  return (
    <MapContainer
      center={pos}
      zoom={15}
      style={{ height: '100%', width: '100%', background: '#0F1115' }}
      zoomControl={false}
      ref={setMap}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="" maxZoom={20} />
      <Marker position={pos} icon={carIcon} />
      <Recenter pos={pos} />
    </MapContainer>
  );
}
