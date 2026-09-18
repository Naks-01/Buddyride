import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { doc, setDoc } from '../lib/supabaseDb';
import { db } from '../lib/supabaseDb';
import { useAuth } from '../context/AuthContext';
import { ADMIN_EMAIL } from '../config/admin';
import type { AppRole } from '../types';

function roleLabel(role: AppRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

async function persistUserProfile(user: { id: string; email?: string | null }, role: AppRole) {
  try {
    await setDoc(doc(db, 'users', user.id), {
      uid: user.id,
      email: user.email,
      role,
    }, { merge: true });
  } catch (profileError) {
    console.error('Supabase profile sync failed after authentication:', profileError);
  }
}

export default function RolePasswordLogin() {
  const [searchParams] = useSearchParams();
  const role = (searchParams.get('role') || 'passenger') as AppRole;
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = `${roleLabel(role)} Login | BuddyRide1`;
    if (localStorage.getItem(`${role}LoggedIn`) === 'true') {
      navigate(`/${role}/dashboard`, { replace: true });
    }
  }, [navigate, role]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setError('Email and password are required.');
      return;
    }

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password: normalizedPassword });
        if (error) throw error;
        const user = data.user;
        if (!user) throw new Error('Account creation did not return a user.');
        if (role === 'driver') {
          await persistUserProfile(user, role);
          await refreshProfile();
          localStorage.setItem(`${role}LoggedIn`, 'true');
          navigate('/driver/dashboard', { replace: true });
          return;
        }
        setIsSignup(false);
        setError('Account created. Log in to continue.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: normalizedPassword });
      if (error) throw error;
      const user = data.user;
      if (!user) throw new Error('Sign-in did not return a user.');
      if (role === 'admin' && user.email?.toLowerCase() !== ADMIN_EMAIL) {
        await supabase.auth.signOut();
        throw new Error('Access denied. This account is not an administrator.');
      }
      await persistUserProfile(user, role);
      await refreshProfile();
      localStorage.setItem(`${role}LoggedIn`, 'true');
      navigate(`/${role}/dashboard`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate.');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-2xl bg-gray-900 p-6 shadow-xl">
        <button type="button" onClick={() => navigate('/')} className="mb-5 text-sm text-gray-400 hover:text-white">
          Back
        </button>
        <h1 className="mb-6 text-2xl font-bold">{isSignup ? 'Create' : 'Login'} as {roleLabel(role)}</h1>
        <label className="mb-4 block text-sm font-semibold">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@gmail.com"
            className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 font-normal outline-none focus:border-orange-500"
          />
        </label>
        <label className="mb-4 block text-sm font-semibold">
          Password
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 font-normal outline-none focus:border-orange-500"
          />
        </label>
        {error && <p className="mb-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}
        <button type="submit" className="w-full rounded-lg bg-orange-500 px-4 py-3 font-bold text-white hover:bg-orange-600">
          {isSignup ? 'Sign Up' : 'Login'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsSignup(!isSignup);
            setError('');
          }}
          className="mt-3 w-full text-center text-sm text-gray-300 underline"
        >
          {isSignup ? 'Have account? Login' : 'No account? Sign Up'}
        </button>
      </form>
    </main>
  );
}
