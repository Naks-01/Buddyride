import { useEffect, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type AppMapMarker = {
  id: string;
  position: [number, number];
  label?: string;
  color?: string;
  emoji?: string;
};

const carIcon = L.divIcon({
  html: `<div style="background:#00C853;width:48px;height:48px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 12px rgba(0,0,0,0.4)">🚕</div>`,
  className: '',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

function pinIcon(color: string, emoji: string) {
  return L.divIcon({
    html: `<div style="background:${color};width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg);font-size:15px;line-height:1">${emoji}</span></div>`,
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function ClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onMapClick?.(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

type AppMapProps = {
  mode?: 'driver' | 'passenger';
  centerBtn?: number;
  center?: [number, number];
  zoom?: number;
  showSelfMarker?: boolean;
  markers?: AppMapMarker[];
  routePath?: [number, number][];
  onMapClick?: (lat: number, lng: number) => void;
};

export default function AppMap({
  mode = 'driver',
  centerBtn,
  center,
  zoom = 15,
  showSelfMarker = mode === 'driver',
  markers = [],
  routePath,
  onMapClick,
}: AppMapProps) {
  const [pos, setPos] = useState<[number, number]>([-25.7479, 28.2293]); // Pretoria default
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (p) => setPos([p.coords.latitude, p.coords.longitude]),
      (e) => console.error('Failed to watch position:', e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // Driver mode auto-follows the live GPS position; passenger mode only recenters when `center` changes.
  useEffect(() => {
    if (!map || mode !== 'driver') return;
    map.flyTo(pos, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, mode]);

  useEffect(() => {
    if (!map || !center) return;
    map.flyTo(center, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.[0], center?.[1]]);

  useEffect(() => {
    if (centerBtn && map) map.flyTo(center ?? pos, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerBtn]);

  const tileClassName = mode === 'driver' ? 'dark-tiles' : '';

  return (
    <MapContainer
      center={center ?? pos}
      zoom={zoom}
      style={{ height: '100%', width: '100%', background: mode === 'driver' ? '#0F1115' : '#e5e3df' }}
      zoomControl={false}
      ref={setMap}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        className={tileClassName}
        maxZoom={19}
      />
      {showSelfMarker && <Marker position={pos} icon={carIcon} />}
      {markers.map((marker) => (
        <Marker key={marker.id} position={marker.position} icon={pinIcon(marker.color ?? '#FF3B30', marker.emoji ?? '📍')} />
      ))}
      {routePath && routePath.length > 1 && <Polyline positions={routePath} color="#2ECC71" weight={5} opacity={0.8} />}
      <ClickHandler onMapClick={onMapClick} />
    </MapContainer>
  );
}
