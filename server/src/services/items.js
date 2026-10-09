import { db } from '../config/firebase.js';
import { COL, ITEM_STATUS } from '../lib/constants.js';
import { deleteImage, keyFromLegacyUrl } from '../config/storage.js';

const col = () => db.collection(COL.ITEMS);

export async function getItem(qrId) {
  const doc = await col().doc(qrId).get();
  if (!doc.exists) return null;
  return { qrId: doc.id, ...doc.data() };
}

export async function upsertItem(qrId, ownerUid, { name, description, category, photoUrl, photoKey, photoThumbUrl, photoHash }) {
  const ref = col().doc(qrId);
  const existing = await ref.get();
  const base = existing.exists ? existing.data() : { status: ITEM_STATUS.ACTIVE };
  const data = {
    ownerUid,
    name: name ?? base.name ?? '',
    description: description ?? base.description ?? '',
    category: category ?? base.category ?? '',
    photoUrl: photoUrl !== undefined ? photoUrl : base.photoUrl ?? null,
    // photoKey tracks the storage object behind photoUrl so it can be cleaned up
    // later. photoThumbUrl is an optimized thumbnail (= photoUrl on backends with
    // no transform). photoHash is the sha256 of the source bytes, used to skip
    // re-uploading an identical image. All three move in lock-step with photoUrl.
    photoKey: photoKey !== undefined ? photoKey : base.photoKey ?? null,
    photoThumbUrl: photoThumbUrl !== undefined ? photoThumbUrl : base.photoThumbUrl ?? null,
    photoHash: photoHash !== undefined ? photoHash : base.photoHash ?? null,
    status: base.status || ITEM_STATUS.ACTIVE,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(data, { merge: true });
  return { qrId, ...data };
}

export async function setStatus(qrId, status) {
  await col().doc(qrId).set({ status, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function listAll() {
  const snap = await col().get();
  return snap.docs.map((d) => ({ qrId: d.id, ...d.data() }));
}

export async function removeItem(qrId) {
  const ref = col().doc(qrId);
  const doc = await ref.get();
  if (doc.exists) {
    const d = doc.data();
    const key = d.photoKey || keyFromLegacyUrl(d.photoUrl);
    // Best-effort: a failed image delete must not block removing the record.
    if (key) await deleteImage(key).catch((e) => console.error('[storage] cleanup failed on removeItem', e));
  }
  await ref.delete();
}
