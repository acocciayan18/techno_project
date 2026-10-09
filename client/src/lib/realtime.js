import { useEffect, useRef } from 'react';
import { API_BASE } from './config.js';
import { getToken } from './api.js';
import { useDataStore } from '../store/dataStore.js';
import { useAuthStore } from '../store/authStore.js';

// Real-time layer (client side). Opens ONE Server-Sent Events connection per
// signed-in session and turns each server nudge into a background revalidation of
// the matching cached resources (store/dataStore.js). The server only ever says
// "resource X changed" — the client refetches through the normal authenticated
// API, so nothing here can show data the account couldn't already load. This sits
// on top of the existing stale-while-revalidate cache and the 60s notifications
// poll: both still work if the stream is unavailable (older browser, proxy that
// strips SSE), this just makes updates appear immediately instead of on the next
// navigation / poll.

// Refresh every currently-cached resource once (used on first connect's recovery
// and after a reconnect, to reconcile anything missed while offline).
function revalidateAll() {
  const { cache, fetch } = useDataStore.getState();
  for (const [key, entry] of Object.entries(cache)) if (entry?.fetcher) fetch(key, entry.fetcher);
}

export function useRealtime() {
  const user = useAuthStore((s) => s.user);
  const reconnectedRef = useRef(false);

  useEffect(() => {
    if (!user) return undefined;
    const token = getToken();
    if (!token || typeof EventSource === 'undefined') return undefined;

    const url = `${API_BASE}/api/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    reconnectedRef.current = false;

    es.onopen = () => {
      // The browser reconnects automatically after a dropped connection (honouring
      // the server's `retry` hint). On every reconnect AFTER the first open, pull a
      // fresh copy of everything so changes that happened during the outage aren't
      // missed — SSE has no replay.
      if (reconnectedRef.current) revalidateAll();
      reconnectedRef.current = true;
    };

    es.onmessage = (ev) => {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      // Account disabled by an admin: end the session live (don't wait for the next
      // REST 401). The server has already closed the stream on its side.
      if (data?.kick) {
        es.close();
        useAuthStore.getState().forceLogout('Your account was disabled by an administrator.');
        return;
      }
      if (Array.isArray(data?.resources)) {
        const store = useDataStore.getState();
        for (const r of data.resources) store.revalidateMatching(r);
      }
    };

    // Transient errors: EventSource retries on its own, so there's nothing to do.
    // A hard refusal (expired/invalid token) leaves it CLOSED with no retry; the
    // next authenticated REST call's 401 handler tears the session down, so we
    // deliberately don't duplicate that logic here.
    es.onerror = () => {};

    return () => {
      es.close();
    };
    // Re-open when the signed-in account changes (login / logout / switch user).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);
}
