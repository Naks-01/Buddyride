import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Lang } from '../lib/i18n';
import { auth, db } from '../lib/firebase';
import { toProfile } from '../lib/converters';
import type { Profile, UserRole } from '../types';

interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  lang: Lang;
  setLang: (lang: Lang) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('buddyride-lang');
    return saved === 'nso' ? 'nso' : 'en';
  });

  const setLang = (l: Lang) => {
    localStorage.setItem('buddyride-lang', l);
    setLangState(l);
  };

  // Reads the users/{uid} doc, creating it on first login.
  const ensureProfile = async (uid: string, phone: string | null): Promise<Profile | null> => {
    const userRef = doc(db, 'users', uid);
    const existing = await getDoc(userRef);

    if (existing.exists()) {
      return toProfile(uid, existing.data());
    }

    const newUser = {
      uid,
      phone,
      name: '',
      role: 'passenger' as UserRole,
      is_driver_approved: false,
      vehicle_plate: null,
      vehicle_model: null,
      createdAt: serverTimestamp(),
    };

    await setDoc(userRef, newUser);
    const created = await getDoc(userRef);
    return created.exists() ? toProfile(uid, created.data()) : null;
  };

  const loadProfile = async () => {
    const user = auth.currentUser;
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const userProfile = await ensureProfile(user.uid, user.phoneNumber);
    setProfile(userProfile);
    setLoading(false);
  };

  const refreshProfile = async () => {
    await loadProfile();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      void loadProfile();
    });
    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ profile, loading, lang, setLang, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
