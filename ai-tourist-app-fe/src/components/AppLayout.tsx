import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from '../core/store';
import { useAuthStore } from '../auth/store';

/**
 * Persistent shell with header + main outlet. The header shows an offline
 * banner driven by `useAppStore.isOnline` so users notice degraded state.
 * When authenticated, an email + logout control appear on the right.
 */
export function AppLayout(): JSX.Element {
  const isOnline = useAppStore((s) => s.isOnline);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);
  return (
    <div>
      <header
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-4)',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
      >
        <strong>AI Travel Guide</strong>
        <nav aria-label="Primary">
          <NavLink to="/home" style={{ marginRight: '1rem' }}>
            Home
          </NavLink>
          <NavLink to="/group" style={{ marginRight: '1rem' }}>
            Group
          </NavLink>
          <NavLink to="/keys" style={{ marginRight: '1rem' }}>
            Keys
          </NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        {isAuthenticated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span aria-label="Signed-in user" style={{ color: 'var(--color-text-muted)' }}>
              {email ?? 'Signed in'}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void logout();
              }}
            >
              Log out
            </button>
          </div>
        )}
      </header>
      {!isOnline && (
        <div
          role="status"
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--color-warning)',
            color: 'white',
            textAlign: 'center',
          }}
        >
          You are offline. Cached data only.
        </div>
      )}
      <main className="app-container">
        <Outlet />
      </main>
    </div>
  );
}
