import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LangSelector } from '../components/LangSelector';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { t } from '../lib/i18n';
import type { AppRole } from '../types';
import { supabase } from '../lib/supabase';
import { ADMIN_EMAIL } from '../config/admin';

const publicRoles: Array<{ role: AppRole; icon: string; description: string; card: string }> = [
  { role: 'passenger', icon: '👤', description: 'Find a ride', card: 'bg-brandOrange/90 border-brandOrange' },
  { role: 'driver', icon: '🚗', description: 'Drive & earn', card: 'bg-brandBlue/90 border-brandBlue' },
];

export function RoleSelect() {
  const { lang } = useAuth();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const showAdmin = userEmail === ADMIN_EMAIL;

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email?.toLowerCase() ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email?.toLowerCase() ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const roles = showAdmin
    ? [...publicRoles, { role: 'admin' as const, icon: '🛡️', description: 'Manage platform', card: 'bg-brandPurple/90 border-brandPurple' }]
    : publicRoles;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-darkBg px-6 py-8">
      <Logo variant="full" size={72} />
      <h1 className="text-center text-2xl md:text-4xl font-extrabold text-brandOrange">BuddyRide1 - Limpopo eHailing</h1>
      <p className="mb-6 text-center text-base text-gray-300">{t('tagline', lang)}</p>

      <div className="flex w-full max-w-md flex-col gap-4">
        {roles.map(({ role, icon, description, card }) => (
          <button
            key={role}
            onClick={() => navigate(`/login?role=${role}`)}
            className={`flex items-center gap-4 rounded-2xl border-2 p-6 text-left font-semibold text-white shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl ${card}`}
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center text-3xl" aria-hidden="true">
              {icon}
            </span>
            <div className="flex flex-col">
              <span className="text-lg">{t(role, lang)}</span>
              <span className="text-sm text-white/80">{description}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-16">
        <LangSelector />
      </div>
    </div>
  );
}