import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Component, type ReactNode } from 'react';
import { useAuth } from './context/AuthContext';
import { auth } from './lib/firebase';
import { RoleSelect } from './pages/RoleSelect';
import RolePasswordLogin from './pages/RolePasswordLogin';
import { PassengerDashboard } from './pages/dashboard/PassengerDashboard';
import { DriverDashboard } from './pages/dashboard/DriverDashboard';
import { AdminDashboard } from './pages/dashboard/AdminDashboard';
import { RideStatus } from './pages/RideStatus';
import { Profile } from './pages/Profile';
import SafetyDashboard from './pages/admin/SafetyDashboard';
import { LoadingScreen } from './components/LoadingScreen';
import { SplashScreen } from './components/SplashScreen';
import type { AppRole } from './types';
import { ADMIN_EMAIL } from './config/admin';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div className="min-h-screen bg-black p-8 text-white">Driver dashboard error: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

export type { AppRole };

function dashboardPath(role: AppRole): string {
  return `/dashboard/${role}`;
}

function RequireRole({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (typeof window === 'undefined') return null;
  if (loading) return <LoadingScreen />;
  if (localStorage.getItem(`${role}LoggedIn`) !== 'true') return <Navigate to={`/login?role=${role}`} replace />;
  if (profile && profile.role !== role) return <Navigate to={`/login?role=${role}`} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (typeof window === 'undefined') return null;
  if (loading) return <LoadingScreen />;
  const user = auth.currentUser;
  if (!user) return <Navigate to="/login?role=admin" replace />;
  if (user.email?.toLowerCase() !== ADMIN_EMAIL) {
    console.warn('Blocked non-admin:', user.email);
    return <Navigate to="/" replace />;
  }
  if (localStorage.getItem('adminLoggedIn') !== 'true') return <Navigate to="/login?role=admin" replace />;
  return <>{children}</>;
}

function HomeOrRedirect() {
  const { profile, loading } = useAuth();
  if (typeof window === 'undefined') return null;
  if (loading) return <LoadingScreen />;
  const savedRole = (['passenger', 'driver', 'admin'] as AppRole[]).find((role) => localStorage.getItem(`${role}LoggedIn`) === 'true');
  if (savedRole) return <Navigate to={dashboardPath(savedRole)} replace />;
  if (profile) return <Navigate to={dashboardPath(profile.role)} replace />;
  return <RoleSelect />;
}

function LoginRouter() {
  return <RolePasswordLogin />;
}

function ProtectedDriverDashboard() {
  return <RequireRole role="driver"><ErrorBoundary><DriverDashboard /></ErrorBoundary></RequireRole>;
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
          <Route path="/passenger/dashboard" element={<RequireRole role="passenger"><PassengerDashboard /></RequireRole>} />
          <Route path="/dashboard/passenger" element={<RequireRole role="passenger"><PassengerDashboard /></RequireRole>} />
          <Route path="/driver" element={<ProtectedDriverDashboard />} />
          <Route path="/driver/dashboard" element={<ProtectedDriverDashboard />} />
          <Route path="/dashboard/driver" element={<ProtectedDriverDashboard />} />
          <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="/admin/safety" element={<RequireAdmin><SafetyDashboard /></RequireAdmin>} />
          <Route path="/dashboard/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="/ride-status/:id" element={<RequireRole role="passenger"><RideStatus /></RequireRole>} />
          <Route path="/profile" element={<RequireRole role="passenger"><Profile /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
