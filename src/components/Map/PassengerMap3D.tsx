import AppMap from './AppMap';

export type PassengerMapMarker = {
  id: string;
  position: [number, number];
  color?: string;
  emoji?: string;
  rotation?: number;
};

type PassengerMapProps = {
  center?: [number, number];
  centerBtn?: number;
  zoom?: number;
  markers?: PassengerMapMarker[];
  routePath?: [number, number][];
  onMapClick?: (lat: number, lng: number) => void;
  onUserInteraction?: () => void;
};

export default function PassengerMap({
  center,
  centerBtn,
  zoom = 14,
  markers = [],
  routePath,
  onMapClick,
  onUserInteraction,
}: PassengerMapProps) {
  return (
    <AppMap
      mode="passenger"
      center={center}
      centerBtn={centerBtn}
      zoom={zoom}
      markers={markers}
      routePath={routePath}
      onMapClick={onMapClick}
      onUserInteraction={onUserInteraction}
    />
  );
}