import { useRef, useState, type ChangeEvent } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ShieldCheck, Camera, IdCard } from 'lucide-react';
import { auth, db, storage } from '../lib/firebase';
import { getIdLast4, hashIdNumber, isValidSAID, validateSelfie } from '../lib/verifyId';
import type { VerificationStatus } from '../types';

const STATUS_STYLES: Record<VerificationStatus, { bg: string; color: string; label: string }> = {
  unverified: { bg: '#e5e7eb', color: '#374151', label: 'Unverified' },
  pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending Review' },
  verified: { bg: '#d1fae5', color: '#065f46', label: 'Verified' },
  failed: { bg: '#fee2e2', color: '#991b1b', label: 'Verification Failed' },
};

export function VerificationStatusCard({ status }: { status: VerificationStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <div
      style={{
        background: style.bg,
        color: style.color,
        borderRadius: 12,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontWeight: 600,
        margin: '12px 0',
      }}
    >
      <ShieldCheck size={18} /> {style.label}
    </div>
  );
}

interface IdVerificationFormProps {
  initialStatus?: VerificationStatus;
  onVerified: () => void;
}

export function IdVerificationForm({ initialStatus = 'unverified', onVerified }: IdVerificationFormProps) {
  const [idNumber, setIdNumber] = useState('');
  const [idError, setIdError] = useState('');
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieError, setSelfieError] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const selfieInputRef = useRef<HTMLInputElement>(null);

  const handleSelfieChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = validateSelfie(file);
    if (!result.valid) {
      setSelfieError(result.error ?? 'Invalid selfie');
      setSelfieFile(null);
      setSelfiePreview(null);
      return;
    }
    setSelfieError('');
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
  };

  const submitVerification = async () => {
    setError('');
    setIdError('');
    if (!isValidSAID(idNumber)) {
      setIdError('Enter a valid 13-digit SA ID number');
      return;
    }
    if (!selfieFile) {
      setSelfieError('Please take a live selfie');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      setError('Session expired, please log in again');
      return;
    }

    setSubmitting(true);
    try {
      const selfieRef = ref(storage, `passengers/${user.uid}/selfie.jpg`);
      await uploadBytes(selfieRef, selfieFile);
      const selfieUrl = await getDownloadURL(selfieRef);
      const idNumberHash = await hashIdNumber(idNumber);
      const idNumberLast4 = getIdLast4(idNumber);
      const userRef = doc(db, 'users', user.uid);

      await setDoc(
        userRef,
        { idNumberLast4, idNumberHash, selfieUrl, verificationStatus: 'pending', idNumberVerified: false },
        { merge: true }
      );
      setVerificationStatus('pending');

      // TODO: replace with a real verification API call. Auto-approves after a short delay for now.
      setTimeout(() => {
        void (async () => {
          await setDoc(
            userRef,
            { verificationStatus: 'verified', idNumberVerified: true, verifiedAt: serverTimestamp() },
            { merge: true }
          );
          setVerificationStatus('verified');
          onVerified();
        })();
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit verification');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <p className="role-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IdCard size={20} /> SA ID Number (13 digits) - Required by NLTA
      </p>

      <div className="form-group w-full">
        <input
          className="form-input"
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 13))}
          placeholder="0000000000000"
          inputMode="numeric"
          maxLength={13}
        />
        <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
          Used to verify you, not shared with drivers. We store **** + last 4 only.
        </p>
        {idError && <p className="text-error text-sm">{idError}</p>}
      </div>

      <div className="form-group w-full" style={{ textAlign: 'center' }}>
        {selfiePreview ? (
          <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto' }}>
            <img
              src={selfiePreview}
              alt="Selfie preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                border: '3px dashed var(--orange)',
                borderRadius: '50%',
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 180,
              height: 180,
              margin: '0 auto',
              borderRadius: '50%',
              border: '3px dashed var(--orange)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gray)',
            }}
          >
            <Camera size={40} />
          </div>
        )}

        <input
          ref={selfieInputRef}
          type="file"
          accept="image/*"
          capture="user"
          style={{ display: 'none' }}
          onChange={handleSelfieChange}
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => selfieInputRef.current?.click()}
        >
          <Camera size={18} /> Take Live Selfie
        </button>
        <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
          No hats/sunglasses, same as Bolt verification
        </p>
        {selfieError && <p className="text-error text-sm">{selfieError}</p>}
      </div>

      <VerificationStatusCard status={verificationStatus} />

      {error && <p className="text-error text-sm text-center">{error}</p>}

      <button
        className="btn btn-primary btn-large"
        onClick={() => void submitVerification()}
        disabled={submitting || verificationStatus === 'pending'}
      >
        <ShieldCheck size={20} />
        {submitting || verificationStatus === 'pending' ? 'Verifying...' : 'Submit for Verification'}
      </button>
    </div>
  );
}
