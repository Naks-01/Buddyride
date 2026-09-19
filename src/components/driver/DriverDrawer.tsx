import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  LogOut,
  Route,
  Star,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { Profile } from '../../types';
import { EarningsModal } from './EarningsModal';

type DriverDrawerProps = {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  driverProfile: Record<string, unknown> | null;
  driverId: string;
  todayEarnings: number;
  isOnline: boolean;
  onGoOffline: () => void;
};

type MenuAction = 'rides' | 'earnings' | 'profile' | 'safety' | 'logout';

export function DriverDrawer({ open, onClose, profile, driverProfile, driverId, todayEarnings, isOnline, onGoOffline }: DriverDrawerProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [showEarnings, setShowEarnings] = useState(false);

  const rating = Number(driverProfile?.avgRating ?? 4.94);
  const ridesCount = Number(driverProfile?.totalRatings ?? 0);

  const handleAction = async (action: MenuAction) => {
    switch (action) {
      case 'rides':
        onClose();
        navigate('/driver/rides');
        break;
      case 'earnings':
        setShowEarnings(true);
        break;
      case 'profile':
        onClose();
        navigate('/profile');
        break;
      case 'safety':
        onClose();
        navigate('/driver/help');
        break;
      case 'logout':
        onClose();
        await signOut();
        localStorage.clear();
        navigate('/login?role=driver');
        break;
    }
  };

  const menuItems: Array<{ action: MenuAction; label: string; icon: typeof Route }> = [
    { action: 'earnings', label: 'Earnings', icon: Wallet },
    { action: 'rides', label: 'My Rides', icon: Route },
    { action: 'profile', label: 'Profile', icon: UserRound },
    { action: 'safety', label: 'Safety', icon: ShieldCheck },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-y-auto bg-white text-gray-900 shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ borderTopRightRadius: 24, borderBottomRightRadius: 24 }}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF5500] text-lg font-black text-white">B</span>
            <span className="text-lg font-bold text-gray-900">uddyRide</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-full p-1 text-gray-500 hover:text-gray-900">
            <X size={22} />
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3 px-5">
          <div className="relative h-16 w-16 shrink-0 rounded-full ring-2 ring-[#FF5500] ring-offset-2 ring-offset-white">
            {profile?.selfieUrl ? (
              <img src={profile.selfieUrl} alt="Driver avatar" className="h-full w-full rounded-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-orange-100 text-xl font-bold text-orange-600">
                {(profile?.full_name ?? 'D').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[22px] font-bold text-gray-900">{profile?.full_name ?? 'Driver'}</p>
            <p className="truncate text-sm text-gray-500">{profile?.email ?? 'No email on file'}</p>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 font-semibold text-[#2ECC71]">
                <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} /> {isOnline ? 'Online' : 'Offline'}
              </span>
              <span className="flex items-center gap-1 font-semibold text-yellow-600">
                <Star size={12} className="fill-yellow-500" /> {rating.toFixed(2)}
              </span>
              {isOnline && (
                <button type="button" onClick={onGoOffline} className="font-semibold text-[#FF3B30] underline">
                  Go Offline
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mx-5 mt-5 grid grid-cols-3 divide-x divide-gray-200 rounded-2xl bg-gray-50 py-4">
          <div className="flex flex-col items-center px-2">
            <span className="text-base font-bold text-gray-900">R{todayEarnings.toFixed(2)}</span>
            <span className="mt-1 text-[11px] text-gray-500">Earnings Today</span>
          </div>
          <div className="flex flex-col items-center px-2">
            <span className="text-base font-bold text-gray-900">{ridesCount}</span>
            <span className="mt-1 text-[11px] text-gray-500">Rides</span>
          </div>
          <div className="flex flex-col items-center px-2">
            <span className="text-base font-bold text-gray-900">0h</span>
            <span className="mt-1 text-[11px] text-gray-500">Hours</span>
          </div>
        </div>

        <p className="mt-6 px-5 text-xs font-bold uppercase tracking-wide text-gray-500">Driver menu</p>

        <nav className="mt-2 flex-1 px-2 pb-4">
          {menuItems.map(({ action, label, icon: Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => void handleAction(action)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-orange-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
                <Icon size={18} className="text-[#FF5500]" />
              </span>
              <span className="flex-1 text-base text-gray-800">{label}</span>
              <ChevronRight size={18} className="text-gray-500" />
            </button>
          ))}

          <button
            type="button"
            onClick={() => void handleAction('logout')}
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-red-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF3B30]">
              <LogOut size={18} className="text-white" />
            </span>
            <span className="flex-1 text-base font-semibold text-[#FF3B30]">Logout</span>
          </button>
        </nav>
      </aside>

      {showEarnings && <EarningsModal driverId={driverId} onClose={() => setShowEarnings(false)} />}
    </>
  );
}
