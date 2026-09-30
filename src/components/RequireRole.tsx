import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

export const RequireRole = ({ role, children }: { role: string, children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth() as any;
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to={/login?role=${role}} replace />;
  if (profile && profile.role && profile.role !== role) {
    return <Navigate to={/login?role=${profile.role}} replace />;
  }
  return <>{children}</>;
};
