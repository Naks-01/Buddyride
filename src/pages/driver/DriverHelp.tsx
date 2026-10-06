import { HelpCircle } from 'lucide-react';
import { DriverPageShell } from './DriverPageShell';

const FAQS = [
  { q: 'How do I get paid?', a: 'You collect cash directly from passengers at the end of each trip. Card payouts are coming soon.' },
  { q: 'What if a passenger no-shows?', a: 'Wait 7 minutes at pickup, then use "Passenger no-show" to cancel and receive the R20 no-show fee.' },
  { q: 'How is my rating calculated?', a: 'Your rating is the average of your last 100 completed trips as rated by passengers.' },
  { q: 'How do I report a safety issue?', a: 'Message support on WhatsApp using the button below.' },
];

export function DriverHelp() {
  return (
    <DriverPageShell title="Help Center">
      <div className="space-y-3">
        {FAQS.map((faq) => (
          <div key={faq.q} className="rounded-2xl bg-[#1E2128] p-4">
            <p className="font-bold text-white">{faq.q}</p>
            <p className="mt-1 text-sm text-gray-400">{faq.a}</p>
          </div>
        ))}
      </div>
      <a
        href="https://wa.me/27000000000?text=Hi%20BuddyRide%20support%2C%20I%20need%20help"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#2ECC71] py-3 font-bold text-white"
      >
        <HelpCircle size={18} /> Chat with support
      </a>
    </DriverPageShell>
  );
}
