import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { doc, getDoc, serverTimestamp, setDoc } from '../lib/supabaseDb';
import { db } from '../lib/supabaseDb';
import { useAuth } from '../context/AuthContext';
import { t } from '../lib/i18n';
import { LangSelector } from '../components/LangSelector';
import { LoadingScreen } from '../components/LoadingScreen';
import { PhoneIcon, XIcon, CheckIcon } from '../components/Icons';
import type { AppRole } from '../types';

declare global {
  interface Window {
    confirmationResult?: boolean;
  }
}

interface PhoneLoginProps {
  role: AppRole;
  onBack: () => void;
}

export function PhoneLogin({ role, onBack }: PhoneLoginProps) {
  const { lang, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('+27793051213');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const roleIcon = role === 'driver' ? '🚗' : role === 'admin' ? '🛡️' : '👤';
  const roleLabel = role === 'driver' ? t('driver', lang) : role === 'admin' ? t('admin', lang) : t('passenger', lang);

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
      const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
      if (error) throw error;
      window.confirmationResult = true;
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
    const confirmation = window.confirmationResult;
    if (!confirmation) {
      setError('Please request a new code');
      return;
    }
    setLoading(true);
    try {
      const result = await supabase.auth.verifyOtp({ phone: formatPhone(phone), token: otp, type: 'sms' });
      if (result.error) throw result.error;
      const user = result.data.user;
      if (!user) throw new Error('Verification did not return a user.');

      const userRef = doc(db, 'users', user.id);
      const existing = await getDoc(userRef);
      if (!existing.exists()) {
        await setDoc(userRef, {
          uid: user.id,
          phone: user.phone,
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
        await setDoc(userRef, { name: fullName || existing.data()?.name, role }, { merge: true });
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

  if (loading) {
    return <LoadingScreen message={t('loading', lang)} />;
  }

  return (
    <div className="role-screen">
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
