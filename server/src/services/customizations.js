import { db } from '../config/firebase.js';
import { COL } from '../lib/constants.js';

const col = () => db.collection(COL.CUSTOMIZATIONS);

const DEFAULTS = {
  template: 'minimal',
  bgColor: '#f5f5f7',
  accentColor: '#2563eb',
  logoUrl: null,
  pageTitle: '',
  finderMessage: 'Please help me return this item. Thank you!',
  contactButtonText: 'Contact Owner',
  // When true, the item's public details + opted-in contact fields are shown to
  // any finder even while the item is NOT reported lost. Off by default.
  alwaysShowInfo: false,
};

export async function getCustomization(qrId) {
  const doc = await col().doc(qrId).get();
  return { ...DEFAULTS, ...(doc.exists ? doc.data() : {}) };
}

export async function saveCustomization(qrId, ownerUid, patch) {
  const ref = col().doc(qrId);
  const existing = await ref.get();
  const data = {
    ...DEFAULTS,
    ...(existing.exists ? existing.data() : {}),
    ...patch,
    ownerUid,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(data, { merge: true });
  return data;
}

export async function removeCustomization(qrId) {
  await col().doc(qrId).delete();
}

export { DEFAULTS as CUSTOMIZATION_DEFAULTS };
