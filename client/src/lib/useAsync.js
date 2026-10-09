import { useCallback, useRef, useState } from 'react';

// Tracks in-flight async actions by key so buttons can show a spinner and block
// duplicate submissions. One hook covers pages with many independent actions
// (e.g. a status button per QR card): give each action a stable key.
//
//   const { run, isPending } = usePending();
//   <button disabled={isPending(id)} onClick={() => run(id, () => doThing(id))}>
//
// A second call with a key already in flight is ignored, so rapid double-clicks
// can't fire the request twice.
export function usePending() {
  const inFlight = useRef(new Set());
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  const run = useCallback(async (key, fn) => {
    if (inFlight.current.has(key)) return;   // duplicate — ignore
    inFlight.current.add(key);
    rerender();
    try {
      return await fn();
    } finally {
      inFlight.current.delete(key);
      rerender();
    }
  }, [rerender]);

  const isPending = useCallback((key) => inFlight.current.has(key), []);

  return { run, isPending };
}
