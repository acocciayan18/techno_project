import { Router } from 'express';
import { z } from 'zod';
import { normalizeQrId } from '../lib/ids.js';
import { qrPngBuffer, qrSvgString, publicUrlFor } from '../lib/qrimage.js';
import { QR_STATUS, ITEM_STATUS, RATE_LIMIT, NOTIFICATION } from '../lib/constants.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as qrService from '../services/qrcodes.js';
import * as itemService from '../services/items.js';
import * as customService from '../services/customizations.js';
import * as contactService from '../services/contacts.js';
import * as notificationService from '../services/notifications.js';
import { publishToUser } from '../lib/events.js';

const router = Router();

// Per-IP backstop on every unauthenticated public read (finder resolve + QR
// image/url). Generous enough that a real finder never notices; it blunts
// scraping, id-enumeration sweeps and QR-image CPU abuse. Keyed by IP, so correct
// only with `trust proxy` set in prod (same requirement as the other IP limits).
const publicReadLimiter = rateLimit({ ...RATE_LIMIT.PUBLIC_READ, bucket: 'public-read', keyBy: 'ip' });
router.use(['/q/:qrId', '/qr/:qrId/image.png', '/qr/:qrId/image.svg', '/qr/:qrId/url'], publicReadLimiter);

// Resolve a QR into exactly what a finder (no auth) is allowed to see.
// Returns a `state` tag the frontend renders. Private contact is exposed ONLY when LOST.
router.get('/q/:qrId', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    if (!qrId) return res.json({ state: 'NOT_FOUND', qrId: req.params.qrId });

    const qr = await qrService.getQr(qrId);
    if (!qr) return res.json({ state: 'NOT_FOUND', qrId });
    if (qr.status === QR_STATUS.DISABLED) return res.json({ state: 'DISABLED', qrId });
    if (qr.status !== QR_STATUS.ACTIVATED) return res.json({ state: 'NOT_ACTIVATED', qrId });

    const item = await itemService.getItem(qrId);
    if (!item || !item.name) return res.json({ state: 'NO_ITEM', qrId });

    const customization = await customService.getCustomization(qrId);

    // basePublicItem is only ever returned in LOST / PUBLIC_INFO states, so
    // recoveryInstructions (how/where to return it) rides the same privacy gate.
    // Private fields (serial numbers, identifying marks) are NOT part of the item
    // model and are never included here.
    const basePublicItem = {
      name: item.name,
      description: item.description || '',
      category: item.category || '',
      recoveryInstructions: item.recoveryInstructions || '',
      photoUrl: item.photoUrl || null,
    };

    if (item.status === ITEM_STATUS.LOST) {
      const contact = contactService.publicContact(await contactService.getContact(qrId));
      return res.json({
        state: 'LOST',
        qrId,
        item: basePublicItem,
        customization,
        contact, // only opted-in fields
      });
    }

    if (item.status === ITEM_STATUS.RECOVERED) {
      return res.json({ state: 'RECOVERED', qrId, item: { name: item.name } });
    }

    // ACTIVE / not lost, but owner opted to keep public details visible always.
    // Same privacy gate as LOST: only opted-in contact fields are exposed.
    if (customization.alwaysShowInfo) {
      const contact = contactService.publicContact(await contactService.getContact(qrId));
      return res.json({
        state: 'PUBLIC_INFO',
        qrId,
        item: basePublicItem,
        customization,
        contact,
      });
    }

    // ACTIVE / not lost: acknowledge registration, expose NO private contact.
    return res.json({ state: 'REGISTERED_NOT_LOST', qrId });
  } catch (e) {
    next(e);
  }
});

// A finder (no account) reports that a LOST item has been found/seen. This creates
// an owner notification; it is deliberately NOT a confirmation the item was
// returned (the public UI says so). Guards, in order:
//   - the QR must exist, be ACTIVATED and own an item (same resolution the finder
//     already sees), and the item must currently be LOST — the only eligible state.
//     Reporting a not-lost item is refused (409) so a stale/forged page can't
//     generate noise; the owner's privacy settings are untouched (nothing new is
//     exposed to the finder — the notification goes only to the owner).
//   - per-IP rate limit (unauthenticated route) blunts spam.
//   - de-dupe in the service collapses repeat reports for the same QR.
// Returns 201 for a newly created report, 200 when it was de-duped — both { ok }.
const foundLimiter = rateLimit({ ...RATE_LIMIT.FOUND_REPORT, bucket: 'found' });
const foundSchema = z.object({
  note: z.string().trim().max(NOTIFICATION.NOTE_MAX).optional().default(''),
});
router.post('/q/:qrId/found', foundLimiter, validate(foundSchema), async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    if (!qrId) return res.status(404).json({ error: 'Unknown QR code', reason: 'NOT_FOUND' });

    const qr = await qrService.getQr(qrId);
    if (!qr) return res.status(404).json({ error: 'Unknown QR code', reason: 'NOT_FOUND' });
    if (qr.status !== QR_STATUS.ACTIVATED || !qr.ownerUid) {
      return res.status(409).json({ error: 'This item can’t be reported right now.', reason: 'NOT_ACTIVE' });
    }

    const item = await itemService.getItem(qrId);
    if (!item || !item.name) {
      return res.status(409).json({ error: 'This item can’t be reported right now.', reason: 'NO_ITEM' });
    }
    if (item.status !== ITEM_STATUS.LOST) {
      return res.status(409).json({ error: 'This item is not currently reported lost.', reason: 'NOT_LOST' });
    }

    const { deduped } = await notificationService.createFoundReport(qr.ownerUid, qrId, {
      itemName: item.name,
      note: req.body.note,
    });
    // Live-nudge the owner's open sessions so the bell/badge updates without a reload.
    publishToUser(qr.ownerUid, ['owner/notifications']);
    return res.status(deduped ? 200 : 201).json({ ok: true, deduped });
  } catch (e) {
    next(e);
  }
});

// Downloadable QR images (encode ONLY the permanent public URL).
router.get('/qr/:qrId/image.png', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    if (!qrId) return res.status(400).send('Invalid QR id');
    const buf = await qrPngBuffer(qrId);
    res.set('Content-Type', 'image/png');
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

router.get('/qr/:qrId/image.svg', async (req, res, next) => {
  try {
    const qrId = normalizeQrId(req.params.qrId);
    if (!qrId) return res.status(400).send('Invalid QR id');
    const svg = await qrSvgString(qrId);
    res.set('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (e) {
    next(e);
  }
});

router.get('/qr/:qrId/url', (req, res) => {
  const qrId = normalizeQrId(req.params.qrId);
  if (!qrId) return res.status(400).json({ error: 'Invalid QR id' });
  res.json({ qrId, url: publicUrlFor(qrId) });
});

export default router;
