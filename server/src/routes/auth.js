import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { signToken } from '../lib/jwt.js';
import { sendPasswordReset } from '../lib/mailer.js';
import { AUTH, TEXT_LIMITS } from '../lib/constants.js';
import {
  createUser,
  findByUsername,
  findByUid,
  verifyPassword,
  publicUser,
  isLocked,
  lockRemainingMs,
  recordFailedAttempt,
  clearLoginThrottle,
  issueResetToken,
  findByResetToken,
  resetPassword,
  updateSettings,
} from '../services/users.js';

const router = Router();

// Shared password rule: 8+ chars with at least one letter and one number.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(AUTH.USERNAME_RE, 'Username must be 3–20 characters: letters, numbers, or underscore');

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Full name is required').max(TEXT_LIMITS.NAME),
    username,
    password,
    confirmPassword: z.string(),
    recoveryEmail: z.string().trim().toLowerCase().email('Enter a valid email').or(z.literal('')).optional(),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must agree to the Terms of Service and Privacy Policy' }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// Generic, identical for both "no such user" and "wrong password" so the
// response can't be used to probe which usernames exist.
const BAD_CREDS = 'Invalid username or password';

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { name, username, password, recoveryEmail, acceptedTerms } = req.body;
    if (await findByUsername(username)) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    const user = await createUser({ name, username, password, recoveryEmail: recoveryEmail || null, acceptedTerms });
    const token = signToken({ uid: user.uid, role: user.role });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await findByUsername(username);

    // Unknown user: same 401 as a wrong password (no enumeration).
    if (!user) return res.status(401).json({ error: BAD_CREDS });

    if (isLocked(user)) {
      const mins = Math.ceil(lockRemainingMs(user) / 60000);
      return res
        .status(429)
        .json({ error: `Too many failed attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.` });
    }

    if (!(await verifyPassword(user, password))) {
      await recordFailedAttempt(user.uid);
      return res.status(401).json({ error: BAD_CREDS });
    }

    // Correct credentials but the account is turned off. Only revealed once the
    // password is proven, so it doesn't leak account existence to attackers.
    if (user.disabled) {
      return res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' });
    }

    await clearLoginThrottle(user.uid);
    const token = signToken({ uid: user.uid, role: user.role });
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Update the signed-in user's synced preferences (e.g. theme). Partial: only the
// provided keys change. Returns the fresh public user so the client can refresh
// its in-memory copy.
const settingsSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No settings provided' });

router.put('/me/settings', requireAuth, validate(settingsSchema), async (req, res, next) => {
  try {
    const user = await updateSettings(req.user.uid, req.body);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

// ---- Password recovery ------------------------------------------------------

// Step 1: request a reset. Always responds the same way whether or not the
// username exists or has a recovery email, so it reveals nothing.
const forgotSchema = z.object({ username: z.string().trim().toLowerCase().min(1) });
const GENERIC_FORGOT = 'If an account with a recovery email exists, a reset link has been sent.';

router.post('/forgot-password', validate(forgotSchema), async (req, res, next) => {
  try {
    const user = await findByUsername(req.body.username);
    if (user && user.recoveryEmail && !user.disabled) {
      const token = await issueResetToken(user.uid);
      const base = process.env.VITE_API_BASE_URL || 'http://localhost:5173';
      const link = `${base}/reset-password?token=${token}`;
      await sendPasswordReset({ to: user.recoveryEmail, link });
    }
    res.json({ message: GENERIC_FORGOT });
  } catch (e) {
    next(e);
  }
});

// Step 2: complete the reset with the token from the email.
const resetSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

router.post('/reset-password', validate(resetSchema), async (req, res, next) => {
  try {
    const user = await findByResetToken(req.body.token);
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    await resetPassword(user.uid, req.body.password);
    res.json({ message: 'Password updated. You can now log in.' });
  } catch (e) {
    next(e);
  }
});

export default router;
