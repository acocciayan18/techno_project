// In-process real-time event bus for Server-Sent Events (SSE).
//
// Holds the set of open SSE connections, keyed by user id, and fans domain
// changes out to the right subscribers so clients refresh without polling or a
// manual reload. The payload is intentionally tiny: a list of logical RESOURCE
// names the client should revalidate (it then refetches through the normal
// authenticated API — SSE carries no data, only "something you can see changed").
// That keeps the stream cheap and, crucially, keeps authorization on the existing
// REST endpoints: a nudge to revalidate never leaks data a client couldn't
// already fetch for itself.
//
// Single-instance only, exactly like the rate limiter: the registry lives in this
// process. A horizontally scaled fleet would need a shared pub/sub (Redis, etc.)
// so an event raised on instance A reaches a client connected to instance B.
// Documented as a known limitation; the backend runs as one long-lived instance.

import { SSE } from './constants.js';

// uid -> Set<{ res, isAdmin }> (insertion-ordered, so the first element is oldest)
const clients = new Map();

export function addClient(uid, res, isAdmin) {
  let set = clients.get(uid);
  if (!set) {
    set = new Set();
    clients.set(uid, set);
  }
  // Bound concurrent sockets per account: a client (or a script holding a valid
  // token) can't open unbounded streams and exhaust fds/memory. Drop the oldest
  // connection(s) so the newest tab always connects. A Set iterates in insertion
  // order, so the first entries are the oldest.
  while (set.size >= SSE.MAX_CONN_PER_USER) {
    const oldest = set.values().next().value;
    if (!oldest) break;
    set.delete(oldest);
    try { oldest.res.end(); } catch { /* already closed */ }
  }
  const entry = { res, isAdmin: !!isAdmin };
  set.add(entry);
  return entry;
}

export function removeClient(uid, entry) {
  const set = clients.get(uid);
  if (!set) return;
  set.delete(entry);
  if (set.size === 0) clients.delete(uid);
}

// Low-level write of one SSE event. Guarded so a dead/closed socket never throws
// up into the caller (a failed write just means that client will reconnect).
function write(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    /* socket gone; its own close handler will clean up */
  }
}

function frame(resources) {
  return { v: 1, ts: Date.now(), resources: Array.isArray(resources) ? resources : [resources] };
}

// Nudge every connection belonging to one user (all their tabs/devices).
export function publishToUser(uid, resources) {
  if (!uid) return;
  const set = clients.get(uid);
  if (!set || set.size === 0) return;
  const payload = frame(resources);
  for (const { res } of set) write(res, payload);
}

// Nudge every admin connection (the admin queue, inventory, stats surfaces).
export function publishToAdmins(resources) {
  const payload = frame(resources);
  for (const set of clients.values()) {
    for (const entry of set) if (entry.isAdmin) write(entry.res, payload);
  }
}

// Force-disconnect every connection of a user and tell the client to end its
// session (used when an admin disables the account, or when the account's
// credentials change — it's kicked live, not just on its next REST call). An
// optional reason is surfaced to the client so the sign-out message matches the
// cause (disabled vs. credentials changed); the client falls back to a generic
// message when none is given.
export function kickUser(uid, reason) {
  const set = clients.get(uid);
  if (!set) return;
  const payload = { v: 1, ts: Date.now(), kick: true, reason: reason || undefined };
  for (const { res } of set) {
    write(res, payload);
    try { res.end(); } catch { /* already closed */ }
  }
  clients.delete(uid);
}

// Heartbeat comment to keep proxies from idling the connection shut and to let the
// client notice a half-open socket. Comments (`:` lines) are ignored by EventSource.
export function heartbeat(res) {
  try {
    res.write(': ping\n\n');
  } catch {
    /* socket gone */
  }
}

export function connectionCount() {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
}
