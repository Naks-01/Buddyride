import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { BOOKING_FEE, DRIVER_RATE } from '../../config/pricing';
import { DriverPageShell } from './DriverPageShell';

type RideHistoryItem = {
  id: string;
  pickup?: string;
  dropoff?: string;
  fare: number;
  payout: number;
  completedAt: Date | null;
};

function addressOf(value: unknown): string {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'address' in value) return String((value as { address?: string }).address ?? '—');
  return '—';
}

export function DriverRides() {
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const loadRides = async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'rides'), where('driverId', '==', uid), where('status', '==', 'completed'), orderBy('completedAt', 'desc'), limit(30)),
        );
        setRides(
          snapshot.docs.map((docSnapshot) => {
            const data = docSnapshot.data();
            const fare = Number(data.fare ?? data.price ?? 0);
            const payout = Math.max(fare - BOOKING_FEE, 0) * DRIVER_RATE + Number(data.tipAmount ?? 0);
            return {
              id: docSnapshot.id,
              pickup: addressOf(data.pickup),
              dropoff: addressOf(data.dropoff),
              fare,
              payout,
              completedAt: data.completedAt?.toDate?.() ?? null,
            };
          }),
        );
      } catch (err) {
        console.error('Failed to load ride history:', err);
      } finally {
        setLoading(false);
      }
    };
    void loadRides();
  }, []);

  return (
    <DriverPageShell title="My Rides">
      {loading && <p className="text-sm text-gray-400">Loading ride history...</p>}
      {!loading && rides.length === 0 && <p className="text-sm text-gray-400">No completed rides yet.</p>}
      <div className="space-y-3">
        {rides.map((ride) => (
          <div key={ride.id} className="rounded-2xl bg-[#1E2128] p-4">
            <p className="text-sm text-white">{ride.pickup} → {ride.dropoff}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
              <span>{ride.completedAt ? ride.completedAt.toLocaleString() : 'Recently'}</span>
              <span className="font-bold text-[#2ECC71]">You earned R{ride.payout.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </DriverPageShell>
  );
}
