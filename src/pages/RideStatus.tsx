import { useEffect, useState } from 'react';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { db } from '../lib/firebase';

const libraries: ('places' | 'geometry' | 'marker')[] = ['places', 'geometry', 'marker'];
const fallbackCenter = { lat: -23.9045, lng: 29.7167 };
const statusLabels: Record<string, string> = {
  searching: 'Finding nearby drivers...',
  driver_assigned: 'Driver assigned',
  driver_arriving: 'Driver is on the way',
  in_progress: 'Your ride is in progress',
  completed: 'Ride completed',
  cancelled: 'Ride cancelled',
};

type Point = { lat: number; lng: number };

function readPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null;
  const point = value as { lat?: unknown; lng?: unknown };
  return typeof point.lat === 'number' && typeof point.lng === 'number' ? { lat: point.lat, lng: point.lng } : null;
}

export function RideStatus() {
  const { id } = useParams<{ id: string }>();
  const [ride, setRide] = useState<DocumentData | null>(null);
  const [error, setError] = useState('');
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey || 'missing-key', libraries });

  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, 'rides', id),
      (snapshot) => {
        if (snapshot.exists()) setRide(snapshot.data());
        else setError('Ride not found.');
      },
      () => setError('Unable to load ride status.'),
    );
  }, [id]);

  const pickup = readPoint(ride?.pickup);
  const destination = readPoint(ride?.destination);
  const driver = readPoint(ride?.driverLocation ?? ride?.driver_location);
  const center = driver ?? pickup ?? destination ?? fallbackCenter;
  const status = typeof ride?.status === 'string' ? ride.status : 'searching';

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <section className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-xl bg-white p-4 shadow-sm">
          <h1 className="text-2xl font-bold text-orange-500">BuddyRide status</h1>
          <p className="mt-2 font-semibold text-gray-800">{statusLabels[status] ?? status}</p>
          {ride?.driverName && <p className="mt-1 text-sm text-gray-600">Driver: {String(ride.driverName)}</p>}
          {ride?.driverPhone && <a className="mt-1 block text-sm text-orange-600" href={`tel:${String(ride.driverPhone)}`}>{String(ride.driverPhone)}</a>}
        </header>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {isLoaded && apiKey ? (
          <GoogleMap mapContainerStyle={{ width: '100%', height: '430px' }} center={center} zoom={14}>
            {pickup && <Marker position={pickup} label="A" />}
            {destination && <Marker position={destination} label="B" />}
            {driver && <Marker position={driver} label="Driver" />}
          </GoogleMap>
        ) : (
          <div className="flex h-[430px] items-center justify-center rounded-xl bg-gray-200 text-gray-600">Map unavailable</div>
        )}

        <div className="rounded-xl bg-white p-4 text-sm text-gray-700 shadow-sm">
          <p><span className="font-semibold">Pickup:</span> {String(ride?.pickup?.address ?? 'Pending')}</p>
          <p className="mt-2"><span className="font-semibold">Destination:</span> {String(ride?.destination?.address ?? 'Pending')}</p>
          {typeof ride?.distance === 'number' && <p className="mt-2">Distance: {ride.distance.toFixed(1)} km</p>}
          {typeof ride?.fareEstimate === 'number' && <p className="mt-1">Estimated fare: R{ride.fareEstimate.toFixed(2)}</p>}
        </div>
      </section>
    </main>
  );
}
