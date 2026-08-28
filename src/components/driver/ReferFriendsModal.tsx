import { useState } from 'react';
import { X } from 'lucide-react';
import { auth } from '../../lib/firebase';

type ReferFriendsModalProps = { onClose: () => void };

export function ReferFriendsModal({ onClose }: ReferFriendsModalProps) {
  const [copied, setCopied] = useState(false);
  const referralCode = (auth.currentUser?.uid ?? 'BUDDY').slice(0, 8).toUpperCase();
  const referralLink = `https://buddyride1.vercel.app/login?role=driver&ref=${referralCode}`;
  const message = `Drive with BuddyRide and earn R800 when you sign up with my link: ${referralLink}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy referral link:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-[#1A1D23] p-5 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Refer Friends</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="rounded-2xl bg-[#252A33] p-4 text-center">
          <p className="text-3xl font-black text-[#2ECC71]">R800</p>
          <p className="mt-1 text-sm text-gray-300">for every friend who signs up and completes 20 rides</p>
        </div>

        <div className="mt-4 rounded-xl bg-[#252A33] px-3 py-2 text-sm text-gray-300 break-all">{referralLink}</div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => void copyLink()} className="rounded-xl bg-[#252A33] py-3 text-sm font-bold text-white">
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-[#2ECC71] py-3 text-center text-sm font-bold text-white"
          >
            Share on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
