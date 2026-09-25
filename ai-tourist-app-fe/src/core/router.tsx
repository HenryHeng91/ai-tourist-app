import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AuthPage } from '../auth/AuthPage';
import { HomePage } from '../components/HomePage';
import { SettingsPage } from '../settings/SettingsPage';
import { GroupPage } from '../group/GroupPage';
import { MyKeysPage } from '../keyvault/MyKeysPage';
import { NotFoundPage } from '../components/NotFoundPage';
import { ProtectedRoute } from './ProtectedRoute';

/**
 * Base route table for Issue 1.1.5.
 * Domain routes (geofence, voiceover, walkie_talkie) are wired in later issues.
 */
export function AppRouter(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/keys"
          element={
            <ProtectedRoute>
              <MyKeysPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/group"
          element={
            <ProtectedRoute>
              <GroupPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
