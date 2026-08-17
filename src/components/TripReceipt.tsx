import { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface TripReceiptProps {
  rideId: string;
  fare: number;
}

const QUICK_TIPS = [5, 10, 20];

export function TripReceipt({ rideId, fare }: TripReceiptProps) {
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [tipMessage, setTipMessage] = useState('');
  const [sendingTip, setSendingTip] = useState(false);

  const addTip = async (rideId: string, tipAmount: number) => {
    if (sendingTip || tipAmount < 0) return;

    setSendingTip(true);

    try {
      const totalEarned = Number((fare + tipAmount).toFixed(2));

      await updateDoc(doc(db, 'rides', rideId), {
        tip: tipAmount,
        tipAt: serverTimestamp(),
        totalEarned,
      });

      setTipAmount(tipAmount);
      setTipMessage(`Thank you! R${tipAmount.toFixed(2)} tip sent to your driver`);
    } catch (err) {
      console.error(err);
      setTipMessage('Unable to send tip. Please try again.');
      setSendingTip(false);
    }
  };

  const submitCustomTip = () => {
    const amount = Number(customTip);
    if (Number.isFinite(amount) && amount >= 0) {
      void addTip(rideId, Number(amount.toFixed(2)));
    }
  };

  const skipTip = () => {
    setTipAmount(0);
    setTipMessage('No tip added. Thank you for riding with BuddyRide1.');
  };

  const tipSubmitted = tipAmount !== null;

  return (
    <div className="mt-4 border-t border-orange-200 pt-4">
      <h3 className="font-bold text-gray-800">Rate your driver</h3>
      <p className="text-sm text-gray-600 mt-1">Would you like to leave a tip?</p>
      <p className="text-xs text-gray-500 mt-1">Drivers keep 100% of tips</p>

      {!tipSubmitted && (
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_TIPS.map((amount) => (
            <button
              key={amount}
              onClick={() => void addTip(rideId, amount)}
              disabled={sendingTip}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-2 px-4 rounded-lg"
            >
              R{amount}
            </button>
          ))}

          <input
            type="number"
            min="0"
            step="0.01"
            value={customTip}
            onChange={(event) => setCustomTip(event.target.value)}
            placeholder="Custom"
            aria-label="Custom tip amount"
            disabled={sendingTip}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2"
          />
          <button
            onClick={submitCustomTip}
            disabled={sendingTip || customTip === ''}
            className="border border-orange-500 text-orange-600 disabled:opacity-60 font-bold py-2 px-3 rounded-lg"
          >
            Custom
          </button>
          <button
            onClick={skipTip}
            disabled={sendingTip}
            className="border border-gray-300 text-gray-600 disabled:opacity-60 font-bold py-2 px-4 rounded-lg"
          >
            Skip
          </button>
        </div>
      )}

      {tipMessage && <p className="text-sm text-green-700 mt-3">{tipMessage}</p>}
    </div>
  );
}