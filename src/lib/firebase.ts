import { getFirestore } from 'firebase/firestore';
import { app, auth } from '../firebase';

export { auth };
export const db = getFirestore(app);
