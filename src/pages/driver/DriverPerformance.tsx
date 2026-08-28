import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { DriverPageShell } from './DriverPageShell';

export function DriverPerformance() {
  const [driverProfile, setDriverProfile] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    void getDoc(doc(db, 'drivers', uid)).then((snapshot) => {
      if (snapshot.exists()) setDriverProfile(snapshot.data());
    });
  }, []);

  const rating = Number(driverProfile?.avgRating ?? 4.94);
  const score = Number(driverProfile?.driverScore ?? 90);
  const acceptanceRate = Number(driverProfile?.acceptanceRate ?? 74);

  return (
    <DriverPageShell title="Performance">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#1E2128] p-4 text-center">
          <p className="text-xs text-gray-400">Driver score</p>
          <p className="mt-1 text-2xl font-bold text-white">{score}%</p>
        </div>
        <div className="rounded-2xl bg-[#1E2128] p-4 text-center">
          <p className="text-xs text-gray-400">Star rating</p>
          <p className="mt-1 text-2xl font-bold text-white">{rating.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-[#1E2128] p-4 text-center">
          <p className="text-xs text-gray-400">Acceptance rate</p>
          <p className="mt-1 text-2xl font-bold text-white">{acceptanceRate}%</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-gray-400">
        Keep your acceptance rate above 70% and your rating above 4.5 to stay eligible for BuddyRide promotions.
      </p>
    </DriverPageShell>
  );
}
