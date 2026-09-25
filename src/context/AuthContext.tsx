import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { doc, getDoc, setDoc, serverTimestamp } from '../lib/supabaseDb';
import type { Lang } from '../lib/i18n';
import { db } from '../lib/supabaseDb';
import { toProfile } from '../lib/converters';
import type { Profile, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  lang: Lang;
  setLang: (lang: Lang) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('buddyride-lang') : null;
    return saved === 'nso' ? 'nso' : 'en';
  });

  const setLang = (l: Lang) => {
    window.localStorage.setItem('buddyride-lang', l);
    setLangState(l);
  };

  // Reads the users/{uid} doc, creating it on first login.
  const ensureProfile = async (uid: string, phone: string | null): Promise<Profile | null> => {
    const userRef = doc(db, 'users', uid);
    const existing = await getDoc(userRef);

    if (existing.exists()) {
      return toProfile(uid, existing.data() ?? {});
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
    return created.exists() ? toProfile(uid, created.data() ?? {}) : null;
  };

  const loadProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    if (!currentUser) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const userProfile = await ensureProfile(currentUser.id, currentUser.phone ?? null);
      setProfile(userProfile);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    await loadProfile();
  };

  useEffect(() => {
    let mounted = true;
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 2500);

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      void loadProfile();
    }).finally(() => {
      if (mounted) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      },
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, lang, setLang, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
