import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { normalizeQrId, normalizeActivationSecret } from '../lib/ids.js';
import { ITEM_STATUS, TEMPLATES, UPLOAD, RATE_LIMIT, TEXT_LIMITS } from '../lib/constants.js';
import { assertAllowedImage } from '../lib/imageValidation.js';
import { downloadImage } from '../lib/fetchRemoteImage.js';
import { saveImage, deleteImage, keyFromLegacyUrl, storageMode } from '../config/storage.js';
import * as qrService from '../services/qrcodes.js';
import * as itemService from '../services/items.js';
import * as customService from '../services/customizations.js';
import * as contactService from '../services/contacts.js';
import * as notificationService from '../services/notifications.js';
import { publishToUser, publishToAdmins } from '../lib/events.js';

const router = Router();
router.use(requireAuth);
// Global per-user backstop across every owner action (edits, status flips, reads).
// Covers "rapid clicking" / repeated editing and runaway client loops without
// touching the dedicated, tighter limits below. Mounted after requireAuth so the
// key is the account, not the connection — new tabs / direct API calls all share it.
router.use(rateLimit({ ...RATE_LIMIT.API, bucket: 'owner-api', keyBy: 'user' }));

// Activation + claim-request limiters (per user). The authoritative brute-force
// guard for codes is the per-QR lockout in qrcodes.activate(); this per-user cap
// stops someone iterating activation codes across MANY different QR ids (which the
// per-QR counter wouldn't catch) and stops claim-request flooding of the admin queue.
const activateLimiter = rateLimit({ ...RATE_LIMIT.ACTIVATE, bucket: 'activate', keyBy: 'user' });
const claimLimiter = rateLimit({ ...RATE_LIMIT.CLAIM, bucket: 'claim', keyBy: 'user' });

// Buffer uploads in memory and hand the bytes to the storage adapter, which
// decides where they live (disk in dev, Cloud Storage in prod). The mimetype
// allowlist (UPLOAD.MIME_EXT) is the single gate on file type; the client-sent
// filename is never trusted for the stored extension.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD.MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (UPLOAD.MIME_EXT[file.mimetype]) cb(null, true);
    else cb(Object.assign(new Error('Unsupported image type. Use PNG, JPG, WebP or GIF.'), { status: 400 }));
  },
});

// Run the single-file upload and translate multer's own errors (too large /
// wrong type) into a clean 400 instead of a generic 500 from the error handler.
function uploadPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Image must be ${Math.round(UPLOAD.MAX_BYTES / (1024 * 1024))}MB or smaller`
        : err.message || 'Upload failed';
    res.status(err.status || 400).json({ error: msg });
  });
}

// Loads a QR and asserts the authenticated user owns it. Sends the error response and
// returns null if the check fails, so handlers can `if (!qr) return;`.
async function loadOwnedQr(req, res) {
  const qrId = normalizeQrId(req.params.qrId);
  if (!qrId) {
    res.status(400).json({ error: 'Invalid QR identifier' });
    return null;
  }
  const qr = await qrService.getQr(qrId);
  if (!qr) {
    res.status(404).json({ error: 'QR not found' });
    return null;
  }
  if (qr.ownerUid !== req.user.uid) {
    res.status(403).json({ error: 'You do not own this QR code' });
    return null;
  }
  return qr;
}

/* ---------------- Activation ----------------
 * Ownership is proven by the activation CODE printed with the product, not by the
 * (public) QR id. Note the failure statuses: invalid-code / locked use 422 and
 * state conflicts use 409 — never 401/403, which the client treats as a dead
 * session and would wrongly log the user out mid-activation.
 */
const activateSchema = z.object({
  qrId: z.string().min(1),
  secret: z.string().min(1, 'Enter the activation code printed with your product'),
});
router.post('/qr/activate', activateLimiter, validate(activateSchema), async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.body.qrId);
    if (!qrId) return res.status(400).json({ error: 'Invalid QR identifier' });
    const secret = normalizeActivationSecret(req.body.secret);
    if (!secret) {
      return res.status(422).json({ error: 'That activation code is not valid', reason: 'BAD_SECRET' });
    }
    const result = await qrService.activate(qrId, req.user.uid, secret);
    if (result.ok) {
      // New ownership: refresh this user's other devices + every admin's inventory/stats.
      publishToUser(req.user.uid, ['owner/qrcodes', 'owner/claims']);
      publishToAdmins(['admin/qrcodes', 'admin/stats']);
    }
    if (!result.ok) {
      const map = {
        NOT_FOUND: [404, 'QR code does not exist'],
        DISABLED: [409, 'This QR code has been disabled'],
        ALREADY_ACTIVATED: [409, 'This QR code is already activated by another user'],
        ALREADY_YOURS: [409, 'You have already activated this QR code'],
        PENDING_YOURS: [409, 'Your activation request for this QR is awaiting admin review'],
        PENDING_OTHER: [409, 'This QR code has a pending activation request'],
        BAD_SECRET: [422, 'The QR id and activation code do not match'],
        LOCKED: [422, 'Too many incorrect codes. Try again later or request admin activation.'],
      };
      const [status, msg] = map[result.reason] || [409, 'Could not activate QR'];
      return res.status(status).json({ error: msg, reason: result.reason });
    }
    res.status(201).json({ qrId, status: 'ACTIVATED' });
  } catch (e) {
    next(e);
  }
});

// Fallback for a user without a usable activation code: file a request for an
// admin to review. The QR goes PENDING; it does not grant ownership by itself.
const claimSchema = z.object({
  qrId: z.string().min(1),
  note: z.string().trim().max(TEXT_LIMITS.CLAIM_NOTE).optional().default(''),
});
router.post('/qr/claim-request', claimLimiter, validate(claimSchema), async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.body.qrId);
    if (!qrId) return res.status(400).json({ error: 'Invalid QR identifier' });
    const result = await qrService.requestClaim(qrId, req.user.uid, req.body.note);
    if (result.ok) {
      // A new request appears in the admin review queue in real time.
      publishToUser(req.user.uid, ['owner/claims']);
      publishToAdmins(['admin/claims', 'admin/qrcodes', 'admin/stats']);
    }
    if (!result.ok) {
      const map = {
        NOT_FOUND: [404, 'QR code does not exist'],
        DISABLED: [409, 'This QR code has been disabled'],
        ALREADY_ACTIVATED: [409, 'This QR code is already activated by another user'],
        ALREADY_YOURS: [409, 'You have already activated this QR code'],
        PENDING_YOURS: [409, 'You already have a pending request for this QR'],
        PENDING_OTHER: [409, 'This QR code already has a pending activation request'],
      };
      const [status, msg] = map[result.reason] || [409, 'Could not submit request'];
      return res.status(status).json({ error: msg, reason: result.reason });
    }
    res.status(201).json({ qrId, status: 'PENDING' });
  } catch (e) {
    next(e);
  }
});

// The user's own pending activation requests (not yet owned).
router.get('/claims', async (req, res, next) => {
  try {
    const pending = await qrService.listPendingByClaimant(req.user.uid);
    res.json({
      claims: pending.map((qr) => ({
        qrId: qr.qrId,
        status: qr.status,
        requestedAt: qr.claim?.requestedAt || null,
        note: qr.claim?.note || '',
      })),
    });
  } catch (e) {
    next(e);
  }
});

// The user's full activation-request history (pending / approved / rejected),
// for the dedicated "Requests" page. Newest request first.
router.get('/requests', async (req, res, next) => {
  try {
    const rows = await qrService.listRequestsByClaimant(req.user.uid);
    const requests = rows
      .map((qr) => ({
        qrId: qr.qrId,
        requestStatus: qr.claim?.status || null, // PENDING | APPROVED | REJECTED
        qrStatus: qr.status,
        owned: qr.ownerUid === req.user.uid, // true once an approval transferred it
        note: qr.claim?.note || '',
        requestedAt: qr.claim?.requestedAt || null,
        decidedAt: qr.claim?.decidedAt || null,
      }))
      .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
    res.json({ requests });
  } catch (e) {
    next(e);
  }
});

// Withdraw a still-pending request the user filed. Returns the QR to AVAILABLE
// so it drops out of the admin queue and can be activated/requested again later.
router.post('/qr/:qrId/cancel-request', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    if (!qrId) return res.status(400).json({ error: 'Invalid QR identifier' });
    const result = await qrService.cancelRequest(qrId, req.user.uid);
    if (!result.ok) {
      const map = {
        NOT_FOUND: [404, 'QR code does not exist'],
        NOT_PENDING: [409, 'This request is no longer pending'],
        NOT_YOURS: [403, 'This request is not yours'],
      };
      const [status, msg] = map[result.reason] || [409, 'Could not cancel request'];
      return res.status(status).json({ error: msg, reason: result.reason });
    }
    // Drop it from this user's surfaces and the admin review queue in real time.
    publishToUser(req.user.uid, ['owner/qrcodes', 'owner/claims']);
    publishToAdmins(['admin/claims', 'admin/qrcodes', 'admin/stats']);
    res.json({ qrId, cancelled: true });
  } catch (e) {
    next(e);
  }
});

/* ---------------- Notifications ----------------
 * Finder "I found this" reports land here as owner notifications. All routes are
 * scoped to the authenticated owner (req.user.uid); the service also re-checks
 * ownership on every mutate, so one account can never read or touch another's.
 */
router.get('/notifications', async (req, res, next) => {
  try {
    const list = await notificationService.listByOwner(req.user.uid);
    res.json({
      notifications: list.map((n) => ({
        id: n.id,
        type: n.type,
        qrId: n.qrId,
        itemName: n.itemName || '',
        note: n.note || '',
        read: !!n.read,
        createdAt: n.createdAt || null,
      })),
      unread: list.filter((n) => !n.read).length,
    });
  } catch (e) {
    next(e);
  }
});

// Mark every unread notification read. Declared BEFORE the :id route so the
// literal "read-all" path is never captured as an :id.
router.put('/notifications/read-all', async (req, res, next) => {
  try {
    const result = await notificationService.markAllRead(req.user.uid);
    publishToUser(req.user.uid, ['owner/notifications']); // keep other devices' badge in sync
    res.json({ ok: true, count: result.count });
  } catch (e) {
    next(e);
  }
});

router.put('/notifications/:id/read', async (req, res, next) => {
  try {
    const result = await notificationService.markRead(req.params.id, req.user.uid);
    if (!result.ok) {
      const map = {
        NOT_FOUND: [404, 'Notification not found'],
        NOT_OWNER: [403, 'This notification is not yours'],
      };
      const [status, msg] = map[result.reason] || [409, 'Could not update notification'];
      return res.status(status).json({ error: msg });
    }
    publishToUser(req.user.uid, ['owner/notifications']); // other devices' badge in sync
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------------- Dashboard list ---------------- */
router.get('/qrcodes', async (req, res, next) => {
  try {
    const qrs = await qrService.listByOwner(req.user.uid);
    const withItems = await Promise.all(
      qrs.map(async (qr) => {
        const item = await itemService.getItem(qr.qrId);
        return {
          qrId: qr.qrId,
          qrStatus: qr.status,
          activatedAt: qr.activatedAt || null,
          item: item ? { name: item.name, status: item.status, photoUrl: item.photoUrl || null } : null,
        };
      })
    );
    withItems.sort((a, b) => (a.qrId < b.qrId ? -1 : 1));
    res.json({ qrcodes: withItems });
  } catch (e) {
    next(e);
  }
});

// Owner deletes (releases) their own QR. This is NOT a hard delete: the QR id
// returns to AVAILABLE so the physical tag can be re-activated — only the user's
// data (item, customization, contact, image) is wiped. Blocked by business rules:
// a LOST item (recovery in progress), an admin-DISABLED QR, or a pending claim.
// Ownership + status guards are enforced transactionally in releaseOwned.
router.delete('/qr/:qrId', async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;

    // Guard: don't let an owner drop a tag that's actively helping recover a lost
    // item (its public finder page is live). They must mark it found/active first.
    const item = await itemService.getItem(qr.qrId);
    if (item?.status === ITEM_STATUS.LOST) {
      return res.status(409).json({
        error: 'Mark this item as found or active before deleting its QR code.',
        reason: 'ITEM_LOST',
      });
    }

    // Release first (authoritative ownership + status guards), THEN clean up the
    // linked data — so a refused release never wipes anything.
    const result = await qrService.releaseOwned(qr.qrId, req.user.uid);
    if (!result.ok) {
      const map = {
        NOT_FOUND: [404, 'QR not found'],
        NOT_OWNER: [403, 'You do not own this QR code'],
        DISABLED: [409, "This QR was disabled by an admin and can't be deleted."],
        PENDING_CLAIM: [409, "This QR has a pending activation request and can't be deleted right now."],
      };
      const [status, msg] = map[result.reason] || [409, 'Could not delete QR'];
      return res.status(status).json({ error: msg, reason: result.reason });
    }

    // Best-effort cleanup (removeItem also deletes the stored image). A cleanup
    // hiccup must not fail the request — the QR is already released.
    await Promise.all([
      itemService.removeItem(qr.qrId),
      customService.removeCustomization(qr.qrId),
      contactService.removeContact(qr.qrId),
      notificationService.removeByQr(qr.qrId),
    ]).catch((e) => console.error('[owner] cleanup after QR release failed', e));

    publishToUser(req.user.uid, ['owner/qrcodes']);
    publishToAdmins(['admin/qrcodes', 'admin/stats', 'admin/items']);
    res.json({ qrId: qr.qrId, deleted: true });
  } catch (e) {
    next(e);
  }
});

/* ---------------- Item ---------------- */
router.get('/items/:qrId', async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    const item = await itemService.getItem(qr.qrId);
    res.json({ item: item || null });
  } catch (e) {
    next(e);
  }
});

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(TEXT_LIMITS.ITEM_NAME),
  description: z.string().trim().max(TEXT_LIMITS.ITEM_DESCRIPTION).optional().default(''),
  category: z.string().trim().max(TEXT_LIMITS.ITEM_CATEGORY).optional().default(''),
  recoveryInstructions: z.string().trim().max(TEXT_LIMITS.RECOVERY_INSTRUCTIONS).optional().default(''),
});
router.put('/items/:qrId', validate(itemSchema), async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    const item = await itemService.upsertItem(qr.qrId, req.user.uid, req.body);
    publishToUser(req.user.uid, ['owner/qrcodes', 'qr']); // other devices see the edit
    // admin/qrcodes too: the admin inventory table and the admin QR drawer render the
    // item name/status, so they must refresh when an owner edits the item.
    publishToAdmins(['admin/items', 'admin/qrcodes']);
    res.json({ item });
  } catch (e) {
    next(e);
  }
});

// Shared pipeline for every image source (device upload, URL import). Takes the
// validated-at-the-edge raw bytes and:
//   1. validates the image SIGNATURE (magic bytes) — client mimetype isn't trusted
//   2. de-dupes: identical bytes to the current photo => no-op (avoids a redundant
//      re-upload / re-processing and makes repeat submissions idempotent)
//   3. uploads to storage (optimized + thumbnailed by the adapter), THEN updates
//      the DB. If the DB write fails, the just-uploaded asset is deleted so no
//      orphan is left and the OLD photo stays intact — success is reported only
//      when both storage and DB succeeded.
//   4. best-effort cleanup of the replaced image.
// Item status (LOST/RECOVERED) and all other fields are untouched throughout.
async function applyNewPhoto(qr, uid, buffer) {
  const { contentType, ext } = assertAllowedImage(buffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const existing = await itemService.getItem(qr.qrId);
  if (existing?.photoHash && existing.photoHash === hash) {
    return { item: existing, deduped: true };
  }

  const saved = await saveImage(buffer, { qrId: qr.qrId, ext, contentType });

  let item;
  try {
    item = await itemService.upsertItem(qr.qrId, uid, {
      photoUrl: saved.url,
      photoKey: saved.key,
      photoThumbUrl: saved.thumbUrl,
      photoHash: hash,
    });
  } catch (dbErr) {
    // DB update failed after a successful upload — remove the orphan and keep the
    // existing photo. Never surface this as success.
    deleteImage(saved.key).catch((e) => console.error('[storage] orphan cleanup failed', e));
    throw dbErr;
  }

  const oldKey = existing?.photoKey || keyFromLegacyUrl(existing?.photoUrl);
  if (oldKey && oldKey !== saved.key) {
    deleteImage(oldKey).catch((e) => console.error('[storage] cleanup failed on photo replace', e));
  }
  return { item, deduped: false };
}

const photoLimiter = rateLimit({ ...RATE_LIMIT.PHOTO, bucket: 'photo' });

// Device upload (multipart). Multer enforces the size limit + mimetype allowlist
// up front; applyNewPhoto re-checks the real bytes.
router.post('/items/:qrId/photo', photoLimiter, uploadPhoto, async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const { item, deduped } = await applyNewPhoto(qr, req.user.uid, req.file.buffer);
    if (!deduped) publishToUser(req.user.uid, ['owner/qrcodes', 'qr']);
    res.json({ item, storageMode, deduped });
  } catch (e) {
    next(e);
  }
});

// Import from an image URL. The URL is fetched server-side with SSRF protections
// (scheme/credential checks, private-IP blocking incl. redirects + DNS rebinding,
// size cap, timeout, magic-byte validation) before it ever reaches storage.
const photoUrlSchema = z.object({ url: z.string().trim().min(1, 'Enter an image URL').max(TEXT_LIMITS.PHOTO_URL) });
router.post('/items/:qrId/photo-url', photoLimiter, validate(photoUrlSchema), async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    const { buffer } = await downloadImage(req.body.url);
    const { item, deduped } = await applyNewPhoto(qr, req.user.uid, buffer);
    if (!deduped) publishToUser(req.user.uid, ['owner/qrcodes', 'qr']);
    res.json({ item, storageMode, deduped });
  } catch (e) {
    next(e);
  }
});

const statusSchema = z.object({
  status: z.enum([ITEM_STATUS.ACTIVE, ITEM_STATUS.LOST, ITEM_STATUS.RECOVERED]),
});
router.put('/items/:qrId/status', validate(statusSchema), async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    const existing = await itemService.getItem(qr.qrId);
    if (!existing) return res.status(400).json({ error: 'Register an item before changing its status' });
    await itemService.setStatus(qr.qrId, req.body.status);
    // Status (ACTIVE/LOST/RECOVERED) drives the dashboard, the admin item view, and
    // the public finder page — nudge this user's devices and the admin surfaces.
    publishToUser(req.user.uid, ['owner/qrcodes', 'qr']);
    // admin/qrcodes too so the inventory table + open QR drawer item-status column refresh.
    publishToAdmins(['admin/items', 'admin/stats', 'admin/qrcodes']);
    res.json({ qrId: qr.qrId, status: req.body.status });
  } catch (e) {
    next(e);
  }
});

/* ---------------- Customization ---------------- */
router.get('/customizations/:qrId', async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    res.json({ customization: await customService.getCustomization(qr.qrId) });
  } catch (e) {
    next(e);
  }
});

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color');
const customSchema = z.object({
  template: z.enum(TEMPLATES).optional(),
  bgColor: hex.optional(),
  accentColor: hex.optional(),
  logoUrl: z.string().max(TEXT_LIMITS.LOGO_URL).nullable().optional(),
  pageTitle: z.string().trim().max(TEXT_LIMITS.PAGE_TITLE).optional(),
  finderMessage: z.string().trim().max(TEXT_LIMITS.FINDER_MESSAGE).optional(),
  contactButtonText: z.string().trim().max(TEXT_LIMITS.CONTACT_BUTTON_TEXT).optional(),
  alwaysShowInfo: z.boolean().optional(),
});
router.put('/customizations/:qrId', validate(customSchema), async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    const saved = await customService.saveCustomization(qr.qrId, req.user.uid, req.body);
    // The look/title/finder-message feed the public page and the owner's other tabs.
    publishToUser(req.user.uid, ['owner/qrcodes', 'qr']);
    res.json({ customization: saved });
  } catch (e) {
    next(e);
  }
});

/* ---------------- Contact settings ---------------- */
router.get('/contact/:qrId', async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    res.json({ contact: await contactService.getContact(qr.qrId) });
  } catch (e) {
    next(e);
  }
});

const contactSchema = z.object({
  fields: z.array(z.object({
    type: z.string().trim().min(1).max(TEXT_LIMITS.CONTACT_TYPE),
    value: z.string().trim().min(1).max(TEXT_LIMITS.CONTACT_VALUE),
    show: z.boolean().optional(),
  })).min(1, 'Add at least one contact field').max(20),
  // Owner contact preference. preferredMethod names a field type (e.g. 'phone')
  // the owner would rather be reached on. Optional and only surfaced on the public
  // page under the same privacy gate as the contact fields themselves.
  preferredMethod: z.string().trim().max(TEXT_LIMITS.CONTACT_TYPE).optional().default(''),
});
router.put('/contact/:qrId', validate(contactSchema), async (req, res, next) => {
  try {
    const qr = await loadOwnedQr(req, res);
    if (!qr) return;
    const saved = await contactService.saveContact(qr.qrId, req.user.uid, req.body);
    // Contact fields feed the public page and the owner's other tabs.
    publishToUser(req.user.uid, ['owner/qrcodes', 'qr']);
    res.json({ contact: saved });
  } catch (e) {
    next(e);
  }
});

export default router;
