import { create } from 'zustand';
import { api, getToken, setToken, setOnUnauthorized } from '../lib/api.js';
import { useDataStore } from './dataStore.js';
import { notify } from '../lib/toast.jsx';
import { setThemeMode, THEME_MODES } from '../lib/theme.js';

// When a session is (re)established on this device, the account's stored theme is
// authoritative — apply it so preferences follow the user across devices.
function syncThemeFromUser(user) {
  const t = user?.settings?.theme;
  if (THEME_MODES.includes(t)) setThemeMode(t);
}

// Global auth state (Zustand). The signed-in user and the app-boot "loading"
// flag live here so any component can read them without prop-drilling or a
// provider. `useAuth` (context/AuthContext.jsx) is a thin selector wrapper kept
// for backwards compatibility — nothing else needs to change.
export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,       // true until the initial /auth/me check resolves
  initialized: false,  // guards init() so it runs exactly once

  // Restore the session from a stored token. Called once on app mount.
  async init() {
    if (get().initialized) return;
    set({ initialized: true });

    // If any authed request later comes back 401/403 (expired token, deleted or
    // disabled account), drop the session so ProtectedRoute bounces to /login.
    setOnUnauthorized(() => {
      if (get().user) {
        useDataStore.getState().reset();
        set({ user: null });
        notify.warning('Your session expired. Please log in again.');
      }
    });

    if (getToken()) {
      try {
        const { user } = await api.get('/auth/me');
        set({ user });
        syncThemeFromUser(user);
      } catch {
        setToken(null);
      }
    }
    set({ loading: false });
  },

  async login(username, password) {
    const { token, user } = await api.post('/auth/login', { username, password }, { auth: false });
    setToken(token);
    useDataStore.getState().reset();  // fresh cache for the new account
    set({ user });
    syncThemeFromUser(user);
    return user;
  },

  async register(details) {
    const { token, user } = await api.post('/auth/register', details, { auth: false });
    setToken(token);
    useDataStore.getState().reset();
    set({ user });
    syncThemeFromUser(user);
    return user;
  },

  // Persist a theme preference to the account so it syncs to other devices. The
  // local apply already happened (setThemeMode in the toggle) for instant UI; this
  // writes it through and refreshes the in-memory user. Fire-and-forget: a failed
  // write just leaves the device on its local choice.
  async saveTheme(theme) {
    if (!get().user) return;
    try {
      const { user } = await api.put('/auth/me/settings', { theme });
      set({ user });
    } catch { /* keep local preference; will re-sync on next login */ }
  },

  // Re-pull the signed-in account from the server and apply it. Driven by the
  // real-time 'me' nudge so a change to this user (their own theme saved on another
  // tab, or an admin editing their name/username) reflects in this live session
  // without a reload. Reuses the same theme-sync as init/login. A 401 here is
  // handled by the global setOnUnauthorized hook, so swallow errors quietly.
  async refreshMe() {
    if (!get().user) return;
    try {
      const { user } = await api.get('/auth/me');
      set({ user });
      syncThemeFromUser(user);
    } catch { /* session teardown handled by setOnUnauthorized */ }
  },

  // Recovery (both respond generically; the UI shows a neutral confirmation).
  forgotPassword(username) {
    return api.post('/auth/forgot-password', { username }, { auth: false });
  },
  resetPassword(payload) {
    return api.post('/auth/reset-password', payload, { auth: false });
  },

  logout() {
    setToken(null);
    useDataStore.getState().reset();  // drop the signed-out user's cached data
    set({ user: null });
    notify.success('Logged out.');
  },

  // End the session from a server-driven event (e.g. the real-time stream reports
  // the account was disabled). Like logout() but with a caller-supplied reason and
  // no "Logged out" success toast. Idempotent: safe if already signed out.
  forceLogout(message) {
    setToken(null);
    useDataStore.getState().reset();
    if (get().user) set({ user: null });
    if (message) notify.warning(message);
  },
}));
