// Server-side image-signature (magic-byte) validation. The client-sent mimetype
// and filename are never trusted; the bytes themselves decide the type. Shared by
// device uploads and URL imports so both gates are identical.
import { UPLOAD } from './constants.js';

// Minimal signature sniffing for the four formats we accept. Returns a canonical
// mimetype string or null. Kept dependency-free and deliberately strict.
export function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // GIF: "GIF87a" / "GIF89a"
  if (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') {
    return 'image/gif';
  }
  // WebP: "RIFF"...."WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

// Validate a buffer is a real, allowed, non-empty, within-size image. Throws an
// Error with .status=400 (so the error handler returns a clean 400) otherwise.
// Returns { contentType, ext } derived from the ACTUAL bytes.
export function assertAllowedImage(buf) {
  const bad = (msg) => {
    throw Object.assign(new Error(msg), { status: 400 });
  };
  if (!Buffer.isBuffer(buf) || buf.length === 0) bad('Empty or unreadable image');
  if (buf.length > UPLOAD.MAX_BYTES) {
    bad(`Image must be ${Math.round(UPLOAD.MAX_BYTES / (1024 * 1024))}MB or smaller`);
  }
  const contentType = sniffImageType(buf);
  if (!contentType) bad('File is not a valid PNG, JPG, WebP or GIF image');
  return { contentType, ext: UPLOAD.MIME_EXT[contentType] };
}
