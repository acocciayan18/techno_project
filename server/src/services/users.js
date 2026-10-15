import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, FieldValue } from '../config/firebase.js';
import { COL, ROLE, AUTH, LEGAL } from '../lib/constants.js';
import { canonicalizeEmail } from '../lib/email.js';

const col = () => db.collection(COL.USERS);

// Only these fields are ever sent outside the server. Everything else
// (passwordHash, reset tokens, attempt counters) stays internal.
// Per-user preferences that sync across devices. Kept small and well-defined so
// a stale client can't inject arbitrary keys; new prefs get a default here.
export const DEFAULT_SETTINGS = { theme: 'system' };

export function normalizeSettings(s) {
  return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
}

export function publicUser(u) {
  if (!u) return null;
  return {
    uid: u.uid,
    username: u.username,
    name: u.name || '',
    role: u.role || ROLE.USER,
    disabled: !!u.disabled,
    settings: normalizeSettings(u.settings),
    createdAt: u.createdAt || null,
  };
}

// Admin-only view of one account: the public fields plus the security-relevant
// state an admin needs to make a decision (recovery email, lockout + failed-
// attempt counters, policy acceptance). Still omits every secret — passwordHash
// and reset-token fields never leave the server.
export function adminUserDetail(u) {
  if (!u) return null;
  return {
    ...publicUser(u),
    recoveryEmail: u.recoveryEmail || null,
    failedAttempts: u.failedAttempts || 0,
    lockedUntil: u.lockedUntil || null,
    termsVersion: u.termsVersion || null,
    termsAcceptedAt: u.termsAcceptedAt || null,
  };
}

// Usernames are stored and matched lowercase so lookups are case-insensitive
// and "Ayan" / "ayan" can't become two accounts.
export async function findByUsername(username) {
  if (!username) return null;
  const snap = await col().where('username', '==', String(username).toLowerCase()).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...doc.data() };
}

// Recovery emails are stored lowercase; used to keep them unique across accounts
// when an admin edits one (so two accounts can't share a recovery address).
export async function findByRecoveryEmail(email) {
  if (!email) return null;
  const snap = await col().where('recoveryEmail', '==', String(email).toLowerCase()).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...doc.data() };
}

// Matches on the canonical (alias-folded) recovery email, so two addresses that
// deliver to the same inbox — `j.doe+x@gmail.com` and `jdoe@gmail.com` — resolve
// to the same account. Used at sign-up to block multi-account creation via email
// aliasing; the raw-email lookup above still catches legacy accounts written
// before this field existed.
export async function findByRecoveryEmailCanonical(email) {
  const canon = canonicalizeEmail(email);
  if (!canon) return null;
  const snap = await col().where('recoveryEmailCanonical', '==', canon).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...doc.data() };
}

export async function findByUid(uid) {
  const doc = await col().doc(uid).get();
  if (!doc.exists) return null;
  return { uid: doc.id, ...doc.data() };
}

export async function createUser({ username, password, name, recoveryEmail, role = ROLE.USER, acceptedTerms = false }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const ref = col().doc();
  const data = {
    username: String(username).toLowerCase(),
    passwordHash,
    name: name || '',
    role,
    recoveryEmail: recoveryEmail ? String(recoveryEmail).toLowerCase() : null,
    // Alias-folded form of the recovery email, for duplicate-account detection.
    // Stored alongside the real address (never replaces it).
    recoveryEmailCanonical: recoveryEmail ? canonicalizeEmail(recoveryEmail) : null,
    settings: { ...DEFAULT_SETTINGS },
    disabled: false,
    failedAttempts: 0,
    lockedUntil: null,
    resetTokenHash: null,
    resetExpires: null,
    resetRequestedAt: null,
    // Bumped whenever the account's password changes (admin edit, self-reset) so
    // any JWT minted before the change is rejected server-side — a stateless token
    // otherwise stays valid until expiry. The signed token carries this value; the
    // auth middleware and the SSE handshake compare it against the live record.
    tokenVersion: 0,
    // Audit the policy acceptance given at sign-up: which version, and when.
    termsVersion: acceptedTerms ? LEGAL.VERSION : null,
    termsAcceptedAt: acceptedTerms ? new Date().toISOString() : null,
    createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  return { uid: ref.id, ...data };
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash || '');
}

export async function listUsers() {
  const snap = await col().get();
  return snap.docs.map((d) => publicUser({ uid: d.id, ...d.data() }));
}

// ---- Brute-force protection -------------------------------------------------

// True while the account is inside an active lockout window.
export function isLocked(user) {
  return !!(user?.lockedUntil && Date.parse(user.lockedUntil) > Date.now());
}

// Seconds until a locked account unlocks (0 if not locked).
export function lockRemainingMs(user) {
  if (!user?.lockedUntil) return 0;
  return Math.max(0, Date.parse(user.lockedUntil) - Date.now());
}

// Count a failed login. Locks the account once the threshold is hit.
export async function recordFailedAttempt(uid) {
  const user = await findByUid(uid);
  if (!user) return;
  const attempts = (user.failedAttempts || 0) + 1;
  const patch = { failedAttempts: attempts };
  if (attempts >= AUTH.MAX_LOGIN_ATTEMPTS) {
    patch.lockedUntil = new Date(Date.now() + AUTH.LOCK_WINDOW_MS).toISOString();
    patch.failedAttempts = 0; // reset the counter; the lock is now what gates login
  }
  await col().doc(uid).update(patch);
}

// Clear the counter/lock after a successful login.
export async function clearLoginThrottle(uid) {
  await col().doc(uid).update({ failedAttempts: 0, lockedUntil: null });
}

// ---- User preferences (sync across devices) --------------------------------

// Merges a validated patch into the user's settings and returns the updated
// user. Only known keys reach here (the route validates), and the stored map is
// normalized so older accounts missing `settings` pick up the defaults.
export async function updateSettings(uid, patch) {
  const user = await findByUid(uid);
  if (!user) return null;
  const settings = { ...normalizeSettings(user.settings), ...patch };
  await col().doc(uid).update({ settings });
  return { ...user, settings };
}

// ---- Account enable / disable (admin) --------------------------------------

export async function setDisabled(uid, disabled) {
  await col().doc(uid).update({ disabled: !!disabled });
}

// ---- Admin edit of an account's identity fields ----------------------------

// Partial update: only the provided fields are written. A new password is hashed
// here (never stored or logged in clear) and clears any active brute-force
// lockout so the user isn't locked out of the credentials just set for them.
// Username / recoveryEmail are lowercased to match how they're stored and looked
// up. Returns the fresh user record. Uniqueness is enforced by the caller before
// this runs.
export async function adminUpdateUser(uid, { name, username, recoveryEmail, password } = {}) {
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (username !== undefined) patch.username = String(username).toLowerCase();
  if (recoveryEmail !== undefined) {
    patch.recoveryEmail = recoveryEmail ? String(recoveryEmail).toLowerCase() : null;
    patch.recoveryEmailCanonical = recoveryEmail ? canonicalizeEmail(recoveryEmail) : null;
  }
  if (password !== undefined) {
    patch.passwordHash = await bcrypt.hash(password, 10);
    patch.failedAttempts = 0;
    patch.lockedUntil = null;
    // Invalidate every JWT issued before this password change.
    patch.tokenVersion = FieldValue.increment(1);
  }
  if (Object.keys(patch).length === 0) return findByUid(uid);
  await col().doc(uid).update(patch);
  return findByUid(uid);
}

// ---- Password reset ---------------------------------------------------------

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Issues a reset token for a user: stores only its hash + expiry, returns the
// raw token (to be delivered out-of-band, never persisted in the clear). Issuing
// a new token invalidates any previous one (single active token per account) and
// stamps the request time for the per-account resend cooldown.
export async function issueResetToken(uid) {
  const raw = crypto.randomBytes(32).toString('hex');
  await col().doc(uid).update({
    resetTokenHash: hashToken(raw),
    resetExpires: new Date(Date.now() + AUTH.RESET_TTL_MS).toISOString(),
    resetRequestedAt: new Date().toISOString(),
  });
  return raw;
}

// True when this account was issued a reset token within the resend-cooldown
// window AND that token is still valid. Lets the forgot-password route skip
// reissuing/resending for rapid repeat requests without changing its response.
export function resetRequestedRecently(user) {
  if (!user?.resetRequestedAt) return false;
  const age = Date.now() - Date.parse(user.resetRequestedAt);
  if (!(age >= 0 && age < AUTH.RESET_REQUEST_COOLDOWN_MS)) return false;
  // Only suppress while the existing token is still usable; an expired token
  // should always be replaceable.
  return !!(user.resetExpires && Date.parse(user.resetExpires) > Date.now());
}

// Resolves a raw reset token to its (still-valid) user, or null.
export async function findByResetToken(rawToken) {
  if (!rawToken) return null;
  const snap = await col().where('resetTokenHash', '==', hashToken(rawToken)).get();
  if (snap.empty) return null;
  const user = { uid: snap.docs[0].id, ...snap.docs[0].data() };
  if (!user.resetExpires || Date.parse(user.resetExpires) < Date.now()) return null; // expired
  return user;
}

// Sets a new password and invalidates the reset token + any lockout.
export async function resetPassword(uid, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await col().doc(uid).update({
    passwordHash,
    resetTokenHash: null,
    resetExpires: null,
    resetRequestedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    // Invalidate every JWT issued before this reset.
    tokenVersion: FieldValue.increment(1),
  });
}
