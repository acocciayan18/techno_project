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

export function publicUrlFor(qrId) {
  return `${publicBaseUrl()}/q/${qrId}`;
}


export async function qrPngBuffer(qrId) {
  return QRCode.toBuffer(publicUrlFor(qrId), { type: 'png', width: 512, margin: 2 });
}

export async function qrSvgString(qrId) {
  return QRCode.toString(publicUrlFor(qrId), { type: 'svg', margin: 2 });
}
