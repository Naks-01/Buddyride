import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { RoleSelect } from './pages/RoleSelect';
import Login from './pages/Login';
import { PassengerDashboard } from './pages/dashboard/PassengerDashboard';
import { DriverDashboard } from './pages/dashboard/DriverDashboard';
import { AdminDashboard } from './pages/dashboard/AdminDashboard';
import { LoadingScreen } from './components/LoadingScreen';
import type { AppRole } from './types';

export type { AppRole };

function dashboardPath(role: AppRole): string {
  return `/dashboard/${role}`;
}

function RequireRole({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!profile) return <Navigate to="/" replace />;
  if (profile.role !== role) return <Navigate to={dashboardPath(profile.role)} replace />;
  return <>{children}</>;
}

function HomeOrRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (profile) return <Navigate to={dashboardPath(profile.role)} replace />;
  return <RoleSelect />;
}

function LoginRouter() {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (profile) return <Navigate to={dashboardPath(profile.role)} replace />;
  return <Login />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeOrRedirect />} />
        <Route path="/login" element={<LoginRouter />} />
        <Route path="/dashboard/passenger" element={<RequireRole role="passenger"><PassengerDashboard /></RequireRole>} />
        <Route path="/dashboard/driver" element={<RequireRole role="driver"><DriverDashboard /></RequireRole>} />
        <Route path="/dashboard/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
