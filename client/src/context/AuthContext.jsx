import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';

// Auth now lives in a Zustand store (store/authStore.js). This module stays as a
// compatibility shim so existing imports (`AuthProvider`, `useAuth`) keep working
// unchanged. AuthProvider just kicks off the one-time session restore; useAuth
// selects the same shape components already expect.
export function AuthProvider({ children }) {
  const init = useAuthStore((s) => s.init);
  useEffect(() => { init(); }, [init]);
  return children;
}

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  return {
    user,
    loading,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
  };
}
