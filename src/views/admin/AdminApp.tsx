import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { toProfile, toTrip } from '../../lib/converters';
import { LogOutIcon } from '../../components/Icons';
import type { Profile, Trip } from '../../types';

type Tab = 'users' | 'rides';

export function AdminApp() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [rides, setRides] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { void loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'users') {
        const snapshot = await getDocs(collection(db, 'users'));
        const list = snapshot.docs.map((d) => toProfile(d.id, d.data()));
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setUsers(list);
      } else {
        const snapshot = await getDocs(collection(db, 'trips'));
        const list = snapshot.docs.map((d) => toTrip(d.id, d.data()));
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setRides(list);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => { await auth.signOut(); window.location.href = '/'; };
  const badge = (value: string) => value === 'admin' ? 'bg-orange-100 text-orange-800' : value === 'driver' ? 'bg-blue-100 text-blue-800' : value === 'passenger' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center"><h1 className="text-2xl font-bold text-orange-500">BuddyRide1 Admin</h1><button onClick={logout} className="flex items-center gap-2 text-gray-600 hover:text-gray-900"><LogOutIcon size={20} /> Logout</button></header>
      <main className="max-w-6xl mx-auto p-4">
        <div className="flex gap-2 mb-6"><button onClick={() => setTab('users')} className={`px-4 py-2 rounded-lg font-semibold ${tab === 'users' ? 'bg-orange-500 text-white' : 'bg-white text-gray-700 border'}`}>Users</button><button onClick={() => setTab('rides')} className={`px-4 py-2 rounded-lg font-semibold ${tab === 'rides' ? 'bg-orange-500 text-white' : 'bg-white text-gray-700 border'}`}>Rides</button></div>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
        {loading ? <p className="text-center py-12 text-gray-500">Loading...</p> : tab === 'users' ? <UserTable users={users} badge={badge} /> : <RideTable rides={rides} badge={badge} />}
      </main>
    </div>
  );
}

function UserTable({ users, badge }: { users: Profile[]; badge: (value: string) => string }) {
  return <Table headers={['Name', 'Phone', 'Role', 'Vehicle', 'Approved']}><>{users.map((user) => <tr key={user.id} className="border-b"><td className="px-4 py-3">{user.full_name || '-'}</td><td className="px-4 py-3">{user.phone || '-'}</td><td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${badge(user.role)}`}>{user.role}</span></td><td className="px-4 py-3">{user.vehicle_plate || user.vehicle_model || '-'}</td><td className="px-4 py-3">{user.is_driver_approved ? 'Yes' : 'No'}</td></tr>)}</> </Table>;
}

function RideTable({ rides, badge }: { rides: Trip[]; badge: (value: string) => string }) {
  return <Table headers={['From', 'To', 'Status', 'Driver', 'Created']}><>{rides.map((ride) => <tr key={ride.id} className="border-b"><td className="px-4 py-3">{ride.pickup_address}</td><td className="px-4 py-3">{ride.dropoff_address}</td><td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs ${badge(ride.status)}`}>{ride.status}</span></td><td className="px-4 py-3">{ride.driver_id ? 'Yes' : 'No'}</td><td className="px-4 py-3">{new Date(ride.created_at).toLocaleDateString()}</td></tr>)}</> </Table>;
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="bg-white rounded-lg shadow-md overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-100"><tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold text-gray-700">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
