import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LangSelector } from '../../components/LangSelector';
import { useAuth } from '../../context/AuthContext';
import { isSoundMuted, setSoundMuted } from '../../utils/sound';
import { DriverPageShell } from './DriverPageShell';

type NavigationProvider = 'buddy' | 'gmaps' | 'waze';

export function DriverSettings() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [muted, setMuted] = useState(isSoundMuted());
  const [navigationProvider, setNavigationProvider] = useState<NavigationProvider>(() => {
    const saved = localStorage.getItem('nav');
    return saved === 'gmaps' || saved === 'waze' ? saved : 'buddy';
  });
  const [navigationAutoStart, setNavigationAutoStart] = useState(() => localStorage.getItem('navAutoStart') !== 'false');

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  const selectNavigationProvider = (provider: NavigationProvider) => {
    setNavigationProvider(provider);
    localStorage.setItem('nav', provider);
  };

  const toggleNavigationAutoStart = () => {
    const next = !navigationAutoStart;
    setNavigationAutoStart(next);
    localStorage.setItem('navAutoStart', String(next));
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

        <section className="rounded-2xl bg-[#1E2128] p-4" aria-labelledby="navigation-settings-title">
          <h2 id="navigation-settings-title" className="mb-3 font-semibold text-white">Navigation</h2>
          <div className="space-y-2">
            {([
              ['buddy', 'Buddy Map', 'Recommended'],
              ['gmaps', 'Google Maps', null],
              ['waze', 'Waze', null],
            ] as const).map(([provider, label, note]) => (
              <label key={provider} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-white">
                <input
                  type="radio"
                  name="navigation-provider"
                  value={provider}
                  checked={navigationProvider === provider}
                  onChange={() => selectNavigationProvider(provider)}
                  className="h-4 w-4 accent-[#2ECC71]"
                />
                <span className="flex-1">{label}</span>
                {note && <span className="text-xs font-semibold text-[#2ECC71]">[{note}]</span>}
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="text-white">Navigation auto-start</span>
            <button
              type="button"
              role="switch"
              aria-checked={navigationAutoStart}
              aria-label="Navigation auto-start"
              onClick={toggleNavigationAutoStart}
              className={`relative h-8 w-14 rounded-full p-1 transition-colors ${navigationAutoStart ? 'bg-[#2ECC71]' : 'bg-gray-600'}`}
            >
              <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${navigationAutoStart ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
          <p className="mt-1 text-right text-xs text-gray-300">{navigationAutoStart ? 'ON' : 'OFF'}</p>
        </section>

        <button type="button" onClick={() => void logout()} className="w-full rounded-2xl bg-[#FF3B30] py-3 font-bold text-white">
          Logout
        </button>
      </div>
    </DriverPageShell>
  );
}
