// Tiny in-memory fixed-window rate limiter. Keyed by a bucket name plus an
// identity — the authenticated user id, the client IP, or a composite — so
// different routes throttle independently and limits can't be dodged by:
//   - refreshing / opening multiple tabs (the key is the uid or IP, not the page),
//   - hitting the backend API directly (same middleware runs on every request),
//   - switching accounts to escape an IP limit, or vice-versa (choose the key that
//     matches the threat: 'ip' for pre-auth endpoints, 'user' for authed actions).
//
// Single-instance only — the Map lives in this process. A horizontally scaled
// fleet would need a shared store (Redis / Firestore) for the counters to be
// authoritative across instances; documented as a known limitation.
//
// IMPORTANT: a 'user'-keyed limiter must mount AFTER requireAuth so req.user is set.
// An 'ip'-keyed limiter must mount where req.ip is the real client — see the
// `trust proxy` note in createApp().
const buckets = new Map(); // key -> { count, resetAt }

// Resolve the identity to throttle on. 'auto' (default) prefers the authenticated
// uid and falls back to IP, which is the right behaviour for a route that may be
// either; 'user' and 'ip' force one or the other.
function identity(req, keyBy) {
  if (keyBy === 'ip') return `ip:${req.ip || 'anon'}`;
  if (keyBy === 'user') return `uid:${req.user?.uid || req.ip || 'anon'}`;
  return `auto:${req.user?.uid || req.ip || 'anon'}`;
}

export function rateLimit({ windowMs, max, bucket = 'default', keyBy = 'auto' }) {
  return (req, res, next) => {
    const key = `${bucket}:${identity(req, keyBy)}`;
    const now = Date.now();

    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));

    if (entry.count > max) {
      const retryMs = entry.resetAt - now;
      res.set('Retry-After', String(Math.ceil(retryMs / 1000)));
      return res.status(429).json({
        error: `Too many requests. Try again in about ${Math.ceil(retryMs / 1000)} second(s).`,
      });
    }
    next();
  };
}

// Opportunistic cleanup so the Map can't grow unbounded over a long-lived process.
const CLEANUP_MS = 10 * 60 * 1000;
const timer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
}, CLEANUP_MS);
timer.unref?.();
