import { db } from '../config/firebase.js';
import { COL } from '../lib/constants.js';

const col = () => db.collection(COL.CONTACTS);

// A contact doc is now a list of typed fields:
//   { fields: [{ type, value, show }], ownerUid, updatedAt }
// Legacy docs stored fixed email/phone/link + showX flags; migrate() folds those
// into the fields shape on read so old QRs keep working with no data backfill.
function migrate(data) {
  if (!data) return { fields: [] };
  if (Array.isArray(data.fields)) {
    return { ...data, fields: data.fields.filter((f) => f && f.value) };
  }
  const fields = [];
  if (data.email) fields.push({ type: 'email', value: data.email, show: !!data.showEmail });
  if (data.phone) fields.push({ type: 'phone', value: data.phone, show: !!data.showPhone });
  if (data.link) fields.push({ type: 'link', value: data.link, show: !!data.showLink });
  return { fields };
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
  return { fields };
}
