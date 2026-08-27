import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { BOOKING_FEE, COMMISSION_RATE } from '../../config/pricing';
import type { VerificationStatus } from '../../types';

const API = import.meta.env.VITE_API_URL || 'http://' + window.location.hostname + ':5000';

type VerificationEntry = {
  id: string;
  name?: string | null;
  phone?: string | null;
  idNumberLast4?: string | null;
  selfieUrl?: string | null;
  verificationStatus?: VerificationStatus;
};

type Ride = {
  _id?: string;
  id?: string;
  pickup?: string | { address?: string; name?: string };
  pickup_address?: string;
  dropoff?: string | { address?: string; name?: string };
  dropoff_address?: string;
  driverId?: string | null;
  driver_id?: string | null;
  status?: string;
  price?: number;
  fare?: number;
  cancellationFee?: number;
  cancellationPlatformCut?: number;
  tipAmount?: number;
  createdAt?: string;
  created_at?: string;
};

function locationValue(value?: string | { address?: string; name?: string }) {
  if (!value) return '';
  return typeof value === 'string' ? value : value.address || value.name || '';
}

function rideId(ride: Ride) {
  return ride._id || ride.id || '';
}

function rideDate(ride: Ride) {
  const value = ride.createdAt || ride.created_at;
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export function AdminApiDashboard() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [verificationQueue, setVerificationQueue] = useState<VerificationEntry[]>([]);
  const totalTipsByDriver = rides.reduce<Record<string, number>>((totals, ride) => {
    const driver = ride.driverId || ride.driver_id;
    if (driver) totals[driver] = (totals[driver] ?? 0) + Number(ride.tipAmount ?? 0);
    return totals;
  }, {});

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const entries = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as VerificationEntry))
        .filter((u) => Boolean(u.idNumberLast4));
      setVerificationQueue(entries);
    });
    return () => unsubscribe();
  }, []);

  const setVerification = async (userId: string, status: VerificationStatus) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        verificationStatus: status,
        idNumberVerified: status === 'verified',
        verifiedAt: status === 'verified' ? serverTimestamp() : null,
      });
    } catch (err) {
      console.error(err);
      setError('Failed to update verification status.');
    }
  };

  useEffect(() => {
    console.log('BuddyRide API URL:', API);

    const fetchRides = async () => {
      try {
        const response = await fetch(`${API}/api/rides/admin/all`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('API returned an invalid rides list');
        setRides(data as Ride[]);
        setConnected(true);
        setError('');
      } catch (fetchError) {
        console.error('Failed to fetch rides from', API, fetchError);
        setConnected(false);
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      }
    };

    void fetchRides();
    const intervalId = window.setInterval(() => void fetchRides(), 3000);
    return () => window.clearInterval(intervalId);
  }, []);

  const deleteRide = async (id: string) => {
    if (!id) return;
    try {
      const response = await fetch(`${API}/api/ride/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      setRides((current) => current.filter((ride) => rideId(ride) !== id));
    } catch (deleteError) {
      console.error('Failed to delete ride from', API, deleteError);
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    }
  };

  const logout = async () => {
    await signOut();
    localStorage.clear();
    navigate('/');
  };

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-gray-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">BuddyRide Admin</h1>
            <p className="mt-1 text-sm text-gray-400">API: {API}</p>
          </div>
          <div className="flex items-center gap-4">
            <p className={connected ? 'text-green-400' : 'text-red-400'}>
              {connected ? '✅ Connected' : '❌ Failed'}
            </p>
            <button type="button" onClick={() => void logout()} className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">
              Logout
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950 p-4 text-sm text-red-200">
            <strong>Could not load rides.</strong> API: {API}. Error: {error}
          </div>
        )}
        <p className="mb-4 text-sm text-gray-300">Total tips by driver: {Object.entries(totalTipsByDriver).map(([driver, total]) => `${driver}: R${total.toFixed(2)}`).join(' | ') || 'None'}</p>

        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-gray-800 text-gray-300">
              <tr>
                <th className="px-4 py-3">Pickup</th>
                <th className="px-4 py-3">Dropoff</th>
                <th className="px-4 py-3">DriverId</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Cancellation earnings</th>
                <th className="px-4 py-3">Tips</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rides.map((ride) => {
                const id = rideId(ride);
                return (
                  <tr key={id} className="border-t border-gray-800">
                    <td className="px-4 py-3">{ride.pickup_address || locationValue(ride.pickup) || '-'}</td>
                    <td className="px-4 py-3">{ride.dropoff_address || locationValue(ride.dropoff) || '-'}</td>
                    <td className="px-4 py-3">{ride.driverId || ride.driver_id || '-'}</td>
                    <td className="px-4 py-3 capitalize">{ride.status || '-'}</td>
                    <td className="px-4 py-3">R{Number(ride.price ?? ride.fare ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3">Platform: R{((Math.max(Number(ride.price ?? ride.fare ?? 0) - BOOKING_FEE, 0) * COMMISSION_RATE) + BOOKING_FEE).toFixed(2)}</td>
                    <td className="px-4 py-3">R{Number(ride.cancellationPlatformCut ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3">R{Number(ride.tipAmount ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3">{rideDate(ride)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void deleteRide(id)}
                        disabled={!id}
                        className="rounded bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rides.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">No rides found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 className="mb-3 mt-8 text-xl font-bold">Verification Queue</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-gray-800 text-gray-300">
              <tr>
                <th className="px-4 py-3">Passenger</th>
                <th className="px-4 py-3">ID (last 4)</th>
                <th className="px-4 py-3">Selfie</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {verificationQueue.map((entry) => (
                <tr key={entry.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{entry.name || entry.phone || entry.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 font-mono">{entry.idNumberLast4 || '-'}</td>
                  <td className="px-4 py-3">
                    {entry.selfieUrl ? (
                      <a href={entry.selfieUrl} target="_blank" rel="noopener noreferrer">
                        <img src={entry.selfieUrl} alt="Selfie" className="h-10 w-10 rounded-full object-cover" />
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{entry.verificationStatus ?? 'unverified'}</td>
                  <td className="px-4 py-3 space-x-2">
                    <button
                      type="button"
                      onClick={() => void setVerification(entry.id, 'verified')}
                      disabled={entry.verificationStatus === 'verified'}
                      className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ShieldCheck size={14} /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void setVerification(entry.id, 'failed')}
                      disabled={entry.verificationStatus === 'failed'}
                      className="inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ShieldX size={14} /> Reject
                    </button>
                  </td>
                </tr>
              ))}
              {verificationQueue.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No verification submissions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
