import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { RoleSelect } from './pages/RoleSelect';
import RolePasswordLogin from './pages/RolePasswordLogin';
import { PassengerDashboard } from './pages/dashboard/PassengerDashboard';
import { DriverDashboard } from './pages/dashboard/DriverDashboard';
import { AdminDashboard } from './pages/dashboard/AdminDashboard';
import { RideStatus } from './pages/RideStatus';
import { LoadingScreen } from './components/LoadingScreen';
import { SplashScreen } from './components/SplashScreen';
import type { AppRole } from './types';

export type { AppRole };

function dashboardPath(role: AppRole): string {
  return `/dashboard/${role}`;
}

function RequireRole({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (localStorage.getItem(`${role}LoggedIn`) !== 'true') return <Navigate to={`/login?role=${role}`} replace />;
  if (profile && profile.role !== role) return <Navigate to={`/login?role=${role}`} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (localStorage.getItem('adminLoggedIn') !== 'true') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeOrRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  const savedRole = (['passenger', 'driver', 'admin'] as AppRole[]).find((role) => localStorage.getItem(`${role}LoggedIn`) === 'true');
  if (savedRole) return <Navigate to={dashboardPath(savedRole)} replace />;
  if (profile) return <Navigate to={dashboardPath(profile.role)} replace />;
  return <RoleSelect />;
}

function LoginRouter() {
  return <RolePasswordLogin />;
}

export default function App() {
  return (
    <>
      <SplashScreen />
      <BrowserRouter basename="/" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<HomeOrRedirect />} />
          <Route path="/login" element={<LoginRouter />} />
          <Route path="/passenger" element={<RequireRole role="passenger"><PassengerDashboard /></RequireRole>} />
          <Route path="/dashboard/passenger" element={<RequireRole role="passenger"><PassengerDashboard /></RequireRole>} />
          <Route path="/dashboard/driver" element={<RequireRole role="driver"><DriverDashboard /></RequireRole>} />
          <Route path="/dashboard/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="/ride-status/:id" element={<RequireRole role="passenger"><RideStatus /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
