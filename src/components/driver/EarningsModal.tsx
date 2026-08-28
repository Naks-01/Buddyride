import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { BOOKING_FEE, DRIVER_RATE } from '../../config/pricing';

type EarningsModalProps = { driverId: string; onClose: () => void };

type DayEarnings = { day: string; total: number };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function EarningsModal({ driverId, onClose }: EarningsModalProps) {
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DayEarnings[]>([]);
  const [weekTotal, setWeekTotal] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);

  useEffect(() => {
    const loadEarnings = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(
          query(collection(db, 'rides'), where('driverId', '==', driverId), where('status', '==', 'completed')),
        );
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - 6);
        startOfWeek.setHours(0, 0, 0, 0);

        const totals = new Map<string, number>();
        let week = 0;
        let today = 0;
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        snapshot.docs.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          const completedAt = data.completedAt?.toDate?.() as Date | undefined;
          if (!completedAt || completedAt < startOfWeek) return;
          const total = Number(data.fare ?? data.price ?? 0);
          const payout = Math.max(total - BOOKING_FEE, 0) * DRIVER_RATE + Number(data.tipAmount ?? 0);
          const key = completedAt.toDateString();
          totals.set(key, (totals.get(key) ?? 0) + payout);
          week += payout;
          if (completedAt >= startOfToday) today += payout;
        });

        const days: DayEarnings[] = [];
        for (let i = 6; i >= 0; i -= 1) {
          const date = new Date(now);
          date.setDate(now.getDate() - i);
          days.push({ day: DAY_LABELS[date.getDay()], total: totals.get(date.toDateString()) ?? 0 });
        }

        setDaily(days);
        setWeekTotal(week);
        setTodayTotal(today);
      } catch (err) {
        console.error('Failed to load earnings:', err);
      } finally {
        setLoading(false);
      }
    };
    void loadEarnings();
  }, [driverId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-[#1A1D23] p-5 shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Earnings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#252A33] p-3 text-center">
            <p className="text-xs text-gray-400">Today</p>
            <p className="text-xl font-bold text-white">R{todayTotal.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl bg-[#252A33] p-3 text-center">
            <p className="text-xs text-gray-400">Last 7 days</p>
            <p className="text-xl font-bold text-white">R{weekTotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="h-56 rounded-2xl bg-[#252A33] p-3">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading earnings...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333844" />
                <XAxis dataKey="day" stroke="#8a8a8a" fontSize={12} />
                <YAxis stroke="#8a8a8a" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#1A1D23', border: '1px solid #333844', borderRadius: 8, color: '#fff' }}
                  formatter={(value) => [`R${Number(value ?? 0).toFixed(2)}`, 'Earnings']}
                />
                <Bar dataKey="total" fill="#2ECC71" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
