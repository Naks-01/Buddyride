import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AppRole } from '../types';

function roleLabel(role: AppRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function RolePasswordLogin() {
  const [searchParams] = useSearchParams();
  const role = (searchParams.get('role') || 'passenger') as AppRole;
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (localStorage.getItem(`${role}LoggedIn`) === 'true') {
      navigate(`/dashboard/${role}`, { replace: true });
    }
  }, [navigate, role]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const normalizedPhone = phone.trim();
    const normalizedPassword = password.trim();

    if (!normalizedPhone || !normalizedPassword) {
      setError('Phone/email and password are required.');
      return;
    }

    if (role === 'passenger') localStorage.setItem('passengerLoggedIn', 'true');
    if (role === 'driver') localStorage.setItem('driverLoggedIn', 'true');
    if (role === 'admin') localStorage.setItem('adminLoggedIn', 'true');

    navigate(`/dashboard/${role}`, { replace: true });
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
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
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
          Login
        </button>
      </form>
    </main>
  );
}
