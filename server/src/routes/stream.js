import { Router } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { findByUid } from '../services/users.js';
import { ROLE, RATE_LIMIT } from '../lib/constants.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { addClient, removeClient, heartbeat } from '../lib/events.js';

const router = Router();

// Per-IP cap on SSE (re)connection attempts. The handshake runs a live-user DB
// lookup before upgrading, so an unthrottled reconnect storm is a cheap amplifier;
// this bounds it. Keyed by IP because req.user isn't set yet (auth happens in the
// handler). The per-account concurrent-connection cap (lib/events.js) is the other
// half of the guard — this limits churn, that limits held sockets.
const streamLimiter = rateLimit({ ...RATE_LIMIT.STREAM, bucket: 'stream', keyBy: 'ip' });

// Server-Sent Events stream. One long-lived GET per signed-in tab; the server
// pushes "revalidate these resources" nudges (see lib/events.js).
//
// Auth note: EventSource can't send an Authorization header, so the JWT is passed
// as a query param and verified here with the SAME secret and the SAME live-user
// re-check as requireAuth (a disabled/deleted account can't open a stream). The
// token-in-URL tradeoff is the standard one for SSE; it's the same bearer token
// the client already holds, scoped identically, and the connection is re-checked.
// (A dedicated short-lived stream ticket could reduce URL exposure later.)
const HEARTBEAT_MS = 25 * 1000;

router.get('/stream', streamLimiter, async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const user = await findByUid(payload.uid);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    if (user.disabled) return res.status(403).json({ error: 'This account has been disabled.' });
    // Same credential-change check as requireAuth: a stale-token stream can't open.
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    // SSE handshake. Disable buffering/compression so events flush immediately.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tell nginx not to buffer the stream
    });
    res.write('retry: 5000\n\n'); // ask the browser to reconnect after 5s if dropped
    res.write(': connected\n\n');
    res.flushHeaders?.();

    const entry = addClient(user.uid, res, user.role === ROLE.ADMIN);

    const hb = setInterval(() => heartbeat(res), HEARTBEAT_MS);
    hb.unref?.();

    const cleanup = () => {
      clearInterval(hb);
      removeClient(user.uid, entry);
    };
    req.on('close', cleanup);
    res.on('error', cleanup);
  } catch (e) {
    next(e);
  }
});

export default router;
