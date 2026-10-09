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

// Simple per-user, per-route request throttles (fixed window). In-memory only —
// good enough for one instance; a shared store would be needed to throttle
// across a horizontally scaled fleet.
export const RATE_LIMIT = {
  PHOTO: { windowMs: 60 * 1000, max: 20 }, // photo writes (upload + url-import) per user/min
  FOUND_REPORT: { windowMs: 60 * 1000, max: 5 }, // finder "I found this" reports per IP/min (unauthenticated)
};

// Owner notifications. Currently one kind: a finder reporting that a LOST item has
// been seen/found. A report is a SIGHTING, never a confirmation the item was
// returned — the UI must say so. De-dupe collapses repeat reports for the same QR
// while the owner still has an unread one (see services/notifications.js).
export const NOTIFICATION = {
  TYPE: { FOUND_REPORT: 'FOUND_REPORT' },
  NOTE_MAX: 300, // optional finder note cap (server-side guard; not surfaced in the UI)
};
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
