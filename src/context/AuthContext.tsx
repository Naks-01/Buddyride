import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type Lang = 'en' | 'st' | 'nso';
type AuthContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  user: any;
  setUser: (user: any) => void;
  profile: any;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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
    setProfile(data ? { ...data, uid: data.uid ?? data.id, name: data.name ?? data.full_name } : null);
  };

  const refreshProfile = async () => {
    await fetchProfile(user);
  };

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setProfile(null);
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
