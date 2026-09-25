import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthPage } from './AuthPage';
import { resetAuthStoreForTests, useAuthStore } from './store';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('./api', () => ({
  login: (...args: unknown[]) => mocks.login(...args),
  signup: (...args: unknown[]) => mocks.signup(...args),
  refresh: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.clear();
  resetAuthStoreForTests();
  mocks.navigate.mockReset();
  mocks.login.mockReset();
  mocks.signup.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function renderAuth(): void {
  render(
    <MemoryRouter initialEntries={['/auth']}>
      <AuthPage />
    </MemoryRouter>,
  );
}

describe('AuthPage', () => {
  it('renders both tabs', () => {
    renderAuth();
    expect(screen.getByRole('tab', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /create account/i })).toBeInTheDocument();
  });

  it('hides the display-name field on login, shows it on signup', () => {
    renderAuth();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: /create account/i }));
    });
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', async () => {
    renderAuth();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    });
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it('rejects malformed email', async () => {
    renderAuth();
    act(() => {
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'not-an-email' } });
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'hunter12pw' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    });
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
  });

  it('rejects short passwords', async () => {
    renderAuth();
    act(() => {
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'a@b.com' } });
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'short' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    });
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it('does not call api.login until inputs are valid', async () => {
    renderAuth();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    });
    // Validation blocks the call before the store action runs.
    await waitFor(() => expect(screen.getByText(/email is required/i)).toBeInTheDocument());
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('redirects on successful login', async () => {
    mocks.login.mockResolvedValueOnce({
      userId: 'u1',
      email: 'a@b.com',
      displayName: null,
      accessToken: 'a',
      refreshToken: 'r',
    });

    renderAuth();
    act(() => {
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'a@b.com' } });
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'hunter12pw' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    });

    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'hunter12pw',
    }));
    expect(mocks.navigate).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('displays backend error message after rejection', async () => {
    mocks.login.mockRejectedValueOnce(new Error('Invalid credentials'));

    renderAuth();
    act(() => {
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'a@b.com' } });
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'hunter12pw' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i);
  });

  it('switches to signup and submits with displayName', async () => {
    mocks.signup.mockResolvedValueOnce({
      userId: 'u1',
      email: 'a@b.com',
      displayName: 'Ada',
      accessToken: 'a',
      refreshToken: 'r',
    });

    renderAuth();
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: /create account/i }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText(/display name/i), {
        target: { value: 'Ada' },
      });
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'a@b.com' } });
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'hunter12pw' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    await waitFor(() =>
      expect(mocks.signup).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'hunter12pw',
        displayName: 'Ada',
      }),
    );
  });

  it('clears error when switching modes', async () => {
    // First trigger an error
    mocks.login.mockRejectedValueOnce(new Error('nope'));
    renderAuth();
    act(() => {
      fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'a@b.com' } });
      fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'hunter12pw' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/nope/i);
    expect(useAuthStore.getState().error).toBe('nope');
    // Switch mode — error should clear via clearError
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: /create account/i }));
    });
    expect(useAuthStore.getState().error).toBeNull();
  });
});
