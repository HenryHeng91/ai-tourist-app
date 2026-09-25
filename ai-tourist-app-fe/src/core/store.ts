import { create } from 'zustand';

/**
 * Minimal global app store.
 * Holds UI-level state (online status, auth token presence, current route).
 * Domain stores (auth, geofence, group, …) live in their own modules.
 */

export interface AppState {
  isOnline: boolean;
  hasAuthToken: boolean;
  setOnline: (online: boolean) => void;
  setHasAuthToken: (has: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnline:
    typeof navigator !== 'undefined' && 'onLine' in navigator
      ? navigator.onLine
      : true,
  hasAuthToken: false,
  setOnline: (isOnline) => {
    set({ isOnline });
  },
  setHasAuthToken: (hasAuthToken) => {
    set({ hasAuthToken });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useAppStore.getState().setOnline(true));
  window.addEventListener('offline', () =>
    useAppStore.getState().setOnline(false),
  );
}
