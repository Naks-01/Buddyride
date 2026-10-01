import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { AppRole } from "../types";

export function RequireRole({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to={`/login?role=${role}`} replace />;
  if (profile && profile.role && profile.role !== role) {
    return <Navigate to={`/login?role=${profile.role}`} replace />;
  }
  return <>{children}</>;
}
