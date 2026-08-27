import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ShieldCheck, Camera, IdCard } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { t } from '../lib/i18n';
import { LangSelector } from '../components/LangSelector';
import { LoadingScreen } from '../components/LoadingScreen';
import { PhoneIcon, XIcon, CheckIcon } from '../components/Icons';
import { getIdLast4, hashIdNumber, isValidSAID, validateSelfie } from '../lib/verifyId';
import type { AppRole, VerificationStatus } from '../types';

declare global {
  interface Window {
    confirmationResult?: ConfirmationResult;
  }
}

interface PhoneLoginProps {
  role: AppRole;
  onBack: () => void;
}

export function PhoneLogin({ role, onBack }: PhoneLoginProps) {
  const auth = getAuth();
  const { lang, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('+27793051213');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [idNumber, setIdNumber] = useState('');
  const [idError, setIdError] = useState('');
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieError, setSelfieError] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('unverified');
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const roleIcon = role === 'driver' ? '🚗' : role === 'admin' ? '🛡️' : '👤';
  const roleLabel = role === 'driver' ? t('driver', lang) : role === 'admin' ? t('admin', lang) : t('passenger', lang);

  useEffect(() => {
    if (!verifierRef.current) {
      verifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
      void verifierRef.current.render();
    }

    return () => {
      verifierRef.current?.clear();
      verifierRef.current = null;
    };
  }, []);

  const formatPhone = (input: string): string => {
    let cleaned = input.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '27' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  };

  const sendOtp = async () => {
    setError('');
    if (phone.replace(/\D/g, '').length < 10) {
      setError(t('enterPhone', lang));
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = formatPhone(phone);
      if (!verifierRef.current) {
        setError('Security verification is still loading. Please try again.');
        return;
      }
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, verifierRef.current);
      confirmationRef.current = confirmation;
      window.confirmationResult = confirmation;
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError('');
    if (otp.length !== 6) {
      setError(t('enterOtp', lang));
      return;
    }
    const confirmation = window.confirmationResult ?? confirmationRef.current;
    if (!confirmation) {
      setError('Please request a new code');
      return;
    }
    setLoading(true);
    try {
      const result = await confirmation.confirm(otp);
      const user = result.user;

      const userRef = doc(db, 'users', user.uid);
      const existing = await getDoc(userRef);
      if (!existing.exists()) {
        // Admin users will be set manually in Firebase Console.
        await setDoc(userRef, {
          uid: user.uid,
          phone: user.phoneNumber,
          name: fullName,
          role,
          is_driver_approved: false,
          vehicle_plate: null,
          vehicle_model: null,
          idNumberVerified: false,
          idNumberLast4: null,
          idNumberHash: null,
          selfieUrl: null,
          verificationStatus: 'unverified',
          verifiedAt: null,
          createdAt: serverTimestamp(),
        });
      } else {
        await setDoc(userRef, { name: fullName || existing.data().name, role }, { merge: true });
        setVerificationStatus((existing.data().verificationStatus as VerificationStatus) || 'unverified');
      }

      if (role === 'passenger') {
        setShowVerification(true);
        return;
      }

      await refreshProfile();
      localStorage.setItem(`${role}LoggedIn`, 'true');
      navigate('/passenger', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

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

    setSubmittingVerification(true);
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
          await refreshProfile();
          localStorage.setItem(`${role}LoggedIn`, 'true');
          navigate('/passenger', { replace: true });
        })();
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit verification');
    } finally {
      setSubmittingVerification(false);
    }
  };

  if (loading) {
    return <LoadingScreen message={t('loading', lang)} />;
  }

  return (
    <div className="role-screen">
      <div id="recaptcha-container" />
      <button
        onClick={onBack}
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: 'transparent',
          color: 'var(--gray)',
          padding: 8,
        }}
      >
        <XIcon size={24} />
        Back
      </button>

      <div className="role-logo" style={{ background: 'var(--orange)' }}>
        {roleIcon}
      </div>
      <h1 className="role-title" style={{ fontSize: 22 }}>
        Login as {roleLabel}
      </h1>

      {!otpSent ? (
        <>
          <p className="role-subtitle">{t('enterPhone', lang)}</p>
          <p style={{ fontSize: 12 }}>Demo: use +27793051213 and code 123456</p>

          <div className="form-group w-full">
            <label className="form-label">{t('fullName', lang)}</label>
            <input
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div className="form-group w-full">
            <label className="form-label">{t('phoneNumber', lang)}</label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--orange)',
                }}
              >
                <PhoneIcon size={20} />
              </span>
              <input
                className="form-input"
                style={{ paddingLeft: 48 }}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="082 123 4567"
                type="tel"
                inputMode="tel"
              />
            </div>
          </div>

          {error && <p className="text-error text-sm text-center">{error}</p>}

          <button className="btn btn-primary btn-large" onClick={sendOtp}>
            {t('sendOtp', lang)}
          </button>
        </>
      ) : showVerification ? (
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
            disabled={submittingVerification || verificationStatus === 'pending'}
          >
            <ShieldCheck size={20} />
            {submittingVerification || verificationStatus === 'pending' ? 'Verifying...' : 'Submit for Verification'}
          </button>
        </div>
      ) : (
        <>
          <p className="role-subtitle">{t('enterOtp', lang)}</p>

          <input
            className="otp-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
          />

          {error && <p className="text-error text-sm text-center">{error}</p>}

          <button className="btn btn-primary btn-large" onClick={verifyOtp}>
            <CheckIcon size={20} />
            {t('verifyOtp', lang)}
          </button>

          <button
            className="btn btn-secondary"
            onClick={sendOtp}
            style={{ marginTop: 8 }}
          >
            {t('resendCode', lang)}
          </button>
        </>
      )}

      <div className="mt-16">
        <LangSelector />
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<VerificationStatus, { bg: string; color: string; label: string }> = {
  unverified: { bg: '#e5e7eb', color: '#374151', label: 'Unverified' },
  pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending Review' },
  verified: { bg: '#d1fae5', color: '#065f46', label: 'Verified' },
  failed: { bg: '#fee2e2', color: '#991b1b', label: 'Verification Failed' },
};

function VerificationStatusCard({ status }: { status: VerificationStatus }) {
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
