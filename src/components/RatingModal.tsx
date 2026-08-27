import { useState } from 'react';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

type RatingModalProps = {
  rideId: string;
  driverId: string;
  driverName?: string | null;
  passengerId: string;
  onSaved: (rating: number) => void;
};

const tags = ['Polite', 'Clean car', 'Safe driving', 'Late', 'Rude'];

export function RatingModal({ rideId, driverId, driverName, passengerId, onSaved }: RatingModalProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saveRating = async () => {
    setSaving(true);
    setError('');
    try {
      await runTransaction(db, async (transaction) => {
        const driverRef = doc(db, 'drivers', driverId);
        const driverSnapshot = await transaction.get(driverRef);
        const data = driverSnapshot.exists() ? driverSnapshot.data() : {};
        const totalRatings = Number(data.totalRatings ?? data.ratingCountTotal ?? 0);
        const currentAverage = Number(data.avgRating ?? 0);
        const nextTotal = totalRatings + 1;
        const nextAverage = ((currentAverage * totalRatings) + rating) / nextTotal;
        const currentCounts = (data.ratingCount ?? {}) as Record<string, number>;
        const ratingCount = { ...currentCounts, [rating]: Number(currentCounts[rating] ?? 0) + 1 };
        transaction.set(driverRef, {
          uid: driverId,
          avgRating: nextAverage,
          totalRatings: nextTotal,
          ratingCount,
          adminFlag: nextTotal >= 20 && nextAverage < 4.5,
        }, { merge: true });
        const ratingRef = doc(collection(db, 'ratings'));
        transaction.set(ratingRef, {
          rideId,
          driverId,
          passengerId,
          rating,
          comment: [selectedTags.join(', '), comment.trim()].filter(Boolean).join(' - '),
          createdAt: serverTimestamp(),
        });
      });
      onSaved(rating);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save rating.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <section className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-xl font-bold text-gray-900">Rate your driver</h2>
        <p className="mt-1 text-sm text-gray-500">{driverName ?? 'Your driver'}</p>
        <div className="my-4 flex justify-center gap-2" aria-label="Driver rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" onClick={() => setRating(value)} className={`text-3xl ${value <= rating ? 'text-yellow-400' : 'text-gray-300'}`} aria-label={`${value} stars`}>
              ★
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button key={tag} type="button" onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} className={`rounded-full border px-3 py-1 text-sm ${selectedTags.includes(tag) ? 'border-orange-500 bg-orange-100 text-orange-700' : 'border-gray-300 text-gray-600'}`}>
              {tag}
            </button>
          ))}
        </div>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Comment (optional)" className="mt-4 min-h-20 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-800" />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button type="button" onClick={() => void saveRating()} disabled={saving} className="mt-4 w-full rounded-lg bg-orange-500 py-3 font-bold text-white disabled:opacity-60">
          {saving ? 'Saving...' : 'Submit rating'}
        </button>
      </section>
    </div>
  );
}

