import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { t } from '../lib/i18n';
import { LangSelector } from '../components/LangSelector';
import { LoadingScreen } from '../components/LoadingScreen';
import { PhoneIcon, XIcon, CheckIcon } from '../components/Icons';
import { IdVerificationForm } from '../components/IdVerificationForm';
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
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('unverified');
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

  const handleVerified = async () => {
    await refreshProfile();
    localStorage.setItem(`${role}LoggedIn`, 'true');
    navigate('/passenger', { replace: true });
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
        <IdVerificationForm initialStatus={verificationStatus} onVerified={() => void handleVerified()} />
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
