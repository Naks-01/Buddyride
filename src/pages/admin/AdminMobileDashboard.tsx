import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc, updateDoc } from '../../lib/supabaseDb';
import { ArrowRight, Ban, Check, LogOut, Settings2, ShieldCheck, TrendingUp, Users, Wallet } from 'lucide-react';
import { db } from '../../lib/supabaseDb';
import { auth } from '../../lib/supabaseDb';
import PassengerMap3D from '../../components/Map/PassengerMap3D';

type UserDoc = {
  id: string;
  name?: string;
  phone?: string | null;
  role?: string;
  is_driver_approved?: boolean;
  driverStatus?: string;
};

type DriverDoc = {
  id: string;
  isOnline?: boolean;
};

type RideDoc = {
  id: string;
  status?: string;
  price?: number;
  fare?: number;
  createdAt?: { toDate?: () => Date } | string | number;
  created_at?: string | number;
};

type Pricing = { perKm: number; baseFare: number };

const DEFAULT_PRICING: Pricing = { perKm: 8.5, baseFare: 15 };
const ADMIN_ROUTE: [number, number][] = [
  [-23.9045, 29.4582],
  [-23.9085, 29.463],
  [-23.913, 29.468],
];

function asDate(value: RideDoc['createdAt'] | RideDoc['created_at']) {
  if (value && typeof value === 'object' && typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return null;
}

function isToday(ride: RideDoc) {
  const date = asDate(ride.createdAt ?? ride.created_at);
  const today = new Date();
  return Boolean(date && !Number.isNaN(date.getTime()) && date.toDateString() === today.toDateString());
}

export default function AdminMobileDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [drivers, setDrivers] = useState<DriverDoc[]>([]);
  const [rides, setRides] = useState<RideDoc[]>([]);
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  const [priceDraft, setPriceDraft] = useState(String(DEFAULT_PRICING.perKm));
  const [savingPrice, setSavingPrice] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const stopUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<UserDoc, 'id'>) })));
    });
    const stopDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      setDrivers(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<DriverDoc, 'id'>) })));
    });
    const stopRides = onSnapshot(collection(db, 'rides'), (snapshot) => {
      setRides(snapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Omit<RideDoc, 'id'>) })));
    });
    const stopPricing = onSnapshot(doc(db, 'settings', 'pricing'), (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      const next = { perKm: Number(data.perKm ?? DEFAULT_PRICING.perKm), baseFare: Number(data.baseFare ?? DEFAULT_PRICING.baseFare) };
      setPricing(next);
      setPriceDraft(String(next.perKm));
    });
    return () => {
      stopUsers();
      stopDrivers();
      stopRides();
      stopPricing();
    };
  }, []);

  const driverUsers = useMemo(() => users.filter((user) => user.role === 'driver'), [users]);
  const pendingDrivers = driverUsers.filter((driver) => !driver.is_driver_approved && driver.driverStatus !== 'blocked');
  const visibleDrivers = [...pendingDrivers, ...driverUsers.filter((driver) => !pendingDrivers.includes(driver))].slice(0, 4);
  const onlineDrivers = drivers.filter((driver) => driver.isOnline).length;
  const todayRides = rides.filter(isToday);
  const earnings = todayRides
    .filter((ride) => ride.status === 'completed')
    .reduce((total, ride) => total + Number(ride.price ?? ride.fare ?? 0), 0);

  const updateDriver = async (driverId: string, status: 'approved' | 'blocked') => {
    try {
      await updateDoc(doc(db, 'users', driverId), { driverStatus: status, is_driver_approved: status === 'approved' });
      setNotice(status === 'approved' ? 'Driver approved' : 'Driver blocked');
    } catch (error) {
      console.error(error);
      setNotice('Could not update driver');
    }
  };

  const savePrice = async () => {
    const perKm = Number(priceDraft);
    if (!Number.isFinite(perKm) || perKm < 0) {
      setNotice('Enter a valid price');
      return;
    }
    setSavingPrice(true);
    try {
      const next = { ...pricing, perKm };
      await setDoc(doc(db, 'settings', 'pricing'), next, { merge: true });
      setPricing(next);
      setNotice('Price per km updated');
    } catch (error) {
      console.error(error);
      setNotice('Could not update price');
    } finally {
      setSavingPrice(false);
    }
  };

  const logout = async () => {
    await auth.signOut();
    localStorage.clear();
    navigate('/');
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#081225] text-white">
      <div className="absolute inset-0 opacity-70">
        <PassengerMap3D routePath={ADMIN_ROUTE} zoom={13} />
      </div>
      <div className="absolute inset-0 bg-[#081225]/80" />
      <div className="relative z-10 mx-auto min-h-screen max-w-md px-4 pb-8 pt-5">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#8AB4FF]">BuddyRide</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Admin control</h1>
          </div>
          <button type="button" onClick={() => void logout()} aria-label="Log out" className="rounded-full border border-white/15 bg-black/25 p-3 text-white/80 backdrop-blur hover:bg-white/10">
            <LogOut size={18} />
          </button>
        </header>

        <section className="mt-6 grid grid-cols-3 gap-2">
          <Metric icon={<Users size={16} />} label="Online" value={onlineDrivers} />
          <Metric icon={<TrendingUp size={16} />} label="Rides today" value={todayRides.length} />
          <Metric icon={<Wallet size={16} />} label="Earnings" value={`R${earnings.toFixed(0)}`} />
        </section>

        {notice && <p className="mt-4 rounded-xl border border-[#8AB4FF]/30 bg-[#4668F2]/20 px-3 py-2 text-center text-sm text-[#DCE6FF]">{notice}</p>}

        <section className="mt-5 rounded-2xl border border-white/10 bg-[#101d35]/90 p-4 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#8AB4FF]">Driver queue</p>
              <h2 className="mt-1 text-lg font-bold">Needs your decision</h2>
            </div>
            <ShieldCheck className="text-[#8AB4FF]" size={22} />
          </div>
          <div className="space-y-2">
            {visibleDrivers.map((driver) => (
              <div key={driver.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4668F2]/30 text-[#C7D7FF]"><Users size={16} /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{driver.name || driver.phone || driver.id.slice(0, 8)}</p><p className="text-xs text-white/45">{driver.driverStatus === 'blocked' ? 'Blocked' : driver.is_driver_approved ? 'Approved' : 'Pending approval'}</p></div>
                <button type="button" onClick={() => void updateDriver(driver.id, 'approved')} aria-label="Approve driver" className="rounded-lg bg-emerald-500/90 p-2 text-white hover:bg-emerald-400"><Check size={16} /></button>
                <button type="button" onClick={() => void updateDriver(driver.id, 'blocked')} aria-label="Block driver" className="rounded-lg bg-rose-500/90 p-2 text-white hover:bg-rose-400"><Ban size={16} /></button>
              </div>
            ))}
            {pendingDrivers.length === 0 && <p className="py-4 text-center text-sm text-white/50">No drivers waiting for approval.</p>}
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-[#101d35]/90 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3"><Settings2 size={20} className="text-[#8AB4FF]" /><div><p className="text-xs font-bold uppercase tracking-widest text-[#8AB4FF]">Pricing</p><h2 className="mt-1 text-lg font-bold">Price per kilometre</h2></div></div>
          <div className="mt-4 flex gap-2">
            <label className="flex flex-1 items-center rounded-xl border border-white/15 bg-black/20 px-3 text-white/50"><span className="mr-2">R</span><input aria-label="Price per kilometre" inputMode="decimal" type="number" min="0" step="0.1" value={priceDraft} onChange={(event) => setPriceDraft(event.target.value)} className="w-full bg-transparent py-3 text-lg font-bold text-white outline-none" /></label>
            <button type="button" onClick={() => void savePrice()} disabled={savingPrice} className="flex items-center gap-1 rounded-xl bg-[#4668F2] px-4 text-sm font-bold text-white hover:bg-[#5878ff] disabled:opacity-60">Save <ArrowRight size={16} /></button>
          </div>
          <p className="mt-2 text-xs text-white/45">Current base fare: R{pricing.baseFare.toFixed(2)}</p>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-[#101d35]/90 p-3 shadow-xl backdrop-blur"><div className="flex items-center gap-1.5 text-[#8AB4FF]">{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div><p className="mt-2 text-xl font-black">{value}</p></div>;
}