import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

type RideHistoryItem = {
  id: string;
  pickup: string;
  dropoff: string;
  fare: number;
  status: string;
  driverName: string | null;
  driverCar: string | null;
  createdAt: Date | null;
};

function addressOf(value: unknown): string {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'address' in value) return String((value as { address?: string }).address ?? '—');
  return '—';
}

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

function statusLabel(status: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return 'In progress';
}

export function PassengerRides() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = profile?.id ?? auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'rides'), where('passengerId', '==', uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rides = snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            return {
              id: docSnapshot.id,
              pickup: addressOf(data.pickup),
              dropoff: addressOf(data.dropoff),
              fare: Number(data.fare ?? data.price ?? data.totalFare ?? 0),
              status: typeof data.status === 'string' ? data.status : 'searching',
              driverName: typeof data.driverName === 'string' ? data.driverName : null,
              driverCar: typeof data.driverCar === 'string' ? data.driverCar : (typeof data.carPlate === 'string' ? data.carPlate : null),
              createdAt: data.createdAt?.toDate?.() ?? null,
            };
          });
        // Sort client-side so we only need Firestore's automatic single-field index.
        rides.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
        setRides(rides);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load ride history:', err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [profile?.id]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-4">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="rounded-full p-1 text-gray-500 hover:text-gray-800">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-gray-800">My Rides</h1>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {loading && <p className="text-sm text-gray-500">Loading ride history...</p>}
        {!loading && rides.length === 0 && <p className="text-sm text-gray-500">No rides yet.</p>}
        <div className="space-y-3">
          {rides.map((ride) => (
            <div key={ride.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{ride.createdAt ? ride.createdAt.toLocaleString() : 'Pending'}</span>
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${STATUS_BADGE[ride.status] ?? 'bg-orange-100 text-orange-700'}`}>
                  {statusLabel(ride.status)}
                </span>
              </div>
              <p className="mt-2 truncate text-sm font-semibold text-gray-800">{ride.pickup} → {ride.dropoff}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">{ride.driverName ? `${ride.driverName}${ride.driverCar ? ` • ${ride.driverCar}` : ''}` : 'No driver assigned'}</span>
                <span className="font-bold text-gray-800">R{ride.fare.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
