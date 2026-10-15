import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { signToken } from '../lib/jwt.js';
import { sendPasswordReset } from '../lib/mailer.js';
import { verifyCaptcha } from '../lib/captcha.js';
import { canonicalizeEmail } from '../lib/email.js';
import { publishToUser, publishToAdmins } from '../lib/events.js';
import { AUTH, TEXT_LIMITS, RATE_LIMIT, ABUSE } from '../lib/constants.js';
import {
  createUser,
  findByUsername,
  findByUid,
  findByRecoveryEmail,
  findByRecoveryEmailCanonical,
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
import {
  signupSignals,
  signupBlockedMs,
  recordSignupStrike,
  botSignupReason,
} from '../services/signupGuard.js';

const router = Router();

// Per-IP throttles on the unauthenticated auth surface. These are abuse backstops
// layered ON TOP of the real guarantees: login has a per-account lockout
// (services/users.js) that an IP limit can't replace, and both login and
// forgot-password stay enumeration-safe (identical responses). Sized so a normal
// person never trips them; they stop scripted spray, mass sign-up and email
// bombing. Keyed by IP, so correct only with `trust proxy` set in prod.
const loginLimiter = rateLimit({ ...RATE_LIMIT.LOGIN, bucket: 'login', keyBy: 'ip' });
const registerLimiter = rateLimit({ ...RATE_LIMIT.REGISTER, bucket: 'register', keyBy: 'ip' });
const forgotLimiter = rateLimit({ ...RATE_LIMIT.FORGOT, bucket: 'forgot', keyBy: 'ip' });
const resetLimiter = rateLimit({ ...RATE_LIMIT.RESET, bucket: 'reset', keyBy: 'ip' });
// Per-user backstop on the authed self endpoints (/me, /me/settings). These sit on
// the auth router, which has no global per-account cap like the owner/admin routers,
// so this stops a hammer on the settings write / profile read. Keyed per account.
const meLimiter = rateLimit({ ...RATE_LIMIT.ME, bucket: 'me', keyBy: 'user' });

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
    // Anti-abuse fields (all optional so API/older clients still work):
    //  - honeypot: hidden form field; a human leaves it empty (see ABUSE.HONEYPOT_FIELD).
    //  - elapsedMs: ms the client spent on the form; a too-fast submit looks scripted.
    //  - captchaToken: bot-challenge token, required only when a CAPTCHA_SECRET is set.
    [ABUSE.HONEYPOT_FIELD]: z.string().max(200).optional(),
    elapsedMs: z.number().int().nonnegative().optional(),
    captchaToken: z.string().max(4000).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Shown whenever a signup is refused on an abuse signal. Deliberately vague — it
// never reveals which check tripped (honeypot, timing, CAPTCHA), so a script can't
// tune around it, while still telling a real user what to do.
const SIGNUP_BLOCKED = 'We couldn’t process this sign-up. Please try again later.';

function blockedMinutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// Generic, identical for both "no such user" and "wrong password" so the
// response can't be used to probe which usernames exist.
const BAD_CREDS = 'Invalid username or password';

router.post('/register', registerLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { name, username, password, recoveryEmail, acceptedTerms, captchaToken } = req.body;
    const honeypot = req.body[ABUSE.HONEYPOT_FIELD];
    const emailCanonical = canonicalizeEmail(recoveryEmail);
    const signals = signupSignals({ ip: req.ip, emailCanonical });

    // 1) Temporary restriction: this IP or recovery email has racked up enough
    //    blocked attempts to be in a cooldown. Refuse up front with a clear ETA,
    //    before doing any work. Keyed on IP + email, so it can't be dodged by
    //    swapping just one of them.
    const cooldownMs = signupBlockedMs(signals);
    if (cooldownMs > 0) {
      const mins = blockedMinutes(cooldownMs);
      res.set('Retry-After', String(Math.ceil(cooldownMs / 1000)));
      return res.status(429).json({
        error: `Too many sign-up attempts from here. Please try again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      });
    }

    // 2) Bot heuristics (honeypot + submit timing). A hit is a strong automation
    //    signal: record a strike (which can engage the cooldown above) and refuse
    //    with the vague message so a script learns nothing.
    const botReason = botSignupReason({ honeypot, elapsedMs: req.body.elapsedMs });
    if (botReason) {
      recordSignupStrike(signals);
      return res.status(400).json({ error: SIGNUP_BLOCKED });
    }

    // 3) CAPTCHA / bot-challenge — only enforced when a secret is configured.
    const captcha = await verifyCaptcha(captchaToken, req.ip);
    if (!captcha.ok) {
      recordSignupStrike(signals);
      return res.status(400).json({ error: SIGNUP_BLOCKED });
    }

    // 4) Username uniqueness (case-folded). A taken handle is ordinary user error,
    //    not abuse, so it does NOT earn a strike.
    if (await findByUsername(username)) {
      return res.status(409).json({
        error: 'That username is already taken',
        details: [{ path: 'username', message: 'That username is already taken' }],
      });
    }

    // 5) Duplicate recovery email — the core multi-account signal. Match both the
    //    canonical (alias-folded) form and the raw address (for legacy accounts
    //    saved before the canonical field existed). This IS an abuse signal, so it
    //    records a strike toward the cooldown.
    if (recoveryEmail) {
      const dupe =
        (await findByRecoveryEmailCanonical(recoveryEmail)) || (await findByRecoveryEmail(recoveryEmail));
      if (dupe) {
        recordSignupStrike(signals);
        const msg = 'An account with that recovery email already exists.';
        return res.status(409).json({ error: msg, details: [{ path: 'recoveryEmail', message: msg }] });
      }
    }

    const user = await createUser({ name, username, password, recoveryEmail: recoveryEmail || null, acceptedTerms });
    const token = signToken({ uid: user.uid, role: user.role, tv: user.tokenVersion || 0 });
    // A new account appears in the admin users table + the registered-users stat.
    publishToAdmins(['admin/users', 'admin/stats']);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
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
    const token = signToken({ uid: user.uid, role: user.role, tv: user.tokenVersion || 0 });
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, meLimiter, (req, res) => {
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

router.put('/me/settings', requireAuth, meLimiter, validate(settingsSchema), async (req, res, next) => {
  try {
    const user = await updateSettings(req.user.uid, req.body);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Sync the change (e.g. theme) to this account's other tabs/devices live.
    publishToUser(req.user.uid, ['me']);
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

router.post('/forgot-password', forgotLimiter, validate(forgotSchema), async (req, res, next) => {
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

router.post('/reset-password', resetLimiter, validate(resetSchema), async (req, res, next) => {
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
