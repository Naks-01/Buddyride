import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

type EmergencyContact = { name: string; phone: string };

type SosButtonProps = {
  rideId?: string | null;
  userRole: 'passenger' | 'driver';
};

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable.'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
  });
}

export function SOSButton({ rideId, userRole }: SosButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);

  const triggerSOS = async () => {
    if (!window.confirm('Are you in emergency? This will alert safety team & share location')) return;
    const user = auth.currentUser;
    if (!user) {
      setMessage('Please sign in before using SOS.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const position = await getPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const userSnapshot = await getDoc(doc(db, 'users', user.uid));
      const contacts = (userSnapshot.data()?.emergencyContacts ?? []) as EmergencyContact[];
      await addDoc(collection(db, 'emergencies'), {
        rideId: rideId ?? null,
        userId: user.uid,
        userRole,
        lat,
        lng,
        timestamp: serverTimestamp(),
        status: 'triggered',
        emergencyContacts: contacts,
      });
      const alert = `EMERGENCY Ride ${rideId ?? 'unknown'} - ${lat},${lng} https://maps.google.com/?q=${lat},${lng}`;
      window.open('tel:10111', '_self');
      window.open(`sms:?body=${encodeURIComponent(alert)}`, '_blank', 'noopener,noreferrer');
      window.open(`https://wa.me/?text=${encodeURIComponent(alert)}`, '_blank', 'noopener,noreferrer');
      contacts.slice(0, 2).forEach((contact) => window.open(`tel:${encodeURIComponent(contact.phone)}`, '_blank', 'noopener,noreferrer'));
      if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorderRef.current = new MediaRecorder(stream);
        recorderRef.current.start();
      }
      setMessage('SOS sent. Safety team and emergency services have been alerted.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to trigger SOS.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => void triggerSOS()} disabled={busy} className="fixed bottom-5 right-5 z-40 rounded-full bg-red-700 px-6 py-4 text-lg font-black text-white shadow-2xl hover:bg-red-800 disabled:opacity-60" aria-label="Emergency SOS">
        {busy ? 'SOS...' : 'SOS'}
      </button>
      {message && <p className="fixed bottom-24 right-5 z-40 max-w-xs rounded-lg bg-white p-3 text-sm text-gray-800 shadow-xl">{message}</p>}
    </>
  );
}

export function EmergencyContacts({ userId }: { userId: string }) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([{ name: '', phone: '' }, { name: '', phone: '' }]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getDoc(doc(db, 'users', userId)).then((snapshot) => {
      const savedContacts = snapshot.data()?.emergencyContacts;
      if (Array.isArray(savedContacts)) {
        setContacts([...savedContacts.slice(0, 2), ...[{ name: '', phone: '' }, { name: '', phone: '' }]].slice(0, 2));
      }
    });
  }, [userId]);

  const saveContacts = async () => {
    await setDoc(doc(db, 'users', userId), { emergencyContacts: contacts.filter((contact) => contact.name && contact.phone) }, { merge: true });
    setSaved(true);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-bold text-gray-800">Emergency contacts</h2>
      {contacts.map((contact, index) => (
        <div key={index} className="mt-2 grid grid-cols-2 gap-2">
          <input value={contact.name} onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder={`Contact ${index + 1} name`} className="rounded border p-2 text-sm" />
          <input value={contact.phone} onChange={(event) => setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, phone: event.target.value } : item))} placeholder="Phone number" className="rounded border p-2 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => void saveContacts()} className="mt-3 rounded bg-gray-800 px-3 py-2 text-sm font-semibold text-white">Save contacts</button>
      {saved && <span className="ml-2 text-sm text-green-600">Saved</span>}
    </section>
  );
}
