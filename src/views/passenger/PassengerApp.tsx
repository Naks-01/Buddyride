import { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { toTrip } from '../../lib/converters';
import { useAuth } from '../../context/AuthContext';
import { CarIcon, LogOutIcon, MapPinIcon } from '../../components/Icons';
import type { Trip } from '../../types';

export function PassengerApp() {
  const { profile } = useAuth();
  const [rides, setRides] = useState<Trip[]>([]);
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { void fetchRides(); }, [profile?.id]);

  const fetchRides = async () => {
    if (!profile?.id) return;
    try {
      const snapshot = await getDocs(query(collection(db, 'trips'), where('passenger_id', '==', profile.id)));
      const list = snapshot.docs.map((d) => toTrip(d.id, d.data()));
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setRides(list);
    } catch (err) {
      console.error(err);
      setError('Failed to load rides');
    }
  };

  const bookRide = async () => {
    if (!profile?.id || !pickup.trim() || !destination.trim()) { setError('Please enter pickup and destination'); return; }
    setLoading(true);
    try {
      await addDoc(collection(db, 'trips'), {
        passenger_id: profile.id,
        driver_id: null,
        pickup_address: pickup,
        dropoff_address: destination,
        status: 'requested',
        pickup_lat: 0,
        pickup_lng: 0,
        created_at: serverTimestamp(),
      });
      setPickup('');
      setDestination('');
      setError('');
      await fetchRides();
    } catch (err) {
      console.error(err);
      setError('Failed to book ride');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => { await auth.signOut(); window.location.href = '/'; };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center"><h1 className="text-2xl font-bold text-orange-500">BuddyRide1</h1><button onClick={logout} className="flex items-center gap-2 text-gray-600 hover:text-gray-900"><LogOutIcon size={20} /> Logout</button></header>
      <main className="max-w-2xl mx-auto p-4">
        <section className="bg-white rounded-lg shadow-md p-6 mb-6"><h2 className="text-xl font-bold text-gray-900 mb-4">Book a Ride</h2>{error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}<div className="space-y-3"><LocationField label="Pickup Location" value={pickup} onChange={setPickup} /><LocationField label="Destination" value={destination} onChange={setDestination} /><button onClick={() => void bookRide()} disabled={loading} className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-semibold rounded-lg">{loading ? 'Booking...' : 'Book Ride'}</button></div></section>
        <section className="bg-white rounded-lg shadow-md p-6"><h2 className="text-xl font-bold text-gray-900 mb-4">My Rides</h2>{rides.length === 0 ? <p className="text-gray-500 text-center py-8">No rides yet</p> : <div className="space-y-3">{rides.map((ride) => <div key={ride.id} className="border border-gray-200 rounded-lg p-4 flex gap-3"><CarIcon size={24} className="text-orange-500" /><div className="text-sm text-gray-600"><p><b>From:</b> {ride.pickup_address}</p><p className="mt-1"><b>To:</b> {ride.dropoff_address}</p><p className="text-xs mt-2">Status: <b className="capitalize">{ride.status}</b></p></div></div>)}</div>}</section>
      </main>
    </div>
  );
}

function LocationField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-gray-700"><span className="block mb-1">{label}</span><div className="flex items-center gap-2"><MapPinIcon size={20} className="text-orange-500" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-500" /></div></label>;
}
