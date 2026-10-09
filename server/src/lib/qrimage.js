import QRCode from 'qrcode';

export function publicUrlFor(qrId) {
  const base = (process.env.VITE_API_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/q/${qrId}`;
}

// The QR image encodes ONLY the permanent public URL — never owner/item/contact data.
export async function qrPngBuffer(qrId) {
  return QRCode.toBuffer(publicUrlFor(qrId), { type: 'png', width: 512, margin: 2 });
}

export async function qrSvgString(qrId) {
  return QRCode.toString(publicUrlFor(qrId), { type: 'svg', margin: 2 });
}
