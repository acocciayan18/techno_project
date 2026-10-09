import { verifyToken } from '../lib/jwt.js';
import { findByUid } from '../services/users.js';

// Requires a valid Bearer JWT. Attaches req.user = { uid, username, role, name }.
// Re-checks the live user every request so a deleted or disabled account is
// rejected immediately, even while holding a still-valid token.
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = verifyToken(token);
    const user = await findByUid(payload.uid);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    if (user.disabled) return res.status(403).json({ error: 'This account has been disabled.' });
    req.user = { uid: user.uid, username: user.username, role: user.role, name: user.name };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
