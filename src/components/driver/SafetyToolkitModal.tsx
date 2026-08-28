import { X } from 'lucide-react';
import { EmergencyContacts } from '../SafetyTools';

type SafetyToolkitModalProps = { driverId: string; onClose: () => void };

export function SafetyToolkitModal({ driverId, onClose }: SafetyToolkitModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#1A1D23] p-5 shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Safety Toolkit</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="mb-4 space-y-2">
          <a href="tel:10111" className="block rounded-xl bg-[#FF3B30] px-4 py-3 text-center font-bold text-white">
            Call Police (10111)
          </a>
          <a href="tel:112" className="block rounded-xl bg-[#252A33] px-4 py-3 text-center font-bold text-white">
            Call Emergency Services (112)
          </a>
        </div>

        <div className="rounded-2xl bg-white p-4">
          <EmergencyContacts userId={driverId} />
        </div>

        <p className="mt-3 text-center text-xs text-gray-500">
          Use the red SOS button on your dashboard any time to alert BuddyRide safety and your emergency contacts with your live location.
        </p>
      </div>
    </div>
  );
}
