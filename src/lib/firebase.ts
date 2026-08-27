import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { app, auth } from '../firebase';

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
