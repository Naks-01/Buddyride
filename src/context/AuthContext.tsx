import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, UserRole } from '../types';
import { toProfile } from '../lib/converters';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  lang: 'en' | 'st';
  setLang: (l: 'en' | 'st') => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<'en' | 'st'>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('buddyride-lang') : null;
    return saved === 'st' || saved === 'en' ? saved : 'en';
  });

  const setLangState = (l: 'en' | 'st') => {
    setLang(l);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('buddyride-lang', l);
    }
  };

  const ensureProfile = async (uid: string, phone: string | null): Promise<Profile | null> => {
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (existing) {
      return toProfile(existing);
    }

    const { data: created, error: createError } = await supabase
      .from('profiles')
      .insert({
        id: uid,
        phone: phone,
        name: null,
        role: 'driver' as UserRole,
        is_driver_approved: true,
        vehicle_make: null,
        vehicle_plate: null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      console.error('Failed to create profile', createError);
      return null;
    }

    return created ? toProfile(created) : null;
  };

  const loadProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const p = await ensureProfile(currentUser.id, (currentUser as any).phone ?? null);
      setProfile(p);
    } catch (err) {
      console.error('Failed to load profile', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session?.user ?? null);
  };

  useEffect(() => {
    let mounted = true;
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 2500);

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      await loadProfile(data.session?.user ?? null);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
    });

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
    <AuthContext.Provider value={{ user, profile, loading, lang, setLang: setLangState, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
