import { createContext, useContext, useState, ReactNode } from 'react';
type Lang = "en" | "st" | "nso";
type AuthContextType = { lang: Lang; setLang: (lang: Lang) => void; user: any; setUser: (u: any) => void; };
const AuthContext = createContext<AuthContextType>({ lang: 'en', setLang: () => {}, user: null, setUser: () => {}, });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  const [user, setUser] = useState<any>(null);
  return <AuthContext.Provider value={{ lang, setLang, user, setUser }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
