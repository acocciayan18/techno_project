// Tiny in-memory fixed-window rate limiter. Keyed by authenticated user id (falls
// back to client IP for unauthenticated routes) plus a bucket name, so different
// routes throttle independently. Single-instance only — a shared store (Redis /
// Firestore) would be required to throttle across a horizontally scaled fleet.
//
// Mounts AFTER requireAuth so req.user is available.
const buckets = new Map(); // key -> { count, resetAt }

export function rateLimit({ windowMs, max, bucket = 'default' }) {
  return (req, res, next) => {
    const id = req.user?.uid || req.ip || 'anon';
    const key = `${bucket}:${id}`;
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
