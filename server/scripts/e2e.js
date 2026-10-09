// End-to-end test of the full flow, exercising the real Express app over HTTP.
// Runs in-process (shares the memory DB) so it needs zero external setup:
//   npm run test:e2e
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

// This suite is designed to run in-process against the zero-setup memory DB and
// local disk storage. Pin that here BEFORE any module that reads these vars is
// imported, so it works even when .env points at cloud Firestore. (ESM static
// imports run before top-level code, so the app is pulled in dynamically below.)
process.env.DB_MODE = 'memory';
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.FIREBASE_SERVICE_ACCOUNT;
delete process.env.FIRESTORE_EMULATOR_HOST;
// Pin the local-disk backend so the photo workflow is deterministic (and never
// touches the real Cloudinary/GCS accounts) regardless of what .env configures.
process.env.STORAGE_MODE = 'local';

const { createApp } = await import('../src/index.js');
const { ROLE } = await import('../src/lib/constants.js');
const { createUser, issueResetToken } = await import('../src/services/users.js');
const { UPLOAD_DIR } = await import('../src/config/storage.js');

let base;
let pass = 0;
let fail = 0;

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function api(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json (e.g. image) */
  }
  return { status: res.status, json, raw: raw ? text : undefined };
}

// multipart/form-data upload of a single image part named "photo".
async function apiUpload(path_, token, { filename, contentType, bytes }) {
  const fd = new FormData();
  fd.append('photo', new Blob([bytes], { type: contentType }), filename);
  const res = await fetch(base + path_, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json };
}

// Smallest valid 1x1 PNG — enough for the image mimetype filter + an fs round-trip.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
// A second, byte-distinct 1x1 PNG (red) so "replace" tests produce a new file
// instead of hitting the identical-bytes dedupe path.
const PNG_1x1_B = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const localPathForUrl = (url) => path.join(UPLOAD_DIR, path.basename(url || ''));

const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
base = `http://127.0.0.1:${server.address().port}`;

try {
  // Seed an admin directly (memory DB shared in-process).
  await createUser({ username: 'admin', password: 'admin123', name: 'Admin', role: ROLE.ADMIN });
  const adminLogin = await api('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  const adminToken = adminLogin.json.token;
  check('TEST 1a: admin logs in with username', adminLogin.status === 200 && !!adminToken);

  // TEST 1: admin generates a few random QR ids (prefix "QR-" + 8 alphanumeric chars)
  const gen = await api('POST', '/api/admin/qr/generate', { token: adminToken, body: { count: 4 } });
  check(
    'TEST 1: admin generated 4 unique random QR ids',
    gen.status === 201 &&
      gen.json.created.length === 4 &&
      gen.json.created.every((id) => /^QR-[A-Z0-9]{8}$/.test(id)) &&
      new Set(gen.json.created).size === 4,
    JSON.stringify(gen.json),
  );
  const [qr1, qr2, qr3, qr4] = gen.json.created;
  // Each QR ships with a one-time activation code, returned ONLY at generation.
  const secretOf = Object.fromEntries(gen.json.secrets.map((s) => [s.qrId, s.secret]));
  check(
    'TEST 1b: generation returns a distinct activation code per QR',
    gen.json.secrets.length === 4 &&
      Object.values(secretOf).every((s) => typeof s === 'string' && s.length >= 14) &&
      new Set(Object.values(secretOf)).size === 4,
    JSON.stringify(gen.json.secrets),
  );

  // Register a normal user (Ayan) — name + username + password + confirmPassword + recovery email
  const reg = await api('POST', '/api/auth/register', {
    body: { name: 'Ayan', username: 'ayan', password: 'secret12', confirmPassword: 'secret12', recoveryEmail: 'ayan@recovery.local', acceptedTerms: true },
  });
  check('TEST 2a: user registers with username', reg.status === 201 && !!reg.json.token && reg.json.user.username === 'ayan');
  const ayan = reg.json.token;

  // TEST 2: activation requires the activation code, not the QR id alone.
  const noSecret = await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: `${qr1}` } });
  check('TEST 2a: activation without a code rejected (400)', noSecret.status === 400, JSON.stringify(noSecret.json));
  const wrongSecret = await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: `${qr1}`, secret: 'XXXX-XXXX-XXXX' } });
  check('TEST 2b: activation with a wrong code rejected (422)', wrongSecret.status === 422 && wrongSecret.json.reason === 'BAD_SECRET', JSON.stringify(wrongSecret.json));
  const act = await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: `${qr1}`, secret: secretOf[qr1] } });
  check(`TEST 2: user activates ${qr1} with its code`, act.status === 201 && act.json.status === 'ACTIVATED', JSON.stringify(act.json));

  // TEST 3: register item
  const item = await api('PUT', `/api/owner/items/${qr1}`, {
    token: ayan,
    body: { name: 'Black Stainless Tumbler', description: '750ml black stainless steel tumbler.', category: 'Drinkware' },
  });
  check('TEST 3: registers Black Stainless Tumbler', item.status === 200 && item.json.item.name === 'Black Stainless Tumbler');

  // ---- Photo workflow: upload → display → replace → validate → delete ----
  // Isolated on qr4 (unused elsewhere) so the admin delete at the end is safe.
  {
    const act4 = await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: qr4, secret: secretOf[qr4] } });
    check('PHOTO setup: activates qr4', act4.status === 201, JSON.stringify(act4.json));
    const reg4 = await api('PUT', `/api/owner/items/${qr4}`, { token: ayan, body: { name: 'Camera Bag' } });
    check('PHOTO setup: registers item on qr4', reg4.status === 200);

    // Upload
    const up1 = await apiUpload(`/api/owner/items/${qr4}/photo`, ayan, { filename: 'a.png', contentType: 'image/png', bytes: PNG_1x1 });
    check('PHOTO 1: upload accepted', up1.status === 200 && typeof up1.json.item.photoUrl === 'string', JSON.stringify(up1.json));
    const url1 = up1.json.item?.photoUrl || '';
    check('PHOTO 1b: local backend returns url + key', url1.startsWith('/uploads/') && up1.json.item.photoKey?.startsWith('local:'));
    check('PHOTO 1c: file written to disk', fs.existsSync(localPathForUrl(url1)));

    // Display — the static route serves the stored bytes back
    const disp = await fetch(base + url1);
    const dispBuf = Buffer.from(await disp.arrayBuffer());
    check('PHOTO 2: image served over HTTP', disp.status === 200 && dispBuf.length === PNG_1x1.length);

    // Replace — new file appears, old file cleaned up (distinct bytes, not a dedupe)
    const up2 = await apiUpload(`/api/owner/items/${qr4}/photo`, ayan, { filename: 'b.png', contentType: 'image/png', bytes: PNG_1x1_B });
    const url2 = up2.json.item?.photoUrl || '';
    check('PHOTO 3: replacement accepted + url changed', up2.status === 200 && !!url2 && url2 !== url1, JSON.stringify(up2.json));
    check('PHOTO 3b: old image deleted from disk', !fs.existsSync(localPathForUrl(url1)));
    check('PHOTO 3c: new image present on disk', fs.existsSync(localPathForUrl(url2)));

    // Validation — wrong type and oversize both rejected, and neither disturbs the current photo
    const badType = await apiUpload(`/api/owner/items/${qr4}/photo`, ayan, { filename: 'x.txt', contentType: 'text/plain', bytes: Buffer.from('nope') });
    check('PHOTO 4: non-image rejected (400)', badType.status === 400, JSON.stringify(badType.json));
    const tooBig = await apiUpload(`/api/owner/items/${qr4}/photo`, ayan, { filename: 'big.png', contentType: 'image/png', bytes: Buffer.alloc(5 * 1024 * 1024 + 16) });
    check('PHOTO 4b: oversize rejected (400)', tooBig.status === 400, JSON.stringify(tooBig.json));
    check('PHOTO 4c: rejected uploads left current photo intact', fs.existsSync(localPathForUrl(url2)));

    // Signature validation: a text payload lying about its mimetype is rejected
    // by the magic-byte check even though multer's mimetype filter lets it pass.
    const spoof = await apiUpload(`/api/owner/items/${qr4}/photo`, ayan, { filename: 'fake.png', contentType: 'image/png', bytes: Buffer.from('this is not really a png') });
    check('PHOTO 6: byte-signature spoof rejected (400)', spoof.status === 400, JSON.stringify(spoof.json));

    // Thumbnail + dedupe. Re-uploading identical bytes is idempotent (no new file).
    const cur = await api('GET', `/api/owner/items/${qr4}`, { token: ayan });
    check('PHOTO 7: thumbnail url stored', typeof cur.json.item.photoThumbUrl === 'string' && cur.json.item.photoThumbUrl.length > 0);
    check('PHOTO 7b: photo hash stored', typeof cur.json.item.photoHash === 'string' && cur.json.item.photoHash.length === 64);
    const keyBefore = cur.json.item.photoKey;
    const sameBytes = fs.readFileSync(localPathForUrl(cur.json.item.photoUrl));
    const dup = await apiUpload(`/api/owner/items/${qr4}/photo`, ayan, { filename: 'again.png', contentType: 'image/png', bytes: sameBytes });
    check('PHOTO 8: identical re-upload deduped', dup.status === 200 && dup.json.deduped === true && dup.json.item.photoKey === keyBefore, JSON.stringify(dup.json));
    check('PHOTO 8b: response reports storage mode', dup.json.storageMode === 'local');

    // ---- URL import (SSRF guard + success via loopback, with the test override) ----
    const imgServer = http.createServer((rq, rs) => {
      if (rq.url === '/ok.png') { rs.writeHead(200, { 'Content-Type': 'image/png' }); rs.end(PNG_1x1); }
      else if (rq.url === '/notimage') { rs.writeHead(200, { 'Content-Type': 'text/plain' }); rs.end('hello'); }
      else { rs.writeHead(404); rs.end(); }
    });
    await new Promise((r) => imgServer.listen(0, '127.0.0.1', r));
    const imgPort = imgServer.address().port;

    // Loopback is normally blocked as SSRF; only the explicit test override allows it.
    process.env.IMAGE_IMPORT_ALLOW_PRIVATE = 'true';
    const urlOk = await api('POST', `/api/owner/items/${qr4}/photo-url`, { token: ayan, body: { url: `http://127.0.0.1:${imgPort}/ok.png` } });
    check('PHOTO 9: URL import succeeds (override on)', urlOk.status === 200 && typeof urlOk.json.item.photoUrl === 'string', JSON.stringify(urlOk.json));
    const urlNotImg = await api('POST', `/api/owner/items/${qr4}/photo-url`, { token: ayan, body: { url: `http://127.0.0.1:${imgPort}/notimage` } });
    check('PHOTO 9b: non-image URL rejected (400)', urlNotImg.status === 400, JSON.stringify(urlNotImg.json));

    // With the override OFF, the SSRF guard blocks loopback + bad schemes.
    delete process.env.IMAGE_IMPORT_ALLOW_PRIVATE;
    const ssrf = await api('POST', `/api/owner/items/${qr4}/photo-url`, { token: ayan, body: { url: `http://127.0.0.1:${imgPort}/ok.png` } });
    check('PHOTO 10: SSRF to loopback blocked (400)', ssrf.status === 400, JSON.stringify(ssrf.json));
    const badScheme = await api('POST', `/api/owner/items/${qr4}/photo-url`, { token: ayan, body: { url: 'file:///etc/passwd' } });
    check('PHOTO 10b: non-http scheme rejected (400)', badScheme.status === 400, JSON.stringify(badScheme.json));
    await new Promise((r) => imgServer.close(r));

    // Delete the QR (admin cascade) — item record and its current image both go.
    // Capture the CURRENT photo (url2 was since replaced by the URL import).
    const final = await api('GET', `/api/owner/items/${qr4}`, { token: ayan });
    const finalPath = localPathForUrl(final.json.item.photoUrl);
    check('PHOTO 5-pre: current photo on disk before delete', fs.existsSync(finalPath));
    const del4 = await api('DELETE', `/api/admin/qr/${qr4}`, { token: adminToken });
    check('PHOTO 5: admin deletes qr4', del4.status === 200 && del4.json.deleted === true, JSON.stringify(del4.json));
    check('PHOTO 5b: image cleaned up on item delete', !fs.existsSync(finalPath));
  }

  // TEST 4: customize + set public contact (email public, phone private)
  const custom = await api('PUT', `/api/owner/customizations/${qr1}`, {
    token: ayan,
    body: { template: 'colorful', accentColor: '#ff5500', finderMessage: 'Please help return my tumbler!' },
  });
  check('TEST 4: customizes public page', custom.status === 200 && custom.json.customization.template === 'colorful');
  const contact = await api('PUT', `/api/owner/contact/${qr1}`, {
    token: ayan,
    body: { fields: [
      { type: 'email', value: 'ayan@test.local', show: true },
      { type: 'phone', value: '0917-000-0000', show: false },
    ] },
  });
  check(
    'TEST 4b: saves contact settings',
    contact.status === 200 && contact.json.contact.fields.length === 2 &&
      contact.json.contact.fields[0].show === true,
    JSON.stringify(contact.json),
  );

  // TEST 5: finder views while ACTIVE -> no private contact
  const activeView = await api('GET', `/api/q/${qr1}`);
  check('TEST 5: finder sees REGISTERED_NOT_LOST while active', activeView.json.state === 'REGISTERED_NOT_LOST', JSON.stringify(activeView.json));
  check('TEST 5b: no contact exposed while active', activeView.json.contact === undefined && activeView.json.item === undefined);

  // TEST 6: owner marks LOST
  const lost = await api('PUT', `/api/owner/items/${qr1}/status`, { token: ayan, body: { status: 'LOST' } });
  check('TEST 6: owner marks item LOST', lost.status === 200 && lost.json.status === 'LOST');

  // TEST 7: finder views SAME url -> LOST page with customization
  const lostView = await api('GET', `/api/q/${qr1}`);
  check('TEST 7: same URL now shows LOST', lostView.json.state === 'LOST', JSON.stringify(lostView.json));
  check('TEST 7b: LOST page carries customization', lostView.json.customization?.template === 'colorful');
  check('TEST 7c: LOST page carries item info', lostView.json.item?.name === 'Black Stainless Tumbler');

  // TEST 8: only permitted contact shown (email yes, phone no)
  const lostFields = lostView.json.contact?.fields || [];
  check('TEST 8: public email shown',
    lostFields.some((f) => f.type === 'email' && f.value === 'ayan@test.local'),
    JSON.stringify(lostFields));
  check('TEST 8b: private phone hidden', !lostFields.some((f) => f.type === 'phone'));

  // ---- FINDER "I FOUND THIS" REPORTS (qr1 is LOST, owned by ayan) -----------
  const noteStart = await api('GET', '/api/owner/notifications', { token: ayan });
  check('FOUND 0: owner starts with no notifications', noteStart.status === 200 && noteStart.json.unread === 0, JSON.stringify(noteStart.json));

  const found1 = await api('POST', `/api/q/${qr1}/found`);
  check('FOUND 1: finder report on a LOST item accepted (201)', found1.status === 201 && found1.json.ok === true && found1.json.deduped === false, JSON.stringify(found1.json));
  const afterFound = await api('GET', '/api/owner/notifications', { token: ayan });
  check('FOUND 1b: owner now has 1 unread notification', afterFound.status === 200 && afterFound.json.unread === 1 && afterFound.json.notifications.length === 1, JSON.stringify(afterFound.json));
  const note1 = afterFound.json.notifications[0];
  check('FOUND 1c: notification carries qrId + item name + unread + timestamp',
    note1.qrId === qr1 && note1.itemName === 'Black Stainless Tumbler' && note1.read === false && !!note1.createdAt,
    JSON.stringify(note1));

  // Duplicate while still unread -> collapses into the one row (deduped), not stacked.
  const found2 = await api('POST', `/api/q/${qr1}/found`);
  check('FOUND 2: duplicate report deduped (200)', found2.status === 200 && found2.json.deduped === true, JSON.stringify(found2.json));
  const afterDup = await api('GET', '/api/owner/notifications', { token: ayan });
  check('FOUND 2b: still a single unread notification', afterDup.json.unread === 1 && afterDup.json.notifications.length === 1, JSON.stringify(afterDup.json));

  // Ownership: a different account can't read-mark ayan's notification.
  const stealNote = await api('PUT', `/api/owner/notifications/${note1.id}/read`, { token: adminToken });
  check('FOUND 3: another user cannot mark your notification read (403)', stealNote.status === 403, JSON.stringify(stealNote.json));

  // Owner marks it read -> unread drops to 0, the row is kept.
  const readOne = await api('PUT', `/api/owner/notifications/${note1.id}/read`, { token: ayan });
  check('FOUND 4: owner marks notification read (200)', readOne.status === 200 && readOne.json.ok === true, JSON.stringify(readOne.json));
  const afterRead = await api('GET', '/api/owner/notifications', { token: ayan });
  check('FOUND 4b: unread now 0, row retained + read', afterRead.json.unread === 0 && afterRead.json.notifications[0].read === true, JSON.stringify(afterRead.json));

  // TEST 9: owner marks RECOVERED
  const rec = await api('PUT', `/api/owner/items/${qr1}/status`, { token: ayan, body: { status: 'RECOVERED' } });
  check('TEST 9: owner marks RECOVERED', rec.status === 200 && rec.json.status === 'RECOVERED');

  // TEST 10: finder views SAME url -> recovered, not presented as lost
  const recView = await api('GET', `/api/q/${qr1}`);
  check('TEST 10: same URL shows RECOVERED (not lost)', recView.json.state === 'RECOVERED');
  check('TEST 10b: recovered exposes no contact', recView.json.contact === undefined);

  // FOUND eligibility: a report is refused once the item is no longer LOST, and
  // for an unknown QR — the only eligible target is a currently-lost item.
  const foundNotLost = await api('POST', `/api/q/${qr1}/found`);
  check('FOUND 5: report on a not-lost item refused (409 NOT_LOST)', foundNotLost.status === 409 && foundNotLost.json.reason === 'NOT_LOST', JSON.stringify(foundNotLost.json));
  const foundUnknown = await api('POST', '/api/q/ZZZZZZZZ/found');
  check('FOUND 5b: report on unknown QR refused (404 NOT_FOUND)', foundUnknown.status === 404 && foundUnknown.json.reason === 'NOT_FOUND', JSON.stringify(foundUnknown.json));

  // TEST 11: re-activate already-activated QR
  const reAct = await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: `${qr1}`, secret: secretOf[qr1] } });
  check('TEST 11: re-activating own QR rejected', reAct.status === 409 && reAct.json.reason === 'ALREADY_YOURS');
  const reg2 = await api('POST', '/api/auth/register', { body: { name: 'Bob', username: 'bob', password: 'secret12', confirmPassword: 'secret12', acceptedTerms: true } });
  const bob = reg2.json.token;
  // Even holding the real code, a taken QR can't be re-claimed (status gates first).
  const stealAct = await api('POST', '/api/owner/qr/activate', { token: bob, body: { qrId: `${qr1}`, secret: secretOf[qr1] } });
  check('TEST 11b: another user cannot activate taken QR', stealAct.status === 409 && stealAct.json.reason === 'ALREADY_ACTIVATED');

  // TEST 12: another user cannot read/modify user 1's QR
  const stealRead = await api('GET', `/api/owner/items/${qr1}`, { token: bob });
  check('TEST 12: cross-user read blocked (403)', stealRead.status === 403);
  const stealWrite = await api('PUT', `/api/owner/items/${qr1}`, { token: bob, body: { name: 'Hacked' } });
  check('TEST 12b: cross-user write blocked (403)', stealWrite.status === 403);
  const stealStatus = await api('PUT', `/api/owner/items/${qr1}/status`, { token: bob, body: { status: 'LOST' } });
  check('TEST 12c: cross-user status change blocked (403)', stealStatus.status === 403);

  // ---- SECURE ACTIVATION: claim requests, admin review, assignment, lockout --

  // Fresh inventory with known codes for these flows.
  const gen2 = await api('POST', '/api/admin/qr/generate', { token: adminToken, body: { count: 4 } });
  const [c1, c2, c3, cLock] = gen2.json.created;
  const secret2 = Object.fromEntries(gen2.json.secrets.map((s) => [s.qrId, s.secret]));

  // TEST 13: no-code fallback -> PENDING -> admin approve transfers ownership.
  const req13 = await api('POST', '/api/owner/qr/claim-request', { token: bob, body: { qrId: c1, note: 'Lost my scratch-off panel' } });
  check('TEST 13: claim request accepted -> PENDING', req13.status === 201 && req13.json.status === 'PENDING', JSON.stringify(req13.json));
  const bobClaims = await api('GET', '/api/owner/claims', { token: bob });
  check('TEST 13b: requester sees their pending claim', bobClaims.json.claims.some((cl) => cl.qrId === c1));
  const pendingView = await api('GET', `/api/admin/qrcodes/${c1}`, { token: adminToken });
  check('TEST 13c: admin sees PENDING + claimant', pendingView.json.qr.status === 'PENDING' && pendingView.json.claim?.status === 'PENDING' && pendingView.json.claim?.claimantUsername === 'bob');
  const approve = await api('PUT', `/api/admin/qr/${c1}/approve`, { token: adminToken });
  check('TEST 13d: admin approves -> ACTIVATED', approve.status === 200 && approve.json.status === 'ACTIVATED');
  const afterApprove = await api('GET', `/api/admin/qrcodes/${c1}`, { token: adminToken });
  check('TEST 13e: approved QR owned by claimant', afterApprove.json.owner?.username === 'bob' && afterApprove.json.claim?.status === 'APPROVED');

  // TEST 14: a PENDING claim blocks the code path; rejecting frees the QR.
  const req14 = await api('POST', '/api/owner/qr/claim-request', { token: ayan, body: { qrId: c2 } });
  check('TEST 14: second user files claim on c2', req14.status === 201);
  const blockedByPending = await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: c2, secret: secret2[c2] } });
  check('TEST 14b: code activation blocked while PENDING (409)', blockedByPending.status === 409 && blockedByPending.json.reason === 'PENDING_YOURS');
  const reject = await api('PUT', `/api/admin/qr/${c2}/reject`, { token: adminToken });
  check('TEST 14c: admin rejects -> back to AVAILABLE', reject.status === 200 && reject.json.status === 'AVAILABLE');
  const afterReject = await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: c2, secret: secret2[c2] } });
  check('TEST 14d: rejected QR can then be code-activated', afterReject.status === 201 && afterReject.json.status === 'ACTIVATED');

  // TEST 15: there is NO admin direct-assignment path. Ownership comes only from
  // the owner's activation code or admin approval of a user-filed claim — so the
  // assign endpoint doesn't exist, and a non-owner can't edit an unclaimed QR.
  const assign = await api('PUT', `/api/admin/qr/${c3}/assign`, { token: adminToken, body: { username: 'ayan' } });
  check('TEST 15: admin cannot direct-assign a QR (no such route)', assign.status === 404, JSON.stringify(assign.json));
  const assignedEdit = await api('PUT', `/api/owner/items/${c3}`, { token: ayan, body: { name: 'Assigned Item' } });
  check('TEST 15b: non-owner cannot edit an unclaimed QR (403)', assignedEdit.status === 403, JSON.stringify(assignedEdit.json));

  // TEST 15c: admin deletes a QR -> record gone, public URL dead, delete is admin-only.
  const nonAdminDelete = await api('DELETE', `/api/admin/qr/${c3}`, { token: ayan });
  check('TEST 15c: non-admin cannot delete a QR (403)', nonAdminDelete.status === 403, JSON.stringify(nonAdminDelete.json));
  const del = await api('DELETE', `/api/admin/qr/${c3}`, { token: adminToken });
  check('TEST 15d: admin deletes a QR (200)', del.status === 200 && del.json.deleted === true, JSON.stringify(del.json));
  const afterDelete = await api('GET', `/api/admin/qrcodes/${c3}`, { token: adminToken });
  check('TEST 15e: deleted QR is gone (404)', afterDelete.status === 404);
  const deletedPublic = await api('GET', `/api/q/${c3}`);
  check('TEST 15f: deleted QR public URL -> NOT_FOUND', deletedPublic.json.state === 'NOT_FOUND');
  const deleteMissing = await api('DELETE', `/api/admin/qr/${c3}`, { token: adminToken });
  check('TEST 15g: deleting a missing QR -> 404', deleteMissing.status === 404);

  // TEST 16: repeated wrong codes lock the QR against brute force.
  let lockReason = '';
  for (let i = 0; i < 5; i++) {
    const r = await api('POST', '/api/owner/qr/activate', { token: bob, body: { qrId: cLock, secret: 'ZZZZ-ZZZZ-ZZZZ-ZZ' } });
    lockReason = r.json.reason;
  }
  check('TEST 16: QR locks after repeated wrong codes', lockReason === 'LOCKED', lockReason);
  const lockedCorrect = await api('POST', '/api/owner/qr/activate', { token: bob, body: { qrId: cLock, secret: secret2[cLock] } });
  check('TEST 16b: even the correct code is refused while locked', lockedCorrect.status === 422 && lockedCorrect.json.reason === 'LOCKED');

  // ---- AUTH: validation, enumeration, brute force, recovery, disable --------

  // Duplicate username
  const dup = await api('POST', '/api/auth/register', { body: { name: 'Ayan2', username: 'ayan', password: 'secret12', confirmPassword: 'secret12', acceptedTerms: true } });
  check('AUTH: duplicate username rejected (409)', dup.status === 409);

  // Registration without agreeing to the Terms/Privacy is rejected.
  const noTerms = await api('POST', '/api/auth/register', { body: { name: 'NoTerms', username: 'noterms', password: 'secret12', confirmPassword: 'secret12' } });
  check('AUTH: registration without accepting terms rejected (400)', noTerms.status === 400);

  // Weak password (too short / no number)
  const weak = await api('POST', '/api/auth/register', { body: { name: 'Weak', username: 'weaky', password: 'abc', confirmPassword: 'abc' } });
  check('AUTH: weak password rejected (400)', weak.status === 400);

  // Password mismatch
  const mismatch = await api('POST', '/api/auth/register', { body: { name: 'Mm', username: 'mmuser', password: 'secret12', confirmPassword: 'secret99' } });
  check('AUTH: password mismatch rejected (400)', mismatch.status === 400);

  // Invalid username format
  const badName = await api('POST', '/api/auth/register', { body: { name: 'Bad', username: 'Bad Name!', password: 'secret12', confirmPassword: 'secret12' } });
  check('AUTH: invalid username format rejected (400)', badName.status === 400);

  // Wrong password + nonexistent user -> identical generic message (no enumeration)
  const wrongPw = await api('POST', '/api/auth/login', { body: { username: 'bob', password: 'nope1234' } });
  const noUser = await api('POST', '/api/auth/login', { body: { username: 'ghost', password: 'nope1234' } });
  check('AUTH: wrong password -> generic 401', wrongPw.status === 401 && wrongPw.json.error === 'Invalid username or password');
  check('AUTH: nonexistent user -> same generic 401', noUser.status === 401 && noUser.json.error === wrongPw.json.error);

  // Brute force: register a victim, fail 5x -> locked (429)
  await api('POST', '/api/auth/register', { body: { name: 'Vic', username: 'victim', password: 'secret12', confirmPassword: 'secret12', acceptedTerms: true } });
  let lockedStatus = 0;
  for (let i = 0; i < 5; i++) {
    const r = await api('POST', '/api/auth/login', { body: { username: 'victim', password: 'wrongpw1' } });
    lockedStatus = r.status;
  }
  const afterLock = await api('POST', '/api/auth/login', { body: { username: 'victim', password: 'secret12' } });
  check('AUTH: account locks after repeated failures (429)', afterLock.status === 429, JSON.stringify(afterLock.json));

  // Recovery: forgot-password always generic
  const forgotKnown = await api('POST', '/api/auth/forgot-password', { body: { username: 'ayan' } });
  const forgotUnknown = await api('POST', '/api/auth/forgot-password', { body: { username: 'ghost' } });
  check('AUTH: forgot-password generic for known user (200)', forgotKnown.status === 200 && !!forgotKnown.json.message);
  check('AUTH: forgot-password identical for unknown user', forgotUnknown.status === 200 && forgotUnknown.json.message === forgotKnown.json.message);

  // Reset: issue a real token for ayan (as the mailer would deliver) and use it
  const ayanUser = reg.json.user;
  const rawToken = await issueResetToken(ayanUser.uid);
  const badReset = await api('POST', '/api/auth/reset-password', { body: { token: 'garbage', password: 'newpass12', confirmPassword: 'newpass12' } });
  check('AUTH: reset with bad token rejected (400)', badReset.status === 400);
  const goodReset = await api('POST', '/api/auth/reset-password', { body: { token: rawToken, password: 'newpass12', confirmPassword: 'newpass12' } });
  check('AUTH: reset with valid token succeeds (200)', goodReset.status === 200);
  const reused = await api('POST', '/api/auth/reset-password', { body: { token: rawToken, password: 'newpass34', confirmPassword: 'newpass34' } });
  check('AUTH: reset token is single-use (400)', reused.status === 400);
  const loginNew = await api('POST', '/api/auth/login', { body: { username: 'ayan', password: 'newpass12' } });
  check('AUTH: can log in with the new password', loginNew.status === 200 && !!loginNew.json.token);

  // Disable: admin disables bob -> bob can't log in and is kicked off authed routes
  const disable = await api('PUT', `/api/admin/users/${reg2.json.user.uid}/disable`, { token: adminToken });
  check('AUTH: admin disables a user (200)', disable.status === 200 && disable.json.disabled === true);
  const bobBlocked = await api('GET', '/api/owner/qrcodes', { token: bob });
  check('AUTH: disabled user blocked on authed route (403)', bobBlocked.status === 403);
  const bobLogin = await api('POST', '/api/auth/login', { body: { username: 'bob', password: 'secret12' } });
  check('AUTH: disabled user cannot log in (403)', bobLogin.status === 403);
  const enable = await api('PUT', `/api/admin/users/${reg2.json.user.uid}/enable`, { token: adminToken });
  const bobLogin2 = await api('POST', '/api/auth/login', { body: { username: 'bob', password: 'secret12' } });
  check('AUTH: re-enabled user can log in again (200)', enable.status === 200 && bobLogin2.status === 200);

  // Admin can't disable self
  const selfDisable = await api('PUT', `/api/admin/users/${adminLogin.json.user?.uid || ''}/disable`, { token: adminToken });
  check('AUTH: admin cannot disable own account (400)', selfDisable.status === 400);

  // ---- Original edge cases --------------------------------------------------
  const notFound = await api('GET', '/api/q/ZZZZZZZZ');
  check('EDGE: nonexistent QR -> NOT_FOUND', notFound.json.state === 'NOT_FOUND');
  const notActivated = await api('GET', `/api/q/${qr2}`);
  check('EDGE: unactivated QR -> NOT_ACTIVATED', notActivated.json.state === 'NOT_ACTIVATED');
  const noItem = await api('POST', '/api/owner/qr/activate', { token: bob, body: { qrId: `${qr2}`, secret: secretOf[qr2] } });
  const noItemView = await api('GET', `/api/q/${qr2}`);
  check('EDGE: activated but no item -> NO_ITEM', noItem.status === 201 && noItemView.json.state === 'NO_ITEM');
  const adminDisableQr = await api('PUT', `/api/admin/qr/${qr3}/disable`, { token: adminToken });
  const disabledView = await api('GET', `/api/q/${qr3}`);
  check('EDGE: disabled QR -> DISABLED', adminDisableQr.status === 200 && disabledView.json.state === 'DISABLED');
  const noAuth = await api('GET', '/api/owner/qrcodes');
  check('EDGE: owner route needs auth (401)', noAuth.status === 401);
  const notAdmin = await api('GET', '/api/admin/users', { token: loginNew.json.token });
  check('EDGE: admin route blocks non-admin (403)', notAdmin.status === 403);
  const stats = await api('GET', '/api/admin/stats', { token: adminToken });
  // 8 generated (4 + 4) minus two deleted (qr4 in the photo workflow, one in TEST 15d) = 6.
  check('EDGE: admin stats computed', stats.status === 200 && stats.json.qr.total === 6, JSON.stringify(stats.json));
  const img = await fetch(base + `/api/qr/${qr1}/image.png`);
  check('EDGE: QR PNG generated', img.status === 200 && img.headers.get('content-type') === 'image/png');

  // Rate limit on photo writes (20/min/user). Use a fresh user so no earlier test
  // pollutes the window; the limiter runs before ownership checks, so a bogus QR
  // still counts. The 21st request in the window is throttled.
  const rlReg = await api('POST', '/api/auth/register', {
    body: { name: 'Rlimit', username: 'rlimit', password: 'secret12', confirmPassword: 'secret12', acceptedTerms: true },
  });
  const rlTok = rlReg.json.token;
  let sawThrottle = false;
  let firstNot429 = true;
  for (let i = 0; i < 21; i++) {
    const r = await apiUpload(`/api/owner/items/QR-RL000001/photo`, rlTok, { filename: 'p.png', contentType: 'image/png', bytes: PNG_1x1 });
    if (i < 20 && r.status === 429) firstNot429 = false;
    if (i === 20) sawThrottle = r.status === 429;
  }
  check('EDGE: photo rate limit first 20 not throttled', firstNot429);
  check('EDGE: photo rate limit trips on 21st (429)', sawThrottle);

  // ---- USER QR DELETION (release): owner drops their own QR ----------------
  // Deleting releases the id back to AVAILABLE (not a hard delete) and wipes the
  // user's linked data. Uses fresh QRs so the stats count above stays correct.
  const genD = await api('POST', '/api/admin/qr/generate', { token: adminToken, body: { count: 3 } });
  const [d1, d2, d3] = genD.json.created;
  const secretD = Object.fromEntries(genD.json.secrets.map((s) => [s.qrId, s.secret]));

  // d1: happy path — activate, register an item, delete -> released + re-usable.
  await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: d1, secret: secretD[d1] } });
  await api('PUT', `/api/owner/items/${d1}`, { token: ayan, body: { name: 'Keys' } });
  const delD1 = await api('DELETE', `/api/owner/qr/${d1}`, { token: ayan });
  check('DELETE: owner deletes own QR -> 200 deleted', delD1.status === 200 && delD1.json.deleted === true, JSON.stringify(delD1.json));
  const d1View = await api('GET', `/api/admin/qrcodes/${d1}`, { token: adminToken });
  check('DELETE: released QR is AVAILABLE, no owner, no item', d1View.json.qr.status === 'AVAILABLE' && !d1View.json.owner && !d1View.json.item, JSON.stringify(d1View.json));
  const reuseD1 = await api('POST', '/api/owner/qr/activate', { token: bob, body: { qrId: d1, secret: secretD[d1] } });
  check('DELETE: released QR can be re-activated with its code', reuseD1.status === 201 && reuseD1.json.status === 'ACTIVATED', JSON.stringify(reuseD1.json));

  // d2: ownership + LOST guard.
  await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: d2, secret: secretD[d2] } });
  await api('PUT', `/api/owner/items/${d2}`, { token: ayan, body: { name: 'Wallet' } });
  const delNotOwner = await api('DELETE', `/api/owner/qr/${d2}`, { token: bob });
  check('DELETE: non-owner cannot delete (403)', delNotOwner.status === 403, JSON.stringify(delNotOwner.json));
  await api('PUT', `/api/owner/items/${d2}/status`, { token: ayan, body: { status: 'LOST' } });
  const delLost = await api('DELETE', `/api/owner/qr/${d2}`, { token: ayan });
  check('DELETE: blocked while item LOST (409 ITEM_LOST)', delLost.status === 409 && delLost.json.reason === 'ITEM_LOST', JSON.stringify(delLost.json));
  await api('PUT', `/api/owner/items/${d2}/status`, { token: ayan, body: { status: 'RECOVERED' } });
  const delAfterFound = await api('DELETE', `/api/owner/qr/${d2}`, { token: ayan });
  check('DELETE: allowed once marked found', delAfterFound.status === 200 && delAfterFound.json.deleted === true, JSON.stringify(delAfterFound.json));

  // d3: admin-DISABLED guard.
  await api('POST', '/api/owner/qr/activate', { token: ayan, body: { qrId: d3, secret: secretD[d3] } });
  await api('PUT', `/api/admin/qr/${d3}/disable`, { token: adminToken });
  const delDisabled = await api('DELETE', `/api/owner/qr/${d3}`, { token: ayan });
  check('DELETE: blocked when admin-DISABLED (409 DISABLED)', delDisabled.status === 409 && delDisabled.json.reason === 'DISABLED', JSON.stringify(delDisabled.json));

  console.log(`\n${pass} passed, ${fail} failed`);
} catch (e) {
  console.error('Test run crashed:', e);
  fail++;
} finally {
  server.close();
  process.exit(fail === 0 ? 0 : 1);
}
