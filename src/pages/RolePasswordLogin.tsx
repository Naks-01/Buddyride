import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AppRole } from '../types';

const API = import.meta.env.VITE_API_URL || 'http://' + window.location.hostname + ':5000';

function roleLabel(role: AppRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function RolePasswordLogin() {
  const [searchParams] = useSearchParams();
  const role = (searchParams.get('role') || 'passenger') as AppRole;
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(`${role}LoggedIn`) === 'true') {
      navigate(role === 'admin' ? '/dashboard/admin' : '/dashboard', { replace: true });
    }
  }, [navigate, role]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, identifier: identifier.trim(), password }),
      });
      const data: { token?: string; error?: string } = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || `Login failed (HTTP ${response.status})`);

      localStorage.setItem(`${role}Token`, data.token);
      localStorage.setItem(`${role}LoggedIn`, 'true');
      navigate(role === 'admin' ? '/dashboard/admin' : '/dashboard', { replace: true });
    } catch (loginError) {
      console.error('Login failed:', loginError);
      setError(loginError instanceof Error ? loginError.message : 'Unable to log in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 px-4 text-white">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-2xl bg-gray-900 p-6 shadow-xl">
        <button type="button" onClick={() => navigate('/')} className="mb-5 text-sm text-gray-400 hover:text-white">
          Back
        </button>
        <h1 className="mb-6 text-2xl font-bold">{roleLabel(role)} Login</h1>
        <label className="mb-4 block text-sm font-semibold">
          {role === 'admin' ? 'Email' : 'Phone'}
          <input
            required
            type={role === 'admin' ? 'email' : 'tel'}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
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
        <button type="submit" disabled={loading} className="w-full rounded-lg bg-orange-500 px-4 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-60">
          {loading ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </main>
  );
}
