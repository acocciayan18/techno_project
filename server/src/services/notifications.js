import { db } from '../config/firebase.js';
import { COL, NOTIFICATION } from '../lib/constants.js';

// Owner-facing notifications. Each doc:
//   { ownerUid, qrId, type, itemName, note, read, createdAt, readAt? }
// Ownership is the security boundary: every read/mutate is scoped to ownerUid, and
// a notification only ever belongs to the QR's owner (set server-side, never by a
// finder). Queries use a single `==` filter (ownerUid or qrId) so they work on the
// in-memory DB and need no composite index on real Firestore; ordering/filtering
// beyond that happens in JS.
const col = () => db.collection(COL.NOTIFICATIONS);
const now = () => new Date().toISOString();

function shape(doc) {
  return { id: doc.id, ...doc.data() };
}

// All of an owner's notifications, newest first.
export async function listByOwner(ownerUid) {
  const snap = await col().where('ownerUid', '==', ownerUid).get();
  return snap.docs
    .map(shape)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function unreadCount(ownerUid) {
  const list = await listByOwner(ownerUid);
  return list.filter((n) => !n.read).length;
}

// The open (still-unread) found-report for a QR, if one exists — the de-dupe key.
async function openFoundReport(ownerUid, qrId) {
  const list = await listByOwner(ownerUid);
  return list.find(
    (n) => n.qrId === qrId && n.type === NOTIFICATION.TYPE.FOUND_REPORT && !n.read,
  );
}

// A finder reports a LOST item was seen/found. De-duped: while the owner still has
// an UNREAD found-report for this QR, repeat reports (another finder, a page
// refresh, a second device) collapse into that one — its timestamp is refreshed so
// the owner sees the latest sighting without the list stacking duplicates. Once the
// owner reads it, a later report creates a fresh row (a new sighting worth knowing).
// Returns { notification, deduped }.
export async function createFoundReport(ownerUid, qrId, { itemName = '', note = '' } = {}) {
  const existing = await openFoundReport(ownerUid, qrId);
  if (existing) {
    const ts = now();
    await col().doc(existing.id).update({ createdAt: ts });
    return { notification: { ...existing, createdAt: ts }, deduped: true };
  }
  const ref = col().doc();
  const data = {
    ownerUid,
    qrId,
    type: NOTIFICATION.TYPE.FOUND_REPORT,
    itemName: String(itemName || '').slice(0, 200),
    note: String(note || '').slice(0, NOTIFICATION.NOTE_MAX),
    read: false,
    createdAt: now(),
  };
  await ref.set(data);
  return { notification: { id: ref.id, ...data }, deduped: false };
}

// Mark one notification read. Enforces ownership so a user can never touch
// another account's notifications. Returns { ok, reason }.
export async function markRead(id, ownerUid) {
  const doc = await col().doc(id).get();
  if (!doc.exists) return { ok: false, reason: 'NOT_FOUND' };
  if (doc.data().ownerUid !== ownerUid) return { ok: false, reason: 'NOT_OWNER' };
  await col().doc(id).update({ read: true, readAt: now() });
  return { ok: true };
}

export async function markAllRead(ownerUid) {
  const list = await listByOwner(ownerUid);
  const unread = list.filter((n) => !n.read);
  await Promise.all(unread.map((n) => col().doc(n.id).update({ read: true, readAt: now() })));
  return { ok: true, count: unread.length };
}

// Remove every notification tied to a QR — called when the QR is released by its
// owner or deleted by an admin, so stale reports don't linger after the item/page
// is gone.
export async function removeByQr(qrId) {
  const snap = await col().where('qrId', '==', qrId).get();
  await Promise.all(snap.docs.map((d) => col().doc(d.id).delete()));
}
