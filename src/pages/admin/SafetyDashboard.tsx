import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import AppMap, { type AppMapMarker } from '../../components/Map/AppMap';

type Emergency = {
  id: string;
  rideId?: string | null;
  userId?: string;
  userRole?: string;
  lat?: number;
  lng?: number;
  status?: string;
  notes?: string;
};

export default function SafetyDashboard() {
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(collection(db, 'emergencies'), (snapshot) => {
    setEmergencies(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Emergency, 'id'>) })));
  }, () => setError('Unable to load emergencies.')), []);

  const resolve = async (emergency: Emergency) => {
    const notes = window.prompt('Resolution notes', emergency.notes ?? '') ?? emergency.notes ?? '';
    await updateDoc(doc(db, 'emergencies', emergency.id), { status: 'resolved', notes, resolvedAt: new Date() });
  };

  const markers: AppMapMarker[] = emergencies
    .filter((emergency): emergency is Emergency & { lat: number; lng: number } => emergency.lat != null && emergency.lng != null)
    .map((emergency) => ({ id: emergency.id, position: [emergency.lat, emergency.lng], color: '#d93025', emoji: '🚨' }));

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold text-red-400">Safety emergencies</h1>
        {error && <p className="mb-4 rounded bg-red-950 p-3 text-red-200">{error}</p>}
        {emergencies.length > 0 && (
          <div className="mb-4 h-[320px] overflow-hidden rounded-lg">
            <AppMap mode="passenger" center={[emergencies[0].lat ?? -23.9045, emergencies[0].lng ?? 29.7167]} zoom={12} markers={markers} />
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-gray-800 text-gray-300"><tr><th className="p-3">Status</th><th className="p-3">Ride</th><th className="p-3">User</th><th className="p-3">Location</th><th className="p-3">Map</th><th className="p-3">Notes</th><th className="p-3">Action</th></tr></thead>
            <tbody>
              {emergencies.map((emergency) => (
                <tr key={emergency.id} className="border-t border-gray-800">
                  <td className="p-3 capitalize">{emergency.status ?? 'triggered'}</td>
                  <td className="p-3">{emergency.rideId ?? '-'}</td>
                  <td className="p-3">{emergency.userId ?? '-'} ({emergency.userRole ?? '-'})</td>
                  <td className="p-3">{emergency.lat?.toFixed(5)}, {emergency.lng?.toFixed(5)}</td>
                  <td className="p-3"><a className="text-orange-400 underline" href={`https://www.openstreetmap.org/?mlat=${emergency.lat}&mlon=${emergency.lng}#map=16/${emergency.lat}/${emergency.lng}`} target="_blank" rel="noreferrer">Open map</a></td>
                  <td className="p-3">{emergency.notes ?? '-'}</td>
                  <td className="p-3"><button type="button" onClick={() => void resolve(emergency)} className="rounded bg-green-600 px-3 py-2 font-semibold">Resolve</button></td>
                </tr>
              ))}
              {emergencies.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">No emergencies.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
