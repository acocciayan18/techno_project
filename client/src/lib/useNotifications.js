import { useEffect } from 'react';
import { api } from './api.js';
import { useResource, useDataStore } from '../store/dataStore.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from './date.js';

const KEY = 'owner/notifications';
// Background refresh cadence so the badge reflects new finder reports without a
// manual reload. useResource already revalidates on navigation; this keeps a
// long-lived surface (the nav bell) current while the user sits on one page.
const POLL_MS = 60 * 1000;

// Owner notifications (finder "I found this" reports). Shared cache key so every
// surface , the nav bell badge and any in-page panel , reads the same data and a
// read/markAll in one place updates them all.
export function useNotifications() {
  const { user } = useAuth();
  const { data, loading, reload, mutate } = useResource(
    KEY,
    () => api.get('/owner/notifications'),
  );

  // Poll while signed in. Cleared on unmount; guarded so a signed-out app never
  // hits the authed endpoint (which would 401 and drop the session).
  useEffect(() => {
    if (!user) return undefined;
    const t = setInterval(() => reload(), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const list = data?.notifications || [];
  const unread = data?.unread ?? list.filter((n) => !n.read).length;

  // Optimistic: flip read state locally, then persist. The server is the source of
  // truth; a reload reconciles if a write fails.
  async function markRead(id) {
    const target = list.find((n) => n.id === id);
    if (!target || target.read) return;
    mutate((d) => bumpRead(d, (n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await api.put(`/owner/notifications/${id}/read`);
    } catch {
      reload();
    }
  }

  async function markAllRead() {
    if (unread === 0) return;
    mutate((d) => bumpRead(d, (n) => ({ ...n, read: true })));
    try {
      await api.put('/owner/notifications/read-all');
    } catch {
      reload();
    }
  }

  return { list, unread, loading, reload, markRead, markAllRead };
}

// Apply `fn` to every notification and recompute the unread count in one shot.
function bumpRead(data, fn) {
  const notifications = (data?.notifications || []).map(fn);
  return { ...data, notifications, unread: notifications.filter((n) => !n.read).length };
}

// Drop the cached notifications (e.g. on logout) so one account never shows
// another's. authStore.reset() already wipes the whole cache on login/logout;
// this is here for targeted refreshes.
export function invalidateNotifications() {
  useDataStore.getState().invalidate(KEY);
}

// Compact relative time ("just now", "4m", "3h", "2d") with a full timestamp title.
export function relativeTime(iso) {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(then);
}
