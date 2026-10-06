import AppMap from './AppMap';

type LatLng = { lat: number; lng: number };

type DriverMapLeafletProps = {
  driver?: LatLng | null;
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  followTrigger?: number;
};

export default function DriverMapLeaflet({ driver, pickup, dropoff, followTrigger }: DriverMapLeafletProps) {
  const center = driver ?? pickup ?? dropoff ?? { lat: -26.2041, lng: 28.0473 };
  const route = pickup && dropoff ? [[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]] as [[number, number], [number, number]] : undefined;
  const markers = [
    ...(pickup ? [{ id: 'pickup', position: [pickup.lat, pickup.lng] as [number, number], label: 'Pickup', color: '#16A34A', emoji: '●' }] : []),
    ...(dropoff ? [{ id: 'dropoff', position: [dropoff.lat, dropoff.lng] as [number, number], label: 'Dropoff', color: '#DC2626', emoji: '●' }] : []),
  ];
  return (
    <AppMap
      mode="driver"
      center={[center.lat, center.lng]}
      centerBtn={followTrigger}
      routePath={route}
      markers={markers}
      routeColor="#FF5500"
      routeWeight={5}
    />
  );
}