import { useEffect, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from '../../lib/supabaseDb';
import { auth, db } from '../../lib/supabaseDb';
import { toTrip } from '../../lib/converters';
import { useAuth } from '../../context/AuthContext';
import { CarIcon, CheckIcon, LogOutIcon, MapPinIcon } from '../../components/Icons';
import type { Trip } from '../../types';

export function DriverApp() {
  const { profile } = useAuth();
  const [availableRides, setAvailableRides] = useState<Trip[]>([]);
  const [acceptedRides, setAcceptedRides] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchRides();
  }, [profile?.id]);

  useEffect(() => {
    if (!currentRideId) return;
    const unsub = onSnapshot(doc(db, 'rides', currentRideId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.status === 'cancelled' && data.cancelledBy === 'passenger') {
        const reason = data.cancelReason || '';
        setCancelMessage(`RIDE CANCELLED\n\nPassenger cancelled.\n${reason}\n\nYou can accept new rides.`);
        window.setTimeout(() => {
          setCancelMessage(null);
          setCurrentRideId(null);
        }, 4000);
      }
    });
    return () => unsub();
  }, [currentRideId]);

  const fetchRides = async () => {
    setLoading(true);
    try {
      const tripsRef = collection(db, 'trips');
      const [availableSnap, acceptedSnap] = await Promise.all([
        getDocs(query(tripsRef, where('status', '==', 'requested'), where('driver_id', '==', null))),
        profile?.id ? getDocs(query(tripsRef, where('driver_id', '==', profile.id))) : Promise.resolve(null),
      ]);
      const available = availableSnap.docs.map((d) => toTrip(d.id, d.data()));
      const accepted = acceptedSnap ? acceptedSnap.docs.map((d) => toTrip(d.id, d.data())) : [];
      accepted.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setAvailableRides(available);
      setAcceptedRides(accepted);
    } catch (err) {
      console.error(err);
      setError('Failed to load rides');
    } finally {
      setLoading(false);
    }
  };

  const acceptRide = async (rideId: string) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'trips', rideId), { driver_id: profile.id, status: 'accepted' });
      setCurrentRideId(rideId);
      void fetchRides();
    } catch (err) {
      console.error(err);
      setError('Failed to accept ride');
    }
  };

  const handleCancel = async () => {
    if (!currentRideId) return;
    await updateDoc(doc(db, 'rides', currentRideId), {
      status: 'cancelled',
      cancelledBy: 'driver',
      cancelReason: 'Changed mind',
      cancelledAt: serverTimestamp(),
    });
  };

  const logout = async () => { await auth.signOut(); window.location.href = '/'; };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-orange-500">BuddyRide1</h1>
        <button onClick={logout} className="flex items-center gap-2 text-gray-600 hover:text-gray-900"><LogOutIcon size={20} /> Logout</button>
      </header>
      <main className="max-w-2xl mx-auto p-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
        <section className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Available Rides ({availableRides.length})</h2>
          {availableRides.length === 0 ? <p className="text-gray-500 text-center py-8">No available rides</p> : <div className="space-y-3">{availableRides.map((ride) => <div key={ride.id} className="border border-gray-200 rounded-lg p-4"><RideRoute ride={ride} /><button onClick={() => void acceptRide(ride.id)} disabled={loading} className="mt-3 w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg">{loading ? 'Accepting...' : 'Accept Ride'}</button></div>)}</div>}
        </section>
        <section className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">My Accepted Rides ({acceptedRides.length})</h2>
          {acceptedRides.length === 0 ? <p className="text-gray-500 text-center py-8">No accepted rides yet</p> : <div className="space-y-3">{acceptedRides.map((ride) => <div key={ride.id} className="border border-gray-200 rounded-lg p-4 bg-blue-50"><RideRoute ride={ride} /><div className="flex items-center gap-2 mt-2 text-green-600 text-xs font-semibold"><CheckIcon size={16} /> Accepted</div>{currentRideId === ride.id && <button type="button" onClick={() => void handleCancel()} className="mt-3 w-full rounded-lg bg-red-600 py-2 font-semibold text-white hover:bg-red-700">Cancel ride</button>}</div>)}</div>}
        </section>
      </main>
      {cancelMessage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '30px', textAlign: 'center', width: '100%', maxWidth: '350px', border: '4px solid red' }}>
            <div style={{ fontSize: '60px', marginBottom: '15px' }}>⚠️</div>
            <h1 style={{ fontSize: '26px', fontWeight: '900', color: 'red', whiteSpace: 'pre-line', lineHeight: '1.3' }}>{cancelMessage}</h1>
            <button type="button" onClick={() => setCancelMessage(null)} style={{ marginTop: '20px', backgroundColor: 'black', color: 'white', padding: '12px 30px', borderRadius: '30px', fontWeight: 'bold', fontSize: '16px' }}>OK, GOT IT</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RideRoute({ ride }: { ride: Trip }) {
  return <div className="flex items-start gap-3"><MapPinIcon size={24} className="text-orange-500 mt-1" /><div className="flex-1 text-sm text-gray-600"><p><span className="font-semibold">From:</span> {ride.pickup_address}</p><p className="mt-1"><span className="font-semibold">To:</span> {ride.dropoff_address}</p></div><CarIcon size={22} className="text-blue-600" /></div>;
}
