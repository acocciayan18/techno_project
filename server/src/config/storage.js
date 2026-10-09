// Image storage adapter. Mirrors config/firebase.js: one uniform interface over
// interchangeable backends, chosen from the environment.
//
//   local (default — dev / memory / emulator, or nothing else configured)
//       Writes to server/uploads and serves via the app's /uploads static route.
//       Fine for a single dev instance; files do NOT survive a container redeploy
//       and are not shared across multiple instances.
//
//   cloudinary (persistent, hosted)
//       Auto-selected when Cloudinary credentials are present (CLOUDINARY_URL, or
//       CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET).
//       Stores the secure_url for display + the public_id (as the key) for deletion.
//       The API secret stays server-side and is never logged or returned to clients.
//
//   gcs (Firebase Cloud Storage)
//       Auto-selected when the DB is in cloud mode and a bucket is resolvable and
//       Cloudinary is NOT configured. Objects are persistent + CDN-served.
//
// Precedence (no STORAGE_MODE set): cloudinary → gcs → local. Force any one with
// STORAGE_MODE=cloudinary|gcs|local. A configured backend that fails its startup
// check degrades to local disk (with a warning) rather than breaking uploads.
//
// Every saved image yields BOTH a public `url` (stored on the item for display)
// and an opaque backend-prefixed `key` (stored for later deletion). Keeping the
// key means cleanup works regardless of backend and never has to re-derive paths
// from a URL — though keyFromLegacyUrl() recovers one for pre-migration items
// that only have a `/uploads/...` photoUrl.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adminApp, mode as dbMode } from './firebase.js';
import { UPLOAD } from '../lib/constants.js';

// Retry a cloud operation on transient failures only (network blips, 5xx). Auth
// errors, quota/limit (4xx) and "not found" are not retried — they won't recover.
async function withRetry(fn, { retries = 2, baseMs = 300, label = 'op' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = e?.http_code ?? e?.error?.http_code;
      const transient = code === undefined || code >= 500 || code === 499;
      if (!transient || attempt === retries) break;
      const wait = baseMs * 2 ** attempt + Math.floor(Math.random() * 100);
      console.warn(`[storage] ${label} failed (attempt ${attempt + 1}), retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// Resolve the target bucket. Explicit env wins; otherwise fall back to the
// classic <project-id>.appspot.com default. If neither resolves we stay on disk.
function resolveBucketName() {
  if (process.env.FIREBASE_STORAGE_BUCKET) return process.env.FIREBASE_STORAGE_BUCKET;
  const projectId = adminApp?.app()?.options?.projectId;
  return projectId ? `${projectId}.appspot.com` : null;
}

const explicitMode = process.env.STORAGE_MODE; // 'cloudinary' | 'gcs' | 'local' | undefined
const bucketName = resolveBucketName();

const hasCloudinary =
  !!process.env.CLOUDINARY_URL ||
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
const useCloudinary = explicitMode === 'cloudinary' || (!explicitMode && hasCloudinary);
const useGcs =
  explicitMode === 'gcs' ||
  (!explicitMode && !hasCloudinary && !!adminApp && dbMode === 'cloud' && !!bucketName);

let bucket = null;
let cloudinary = null;
export let storageMode = 'local';

// Configure + verify Cloudinary. Reads CLOUDINARY_URL if present (which already
// carries cloud name, key and secret), else the three discrete vars. api.ping()
// confirms the credentials work before we commit to this backend. The secret is
// never logged — only the (non-sensitive) cloud name is printed below.
async function setupCloudinary() {
  try {
    const { v2 } = await import('cloudinary');
    if (process.env.CLOUDINARY_URL) {
      v2.config({ secure: true }); // picks up CLOUDINARY_URL from the environment
    } else {
      v2.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
    await v2.api.ping();
    cloudinary = v2;
    return true;
  } catch (e) {
    const why = e?.message || e?.error?.message || 'authentication failed';
    console.warn(`[storage] Cloudinary configured but unusable (${why}) — falling back to local disk.`);
    return false;
  }
}

async function setupGcs() {
  if (!adminApp || !bucketName) {
    console.warn('[storage] gcs requested but no firebase-admin app / bucket available — falling back to local disk.');
    return false;
  }
  const candidate = adminApp.storage().bucket(bucketName);
  // Verify the bucket exists so a project without Storage provisioned degrades
  // gracefully to disk instead of 500-ing on every upload.
  try {
    const [exists] = await candidate.exists();
    if (exists) {
      bucket = candidate;
      return true;
    }
    console.warn(
      `[storage] bucket "${bucketName}" does not exist — falling back to local disk. ` +
        'Enable Firebase Storage (or set FIREBASE_STORAGE_BUCKET) to use gcs.'
    );
    return false;
  } catch (e) {
    console.warn(`[storage] could not reach bucket "${bucketName}" (${e.message}) — falling back to local disk.`);
    return false;
  }
}

if (explicitMode === 'local') {
  // stay on disk
} else if (useCloudinary) {
  if (await setupCloudinary()) storageMode = 'cloudinary';
} else if (useGcs) {
  if (await setupGcs()) storageMode = 'gcs';
}

const detail =
  storageMode === 'gcs' ? ` (bucket: ${bucket.name})`
  : storageMode === 'cloudinary' ? ` (cloud: ${cloudinary.config().cloud_name})`
  : '';
console.log(`[storage] mode: ${storageMode}${detail}`);

function uniqueStem() {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

// Persist an image buffer. Returns { url, key }.
//   buffer      raw bytes (multer memoryStorage gives req.file.buffer)
//   qrId        used to namespace the object path (gcs) for easy browsing
//   ext         canonical extension derived from the validated mimetype
//   contentType the validated mimetype, stored so the browser renders inline
export async function saveImage(buffer, { qrId = 'item', ext = 'img', contentType = 'application/octet-stream' } = {}) {
  const stem = uniqueStem();

  if (storageMode === 'cloudinary') {
    // Stream the buffer to Cloudinary (no temp file), namespaced per QR. The
    // incoming transformation shrinks the STORED master: downscale to fit
    // MAX_DIMENSION (crop:limit never upsizes and keeps aspect + transparency)
    // and re-encode at q_auto. Cloudinary strips EXIF/GPS metadata on transform
    // and auto-orients from the EXIF flag, so stored images carry no location
    // data and display upright. An eager square thumbnail is generated once here
    // (not per request) to avoid redundant processing.
    const result = await withRetry(
      () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: `tagback/items/${qrId}`,
              public_id: stem,
              resource_type: 'image',
              overwrite: false,
              transformation: [
                { width: UPLOAD.MAX_DIMENSION, height: UPLOAD.MAX_DIMENSION, crop: 'limit' },
                { quality: 'auto', fetch_format: 'auto' },
              ],
              eager: [
                { width: UPLOAD.THUMB_DIMENSION, height: UPLOAD.THUMB_DIMENSION, crop: 'fill', gravity: 'auto', quality: 'auto', fetch_format: 'auto' },
              ],
            },
            (err, res) => (err ? reject(err) : resolve(res)),
          );
          stream.end(buffer);
        }),
      { label: 'cloudinary upload' },
    );
    return {
      url: result.secure_url,
      key: `cloudinary:${result.public_id}`,
      thumbUrl: result.eager?.[0]?.secure_url || result.secure_url,
      width: result.width ?? null,
      height: result.height ?? null,
      bytes: result.bytes ?? null,
    };
  }

  if (storageMode === 'gcs') {
    const objectPath = `items/${qrId}/${stem}.${ext}`;
    // A Firebase download token yields a persistent, CDN-served URL that works
    // under uniform bucket-level access (no object ACL / makePublic needed).
    const token = crypto.randomUUID();
    await bucket.file(objectPath).save(buffer, {
      resumable: false,
      contentType,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
    // GCS has no server-side transform here; thumbnail = full image.
    return { url, key: `gcs:${objectPath}`, thumbUrl: url, width: null, height: null, bytes: buffer.length };
  }

  // local disk — no optimization/thumbnail; thumbnail = full image.
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${stem}.${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return { url: `/uploads/${filename}`, key: `local:${filename}`, thumbUrl: `/uploads/${filename}`, width: null, height: null, bytes: buffer.length };
}

// Best-effort delete of a previously saved image by its key. Never throws for a
// missing object; callers additionally guard with .catch() so cleanup failures
// can't break the main request. A gcs key is unreachable when the process is in
// local mode (and vice-versa) — we skip rather than error.
export async function deleteImage(key) {
  if (!key || typeof key !== 'string') return;

  if (key.startsWith('cloudinary:')) {
    if (storageMode !== 'cloudinary' || !cloudinary) return;
    await withRetry(
      () => cloudinary.uploader.destroy(key.slice('cloudinary:'.length), { resource_type: 'image', invalidate: true }),
      { label: 'cloudinary destroy' },
    );
    return;
  }

  if (key.startsWith('gcs:')) {
    if (storageMode !== 'gcs' || !bucket) return;
    await bucket.file(key.slice(4)).delete({ ignoreNotFound: true });
    return;
  }

  // local — basename() neutralizes any path-traversal in a stored key.
  const raw = key.startsWith('local:') ? key.slice(6) : key;
  const filename = path.basename(raw);
  if (!filename) return;
  await fs.promises.rm(path.join(UPLOAD_DIR, filename), { force: true });
}

// Recover a deletion key for items saved before photoKey existed (they carry
// only photoUrl). Handles both the old local /uploads/<name> form and a Firebase
// Storage download URL.
export function keyFromLegacyUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/uploads/')) return `local:${url.slice('/uploads/'.length)}`;
  const m = url.match(/\/o\/([^?]+)/); // .../o/<url-encoded-object-path>?alt=media...
  if (m) return `gcs:${decodeURIComponent(m[1])}`;
  return null;
}
