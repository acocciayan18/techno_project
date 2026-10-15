// Admin audit trail. Every privileged action an admin takes against a user
// account (enable / disable / edit) is appended here as an immutable record so a
// later admin can see who changed what, and when.
//
// Records are append-only: nothing in the app updates or deletes a log entry.
// Only the common Firestore subset is used (doc().set(), where('==').get()), so
// this works identically on the in-memory DB and real Firestore. The memory DB
// has no orderBy/limit, so ordering and capping are done in JS after the fetch.
import { db } from '../config/firebase.js';
import { COL } from '../lib/constants.js';

const col = () => db.collection(COL.ADMIN_LOGS);

// Action tags stored on each record. Keep these stable — the client maps them to
// human-readable labels.
export const AUDIT_ACTION = {
  USER_UPDATE: 'user.update',
  USER_DISABLE: 'user.disable',
  USER_ENABLE: 'user.enable',
};

// Append one admin-action record. Deliberately swallows its own errors and never
// throws into the request path: auditing must not be able to fail the action it
// is recording. `details` is a small, non-secret map (e.g. which fields changed)
// — never the new password or any other secret value.
export async function record({ actorUid, actorUsername, action, targetUid, targetUsername, details = {} }) {
  try {
    const ref = col().doc();
    const entry = {
      actorUid: actorUid || null,
      actorUsername: actorUsername || null,
      action,
      targetUid: targetUid || null,
      targetUsername: targetUsername || null,
      details: details && typeof details === 'object' ? details : {},
      at: new Date().toISOString(),
    };
    await ref.set(entry);
    return { id: ref.id, ...entry };
  } catch (e) {
    console.error('[audit] failed to record', action, e?.message || e);
    return null;
  }
}

// All records targeting one user, newest first, capped at `limit`. Sorted in
// memory so it behaves the same on the memory DB (no orderBy) and cloud.
export async function listForTarget(targetUid, limit = 50) {
  if (!targetUid) return [];
  const snap = await col().where('targetUid', '==', targetUid).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return rows.slice(0, limit);
}
