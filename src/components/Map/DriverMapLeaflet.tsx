import AppMap from './AppMap';

type LatLng = { lat: number; lng: number };

type DriverMapLeafletProps = {
  driver: LatLng;
  dropoff: LatLng;
  followTrigger?: number;
};

export default function DriverMapLeaflet({ driver, dropoff, followTrigger }: DriverMapLeafletProps) {
  return (
    <AppMap
      mode="driver"
      center={[driver.lat, driver.lng]}
      centerBtn={followTrigger}
      routePath={[[driver.lat, driver.lng], [dropoff.lat, dropoff.lng]]}
      markers={[{ id: 'dropoff', position: [dropoff.lat, dropoff.lng], label: 'Destination', emoji: '🏁' }]}
    />
  );
}