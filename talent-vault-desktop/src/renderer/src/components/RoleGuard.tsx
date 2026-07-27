import React from 'react';
import { useAuth } from '../context/AuthContext';

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function RoleGuard({ allowedRoles, children, fallback = null }: RoleGuardProps) {
  const { userProfile } = useAuth();

  // If loading or no profile, do not render
  if (!userProfile) return null;

  // If user role is NOT in the allowed list, render the fallback (default is invisible)
  if (!allowedRoles.includes(userProfile.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}