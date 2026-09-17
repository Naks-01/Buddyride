import { useEffect, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { decode } from '@googlemaps/polyline-codec';

type LatLng = { lat: number; lng: number };

type DriverGoogleMapSecureProps = {
  driver: LatLng;
  dropoff: LatLng;
};

// Directions are fetched through /api/directions (a Vercel serverless function) so the Google
// Directions server key never reaches the browser - only the restricted browser (Maps JS) key does.
export default function DriverGoogleMapSecure({ driver, dropoff }: DriverGoogleMapSecureProps) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  });
  const [path, setPath] = useState<LatLng[]>([]);

  useEffect(() => {
    if (!driver || !dropoff) return;
    fetch(`/api/directions?origin=${driver.lat},${driver.lng}&destination=${dropoff.lat},${dropoff.lng}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.polyline) {
          const decoded = decode(d.polyline).map(([lat, lng]: [number, number]) => ({ lat, lng }));
          setPath(decoded);
          console.log('ROUTE LIVE', decoded.length + 'pts');
        } else {
          setPath([driver, dropoff]); // fallback 2pts straight
        }
      })
      .catch((err) => {
        console.error('Directions fetch failed:', err);
        setPath([driver, dropoff]); // fallback 2pts straight
      });
  }, [driver, dropoff]);

  if (!isLoaded) return <div className="flex h-full w-full items-center justify-center bg-slate-200">Loading map...</div>;

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%' }}
      center={driver}
      zoom={14}
      options={{ disableDefaultUI: true, zoomControl: false }}
    >
      <Marker position={driver} label="🚕" />
      <Marker position={dropoff} label="🏁" />
      {path.length > 0 && (
        <Polyline
          path={path}
          options={{ strokeColor: '#0066FF', strokeWeight: 6, strokeOpacity: 1 }}
        />
      )}
    </GoogleMap>
  );
}
