import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { doc, getDoc, serverTimestamp, setDoc } from '../lib/supabaseDb';
import { db } from '../lib/supabaseDb';
import { useAuth } from '../context/AuthContext';
import type { AppRole } from '../types';

export default function Login() {
  const [searchParams] = useSearchParams();
  const role = (searchParams.get('role') || 'passenger') as AppRole;
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [error, setError] = useState('');
  const handleSendCode = async () => {
    setError('');
    try {
      let formattedPhone = phone.replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = `+27${formattedPhone.substring(1)}`;
      } else if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+27${formattedPhone}`;
      }

      const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
      if (error) throw error;
      setConfirmation(true);
      setStep(2);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unable to send the verification code.');
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (!confirmation) {
      setError('Request a verification code first.');
      return;
    }

    try {
      const result = await supabase.auth.verifyOtp({ phone: phone, token: otp, type: 'sms' });
      if (result.error) throw result.error;
      const user = result.data.user;
      if (!user) throw new Error('Verification did not return a user.');
      const userRef = doc(db, 'users', user.id);
      const existing = await getDoc(userRef);
      await setDoc(userRef, {
        uid: user.id,
        phone: user.phone,
        name: name || existing.data()?.name || '',
        role,
        ...(existing.exists() ? {} : { createdAt: serverTimestamp(), is_driver_approved: false, vehicle_plate: null, vehicle_model: null }),
      }, { merge: true });
      await refreshProfile();

      if (role === 'admin') localStorage.setItem('adminLoggedIn', 'true');
      navigate(`/dashboard/${role}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 p-6 rounded-2xl">
        <button type="button" onClick={() => navigate('/')} className="text-gray-300 mb-4">Back</button>
        <h1 className="text-center text-2xl font-bold mb-4">BuddyRide1 - Limpopo eHailing</h1>
        <h2 className="text-center mb-6">Login as {role.charAt(0).toUpperCase() + role.slice(1)}</h2>

        <label className="block mb-1">Full Name</label>
        <input value={name} onChange={(event) => setName(event.target.value)} className="border p-2 w-full rounded bg-gray-700 mb-4" />

        <label className="block mb-1">Phone Number</label>
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0793051213" className="border p-2 w-full rounded bg-gray-700 mb-4" inputMode="tel" />

        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

        {step === 1 ? (
          <button type="button" onClick={() => void handleSendCode()} className="bg-orange-500 text-white p-3 mt-2 w-full rounded-xl font-bold">
            Send Code
          </button>
        ) : (
          <>
            <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6 digit code" className="border p-2 w-full rounded bg-gray-700 mb-4" inputMode="numeric" />
            <button type="button" onClick={() => void handleVerifyCode()} className="bg-green-500 text-white p-3 mt-2 w-full rounded-xl font-bold">
              Verify
            </button>
          </>
        )}
      </div>
    </div>
  );
}
