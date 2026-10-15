import { verifyToken } from '../lib/jwt.js';
import { findByUid, getSession, normalizeSettings, touchSession } from '../services/users.js';

// Requires a valid Bearer JWT. Attaches req.user = { uid, username, role, name,
// settings }. Re-checks the live user every request so a deleted or disabled
// account is rejected immediately, even while holding a still-valid token, and so
// a token minted before a password change (lower tokenVersion) is rejected.
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = verifyToken(token);
    const user = await findByUid(payload.uid);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    if (user.disabled) return res.status(403).json({ error: 'This account has been disabled.' });
    // Reject tokens issued before the account's last credential change. Legacy
    // tokens/users default to 0 on both sides, so this never fires until a password
    // actually changes.
    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    if (payload.jti) {
      const session = await getSession(payload.jti);
      if (!session || session.uid !== user.uid || session.revokedAt || (session.expiresAt && Date.parse(session.expiresAt) <= Date.now())) {
        return res.status(401).json({ error: 'Session revoked. Please log in again.' });
      }
      touchSession(payload.jti).catch((e) => console.error('[auth] session timestamp update failed', e?.message || e));
    }
    req.user = {
      uid: user.uid,
      username: user.username,
      role: user.role,
      name: user.name,
      recoveryEmail: user.recoveryEmail || null,
      recoveryEmailVerified: !!user.recoveryEmailVerified,
      settings: normalizeSettings(user.settings),
      sessionId: payload.jti || null,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
