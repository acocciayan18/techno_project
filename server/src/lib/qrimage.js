import QRCode from 'qrcode';

// Public origin that physical QR codes (and other outbound links) point to.
// Canonical server env var is PUBLIC_BASE_URL (see server/.env.example); set it to
// the deployed domain in production. VITE_API_BASE_URL is a client-only Vite var
// and is kept here only as a legacy fallback. Localhost is the last-resort dev
// default — without PUBLIC_BASE_URL set, deployed QR codes would point at it.
export function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
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

// The SHORTEST URL that still resolves, used only as the scannable image payload.
// The "QR-" prefix is cosmetic — the server's normalizeQrId re-adds it — so
// dropping it trims 3 bytes from the encoded data. Fewer bytes can shrink the
// symbol by a whole QR version, yielding fewer, larger modules that stay crisp
// and scannable at tiny print sizes (e.g. 15×15 mm). QR IDs are unchanged, and
// older codes that still encode the full "/q/QR-…" form keep working.
export function qrPayloadUrl(qrId) {
  const core = String(qrId).replace(/^QR-/i, '');
  return `${publicBaseUrl()}/q/${core}`;
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
