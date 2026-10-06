import { XIcon } from './Icons';

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

      </div>
    </div>
  );
}
