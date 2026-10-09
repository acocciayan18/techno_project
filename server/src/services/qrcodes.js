import { db } from '../config/firebase.js';
import { COL, QR_STATUS, CLAIM_STATUS, CLAIM_METHOD, ACTIVATION } from '../lib/constants.js';
import { generateQrId, generateActivationSecret } from '../lib/ids.js';
import { hashActivationSecret, verifyActivationSecret } from '../lib/secrets.js';

const col = () => db.collection(COL.QRCODES);
const now = () => new Date().toISOString();

// NOTE: raw QR records carry server-only fields (`secretHash`, throttle counters).
// Routes must map to an explicit response shape and never spread a QR directly —
// the secret hash in particular must never leave the server.

export async function getQr(qrId) {
  const doc = await col().doc(qrId).get();
  if (!doc.exists) return null;
  return { qrId: doc.id, ...doc.data() };
}

export async function listAll({ status } = {}) {
  let q = col();
  if (status) q = q.where('status', '==', status);
  const snap = await q.get();
  return snap.docs.map((d) => ({ qrId: d.id, ...d.data() }));
}

export async function listByOwner(ownerUid) {
  const snap = await col().where('ownerUid', '==', ownerUid).get();
  return snap.docs.map((d) => ({ qrId: d.id, ...d.data() }));
}

// QRs with a PENDING claim filed by this user (their own activation requests).
export async function listPendingByClaimant(claimantUid) {
  const snap = await col().where('status', '==', QR_STATUS.PENDING).get();
  return snap.docs
    .map((d) => ({ qrId: d.id, ...d.data() }))
    .filter((qr) => qr.claim?.uid === claimantUid);
}

// Pre-generate `count` QR ids inside a transaction. Each id is securely random
// (crypto) and collision-checked. Each QR also gets a one-time activation code:
// only its HMAC is stored; the plaintext is returned here ONCE so the caller can
// print it with the product. It is never persisted in the clear and never
// returned again.
export async function generateBatch(count) {
  const MAX_ATTEMPTS = count * 20 + 50; // guard against a pathological collision storm
  return db.runTransaction(async (tx) => {
    const created = [];
    const seen = new Set();
    let attempts = 0;
    while (created.length < count) {
      if (++attempts > MAX_ATTEMPTS) {
        throw new Error('generateBatch: too many id collisions, aborting');
      }
      const qrId = generateQrId();
      if (seen.has(qrId)) continue; // dup within this batch
      // Firestore transactions require all reads before writes, so check existence now.
      const snap = await tx.get(col().doc(qrId));
      if (snap.exists) continue; // collides with an existing QR
      seen.add(qrId);
      created.push(qrId);
    }
    const result = [];
    for (const qrId of created) {
      const secret = generateActivationSecret();
      tx.set(col().doc(qrId), {
        status: QR_STATUS.AVAILABLE,
        ownerUid: null,
        secretHash: hashActivationSecret(qrId, secret.replace(/-/g, '')),
        failedClaims: 0,
        claimLockUntil: null,
        claim: null,
        createdAt: now(),
      });
      result.push({ qrId, secret });
    }
    return result;
  });
}

// Self-serve activation: proof of possession. Succeeds ONLY if the QR is
// AVAILABLE and the submitted activation code matches. The QR id alone grants
// nothing. Brute force is throttled per QR (ACTIVATION.MAX_ATTEMPTS / window).
// `normalizedSecret` is the dash-free code from normalizeActivationSecret().
// Returns { ok, reason } so the route can map to the right HTTP status.
export async function activate(qrId, ownerUid, normalizedSecret) {
  const ref = col().doc(qrId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'NOT_FOUND' };
    const data = snap.data();

    if (data.status === QR_STATUS.DISABLED) return { ok: false, reason: 'DISABLED' };
    if (data.status === QR_STATUS.ACTIVATED) {
      return { ok: false, reason: data.ownerUid === ownerUid ? 'ALREADY_YOURS' : 'ALREADY_ACTIVATED' };
    }
    if (data.status === QR_STATUS.PENDING) {
      // A claim is already under admin review; don't let the code path race it.
      return { ok: false, reason: data.claim?.uid === ownerUid ? 'PENDING_YOURS' : 'PENDING_OTHER' };
    }

    // AVAILABLE from here. Enforce the brute-force lockout first.
    if (data.claimLockUntil && Date.parse(data.claimLockUntil) > Date.now()) {
      return { ok: false, reason: 'LOCKED' };
    }

    if (!verifyActivationSecret(qrId, normalizedSecret, data.secretHash)) {
      const failed = (data.failedClaims || 0) + 1;
      const patch = { failedClaims: failed };
      if (failed >= ACTIVATION.MAX_ATTEMPTS) {
        patch.claimLockUntil = new Date(Date.now() + ACTIVATION.LOCK_WINDOW_MS).toISOString();
        patch.failedClaims = 0; // reset; the lock now gates further attempts
      }
      tx.update(ref, patch);
      return { ok: false, reason: patch.claimLockUntil ? 'LOCKED' : 'BAD_SECRET' };
    }

    tx.update(ref, {
      status: QR_STATUS.ACTIVATED,
      ownerUid,
      activatedAt: now(),
      failedClaims: 0,
      claimLockUntil: null,
      claim: { uid: ownerUid, status: CLAIM_STATUS.APPROVED, method: CLAIM_METHOD.SECRET, requestedAt: now(), decidedAt: now() },
    });
    return { ok: true };
  });
}

// Fallback path for a user who can't use the activation code (lost/damaged):
// files a claim request. The QR goes PENDING with the claimant recorded; an admin
// decides. Only an AVAILABLE QR can receive a new request.
export async function requestClaim(qrId, claimantUid, note = '') {
  const ref = col().doc(qrId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'NOT_FOUND' };
    const data = snap.data();
    if (data.status === QR_STATUS.DISABLED) return { ok: false, reason: 'DISABLED' };
    if (data.status === QR_STATUS.ACTIVATED) {
      return { ok: false, reason: data.ownerUid === claimantUid ? 'ALREADY_YOURS' : 'ALREADY_ACTIVATED' };
    }
    if (data.status === QR_STATUS.PENDING) {
      return { ok: false, reason: data.claim?.uid === claimantUid ? 'PENDING_YOURS' : 'PENDING_OTHER' };
    }
    tx.update(ref, {
      status: QR_STATUS.PENDING,
      claim: {
        uid: claimantUid,
        status: CLAIM_STATUS.PENDING,
        note: String(note || '').slice(0, 500),
        requestedAt: now(),
      },
    });
    return { ok: true };
  });
}

// Admin approves a pending claim -> ownership transfers to the claimant.
export async function approveClaim(qrId, adminUid) {
  const ref = col().doc(qrId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'NOT_FOUND' };
    const data = snap.data();
    if (data.status !== QR_STATUS.PENDING || !data.claim?.uid) {
      return { ok: false, reason: 'NOT_PENDING' };
    }
    tx.update(ref, {
      status: QR_STATUS.ACTIVATED,
      ownerUid: data.claim.uid,
      activatedAt: now(),
      failedClaims: 0,
      claimLockUntil: null,
      claim: { ...data.claim, status: CLAIM_STATUS.APPROVED, method: CLAIM_METHOD.APPROVAL, decidedAt: now(), decidedBy: adminUid },
    });
    return { ok: true, ownerUid: data.claim.uid };
  });
}

// Admin rejects a pending claim -> QR returns to AVAILABLE, outcome recorded.
export async function rejectClaim(qrId, adminUid) {
  const ref = col().doc(qrId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'NOT_FOUND' };
    const data = snap.data();
    if (data.status !== QR_STATUS.PENDING || !data.claim?.uid) {
      return { ok: false, reason: 'NOT_PENDING' };
    }
    tx.update(ref, {
      status: QR_STATUS.AVAILABLE,
      ownerUid: null,
      claim: { ...data.claim, status: CLAIM_STATUS.REJECTED, decidedAt: now(), decidedBy: adminUid },
    });
    return { ok: true };
  });
}

// NOTE: no admin direct-activation path. A QR is activated only by its owner via
// the activation code (activate) or by admin approval of a user-filed claim
// (approveClaim). Admins cannot assign/claim a QR to a user on their own.

export async function setStatus(qrId, status) {
  await col().doc(qrId).update({ status });
}

// Owner releases their OWN QR. The id is NOT retired (that's an admin-only
// hard delete) — the physical tag survives: the QR returns to AVAILABLE with
// all ownership + claim history cleared, so it can be activated again later
// with its printed code (secretHash is kept). Linked item/customization/contact
// docs and the item image are removed by the caller (owner route).
//
// Authoritative, transactional guards (never trust a pre-read): the caller must
// own it, and release is refused for a DISABLED QR (admin-controlled) or one
// carrying a pending claim. The LOST-item guard lives in the route (item lookup).
// Returns { ok, reason } so the route maps the right HTTP status.
export async function releaseOwned(qrId, ownerUid) {
  const ref = col().doc(qrId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'NOT_FOUND' };
    const data = snap.data();
    if (data.ownerUid !== ownerUid) return { ok: false, reason: 'NOT_OWNER' };
    if (data.status === QR_STATUS.DISABLED) return { ok: false, reason: 'DISABLED' };
    if (data.status === QR_STATUS.PENDING || data.claim?.status === CLAIM_STATUS.PENDING) {
      return { ok: false, reason: 'PENDING_CLAIM' };
    }
    tx.update(ref, {
      status: QR_STATUS.AVAILABLE,
      ownerUid: null,
      activatedAt: null,
      failedClaims: 0,
      claimLockUntil: null,
      claim: null,
    });
    return { ok: true };
  });
}

// Permanently remove a QR record. Linked item/customization/contact docs are
// cleaned up by the caller (admin route). Irreversible — the id is retired.
export async function deleteQr(qrId) {
  await col().doc(qrId).delete();
}
