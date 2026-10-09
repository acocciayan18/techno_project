import { db } from '../config/firebase.js';
import { COL } from '../lib/constants.js';

const col = () => db.collection(COL.CONTACTS);

// A contact doc is now a list of typed fields:
//   { fields: [{ type, value, show }], ownerUid, updatedAt }
// Legacy docs stored fixed email/phone/link + showX flags; migrate() folds those
// into the fields shape on read so old QRs keep working with no data backfill.
function migrate(data) {
  if (!data) return { fields: [], preferredMethod: '' };
  if (Array.isArray(data.fields)) {
    return {
      ...data,
      fields: data.fields.filter((f) => f && f.value),
      preferredMethod: data.preferredMethod || '',
    };
  }
  const fields = [];
  if (data.email) fields.push({ type: 'email', value: data.email, show: !!data.showEmail });
  if (data.phone) fields.push({ type: 'phone', value: data.phone, show: !!data.showPhone });
  if (data.link) fields.push({ type: 'link', value: data.link, show: !!data.showLink });
  return { fields, preferredMethod: '' };
}

export async function getContact(qrId) {
  const doc = await col().doc(qrId).get();
  return migrate(doc.exists ? doc.data() : null);
}

export async function saveContact(qrId, ownerUid, patch) {
  const fields = (patch.fields || [])
    .filter((f) => f && typeof f.value === 'string' && f.value.trim())
    .map((f) => ({ type: f.type, value: f.value.trim(), show: !!f.show }));
  const data = {
    fields,
    preferredMethod: typeof patch.preferredMethod === 'string' ? patch.preferredMethod.trim() : '',
    ownerUid,
    updatedAt: new Date().toISOString(),
  };
  // Replace the whole doc so legacy fixed fields can't linger alongside the array.
  await col().doc(qrId).set(data);
  return data;
}

export async function removeContact(qrId) {
  await col().doc(qrId).delete();
}

// Privacy gate: returns ONLY the fields the owner explicitly opted to show
// publicly, stripped to what a finder needs (type + value).
export function publicContact(contact) {
  const fields = (contact.fields || [])
    .filter((f) => f.show && f.value)
    .map((f) => ({ type: f.type, value: f.value }));
  // Only surface the preferred method when a matching PUBLIC field actually exists —
  // never hint at a channel the owner chose to keep private.
  const preferredMethod =
    contact.preferredMethod && fields.some((f) => f.type === contact.preferredMethod)
      ? contact.preferredMethod
      : '';
  return { fields, preferredMethod };
}
