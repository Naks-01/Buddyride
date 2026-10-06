import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { AppRole } from '../types';
import { ADMIN_EMAIL } from '../config/admin';

type Lang = 'en' | 'st' | 'nso';
type AuthContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  user: any;
  setUser: (user: any) => void;
  profile: any;
  loading: boolean;
  login: (email: string, password: string, role: AppRole) => Promise<any>;
  signUp: (email: string, password: string, role: AppRole, fullName: string) => Promise<any>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  lang: 'en',
  setLang: () => {},
  user: null,
  setUser: () => {},
  profile: null,
  loading: true,
  login: async () => {},
  signUp: async () => null,
  logout: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (currentUser: any) => {
    if (!currentUser || !isSupabaseConfigured) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error) throw error;
    setProfile(data ? {
      ...data,
      email: currentUser.email ?? null,
      role: data.role ?? data.user_type ?? null,
      uid: data.uid ?? data.id,
      name: data.name ?? data.full_name,
    } : null);
  };

  const refreshProfile = async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (currentUser) setUser(currentUser);
    await fetchProfile(currentUser);
  };

  const login = async (email: string, password: string, role: AppRole) => {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('Sign-in did not return a user.');
    if (role === 'admin' && data.user.email?.toLowerCase() !== ADMIN_EMAIL) {
      await supabase.auth.signOut();
      throw new Error('Access denied. This account is not an administrator.');
    }

    const { data: existingProfile, error: profileReadError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileReadError) {
      await supabase.auth.signOut();
      throw new Error(`Could not read your profile: ${profileReadError.message}`);
    }

    const accountRole = (existingProfile?.role ?? existingProfile?.user_type) as AppRole | null | undefined;
    if (accountRole && accountRole !== role) {
      await supabase.auth.signOut();
      throw new Error(`This account is registered as ${accountRole}. Go to /login?role=${accountRole}.`);
    }

    if (!existingProfile) {
      const { error: insertError } = await supabase.from('profiles').insert({
        id: data.user.id,
        role,
        full_name: data.user.user_metadata?.full_name ?? data.user.email ?? null,
        email: data.user.email ?? null,
      });
      if (insertError) {
        await supabase.auth.signOut();
        throw new Error(`Could not create your profile: ${insertError.message}`);
      }
    } else if (!accountRole) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', data.user.id);
      if (updateError) {
        await supabase.auth.signOut();
        throw new Error(`Could not set your account role: ${updateError.message}`);
      }
    }

    setUser(data.user);
    await fetchProfile(data.user);
    return data.user;
  };

  const signUp = async (email: string, password: string, role: AppRole, fullName: string) => {
    if (role === 'admin') throw new Error('Admin accounts cannot be created here.');
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, full_name: fullName } },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Account creation did not return a user.');

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      role,
      full_name: fullName,
      email,
    }, { onConflict: 'id' });
    if (profileError) console.warn('Unable to save the new profile:', profileError);

    return data.user;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
    for (const roleKey of ['passenger', 'driver', 'admin']) {
      localStorage.removeItem(`${roleKey}LoggedIn`);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      window.setTimeout(() => {
        void fetchProfile(nextUser)
          .catch((error) => console.warn('Unable to load the Supabase profile:', error))
          .finally(() => { if (active) setLoading(false); });
      }, 0);
    });

    void supabase.auth.getSession()
      .then(async ({ data, error }) => {
        if (error) throw error;
        if (!active) return;
        const currentUser = data.session?.user ?? null;
        setUser(currentUser);
        await fetchProfile(currentUser);
      })
      .catch((error) => console.warn('Unable to restore the Supabase session:', error))
      .finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      login,
      signUp,
      logout,
      signOut: logout,
      refreshProfile,
      lang,
      setLang,
      setUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
