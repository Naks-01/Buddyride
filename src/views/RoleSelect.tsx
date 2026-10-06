import { useNavigate } from 'react-router-dom';
import { LangSelector } from '../components/LangSelector';
import { useAuth } from '../context/AuthContext';
import { t } from '../lib/i18n';
import type { AppRole } from '../types';

export function RoleSelect() {
  const { lang } = useAuth();
  const navigate = useNavigate();

  const handleRoleSelect = (role: AppRole) => {
    navigate(`/login?role=${role}`);
  };

  return (
    <div className="role-screen">
      <div className="role-logo">BR</div>
      <h1 className="role-title">BuddyRide1</h1>
      <p className="role-subtitle">{t('tagline', lang)}</p>

      <button className="role-card" onClick={() => handleRoleSelect('passenger')}>
        <span className="text-3xl" aria-hidden="true">👤</span>
        <div className="flex flex-col">
          <span>{t('passenger', lang)}</span>
          <span className="text-sm text-gray">Find a ride</span>
        </div>
      </button>

      <button className="role-card" onClick={() => handleRoleSelect('driver')}>
        <span className="text-3xl" aria-hidden="true">🚗</span>
        <div className="flex flex-col">
          <span>{t('driver', lang)}</span>
          <span className="text-sm text-gray">Drive & earn</span>
        </div>
      </button>

      <button className="role-card" onClick={() => handleRoleSelect('admin')}>
        <span className="text-3xl" aria-hidden="true">🛡️</span>
        <div className="flex flex-col">
          <span>{t('admin', lang)}</span>
          <span className="text-sm text-gray">Manage platform</span>
        </div>
      </button>

      <div className="mt-16">
        <LangSelector />
      </div>
    </div>
  );
}
