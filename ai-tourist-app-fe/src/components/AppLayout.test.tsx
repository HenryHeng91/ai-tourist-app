import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { useAppStore } from '../core/store';
import { resetAuthStoreForTests, useAuthStore } from '../auth/store';

beforeEach(() => {
  window.localStorage.clear();
  resetAuthStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('AppLayout', () => {
  it('renders the brand and primary nav', () => {
    render(
      <MemoryRouter
      initialEntries={['/home']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<div>Home content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('AI Travel Guide')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /group/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('shows the offline banner when navigator reports offline', () => {
    act(() => {
      useAppStore.setState({ isOnline: false });
    });
    render(
      <MemoryRouter
      initialEntries={['/home']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<div>Home content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
    act(() => {
      useAppStore.setState({ isOnline: true });
    });
  });

  it('shows email + logout button when authenticated', () => {
    act(() => {
      useAuthStore.setState({
        isAuthenticated: true,
        email: 'a@b.com',
        userId: 'u1',
      });
    });
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Signed-in user')).toHaveTextContent('a@b.com');
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('does not show the logout button when unauthenticated', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('invokes the store logout action when clicked', async () => {
    const logoutSpy = vi.fn().mockResolvedValueOnce(undefined);
    act(() => {
      useAuthStore.setState({
        isAuthenticated: true,
        email: 'a@b.com',
        userId: 'u1',
      });
      // Swap in our spy for the duration of this render.
      useAuthStore.setState({ logout: logoutSpy });
    });
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    });
    await waitFor(() => expect(logoutSpy).toHaveBeenCalledTimes(1));
  });
});
