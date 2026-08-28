import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Car,
  ChevronRight,
  FileText,
  HelpCircle,
  LogOut,
  Route,
  Settings,
  Shield,
  Star,
  Tag,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { Profile } from '../../types';
import { EarningsModal } from './EarningsModal';
import { SafetyToolkitModal } from './SafetyToolkitModal';
import { ReferFriendsModal } from './ReferFriendsModal';

type DriverDrawerProps = {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  driverProfile: Record<string, unknown> | null;
  driverId: string;
  todayEarnings: number;
};

type MenuAction = 'rides' | 'earnings' | 'performance' | 'vehicle' | 'documents' | 'safety' | 'promotions' | 'refer' | 'help' | 'settings' | 'logout';

export function DriverDrawer({ open, onClose, profile, driverProfile, driverId, todayEarnings }: DriverDrawerProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [showEarnings, setShowEarnings] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showRefer, setShowRefer] = useState(false);

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
      case 'performance':
        onClose();
        navigate('/driver/performance');
        break;
      case 'vehicle':
        onClose();
        navigate('/driver/vehicle');
        break;
      case 'documents':
        onClose();
        navigate('/driver/documents');
        break;
      case 'safety':
        setShowSafety(true);
        break;
      case 'promotions':
        onClose();
        navigate('/driver/promos');
        break;
      case 'refer':
        setShowRefer(true);
        break;
      case 'help':
        onClose();
        navigate('/driver/help');
        break;
      case 'settings':
        onClose();
        navigate('/driver/settings');
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
    { action: 'rides', label: 'My Rides', icon: Route },
    { action: 'earnings', label: 'Earnings', icon: Wallet },
    { action: 'performance', label: 'Performance', icon: BarChart3 },
    { action: 'vehicle', label: 'Vehicle', icon: Car },
    { action: 'documents', label: 'Documents', icon: FileText },
    { action: 'safety', label: 'Safety', icon: Shield },
    { action: 'promotions', label: 'Promotions', icon: Tag },
    { action: 'refer', label: 'Refer Friends', icon: UserPlus },
    { action: 'help', label: 'Help Center', icon: HelpCircle },
    { action: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-[#1A1D23] shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ borderTopRightRadius: 24, borderBottomRightRadius: 24 }}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2ECC71] text-lg font-black text-white">B</span>
            <span className="text-lg font-bold text-white">uddyRide</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-full p-1 text-gray-400 hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3 px-5">
          <div className="relative h-16 w-16 shrink-0 rounded-full ring-2 ring-[#2ECC71] ring-offset-2 ring-offset-[#1A1D23]">
            {profile?.selfieUrl ? (
              <img src={profile.selfieUrl} alt="Driver avatar" className="h-full w-full rounded-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[#2A2D36] text-xl font-bold text-white">
                {(profile?.full_name ?? 'D').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[22px] font-bold text-white">{profile?.full_name ?? 'Driver'}</p>
            <p className="truncate text-sm text-gray-400">{profile?.phone ?? 'No phone on file'}</p>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 font-semibold text-[#2ECC71]">
                <span className="h-2 w-2 rounded-full bg-[#2ECC71]" /> Online
              </span>
              <span className="flex items-center gap-1 font-semibold text-yellow-400">
                <Star size={12} className="fill-yellow-400" /> {rating.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="mx-5 mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-[#252A33] py-4">
          <div className="flex flex-col items-center px-2">
            <span className="text-base font-bold text-white">R{todayEarnings.toFixed(2)}</span>
            <span className="mt-1 text-[11px] text-gray-400">Earnings Today</span>
          </div>
          <div className="flex flex-col items-center px-2">
            <span className="text-base font-bold text-white">{ridesCount}</span>
            <span className="mt-1 text-[11px] text-gray-400">Rides</span>
          </div>
          <div className="flex flex-col items-center px-2">
            <span className="text-base font-bold text-white">0h</span>
            <span className="mt-1 text-[11px] text-gray-400">Hours</span>
          </div>
        </div>

        <p className="mt-6 px-5 text-xs font-bold uppercase tracking-wide text-gray-500">Main menu</p>

        <nav className="mt-2 flex-1 px-2 pb-4">
          {menuItems.map(({ action, label, icon: Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => void handleAction(action)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2ECC71]">
                <Icon size={18} className="text-white" />
              </span>
              <span className="flex-1 text-base text-white">{label}</span>
              <ChevronRight size={18} className="text-gray-500" />
            </button>
          ))}

          <button
            type="button"
            onClick={() => void handleAction('logout')}
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF3B30]">
              <LogOut size={18} className="text-white" />
            </span>
            <span className="flex-1 text-base font-semibold text-[#FF3B30]">Logout</span>
          </button>
        </nav>
      </aside>

      {showEarnings && <EarningsModal driverId={driverId} onClose={() => setShowEarnings(false)} />}
      {showSafety && <SafetyToolkitModal driverId={driverId} onClose={() => setShowSafety(false)} />}
      {showRefer && <ReferFriendsModal onClose={() => setShowRefer(false)} />}
    </>
  );
}
