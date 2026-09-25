import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './store';

/**
 * Auth screen with Login and Signup tabs.
 *
 * Validation is purely client-side (length, format). Server-side validation
 * is delegated to the backend's Zod schemas — the auth store surfaces any
 * upstream error message verbatim via the `error` field.
 */
type Mode = 'login' | 'signup';

interface FormState {
  email: string;
  password: string;
  displayName: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  displayName?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

function validate(mode: Mode, form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(form.email)) errors.email = 'Enter a valid email address';

  if (!form.password) errors.password = 'Password is required';
  else if (form.password.length < MIN_PASSWORD_LEN)
    errors.password = `Password must be at least ${MIN_PASSWORD_LEN} characters`;

  if (mode === 'signup' && form.displayName.trim().length === 0) {
    // displayName is OPTIONAL in the backend; we don't enforce it. The
    // placeholder text suggests it but a signup with only email+password
    // succeeds.
  }
  return errors;
}

export function AuthPage(): JSX.Element {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const signup = useAuthStore((s) => s.signup);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState<FormState>({ email: '', password: '', displayName: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function switchMode(next: Mode): void {
    setMode(next);
    setErrors({});
    clearError();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const v = validate(mode, form);
    setErrors(v);
    if (Object.values(v).some(Boolean)) return;
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ email: form.email.trim(), password: form.password });
      } else {
        await signup({
          email: form.email.trim(),
          password: form.password,
          displayName: form.displayName.trim() || undefined,
        });
      }
      navigate('/home', { replace: true });
    } catch {
      // Error message is in the store; UI re-renders the alert.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-container" aria-labelledby="auth-title" style={{ maxWidth: 420 }}>
      <h1 id="auth-title">AI Travel Guide</h1>
      <p>Sign in to discover places tailored to you.</p>

      <div role="tablist" aria-label="Authentication mode" style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => switchMode('login')}
          style={{ flex: 1, padding: '0.5rem', fontWeight: mode === 'login' ? 'bold' : 'normal' }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => switchMode('signup')}
          style={{ flex: 1, padding: '0.5rem', fontWeight: mode === 'signup' ? 'bold' : 'normal' }}
        >
          Create account
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}
        noValidate
      >
        {mode === 'signup' && (
          <label>
            Display name (optional)
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              autoComplete="name"
              style={{ display: 'block', width: '100%', padding: '0.5rem' }}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            style={{ display: 'block', width: '100%', padding: '0.5rem' }}
          />
        </label>
        {errors.email && (
          <span id="email-error" role="alert" style={{ color: 'var(--color-error, #c00)' }}>
            {errors.email}
          </span>
        )}
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            style={{ display: 'block', width: '100%', padding: '0.5rem' }}
          />
        </label>
        {errors.password && (
          <span id="password-error" role="alert" style={{ color: 'var(--color-error, #c00)' }}>
            {errors.password}
          </span>
        )}
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {error && (
        <div role="alert" className="auth-error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}
    </main>
  );
}
