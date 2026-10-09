// QR ownership lifecycle. PENDING means a user has requested activation and is
// awaiting admin review; AVAILABLE/ACTIVATED/DISABLED are the resting states.
export const QR_STATUS = {
  AVAILABLE: 'AVAILABLE',
  PENDING: 'PENDING',
  ACTIVATED: 'ACTIVATED',
  DISABLED: 'DISABLED',
};

// Outcome of a claim review, recorded on the QR's `claim` sub-record so the
// history (who asked, how it was decided) survives on the document.
export const CLAIM_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };

// How ownership was obtained — for audit. SECRET = proof-of-possession claim,
// APPROVAL = admin approved a pending request, ADMIN = admin direct assignment.
export const CLAIM_METHOD = { SECRET: 'SECRET', APPROVAL: 'APPROVAL', ADMIN: 'ADMIN' };

// Activation-code brute-force guard (mirrors the login lockout in AUTH): after
// MAX_ATTEMPTS bad codes for one QR, further attempts are refused for LOCK_WINDOW_MS.
export const ACTIVATION = {
  MAX_ATTEMPTS: 5,
  LOCK_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  SECRET_LENGTH: 14, // chars of the activation code (excluding grouping dashes)
};
export const ITEM_STATUS = { ACTIVE: 'ACTIVE', LOST: 'LOST', RECOVERED: 'RECOVERED' };

// Item-photo upload limits. The allowlist is the single source of truth for both
// the multer file filter (which mimetypes are accepted) and the storage layer
// (which canonical file extension / contentType to persist). Never trust the
// client-supplied filename extension — derive it from the validated mimetype.
export const UPLOAD = {
  MAX_BYTES: 5 * 1024 * 1024, // 5 MB — applies to device uploads AND URL imports
  MIME_EXT: {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  },
  // Largest edge (px) kept when optimizing; bigger images are downscaled with
  // aspect ratio + transparency preserved. Delivered format/quality are chosen
  // automatically by Cloudinary (f_auto / q_auto). Thumbnails are square fills.
  MAX_DIMENSION: 1600,
  THUMB_DIMENSION: 400,
  // URL-import download guardrails.
  IMPORT_TIMEOUT_MS: 8000,
  IMPORT_MAX_REDIRECTS: 3,
};

// Simple per-user / per-IP, per-route request throttles (fixed window). In-memory
// only — good enough for one instance; a shared store (Redis/Firestore) would be
// needed to throttle across a horizontally scaled fleet (see middleware/rateLimit.js).
//
// Two families of key:
//   keyBy:'user'  — authenticated routes, throttled per account (can't be dodged
//                   by refreshing, new tabs, or hitting the API directly: the key
//                   is the uid in the signed JWT, not the connection).
//   keyBy:'ip'    — unauthenticated routes, throttled per client IP (requires a
//                   correct `trust proxy` setting in prod so req.ip is the real
//                   client, not the load balancer — see createApp()).
//
// These are deliberately generous: a backstop against scripted abuse / runaway
// loops, sized so no realistic human workflow is ever throttled. The hard
// security guarantees (login lockout, per-QR activation lockout, ownership
// checks) live elsewhere and do NOT depend on these limits.
export const RATE_LIMIT = {
  PHOTO: { windowMs: 60 * 1000, max: 20 }, // photo writes (upload + url-import) per user/min
  FOUND_REPORT: { windowMs: 60 * 1000, max: 5 }, // finder "I found this" reports per IP/min (unauthenticated)

  // Unauthenticated PUBLIC reads — per IP. Covers the finder page resolve
  // (GET /q/:id) and the QR image/url endpoints. Blunts scraping, id-enumeration
  // sweeps across the 36^8 id space, and QR-image CPU abuse. A real finder loading
  // one page makes only a few of these, so 240/min never troubles a human.
  PUBLIC_READ: { windowMs: 60 * 1000, max: 240 },
  // SSE (re)connection attempts per IP. EventSource reconnects every ~5s, so even
  // several tabs stay well under this; it caps a reconnect-storm / handshake flood
  // (each handshake costs a live-user DB lookup).
  STREAM: { windowMs: 60 * 1000, max: 120 },
  // Authenticated self endpoints (GET /me, PUT /me/settings) — per user. A backstop
  // on the one authed surface not under the owner/admin routers' global cap.
  ME: { windowMs: 60 * 1000, max: 120 },

  // Unauthenticated auth endpoints — per IP.
  LOGIN: { windowMs: 15 * 60 * 1000, max: 100 }, // login attempts/IP (account lockout is the real brute-force guard)
  REGISTER: { windowMs: 60 * 60 * 1000, max: 30 }, // new accounts/IP/hour — blunts mass sign-up
  FORGOT: { windowMs: 15 * 60 * 1000, max: 30 }, // reset-email requests/IP — blunts email bombing + SMTP abuse
  RESET: { windowMs: 15 * 60 * 1000, max: 30 }, // reset-token submissions/IP

  // Authenticated owner actions — per user.
  ACTIVATE: { windowMs: 15 * 60 * 1000, max: 40 }, // activation attempts/user (per-QR lockout is the brute-force guard)
  CLAIM: { windowMs: 60 * 60 * 1000, max: 30 }, // claim requests/user/hour — stops flooding the admin queue
  // Global per-user backstop on every authenticated router. High enough that a
  // real UI (even rapid clicking) never trips it; low enough to stop a runaway
  // client loop or a scripted hammer.
  API: { windowMs: 60 * 1000, max: 480 },
};

// Owner notifications. Currently one kind: a finder reporting that a LOST item has
// been seen/found. A report is a SIGHTING, never a confirmation the item was
// returned — the UI must say so. De-dupe collapses repeat reports for the same QR
// while the owner still has an unread one (see services/notifications.js).
export const NOTIFICATION = {
  TYPE: { FOUND_REPORT: 'FOUND_REPORT' },
  NOTE_MAX: 300, // optional finder note cap (server-side guard; not surfaced in the UI)
};
// Max concurrent SSE connections held open for one account. Normal use is a few
// tabs/devices; the cap stops a client (or a script holding a valid token) from
// opening unbounded sockets and exhausting file descriptors / memory. When the cap
// is hit the OLDEST connection is dropped so the newest tab always works.
export const SSE = { MAX_CONN_PER_USER: 12 };

export const ROLE = { USER: 'user', ADMIN: 'admin' };
export const TEMPLATES = ['minimal', 'colorful', 'personal'];

// Max lengths for every user-editable text field. Single source of truth for the
// route zod schemas; the client mirrors these in client/src/lib/limits.js so the
// in-browser maxLength/counter matches what the server will accept. Keep the two
// in sync — the server re-validates regardless, so these are the hard ceiling.
export const TEXT_LIMITS = {
  NAME: 80, // account full name (register)
  USERNAME: 20, // handle (also bounded by AUTH.USERNAME_RE)
  ITEM_NAME: 120,
  ITEM_DESCRIPTION: 1000,
  ITEM_CATEGORY: 60,
  RECOVERY_INSTRUCTIONS: 500, // owner's "how/where to return it" note (public when LOST)
  PAGE_TITLE: 80,
  FINDER_MESSAGE: 400,
  CONTACT_BUTTON_TEXT: 40,
  CONTACT_TYPE: 30,
  CONTACT_VALUE: 300,
  CLAIM_NOTE: 500,
  LOGO_URL: 500,
  PHOTO_URL: 2048,
};

// Auth tuning. Brute-force: after MAX_LOGIN_ATTEMPTS consecutive failures an
// account is locked for LOCK_WINDOW_MS. Password-reset tokens live RESET_TTL_MS.
export const AUTH = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCK_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RESET_TTL_MS: 60 * 60 * 1000, // 1 hour
  USERNAME_RE: /^[a-z0-9_]{3,20}$/, // lowercase letters, digits, underscore
};

// Current version of the Terms of Service / Privacy Policy. Recorded against a
// user when they accept at sign-up (see users.createUser). Keep in sync with the
// client's LEGAL_VERSION (client/src/lib/legal.js).
export const LEGAL = { VERSION: '1.0' };

export const COL = {
  USERS: 'users',
  QRCODES: 'qrcodes',
  ITEMS: 'items',
  CUSTOMIZATIONS: 'customizations',
  CONTACTS: 'contactSettings',
  COUNTERS: 'counters',
  NOTIFICATIONS: 'notifications',
};
