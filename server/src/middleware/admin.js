import { ROLE } from '../lib/constants.js';

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== ROLE.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
