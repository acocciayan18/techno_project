import { useEffect } from 'react';
import { create } from 'zustand';

// Stale-while-revalidate data cache (Zustand).
//
// Page data used to live in each component's local useState(null), so every
// navigation remounted the page, reset to null, refetched, and flashed a
// skeleton. Here the fetched data is cached by key and survives navigation:
// a revisit renders the cached data instantly while a fresh fetch runs quietly
// in the background. The skeleton only shows on the genuine first load of a key.
export const useDataStore = create((set, get) => ({
  cache: {}, // key -> { data, error, loading, loaded, ts }

  // Fetch (or revalidate) a key. Keeps any cached data visible during a
  // background refetch — `loading` only flips true when there's nothing yet.
  async fetch(key, fetcher) {
    const prev = get().cache[key];
    const hasData = !!prev?.loaded;
    set((s) => ({
      cache: { ...s.cache, [key]: { ...(prev || {}), loading: !hasData, error: hasData ? '' : (prev?.error || '') } },
    }));
    try {
      const data = await fetcher();
      set((s) => ({ cache: { ...s.cache, [key]: { data, error: '', loading: false, loaded: true, ts: Date.now() } } }));
      return data;
    } catch (e) {
      set((s) => {
        const cur = s.cache[key] || {};
        return { cache: { ...s.cache, [key]: { ...cur, error: e.message, loading: false } } };
      });
      throw e;
    }
  },

  // Replace cached data for a key without a request (optimistic updates).
  setData(key, updater) {
    set((s) => {
      const cur = s.cache[key] || { loaded: true };
      const data = typeof updater === 'function' ? updater(cur.data) : updater;
      return { cache: { ...s.cache, [key]: { ...cur, data, loaded: true, loading: false } } };
    });
  },

  // Drop a key so its next read refetches from scratch.
  invalidate(key) {
    set((s) => {
      const next = { ...s.cache };
      delete next[key];
      return { cache: next };
    });
  },

  // Wipe everything — called on login/logout so one account never shows
  // another's cached data.
  reset() {
    set({ cache: {} });
  },
}));

// Hook: read a cached resource, fetching/revalidating on mount.
//   const { data, error, loading, reload } = useResource(`qr/${id}`, () => api.get(...));
// `loading` is first-load-only (true until a key has data). Use it for skeletons.
export function useResource(key, fetcher) {
  const entry = useDataStore((s) => s.cache[key]);
  const fetchKey = useDataStore((s) => s.fetch);

  useEffect(() => {
    fetchKey(key, fetcher);
    // fetcher is recreated each render; keying the effect on `key` alone is
    // intentional — we revalidate once per navigation to this key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    data: entry?.data,
    error: entry?.error || '',
    loading: entry ? entry.loading && !entry.loaded : true,
    loaded: !!entry?.loaded,
    reload: () => fetchKey(key, fetcher),
    mutate: (updater) => useDataStore.getState().setData(key, updater),
  };
}
