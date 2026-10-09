import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { normalizeQrId } from '../lib/ids.js';
import { QR_STATUS, ITEM_STATUS, RATE_LIMIT } from '../lib/constants.js';
import * as qrService from '../services/qrcodes.js';
import * as itemService from '../services/items.js';
import * as userService from '../services/users.js';
import * as customService from '../services/customizations.js';
import * as contactService from '../services/contacts.js';
import * as notificationService from '../services/notifications.js';
import { publishToUser, publishToAdmins, kickUser } from '../lib/events.js';

const router = Router();
router.use(requireAuth, requireAdmin);
// Per-admin backstop against runaway loops on the admin surface (same family as
// the owner one). Admin actions are already gated by role; this only caps volume.
router.use(rateLimit({ ...RATE_LIMIT.API, bucket: 'admin-api', keyBy: 'user' }));

// Pre-register a batch of permanent QR ids (inventory). They start AVAILABLE,
// each with a one-time activation code. The plaintext codes are returned HERE
// ONLY — they are stored hashed and can never be retrieved again, so the admin
// must save/print them with this response (pair each code with its product).
const genSchema = z.object({ count: z.coerce.number().int().min(1).max(500) });
router.post('/qr/generate', validate(genSchema), async (req, res, next) => {
  try {
    const pairs = await qrService.generateBatch(req.body.count); // [{ qrId, secret }]
    publishToAdmins(['admin/qrcodes', 'admin/stats']); // other admins see new inventory
    res.status(201).json({
      created: pairs.map((p) => p.qrId),
      secrets: pairs, // { qrId, secret } — shown once for printing, never persisted in clear
      count: pairs.length,
    });
  } catch (e) {
    next(e);
  }
});

// QR inventory, optionally filtered by status; joins owner username + item for the admin table.
router.get('/qrcodes', async (req, res, next) => {
  try {
    const status = req.query.status;
    const qrs = await qrService.listAll(status ? { status } : {});
    const users = await userService.listUsers();
    const byUid = Object.fromEntries(users.map((u) => [u.uid, u]));
    const rows = await Promise.all(
      qrs.map(async (qr) => {
        const item = qr.status === QR_STATUS.ACTIVATED ? await itemService.getItem(qr.qrId) : null;
        const claimantUid = qr.claim?.uid || null;
        return {
          qrId: qr.qrId,
          status: qr.status,
          ownerUid: qr.ownerUid || null,
          ownerUsername: qr.ownerUid ? byUid[qr.ownerUid]?.username || null : null,
          reviewStatus: qr.claim?.status || null,
          claimantUid: claimantUid,
          claimantUsername: claimantUid ? byUid[claimantUid]?.username || null : null,
          item: item ? { name: item.name, status: item.status } : null,
        };
      })
    );
    rows.sort((a, b) => (a.qrId < b.qrId ? -1 : 1));
    res.json({ qrcodes: rows });
  } catch (e) {
    next(e);
  }
});

// Full detail for one QR: the record, its owner (if any), and its item (if any).
router.get('/qrcodes/:qrId', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    const qr = qrId ? await qrService.getQr(qrId) : null;
    if (!qr) return res.status(404).json({ error: 'QR not found' });
    const owner = qr.ownerUid ? await userService.findByUid(qr.ownerUid) : null;
    const claimantUid = qr.claim?.uid || null;
    const claimant = claimantUid ? await userService.findByUid(claimantUid) : null;
    const item = await itemService.getItem(qr.qrId);
    res.json({
      qr: {
        qrId: qr.qrId,
        status: qr.status,
        ownerUid: qr.ownerUid || null,
        createdAt: qr.createdAt || null,
        activatedAt: qr.activatedAt || null,
      },
      claim: qr.claim
        ? {
            status: qr.claim.status,
            method: qr.claim.method || null,
            note: qr.claim.note || '',
            requestedAt: qr.claim.requestedAt || null,
            decidedAt: qr.claim.decidedAt || null,
            claimantUid,
            claimantUsername: claimant ? claimant.username : null,
          }
        : null,
      owner: owner
        ? { uid: owner.uid, username: owner.username, name: owner.name || '', disabled: !!owner.disabled }
        : null,
      item: item || null,
    });
  } catch (e) {
    next(e);
  }
});

// NOTE: QR activation and item editing belong to the QR's owner, not admins.
// Those actions live on the owner routes (POST /qr/activate, PUT /items/:qrId,
// PUT /items/:qrId/status) and are enforced there by ownership checks. Admins
// manage inventory (generate/disable/enable) and review user-filed claims only.

router.put('/qr/:qrId/disable', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    const qr = qrId ? await qrService.getQr(qrId) : null;
    if (!qr) return res.status(404).json({ error: 'QR not found' });
    await qrService.setStatus(qrId, QR_STATUS.DISABLED);
    publishToAdmins(['admin/qrcodes', 'admin/stats']);
    if (qr.ownerUid) publishToUser(qr.ownerUid, ['owner/qrcodes', 'qr']);
    res.json({ qrId, status: QR_STATUS.DISABLED });
  } catch (e) {
    next(e);
  }
});

// Permanently delete a QR and everything linked to it (item, customization,
// contact). Irreversible: the id is retired and any printed sticker/URL goes dead.
// Admin-only (this whole router is requireAuth + requireAdmin).
router.delete('/qr/:qrId', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    const qr = qrId ? await qrService.getQr(qrId) : null;
    if (!qr) return res.status(404).json({ error: 'QR not found' });
    await Promise.all([
      itemService.removeItem(qrId),
      customService.removeCustomization(qrId),
      contactService.removeContact(qrId),
      notificationService.removeByQr(qrId),
    ]);
    await qrService.deleteQr(qrId);
    publishToAdmins(['admin/qrcodes', 'admin/stats', 'admin/items']);
    if (qr.ownerUid) publishToUser(qr.ownerUid, ['owner/qrcodes']);
    res.json({ qrId, deleted: true });
  } catch (e) {
    next(e);
  }
});

// Re-enable: an owned QR returns to ACTIVATED, an unowned one to AVAILABLE.
router.put('/qr/:qrId/enable', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    const qr = qrId ? await qrService.getQr(qrId) : null;
    if (!qr) return res.status(404).json({ error: 'QR not found' });
    const status = qr.ownerUid ? QR_STATUS.ACTIVATED : QR_STATUS.AVAILABLE;
    await qrService.setStatus(qrId, status);
    publishToAdmins(['admin/qrcodes', 'admin/stats']);
    if (qr.ownerUid) publishToUser(qr.ownerUid, ['owner/qrcodes', 'qr']);
    res.json({ qrId, status });
  } catch (e) {
    next(e);
  }
});

/* ---------------- Claim review & direct activation ---------------- */

// All pending activation requests awaiting review, newest-decided-first is not
// relevant here — ordered oldest-requested-first so the queue is FIFO. Powers the
// dedicated Activation Requests admin page and its notification badge (count).
router.get('/claims', async (req, res, next) => {
  try {
    const qrs = await qrService.listAll({ status: QR_STATUS.PENDING });
    const users = await userService.listUsers();
    const byUid = Object.fromEntries(users.map((u) => [u.uid, u]));
    const claims = qrs
      .filter((qr) => qr.claim?.uid)
      .map((qr) => {
        const u = byUid[qr.claim.uid];
        return {
          qrId: qr.qrId,
          claimantUid: qr.claim.uid,
          claimantUsername: u?.username || null,
          claimantName: u?.name || '',
          note: qr.claim.note || '',
          requestedAt: qr.claim.requestedAt || null,
        };
      })
      .sort((a, b) => (a.requestedAt || '').localeCompare(b.requestedAt || ''));
    res.json({ claims, count: claims.length });
  } catch (e) {
    next(e);
  }
});

// Approve a pending claim -> ownership transfers to the requester.
router.put('/qr/:qrId/approve', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    if (!qrId) return res.status(404).json({ error: 'QR not found' });
    const result = await qrService.approveClaim(qrId, req.user.uid);
    if (!result.ok) {
      const map = { NOT_FOUND: [404, 'QR not found'], NOT_PENDING: [409, 'This QR has no pending claim to approve'] };
      const [status, msg] = map[result.reason] || [409, 'Could not approve claim'];
      return res.status(status).json({ error: msg, reason: result.reason });
    }
    // Approved: the claimant now owns it (their dashboard + claims update live),
    // and the admin queue / inventory / stats drop the pending row.
    publishToUser(result.ownerUid, ['owner/qrcodes', 'owner/claims']);
    publishToAdmins(['admin/claims', 'admin/qrcodes', 'admin/stats']);
    res.json({ qrId, status: QR_STATUS.ACTIVATED, ownerUid: result.ownerUid });
  } catch (e) {
    next(e);
  }
});

// Reject a pending claim -> QR returns to AVAILABLE.
router.put('/qr/:qrId/reject', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    if (!qrId) return res.status(404).json({ error: 'QR not found' });
    // Capture the claimant before the reject clears the claim, so we can nudge them.
    const pre = await qrService.getQr(qrId);
    const claimantUid = pre?.claim?.uid || null;
    const result = await qrService.rejectClaim(qrId, req.user.uid);
    if (!result.ok) {
      const map = { NOT_FOUND: [404, 'QR not found'], NOT_PENDING: [409, 'This QR has no pending claim to reject'] };
      const [status, msg] = map[result.reason] || [409, 'Could not reject claim'];
      return res.status(status).json({ error: msg, reason: result.reason });
    }
    if (claimantUid) publishToUser(claimantUid, ['owner/claims']);
    publishToAdmins(['admin/claims', 'admin/qrcodes', 'admin/stats']);
    res.json({ qrId, status: QR_STATUS.AVAILABLE });
  } catch (e) {
    next(e);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    res.json({ users: await userService.listUsers() });
  } catch (e) {
    next(e);
  }
});

// Enable / disable a user account. A disabled user can't log in and is kicked
// off on their next request. An admin can't disable their own account.
async function setUserDisabled(req, res, next, disabled) {
  try {
    const { uid } = req.params;
    if (uid === req.user.uid) return res.status(400).json({ error: "You can't change your own account status." });
    const target = await userService.findByUid(uid);
    if (!target) return res.status(404).json({ error: 'User not found' });
    await userService.setDisabled(uid, disabled);
    // Disabling kicks the account's live sessions immediately (not just on its next
    // REST call); both directions refresh other admins' user table.
    if (disabled) kickUser(uid);
    publishToAdmins(['admin/users']);
    res.json({ uid, disabled });
  } catch (e) {
    next(e);
  }
}
router.put('/users/:uid/disable', (req, res, next) => setUserDisabled(req, res, next, true));
router.put('/users/:uid/enable', (req, res, next) => setUserDisabled(req, res, next, false));

router.get('/items', async (req, res, next) => {
  try {
    res.json({ items: await itemService.listAll() });
  } catch (e) {
    next(e);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const qrs = await qrService.listAll();
    const items = await itemService.listAll();
    const users = await userService.listUsers();
    const countBy = (arr, key, val) => arr.filter((x) => x[key] === val).length;
    res.json({
      users: users.length,
      qr: {
        total: qrs.length,
        available: countBy(qrs, 'status', QR_STATUS.AVAILABLE),
        pending: countBy(qrs, 'status', QR_STATUS.PENDING),
        activated: countBy(qrs, 'status', QR_STATUS.ACTIVATED),
        disabled: countBy(qrs, 'status', QR_STATUS.DISABLED),
      },
      items: {
        total: items.length,
        active: countBy(items, 'status', ITEM_STATUS.ACTIVE),
        lost: countBy(items, 'status', ITEM_STATUS.LOST),
        recovered: countBy(items, 'status', ITEM_STATUS.RECOVERED),
      },
    });
  } catch (e) {
    next(e);
  }
});

export default router;
