import { useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';

type LatLng = { lat: number; lng: number };

type DriverGoogleMapProps = {
  driver: LatLng;
  dropoff: LatLng;
  followTrigger?: number;
};

const PROVIDER_GOOGLE = 'google';
const FOLLOW_ZOOM = 17;
const mapContainerStyle = { width: '100%', height: '100%' };

export default function DriverGoogleMapSecure({ driver, dropoff, followTrigger }: DriverGoogleMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'buddyride-google-maps',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
    libraries: ['places'],
  });
  const mapRef = useRef<google.maps.Map | null>(null);
  const [followMode, setFollowMode] = useState(true);

  useEffect(() => setFollowMode(true), [followTrigger]);

  useEffect(() => {
    if (followMode && mapRef.current) {
      mapRef.current.panTo(driver);
      mapRef.current.setZoom(FOLLOW_ZOOM);
    }
  }, [driver, followMode]);

  if (loadError || !import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return <div className="flex h-full items-center justify-center bg-slate-900 p-4 text-center text-sm text-white">Google Maps requires VITE_GOOGLE_MAPS_API_KEY.</div>;
  }
  if (!isLoaded) return <div className="flex h-full items-center justify-center bg-slate-900 text-sm text-white">Loading Google Maps...</div>;

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={driver}
      zoom={FOLLOW_ZOOM}
      onLoad={(map) => { mapRef.current = map; }}
      onUnmount={() => { mapRef.current = null; }}
      onDragStart={() => setFollowMode(false)}
      options={{ mapTypeControl: false, streetViewControl: false, fullscreenControl: false }}
    >
      <Marker position={driver} label="Driver" />
      <Marker position={dropoff} label="Destination" />
      <Polyline path={[driver, dropoff]} options={{ strokeColor: '#1A73E8', strokeOpacity: 0.9, strokeWeight: 6 }} />
      <span className="sr-only">Map provider: {PROVIDER_GOOGLE}</span>
    </GoogleMap>
  );
}