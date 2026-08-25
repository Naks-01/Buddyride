import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { LogOutIcon } from '../../components/Icons';
import { Logo } from '../../components/Logo';

type Location = { placeId?: string; address?: string; name?: string; lat?: number; lng?: number };

type RideRequest = {
  id: string;
  pickup?: string | Location;
  dropoff?: string | Location;
  pickupLatLng?: { lat: number; lng: number };
  dropoffLatLng?: { lat: number; lng: number };
  distance?: string | number;
  price?: number;
  status?: string;
  passengerId?: string;
  driverId?: string | null;
  driverPhone?: string | null;
  passengerPhone?: string | null;
  createdAt?: unknown;
};

// Firestore for this project is provisioned in the africa-south1 region.
export function DriverDashboard() {
  const [rides, setRides] = useState<RideRequest[]>([]);
  const [acceptedRide, setAcceptedRide] = useState<RideRequest | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const requestedQuery = query(collection(db, 'rides'), where('status', '==', 'searching'));
    const unsubscribe = onSnapshot(
      requestedQuery,
      (snapshot) => {
        setRides(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as RideRequest)));
      },
      (err) => {
        console.error(err);
        setError('Failed to load ride requests.');
      },
    );
    return () => unsubscribe();
  }, []);

  const acceptRide = async (ride: RideRequest) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setAccepting(ride.id);
    try {
      await updateDoc(doc(db, 'rides', ride.id), {
        status: 'accepted',
        driverId: uid,
        driverName: auth.currentUser?.displayName ?? 'Driver',
        driverPhone: auth.currentUser?.phoneNumber ?? null,
        acceptedAt: serverTimestamp(),
      });
      setAcceptedRide(ride);
    } catch (err) {
      console.error(err);
      setError('Failed to accept ride.');
    } finally {
      setAccepting(null);
    }
  };

  // Keep the accepted ride's status in sync as the passenger and driver progress through the ride.
  useEffect(() => {
    if (!acceptedRide) return;
    const unsubscribe = onSnapshot(doc(db, 'rides', acceptedRide.id), (snapshot) => {
      const data = snapshot.data() as Record<string, unknown> | undefined;
      if (!data) return;
      setAcceptedRide((prev) => (prev ? { ...prev, ...(data as Record<string, unknown>) } : prev));
    });
    return () => unsubscribe();
  }, [acceptedRide?.id]);

  const [updatingStatus, setUpdatingStatus] = useState(false);

  const updateRideStatus = async (rideId: string, status: string, extra?: Record<string, unknown>) => {
    setUpdatingStatus(true);
    try {
      await updateDoc(doc(db, 'rides', rideId), { status, ...extra });
    } catch (err) {
      console.error(err);
      setError('Failed to update ride status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const markArrived = (ride: RideRequest) => void updateRideStatus(ride.id, 'driver_arrived', { arrivedAt: serverTimestamp() });
  const startTrip = (ride: RideRequest) => void updateRideStatus(ride.id, 'in_progress', { startedAt: serverTimestamp() });
  const completeTrip = (ride: RideRequest) =>
    void updateRideStatus(ride.id, 'completed', { completedAt: serverTimestamp() });

  const navigateToPickup = (ride: RideRequest) => {
    const pickup = ride.pickupLatLng ?? { lat: 0, lng: 0 };
    const dropoff = ride.dropoffLatLng ?? { lat: 0, lng: 0 };
    const url = `https://www.google.com/maps/dir/${pickup.lat},${pickup.lng}/${dropoff.lat},${dropoff.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const finishRide = () => setAcceptedRide(null);

  const logout = async () => {
    await auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center">
        <Logo size={48} />
        <button onClick={() => void logout()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <LogOutIcon size={20} /> Logout
        </button>
      </header>

      <main className="flex-1 p-4 max-w-2xl w-full mx-auto">
        <h2 className="text-lg font-bold text-gray-800 mb-3">Incoming Ride Requests</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {acceptedRide && (
          <section className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-bold text-green-900">Accepted Ride</h2>
            <RideDetails ride={acceptedRide} />
            <a
              href={`tel:${acceptedRide.passengerPhone ?? ''}`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 py-2 font-bold text-green-700 hover:bg-green-100"
            >
              Call Passenger
            </a>
            <button
              onClick={() => navigateToPickup(acceptedRide)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3 font-bold text-white hover:bg-green-700"
            >
              Navigate
            </button>
            {acceptedRide.status === 'accepted' && (
              <button
                onClick={() => markArrived(acceptedRide)}
                disabled={updatingStatus}
                className="mt-2 w-full rounded-lg bg-orange-500 py-3 font-bold text-white disabled:opacity-60"
              >
                I've Arrived
              </button>
            )}
            {acceptedRide.status === 'driver_arrived' && (
              <button
                onClick={() => startTrip(acceptedRide)}
                disabled={updatingStatus}
                className="mt-2 w-full rounded-lg bg-orange-500 py-3 font-bold text-white disabled:opacity-60"
              >
                Start Trip
              </button>
            )}
            {acceptedRide.status === 'in_progress' && (
              <button
                onClick={() => completeTrip(acceptedRide)}
                disabled={updatingStatus}
                className="mt-2 w-full rounded-lg bg-orange-500 py-3 font-bold text-white disabled:opacity-60"
              >
                Complete Trip
              </button>
            )}
            {acceptedRide.status === 'completed' && (
              <div className="mt-3 space-y-2">
                <p className="text-center text-sm font-semibold text-green-800">
                  R{Number(acceptedRide.price ?? 0).toFixed(2)} Collected - Cash
                </p>
                <button
                  onClick={finishRide}
                  className="w-full rounded-lg bg-gray-200 py-2 font-bold text-gray-700 hover:bg-gray-300"
                >
                  Done
                </button>
              </div>
            )}
          </section>
        )}

        {rides.length === 0 && !acceptedRide && <p className="text-sm text-gray-500">No ride requests right now.</p>}

        <div className="space-y-3">
          {rides.map((ride) => (
            <div key={ride.id} className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
              <RideDetails ride={ride} />
              <p className="text-gray-500 text-sm mb-3">Passenger: {ride.passengerId ?? 'test123'}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => navigateToPickup(ride)}
                  className="w-full rounded-lg border border-orange-500 py-2 font-bold text-orange-600 hover:bg-orange-50"
                >
                  Open in Maps
                </button>
                <button
                  onClick={() => void acceptRide(ride)}
                  disabled={accepting === ride.id}
                  className="w-full rounded-lg bg-orange-500 py-2 font-bold text-white disabled:opacity-60"
                >
                  {accepting === ride.id ? 'Accepting...' : 'Accept Ride'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function RideDetails({ ride }: { ride: RideRequest }) {
  const formatLocation = (loc?: string | Location) => {
    if (!loc) return '—';
    if (typeof loc === 'string') return loc;
    return loc.address ?? loc.name ?? JSON.stringify(loc);
  };
  return (
    <div className="space-y-1 text-sm text-gray-700">
      <p><span className="font-semibold">Pickup:</span> {formatLocation(ride.pickup)}</p>
      <p><span className="font-semibold">Dropoff:</span> {formatLocation(ride.dropoff)}</p>
      <p><span className="font-semibold">Distance:</span> {typeof ride.distance === 'number' ? `${ride.distance} km` : ride.distance ?? '—'}</p>
      <p><span className="font-semibold">Fare:</span> R{Number(ride.price ?? 0).toFixed(2)}</p>
    </div>
  );
}

