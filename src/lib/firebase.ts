import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { app, auth } from '../firebase';

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
// Realtime Database - used for high-frequency live driver location instead of Firestore
// (RTDB reads/writes are free at this scale; Firestore charges per document read/write).
export const rtdb = getDatabase(app, import.meta.env.VITE_FIREBASE_DATABASE_URL);
