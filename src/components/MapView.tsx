import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/maps';

// Fix default marker icons for Leaflet in bundlers
const orangeIcon = L.divIcon({
  className: 'custom-marker',
  html: '<div style="width:20px;height:20px;background:#ff6b00;border:3px solid #0a0a0a;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const pickupIcon = L.divIcon({
  className: 'custom-marker',
  html: '<div style="width:18px;height:18px;background:#22c55e;border:3px solid #0a0a0a;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const dropoffIcon = L.divIcon({
  className: 'custom-marker',
  html: '<div style="width:18px;height:18px;background:#ff6b00;border:3px solid #0a0a0a;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const driverIcon = L.divIcon({
  className: 'custom-marker',
  html: '<div style="font-size:24px;line-height:1">🚗</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapAutoCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center[0], center[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

interface MapProps {
  center?: [number, number];
  zoom?: number;
  pickup?: { lat: number; lng: number };
  dropoff?: { lat: number; lng: number };
  driverPos?: { lat: number; lng: number };
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
  fitBounds?: boolean;
  markers?: Array<{ lat: number; lng: number; label?: string; type?: 'orange' | 'pickup' | 'dropoff' }>;
}

export function MapView({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  pickup,
  dropoff,
  driverPos,
  onMapClick,
  className = '',
  fitBounds = false,
  markers = [],
}: MapProps) {
  const mapRef = (map: L.Map | null) => {
    if (map && fitBounds) {
      const points: [number, number][] = [];
      if (pickup) points.push([pickup.lat, pickup.lng]);
      if (dropoff) points.push([dropoff.lat, dropoff.lng]);
      if (driverPos) points.push([driverPos.lat, driverPos.lng]);
      if (points.length >= 2) {
        map.fitBounds(L.latLngBounds(points), { padding: [60, 60] });
      }
    }
  };

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={className || 'map-container'}
      ref={mapRef}
      zoomControl={false}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        maxZoom={19}
      />
      <MapClickHandler onClick={onMapClick} />
      <MapAutoCenter center={center} />

      {pickup && (
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
          <Popup>Pickup</Popup>
        </Marker>
      )}
      {dropoff && (
        <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon}>
          <Popup>Drop-off</Popup>
        </Marker>
      )}
      {driverPos && (
        <Marker position={[driverPos.lat, driverPos.lng]} icon={driverIcon}>
          <Popup>Driver</Popup>
        </Marker>
      )}
      {markers.map((m, i) => (
        <Marker
          key={i}
          position={[m.lat, m.lng]}
          icon={m.type === 'pickup' ? pickupIcon : m.type === 'dropoff' ? dropoffIcon : orangeIcon}
        >
          {m.label && <Popup>{m.label}</Popup>}
        </Marker>
      ))}
    </MapContainer>
  );
}
