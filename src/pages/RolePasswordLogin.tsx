import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { AppRole } from '../types';

const CLOCK_ERROR_MESSAGE = 'Clock error: Your PC time is wrong. Go to Windows Settings > Time > Set time automatically ON > Sync now, then refresh and login again.';

function roleLabel(role: AppRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return String(error);
}

function isJwtClockError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('jwt')
    && (normalizedMessage.includes('future') || normalizedMessage.includes('issued at'));
}

async function clearClockErrorSession() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Unable to sign out after JWT clock error:', error);
  } catch (error) {
    console.error('Unable to sign out after JWT clock error:', error);
  } finally {
    localStorage.clear();
    sessionStorage.clear();
  }
}

async function ensurePublicUser(user: { id: string; user_metadata?: Record<string, unknown> }, role: AppRole, fallbackName: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return;

  const metadataName = user.user_metadata?.full_name;
  const { error: insertError } = await supabase.from('users').insert({
    id: user.id,
    user_type: role,
    full_name: typeof metadataName === 'string' ? metadataName : fallbackName || null,
  });

  if (insertError) throw insertError;
}

export default function RolePasswordLogin() {
  const [searchParams] = useSearchParams();
  const role = (searchParams.get('role') || 'passenger') as AppRole;
  const navigate = useNavigate();
  const { login, refreshProfile, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
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
        await signUp(normalizedEmail, normalizedPassword, role, fullName.trim());
        if (role === 'driver') {
          await refreshProfile();
          localStorage.setItem(`${role}LoggedIn`, 'true');
          navigate('/driver/dashboard', { replace: true });
          return;
        }
        setIsSignup(false);
        setError('Account created. Log in to continue.');
        return;
      }

      const authenticatedUser = await login(normalizedEmail, normalizedPassword, role);
      try {
        await ensurePublicUser(authenticatedUser, role, fullName.trim());
        await refreshProfile();
      } catch (profileError) {
        const message = errorMessage(profileError);
        if (isJwtClockError(message)) {
          await clearClockErrorSession();
          setError(CLOCK_ERROR_MESSAGE);
          return;
        }
        throw profileError;
      }
      localStorage.setItem(`${role}LoggedIn`, 'true');
      navigate(`/${role}/dashboard`, { replace: true });
    } catch (err) {
      console.error('Login error:', err);
      const message = errorMessage(err);
      if (isJwtClockError(message)) {
        await clearClockErrorSession();
        setError(CLOCK_ERROR_MESSAGE);
      } else {
        setError(message || 'Authentication failed for an unknown reason.');
      }
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-2xl bg-gray-900 p-6 shadow-xl">
        <button type="button" onClick={() => navigate('/')} className="mb-5 text-sm text-gray-400 hover:text-white">
          Back
        </button>
        <h1 className="mb-6 text-2xl font-bold">{isSignup ? 'Create' : 'Login'} as {roleLabel(role)}</h1>
        {isSignup && (
          <label className="mb-4 block text-sm font-semibold">
            Full name
            <input
              required
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 font-normal outline-none focus:border-orange-500"
            />
          </label>
        )}
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
