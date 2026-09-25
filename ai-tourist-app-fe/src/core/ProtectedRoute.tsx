import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../auth/store';

interface Props {
  children: ReactNode;
}

/**
 * Redirects to /auth when the user is not authenticated.
 * Public routes opt out by NOT wrapping their element.
 */
export function ProtectedRoute({ children }: Props): JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
