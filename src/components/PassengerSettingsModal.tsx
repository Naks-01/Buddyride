import { XIcon } from './Icons';
import { MapProviderSelector } from './MapProviderSelector';

type PassengerSettingsModalProps = { onClose: () => void };

export function PassengerSettingsModal({ onClose }: PassengerSettingsModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <XIcon size={22} />
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="mb-1 font-bold text-gray-800">Navigation</p>
          <p className="mb-3 text-sm text-gray-500">Choose Navigation App</p>
          <MapProviderSelector theme="light" />
        </div>
      </div>
    </div>
  );
}
