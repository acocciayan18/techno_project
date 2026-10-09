// QR identifiers are the permanent, printable public id (e.g. "QR-A7K2P9XQ").
// They are NOT personal data and are what the physical QR encodes.
// Canonical form: the "QR-" prefix + 8 random alphanumeric chars, uppercase
// A-Z + 0-9 (36^8 ≈ 2.8e12 space). The prefix is cosmetic/branding only — all
// randomness lives in the 8-char core.
import { randomInt } from 'node:crypto';
import { ACTIVATION } from './constants.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const QR_PREFIX = 'QR-';
export const QR_ID_LENGTH = 8;
// Matches the 8-char core only; normalizeQrId strips any prefix before testing.
const QR_CORE_RE = new RegExp(`^[A-Z0-9]{${QR_ID_LENGTH}}$`);

// Activation-code alphabet: Crockford-style, no 0/O/1/I/L/U so a human reading a
// printed code off a label can't confuse characters. The code is the SECRET that
// proves physical possession — it is NOT encoded in the scannable QR image.
const SECRET_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_RE = new RegExp(`^[${SECRET_ALPHABET}]{${ACTIVATION.SECRET_LENGTH}}$`);

// Securely generate a single random QR id. Unbiased (randomInt), not sequential/guessable.
export function generateQrId() {
  let core = '';
  for (let i = 0; i < QR_ID_LENGTH; i++) {
    core += ALPHABET[randomInt(ALPHABET.length)];
  }
  return QR_PREFIX + core; // e.g. "QR-A7K2P9XQ"
}

// Accepts the id with or without the "QR-" prefix and in any case
// ("qr-a7k2p9xq", " A7K2P9XQ ", "QR-A7K2P9XQ") and normalises to the canonical
// "QR-A7K2P9XQ". Returns null if the core isn't a valid 8-char alphanumeric id.
export function normalizeQrId(raw) {
  if (!raw) return null;
  let id = String(raw).trim().toUpperCase();
  if (id.startsWith(QR_PREFIX)) id = id.slice(QR_PREFIX.length);
  return QR_CORE_RE.test(id) ? QR_PREFIX + id : null;
}

// Securely generate one activation code (the proof-of-possession secret).
// Grouped as "XXXX-XXXX-XXXX…" for legibility when printed.
export function generateActivationSecret() {
  let raw = '';
  for (let i = 0; i < ACTIVATION.SECRET_LENGTH; i++) {
    raw += SECRET_ALPHABET[randomInt(SECRET_ALPHABET.length)];
  }
  return raw.replace(/(.{4})(?=.)/g, '$1-'); // e.g. "A2CD-EF34-GH5J-KM"
}

// Normalise a submitted activation code: strip the grouping dashes/spaces and
// uppercase. Returns the canonical dash-free code, or null if it isn't valid.
// The alphabet deliberately omits look-alikes (0/O/1/I/L/U) so there is nothing
// to "fold" — an out-of-alphabet character is a genuine typo and fails here.
export function normalizeActivationSecret(raw) {
  if (!raw) return null;
  const code = String(raw).toUpperCase().replace(/[\s-]/g, '');
  return SECRET_RE.test(code) ? code : null;
}
