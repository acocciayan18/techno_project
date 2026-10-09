// Hashing + verification for QR activation codes.
//
// The activation code is the proof-of-possession secret printed WITH the product
// (e.g. under a scratch-off panel), never encoded in the scannable QR. We store
// only an HMAC-SHA256 of the normalised code, keyed by the QR id and a server
// pepper, so:
//   - a database leak never exposes a usable code (hashes aren't reversible),
//   - the same code under two different QR ids hashes differently (qrId in the MAC),
//   - without the server pepper an attacker can't pre-compute hashes offline.
//
// The codes are high-entropy random (see ids.js), so a single fast MAC is the
// right primitive here — a slow password KDF (bcrypt/scrypt) buys nothing against
// a ~10^20 search space and would only slow legitimate activation.
import crypto from 'node:crypto';

// Defaults keep memory/dev mode working with zero config; production should set a
// dedicated ACTIVATION_SECRET_PEPPER. Falls back to JWT_SECRET so a configured
// deployment is never left on the literal dev string by accident.
function pepper() {
  return (
    process.env.ACTIVATION_SECRET_PEPPER ||
    process.env.JWT_SECRET ||
    'dev-activation-pepper-change-me'
  );
}

// Hash a NORMALISED activation code (dash-free, uppercase) for a given QR id.
export function hashActivationSecret(qrId, normalizedCode) {
  return crypto
    .createHmac('sha256', pepper())
    .update(`${qrId}:${normalizedCode}`)
    .digest('hex');
}

// Constant-time comparison of a submitted code against a stored hash.
export function verifyActivationSecret(qrId, normalizedCode, storedHash) {
  if (!storedHash || !normalizedCode) return false;
  const candidate = hashActivationSecret(qrId, normalizedCode);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  // timingSafeEqual throws on length mismatch; equal-length hex here, but guard anyway.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
