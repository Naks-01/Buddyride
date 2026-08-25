import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { LogOutIcon, SearchIcon } from '../../components/Icons';
import { Logo } from '../../components/Logo';

type Location = { address?: string; name?: string; lat?: number; lng?: number };

type Ride = {
  id: string;
  pickup?: string | Location;
  dropoff?: string | Location;
  distance?: string | number;
  price?: number;
  status?: string;
  passengerId?: string;
  driverId?: string | null;
  driverName?: string | null;
};

type UserDoc = {
  id: string;
  name?: string;
  phone?: string | null;
  role?: string;
  is_driver_approved?: boolean;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  driverStatus?: string;
  licenseImageUrl?: string | null;
  vehicleRegImageUrl?: string | null;
};

type Pricing = { perKm: number; baseFare: number; commissionPct: number };

const DEFAULT_PRICING: Pricing = { perKm: 12, baseFare: 30, commissionPct: 20 };
const ACTIVE_RIDE_STATUSES = ['accepted', 'driver_arrived', 'in_progress'];
const RIDE_FILTERS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Requested', value: 'searching' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Completed', value: 'completed' },
];

function formatLocation(loc?: string | Location) {
  if (!loc) return '—';
  if (typeof loc === 'string') return loc;
  return loc.address ?? loc.name ?? '—';
}

export function AdminDashboard() {
  const [tab, setTab] = useState<'rides' | 'drivers' | 'pricing' | 'users'>('rides');
  const [rides, setRides] = useState<Ride[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [rideFilter, setRideFilter] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'rides'),
      (snapshot) => setRides(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as Ride))),
      (err) => {
        console.error(err);
        setError('Failed to load rides.');
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => setUsers(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as UserDoc))),
      (err) => {
        console.error(err);
        setError('Failed to load users.');
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'pricing'), (snapshot) => {
      const data = snapshot.data();
      if (data) {
        setPricing({
          perKm: Number(data.perKm ?? DEFAULT_PRICING.perKm),
          baseFare: Number(data.baseFare ?? DEFAULT_PRICING.baseFare),
          commissionPct: Number(data.commissionPct ?? DEFAULT_PRICING.commissionPct),
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const drivers = useMemo(() => users.filter((u) => u.role === 'driver'), [users]);
  const totalRevenue = useMemo(
    () => rides.filter((r) => r.status === 'completed').reduce((sum, r) => sum + Number(r.price ?? 0), 0),
    [rides],
  );
  const activeDrivers = useMemo(
    () => new Set(rides.filter((r) => ACTIVE_RIDE_STATUSES.includes(r.status ?? '') && r.driverId).map((r) => r.driverId)).size,
    [rides],
  );
  const pendingDrivers = useMemo(
    () => drivers.filter((d) => !d.is_driver_approved && d.driverStatus !== 'blocked').length,
    [drivers],
  );
  const filteredRides = useMemo(
    () => (rideFilter ? rides.filter((r) => r.status === rideFilter) : rides),
    [rides, rideFilter],
  );
  const filteredUsers = useMemo(
    () => users.filter((u) => (userSearch ? (u.phone ?? '').includes(userSearch) : true)),
    [users, userSearch],
  );

  const setDriverStatus = async (userId: string, status: 'approved' | 'blocked') => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        driverStatus: status,
        is_driver_approved: status === 'approved',
      });
    } catch (err) {
      console.error(err);
      setError('Failed to update driver status.');
    }
  };

  const savePricing = async () => {
    setSavingPricing(true);
    setPricingSaved(false);
    try {
      await setDoc(doc(db, 'settings', 'pricing'), pricing, { merge: true });
      setPricingSaved(true);
    } catch (err) {
      console.error(err);
      setError('Failed to save pricing.');
    } finally {
      setSavingPricing(false);
    }
  };

  const logout = async () => {
    await auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-4 sm:px-6">
        <Logo size={48} />
        <button onClick={() => void logout()} className="flex items-center gap-2 text-gray-400 hover:text-white">
          <LogOutIcon size={20} /> Logout
        </button>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Rides" value={rides.length} />
          <StatCard label="Total Revenue" value={`R${totalRevenue.toFixed(2)}`} />
          <StatCard label="Active Drivers" value={activeDrivers} />
          <StatCard label="Pending Driver Approvals" value={pendingDrivers} />
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto border-b border-gray-800 pb-px">
          {(
            [
              { key: 'rides', label: 'Live Rides' },
              { key: 'drivers', label: 'Drivers Management' },
              { key: 'pricing', label: 'Settings - Pricing' },
              { key: 'users', label: 'Users' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-semibold ${
                tab === t.key ? 'bg-gray-900 text-orange-500' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'rides' && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {RIDE_FILTERS.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setRideFilter(f.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    rideFilter === f.value ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Pickup</th>
                    <th className="px-3 py-2">Dropoff</th>
                    <th className="px-3 py-2">Distance</th>
                    <th className="px-3 py-2">Fare</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Passenger</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRides.map((r) => (
                    <tr key={r.id} className="border-b border-gray-800/60">
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.id.slice(0, 6)}</td>
                      <td className="px-3 py-2">{formatLocation(r.pickup)}</td>
                      <td className="px-3 py-2">{formatLocation(r.dropoff)}</td>
                      <td className="px-3 py-2">{typeof r.distance === 'number' ? `${r.distance} km` : r.distance ?? '—'}</td>
                      <td className="px-3 py-2">R{Number(r.price ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-2 capitalize">{r.status ?? '—'}</td>
                      <td className="px-3 py-2">{r.driverName ?? r.driverId ?? '—'}</td>
                      <td className="px-3 py-2">{r.passengerId ?? '—'}</td>
                    </tr>
                  ))}
                  {filteredRides.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-center text-gray-500">No rides found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'drivers' && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Car</th>
                    <th className="px-3 py-2">Documents</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id} className="border-b border-gray-800/60">
                      <td className="px-3 py-2">{d.name || '—'}</td>
                      <td className="px-3 py-2">{d.phone || '—'}</td>
                      <td className="px-3 py-2">{d.vehicle_model || d.vehicle_plate || '—'}</td>
                      <td className="px-3 py-2 space-x-2">
                        {d.licenseImageUrl ? (
                          <a href={d.licenseImageUrl} target="_blank" rel="noopener noreferrer" className="text-orange-400 underline">License</a>
                        ) : (
                          <span className="text-gray-600">No license</span>
                        )}
                        {d.vehicleRegImageUrl ? (
                          <a href={d.vehicleRegImageUrl} target="_blank" rel="noopener noreferrer" className="text-orange-400 underline">Car Reg</a>
                        ) : (
                          <span className="text-gray-600">No car reg</span>
                        )}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {d.driverStatus === 'blocked' ? 'Blocked' : d.is_driver_approved ? 'Approved' : 'Pending'}
                      </td>
                      <td className="px-3 py-2 space-x-2">
                        <button
                          onClick={() => void setDriverStatus(d.id, 'approved')}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => void setDriverStatus(d.id, 'blocked')}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                        >
                          Block
                        </button>
                      </td>
                    </tr>
                  ))}
                  {drivers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-center text-gray-500">No drivers found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'pricing' && (
          <section className="max-w-md rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-gray-400">Price per km</span>
                <input
                  type="number"
                  value={pricing.perKm}
                  onChange={(e) => setPricing((p) => ({ ...p, perKm: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-gray-400">Base fare</span>
                <input
                  type="number"
                  value={pricing.baseFare}
                  onChange={(e) => setPricing((p) => ({ ...p, baseFare: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-gray-400">Commission %</span>
                <input
                  type="number"
                  value={pricing.commissionPct}
                  onChange={(e) => setPricing((p) => ({ ...p, commissionPct: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                />
              </label>
              <button
                onClick={() => void savePricing()}
                disabled={savingPricing}
                className="w-full rounded-lg bg-orange-500 py-2.5 font-bold text-white disabled:opacity-60"
              >
                {savingPricing ? 'Saving...' : 'Save Pricing'}
              </button>
              {pricingSaved && <p className="text-center text-sm text-green-400">Pricing saved.</p>}
            </div>
          </section>
        )}

        {tab === 'users' && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="relative mb-3 max-w-xs">
              <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by phone"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-white"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-gray-800/60">
                      <td className="px-3 py-2">{u.name || '—'}</td>
                      <td className="px-3 py-2">{u.phone || '—'}</td>
                      <td className="px-3 py-2 capitalize">{u.role ?? '—'}</td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-gray-500">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
      <p className="mb-1 text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-orange-500">{value}</p>
    </div>
  );
}
