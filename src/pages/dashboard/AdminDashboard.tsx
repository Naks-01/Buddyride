import { useEffect, useState } from 'react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { MapComponent } from '../../components/MapComponent';
import { LogOutIcon } from '../../components/Icons';

export function AdminDashboard() {
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalRides, setTotalRides] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { void loadStats(); }, []);

  const loadStats = async () => {
    setError('');
    try {
      const [usersCount, ridesCount] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'trips')),
      ]);
      setTotalUsers(usersCount.data().count);
      setTotalRides(ridesCount.data().count);
    } catch (err) {
      console.error(err);
      setError('Failed to load stats');
    }
  };

  const logout = async () => { await auth.signOut(); window.location.href = '/'; };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-orange-500">BuddyRide1 - Admin</h1>
        <button onClick={() => void logout()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <LogOutIcon size={20} /> Logout
        </button>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
        <div className="map-container mb-4" style={{ height: 320, borderRadius: 16, overflow: 'hidden' }}>
          <MapComponent />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
            <p className="text-gray-500 mb-2">Total Users</p>
            <p className="text-4xl font-bold text-orange-500">{totalUsers ?? '...'}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
            <p className="text-gray-500 mb-2">Total Rides</p>
            <p className="text-4xl font-bold text-orange-500">{totalRides ?? '...'}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
