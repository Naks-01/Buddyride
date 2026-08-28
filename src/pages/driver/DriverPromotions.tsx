import { Tag } from 'lucide-react';
import { DriverPageShell } from './DriverPageShell';

const PROMOTIONS = [
  { title: 'Weekend Boost', detail: 'Earn 20% extra on all rides completed Fri-Sun this week.' },
  { title: 'Peak Hour Bonus', detail: 'R10 bonus per ride during 07:00-08:30 and 16:00-18:00.' },
  { title: '50-Ride Streak', detail: 'Complete 50 rides this month for a R500 bonus payout.' },
];

export function DriverPromotions() {
  return (
    <DriverPageShell title="Promotions">
      <div className="space-y-3">
        {PROMOTIONS.map((promo) => (
          <div key={promo.title} className="flex items-start gap-3 rounded-2xl bg-[#1E2128] p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2ECC71]/20">
              <Tag size={18} className="text-[#2ECC71]" />
            </span>
            <div>
              <p className="font-bold text-white">{promo.title}</p>
              <p className="text-sm text-gray-400">{promo.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </DriverPageShell>
  );
}
