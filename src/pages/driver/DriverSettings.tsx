import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LangSelector } from '../../components/LangSelector';
import { useAuth } from '../../context/AuthContext';
import { isSoundMuted, setSoundMuted } from '../../utils/sound';
import { DriverPageShell } from './DriverPageShell';

export function DriverSettings() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [muted, setMuted] = useState(isSoundMuted());

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  const logout = async () => {
    await signOut();
    localStorage.clear();
    navigate('/login?role=driver');
  };

  return (
    <DriverPageShell title="Settings">
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-2xl bg-[#1E2128] p-4">
          <span className="text-white">Notification sounds</span>
          <button
            type="button"
            onClick={toggleMuted}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${muted ? 'bg-gray-600 text-white' : 'bg-[#2ECC71] text-white'}`}
          >
            {muted ? 'Muted' : 'On'}
          </button>
        </div>

        <div className="rounded-2xl bg-[#1E2128] p-4">
          <p className="mb-2 text-white">Language</p>
          <LangSelector />
        </div>

        <button type="button" onClick={() => void logout()} className="w-full rounded-2xl bg-[#FF3B30] py-3 font-bold text-white">
          Logout
        </button>
      </div>
    </DriverPageShell>
  );
}
