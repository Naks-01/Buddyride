import { useState } from 'react';
import { doc, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TIP_PRESETS } from '../config/pricing';

interface TripReceiptProps {
  rideId: string;
  fare: number;
  driverId?: string | null;
  paymentMethod?: string;
}

export function TripReceipt({ rideId, fare, driverId, paymentMethod = 'cash' }: TripReceiptProps) {
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [tipMessage, setTipMessage] = useState('');
  const [sendingTip, setSendingTip] = useState(false);

  const addTip = async (rideId: string, nextTipAmount: number) => {
    if (sendingTip || !Number.isFinite(nextTipAmount) || nextTipAmount < 0) return;
    if (!driverId) {
      setTipMessage('A driver must be assigned before adding a tip.');
      return;
    }

    setSendingTip(true);

    try {
      await runTransaction(db, async (transaction) => {
        const rideRef = doc(db, 'rides', rideId);
        const driverRef = doc(db, 'drivers', driverId);
        const rideSnapshot = await transaction.get(rideRef);
        await transaction.get(driverRef);
        if (rideSnapshot.data()?.tipAmount != null) return;
        transaction.set(rideRef, {
          tipAmount: nextTipAmount,
          tippedAt: serverTimestamp(),
          tipMethod: paymentMethod,
          totalEarned: Number((fare + nextTipAmount).toFixed(2)),
        }, { merge: true });
        transaction.set(driverRef, { totalTips: increment(nextTipAmount) }, { merge: true });
      });

      setTipAmount(nextTipAmount);
      setTipMessage(nextTipAmount === 0 ? 'No tip added. Thank you for riding with BuddyRide1.' : paymentMethod === 'cash'
        ? `Give R${nextTipAmount.toFixed(2)} tip in cash to driver`
        : `Total paid: R${fare.toFixed(2)} fare + R${nextTipAmount.toFixed(2)} tip = R${(fare + nextTipAmount).toFixed(2)}`);
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
          {TIP_PRESETS.map((amount) => (
            <button
              key={amount}
              onClick={() => void addTip(rideId, amount)}
              disabled={sendingTip}
              className="rounded-full border border-orange-500 px-4 py-2 font-bold text-orange-600 hover:bg-green-100 disabled:opacity-60"
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