import QRCode from 'qrcode';

// Canonical production origin every physical QR code must resolve to. Printed
// codes are permanent, so they can NEVER encode a localhost/dev origin — that
// would be unreachable once the tag leaves the machine that made it.
export const PRODUCTION_QR_ORIGIN = 'https://tagback-app.vercel.app';

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i;

// Public origin that physical QR codes point to. PUBLIC_BASE_URL (see
// server/.env.example) overrides it, but ONLY when set to a real remote origin:
// a localhost/dev value (or nothing) falls back to the production domain so that
// no generated QR — admin inventory, printing, downloads, the /url endpoint —
// can ever bake in an unreachable link. The legacy VITE_API_BASE_URL fallback is
// deliberately NOT consulted here (it is a client dev value, often localhost).
export function publicBaseUrl() {
  const configured = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured && !LOCAL_ORIGIN_RE.test(configured)) return configured;
  return PRODUCTION_QR_ORIGIN;
}

let warnedLocalhost = false;

// Origin of the user-facing web app, used to build links sent in email (e.g. the
// password-reset link). Prefers an explicit APP_URL, then PUBLIC_BASE_URL (the
// same frontend origin QR codes point at), then the dev localhost default.
//
// A reset link must NEVER point at localhost in production — the recipient would
// get an unreachable link. When running in production we refuse the localhost
// fallback: if nothing is configured we warn loudly (once) and still return the
// configured value so the failure is visible in logs rather than silently
// shipping a broken link.
export function appBaseUrl() {
  const configured = (process.env.APP_URL || process.env.PUBLIC_BASE_URL || process.env.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const isProd = process.env.NODE_ENV === 'production';
  const looksLocal = !configured || /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(configured);

  if (isProd && looksLocal && !warnedLocalhost) {
    warnedLocalhost = true;
    console.error(
      '[config] APP_URL/PUBLIC_BASE_URL is unset or points at localhost in production. ' +
        'Password-reset links will be unreachable. Set APP_URL to your deployed domain.'
    );
  }
  return configured || 'http://localhost:5173';
}

// Canonical, human-facing public URL (keeps the "QR-" branding prefix). Used for
// display and the /url endpoint. Existing printed codes encode this exact form.
export function publicUrlFor(qrId) {
  return `${publicBaseUrl()}/q/${qrId}`;
}

// The most compact URL that still resolves, used only as the scannable image
// payload. Two tricks shrink the symbol without touching the QR ID:
//
//  1. Drop the cosmetic "QR-" prefix (normalizeQrId re-adds it) — 3 chars fewer.
//  2. UPPERCASE the whole URL. Every character here (A–Z 0–9 : / - .) is in the
//     QR *alphanumeric* charset, so the encoder uses alphanumeric mode (~1.4×
//     denser than byte mode) instead of being forced into byte mode by the
//     lowercase in "https"/the domain. For this domain that drops the symbol a
//     whole version — v3 (29×29) → v2 (25×25) — so each module is ~35% larger at
//     15×15 mm. Case is safe to change: the scheme and host are case-insensitive
//     (RFC 3986 / DNS), the SPA router matches the "/Q/:id" path case-insensitively
//     and then normalizeQrId re-canonicalises the id to "QR-…".
//
// Existing codes that encode the old mixed-case "/q/QR-…" form keep resolving.
export function qrPayloadUrl(qrId) {
  const core = String(qrId).replace(/^QR-/i, '');
  return `${publicBaseUrl()}/q/${core}`.toUpperCase();
}

// Shared encoder options tuned for small physical print:
// - errorCorrectionLevel 'L' (~7%): lowest level ⇒ fewest data modules. A clean
//   printed label has no occlusion to recover from, so higher levels only waste
//   module budget and make each cell smaller.
// - margin 4: the full spec quiet zone (4 modules). Scanners rely on it to locate
//   the finder patterns; too little quiet zone is a leading cause of scan failure
//   at small sizes. Quiet zone is white space, so it adds no black modules.
const QR_OPTIONS = { errorCorrectionLevel: 'L', margin: 4 };

export async function qrPngBuffer(qrId) {
  // High resolution so downloaded raster codes stay sharp; print uses the SVG.
  return QRCode.toBuffer(qrPayloadUrl(qrId), { type: 'png', width: 1024, ...QR_OPTIONS });
}

export async function qrSvgString(qrId) {
  // Vector output: resolution-independent, renders as crisp edges at any print size.
  return QRCode.toString(qrPayloadUrl(qrId), { type: 'svg', ...QR_OPTIONS });
}
