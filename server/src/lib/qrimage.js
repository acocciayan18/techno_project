import QRCode from 'qrcode';

// Public origin that physical QR codes (and other outbound links) point to.
// Canonical server env var is PUBLIC_BASE_URL (see server/.env.example); set it to
// the deployed domain in production. VITE_API_BASE_URL is a client-only Vite var
// and is kept here only as a legacy fallback. Localhost is the last-resort dev
// default — without PUBLIC_BASE_URL set, deployed QR codes would point at it.
export function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.VITE_API_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
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
