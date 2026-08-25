import { useNavigate } from 'react-router-dom';
import { LangSelector } from '../components/LangSelector';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { t } from '../lib/i18n';
import type { AppRole } from '../types';

const roles: Array<{ role: AppRole; icon: string; description: string }> = [
  { role: 'passenger', icon: '👤', description: 'Find a ride' },
  { role: 'driver', icon: '🚗', description: 'Drive & earn' },
  { role: 'admin', icon: '🛡️', description: 'Manage platform' },
];

export function RoleSelect() {
  const { lang } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="role-screen">
      <Logo variant="full" size={72} />
      <h1 className="role-title">BuddyRide1 - Limpopo eHailing</h1>
      <p className="role-subtitle">{t('tagline', lang)}</p>

      {roles.map(({ role, icon, description }) => (
        <button
          key={role}
          className={`role-card role-card--${role}`}
          onClick={() => navigate(`/login?role=${role}`)}
        >
          <span className="role-card-icon" aria-hidden="true">{icon}</span>
          <div className="flex flex-col">
            <span>{t(role, lang)}</span>
            <span className="text-sm text-gray">{description}</span>
          </div>
        </button>
      ))}

      <div className="mt-16">
        <LangSelector />
      </div>
    </div>
  );
}