// Suspicious-signup detection + temporary restriction.
//
// This is the abuse layer that the per-IP REGISTER rate limit cannot be: the rate
// limit caps how MANY signups come from an IP (and so would punish a legitimate
// burst — a classroom, an office, a shared NAT), while this layer watches for the
// abuse SIGNATURE and keys on *bad* attempts only. A page full of honest signups
// records zero strikes here, so real users are never caught by it.
//
// A strike is recorded against EVERY signal of a blocked attempt — the client IP
// AND the canonical recovery email — so an attacker who rotates IPs but reuses one
// inbox, or sits on one IP cycling through many fake identities, trips the same
// cooldown. That is the point of not leaning on IP alone.
//
// Process-local (a Map, like middleware/rateLimit.js): authoritative for the
// single long-lived instance this backend runs as; a horizontally scaled fleet
// would move these counters to a shared store (Redis/Firestore). Documented in
// SECURITY.md alongside the matching note for the rate limiter and SSE registry.
import { ABUSE } from '../lib/constants.js';

const strikes = new Map(); // signal -> { count, windowEnds, blockedUntil }

function entryFor(signal, now) {
  let e = strikes.get(signal);
  if (!e || now >= e.windowEnds) {
    e = { count: 0, windowEnds: now + ABUSE.SIGNUP_STRIKE_WINDOW_MS, blockedUntil: 0 };
    strikes.set(signal, e);
  }
  return e;
}

// The signals that identify one signup attempt. Falsy inputs are omitted so a
// signup without a recovery email is tracked by IP alone.
export function signupSignals({ ip, emailCanonical } = {}) {
  const out = [];
  if (ip) out.push(`ip:${ip}`);
  if (emailCanonical) out.push(`email:${emailCanonical}`);
  return out;
}

// If any of the attempt's signals is inside an active cooldown, returns the ms
// remaining (the longest, so the message doesn't under-promise); 0 otherwise.
export function signupBlockedMs(signals, now = Date.now()) {
  let max = 0;
  for (const s of signals) {
    const e = strikes.get(s);
    if (e && e.blockedUntil > now) max = Math.max(max, e.blockedUntil - now);
  }
  return max;
}

// Record one strike against each signal of a blocked attempt; engage the cooldown
// on a signal once it reaches the threshold within the window. Returns true if a
// cooldown is now active for any signal.
export function recordSignupStrike(signals, now = Date.now()) {
  let blocked = false;
  for (const s of signals) {
    const e = entryFor(s, now);
    e.count += 1;
    if (e.count >= ABUSE.SIGNUP_MAX_STRIKES) {
      e.blockedUntil = now + ABUSE.SIGNUP_COOLDOWN_MS;
      blocked = true;
    }
  }
  return blocked;
}

// Pure bot heuristics on the submitted body — no external service needed. Returns
// a short reason if the submission looks automated, else null. Both checks are
// fail-OPEN when their field is absent, so a legitimate API client or an older
// build that doesn't send them is never blocked by this alone:
//   - honeypot: a field no human sees; any value means a form-filler populated it.
//   - timing:  a submit faster than a human could realistically fill the form.
export function botSignupReason({ honeypot, elapsedMs } = {}) {
  if (typeof honeypot === 'string' && honeypot.trim() !== '') return 'honeypot';
  if (
    typeof elapsedMs === 'number' &&
    Number.isFinite(elapsedMs) &&
    elapsedMs >= 0 &&
    elapsedMs < ABUSE.MIN_FORM_FILL_MS
  ) {
    return 'timing';
  }
  return null;
}

// Test/maintenance hook: drop all tracked strikes.
export function _resetSignupGuard() {
  strikes.clear();
}

// Opportunistic prune so the Map can't grow unbounded on a long-lived process.
const CLEANUP_MS = 15 * 60 * 1000;
const timer = setInterval(() => {
  const now = Date.now();
  for (const [k, e] of strikes) {
    if (now >= e.windowEnds && now >= e.blockedUntil) strikes.delete(k);
  }
}, CLEANUP_MS);
timer.unref?.();
