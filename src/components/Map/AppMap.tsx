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
  showControls?: boolean;
};

const TILE_LAYERS = {
  standard: {
    label: 'Standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  humanitarian: {
    label: 'Humanitarian',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/tiles/cyclosm/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, tiles courtesy of Humanitarian OpenStreetMap Team',
  },
} as const;

function MapControls({
  map,
  layer,
  onLayerChange,
  onMyLocation,
  onCompass,
}: {
  map: L.Map | null;
  layer: keyof typeof TILE_LAYERS;
  onLayerChange: (layer: keyof typeof TILE_LAYERS) => void;
  onMyLocation: () => void;
  onCompass: () => void;
}) {
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const btnClass = 'flex h-9 w-9 items-center justify-center rounded-lg bg-white text-lg shadow-md hover:bg-gray-100';
  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
      <div className="relative">
        <button type="button" aria-label="Map layers" className={btnClass} onClick={() => setShowLayerMenu((v) => !v)}>🗺️</button>
        {showLayerMenu && (
          <div className="absolute right-0 mt-1 w-40 rounded-lg bg-white p-1 shadow-lg">
            {(Object.keys(TILE_LAYERS) as Array<keyof typeof TILE_LAYERS>).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onLayerChange(key);
                  setShowLayerMenu(false);
                }}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${layer === key ? 'bg-orange-100 font-bold text-orange-700' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {TILE_LAYERS[key].label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" aria-label="My location" className={btnClass} onClick={onMyLocation}>📍</button>
      <button type="button" aria-label="Zoom in" className={btnClass} onClick={() => map?.zoomIn()}>➕</button>
      <button type="button" aria-label="Zoom out" className={btnClass} onClick={() => map?.zoomOut()}>➖</button>
      <button type="button" aria-label="Reset north (compass)" className={btnClass} onClick={onCompass}>🧭</button>
    </div>
  );
}

export default function AppMap({
  mode = 'driver',
  centerBtn,
  center,
  zoom = 15,
  showSelfMarker = mode === 'driver',
  markers = [],
  routePath,
  onMapClick,
  showControls = true,
}: AppMapProps) {
  const [pos, setPos] = useState<[number, number]>([-25.7479, 28.2293]); // Pretoria default
  const [map, setMap] = useState<L.Map | null>(null);
  const [tileLayer, setTileLayer] = useState<keyof typeof TILE_LAYERS>('standard');


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

  const handleMyLocation = () => {
    if (!map) return;
    if (mode === 'driver') {
      map.flyTo(pos, Math.max(zoom, 16));
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => map.flyTo([p.coords.latitude, p.coords.longitude], Math.max(zoom, 16)),
      (e) => console.error('Failed to get current position:', e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleCompass = () => map?.setView(center ?? pos, zoom);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={center ?? pos}
        zoom={zoom}
        style={{ height: '100%', width: '100%', background: mode === 'driver' ? '#0F1115' : '#e5e3df' }}
        zoomControl={false}
        ref={setMap}
      >
        <TileLayer
          key={tileLayer}
          url={TILE_LAYERS[tileLayer].url}
          attribution={TILE_LAYERS[tileLayer].attribution}
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
      {showControls && (
        <MapControls map={map} layer={tileLayer} onLayerChange={setTileLayer} onMyLocation={handleMyLocation} onCompass={handleCompass} />
      )}
    </div>
  );
}
