import DriverMap3D from './DriverMap3D';

type LatLng = { lat: number; lng: number };

type DriverMapProps = {
  driver: LatLng;
  dropoff: LatLng;
  followTrigger?: number;
};

export default function DriverMapSecure({ driver, dropoff, followTrigger }: DriverMapProps) {
  return (
    <DriverMap3D
      centerBtn={followTrigger}
      driverLocation={[driver.lat, driver.lng]}
      destination={[dropoff.lat, dropoff.lng]}
    />
  );
}