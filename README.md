# TagBack

TagBack — a QR-based lost & found platform. The business pre-generates physical QR stickers, sells them,
and owners activate + register items to them. Each sticker encodes **only** a permanent URL
(`/q/A7K2P9XQ`); everything shown when it is scanned is resolved dynamically from the database,
so the same physical sticker works across an item's whole life: `ACTIVE → LOST → RECOVERED`.

## Stack

| Layer    | Tech |
|----------|------|
| Backend  | Node + Express (REST API) |
| Frontend | React + Vite + React Router |
| Database | Firebase Firestore (via `firebase-admin`) — with a zero-setup in-memory fallback for dev/tests |
| Auth     | Username + password, custom JWT (bcrypt hashes in Firestore); role-based admin; lockout + password reset |
| QR images| `qrcode` (backend-generated PNG/SVG) |

## Roles

- **Owner** — buys a QR, activates it, registers an item, customizes the public page, marks lost/found.
- **Finder** — scans a QR (no account). Sees the public page; can reach the owner via the contact details (email, phone, link) they published, when the item is lost.
- **Admin** — pre-generates QR inventory, views users/items/stats, disables/enables QR codes.

---

## Quick start (zero setup — in-memory DB)

```bash
# 1. Backend
cd server
npm install
npm run dev            # http://localhost:4000  (DB mode: memory; auto-seeds an admin)

# 2. Frontend (new terminal)
cd client
npm install
npm run dev            # http://localhost:5173  (proxies /api to :4000)
```

Open http://localhost:5173.

In **memory mode** the server auto-seeds an admin on boot:

- username: `admin`
- password: `admin12345`

> Accounts log in with **username + password** (no email required). Signup collects full name,
> username, password, and an optional recovery email used for password resets.

> Memory mode keeps data in RAM only — it resets on restart. Great for demos and the automated
> tests. Use Firestore (below) to persist data.

### First run walkthrough
1. Log in as the admin → **Admin → QR Inventory → Generate QR codes** (creates random ids like `A7K2P9XQ`,
   each with a one-time **activation code** shown once — save/print it with the product).
2. Register a normal account, **Activate a QR** with the id printed on the sticker **plus** that activation
   code. The QR id alone (which finders can see) never grants ownership. No code? Submit a request for an
   admin to approve. Admins can also assign a QR to a user immediately from the inventory drawer.
3. Register the item, **Customize** the page + set which contact details are public.
4. **Mark as Lost**, then open the public page (View → *Open public page*, or `/q/A7K2P9XQ`).

---

## Using real Firebase Firestore

1. Create a Firebase project and a **service account** key (Project settings → Service accounts → Generate key).
2. In `server/`, copy `.env.example` to `.env` and set either:
   - `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json`, or
   - `FIREBASE_SERVICE_ACCOUNT={...}` (the JSON on one line) + `FIREBASE_PROJECT_ID=...`
   and set `DB_MODE=cloud` (or just providing credentials is enough).
3. Seed an admin: `npm run seed:admin`.
4. `npm run dev`.

### Or the Firestore emulator (offline, persistent-ish)
```bash
npm install -g firebase-tools
firebase emulators:start --only firestore      # defaults to localhost:8080
# server/.env:
#   FIRESTORE_EMULATOR_HOST=localhost:8080
#   FIREBASE_PROJECT_ID=demo-lostfound
npm run seed:admin && npm run dev
```

No Firestore `collectionGroup` or composite indexes are required — all queries are single-field
equality (`where('field','==',value)`), so it works on the free tier and the emulator as-is.

---

## Deployment notes

- Set `PUBLIC_BASE_URL` to your real domain so generated QR images encode the right URL.
- **Item photos:** stored by a pluggable adapter (`config/storage.js`). Precedence when no
  `STORAGE_MODE` is set: **Cloudinary** (if `CLOUDINARY_URL`, or the cloud-name/key/secret trio, are
  configured) → **Firebase Cloud Storage** (`gcs`, if the DB is in cloud mode and a bucket exists) →
  **local disk** (`server/uploads`, dev default). Force one with `STORAGE_MODE=cloudinary|gcs|local`.
  The item record stores the image's secure URL (for display) plus an opaque storage key (Cloudinary
  `public_id` / GCS object path / local filename); replacing a photo or deleting an item/QR cleans up
  the old image. A configured cloud backend that fails its startup check degrades to local disk with a
  warning (never breaks uploads). The Cloudinary API secret is used server-side only — never logged or
  sent to the client. `GET /api/health` reports the active `storageMode` (so the UI can warn that
  `local` files won't survive a redeploy).
- **Photo sources & processing (server):** an owner can set the item photo by device upload
  (`POST /owner/items/:qrId/photo`, multipart) or by **image URL** (`POST /owner/items/:qrId/photo-url`,
  JSON `{ url }`). URL imports are downloaded server-side with SSRF protection — http(s) only, no embedded
  credentials, private/loopback/link-local/reserved IPs blocked (including redirect hops, literal-IP hosts,
  and DNS-rebinding via a pinned `lookup`), a hard size cap, a timeout, and a magic-byte image check. Both
  sources share one pipeline: image-signature validation (the client mimetype is never trusted),
  sha256 **de-dup** (an identical re-upload is a no-op), then on Cloudinary the stored master is downscaled
  to fit 1600px (aspect + transparency preserved), re-encoded at `q_auto`/`f_auto`, EXIF/GPS stripped and
  auto-oriented, with a square thumbnail generated once (eager). Transient Cloudinary failures are retried
  with backoff; if the DB write fails after an upload the new asset is deleted and the old photo is kept —
  success is reported only when both storage and DB succeed. Photo writes are rate-limited per user
  (20/min). All of this preserves the single-photo schema and the LOST/RECOVERED + privacy rules.
  *(The camera-capture / multi-select / URL-import front-end is the next pass; these endpoints are the API it will use.)*
- Build the client (`cd client && npm run build`); the Express server auto-serves `client/dist`
  with history fallback, so `/q/...` deep links resolve. You can host the whole thing as one service.
- Set a strong `JWT_SECRET` and your `CORS_ORIGINS`.

---

## Testing

End-to-end API test (runs the real Express app over HTTP, in memory, no setup):

```bash
cd server
npm run test:e2e
```

Covers the full spec flow and edge cases: QR generation, activation (incl. duplicate-activation
rejection), item registration, customization, the privacy gate (private contact hidden unless
LOST + opted-in), lost→recovered transitions on the same URL, finder messaging, cross-user
authorization (403), disabled/unactivated/no-item/nonexistent states, and admin role enforcement.

## Project structure

```
server/
  src/
    config/firebase.js        3-mode Firestore selector + memory adapter
    config/storage.js         image storage adapter (local disk / Firebase Cloud Storage)
    lib/                      jwt, ids (random 8-char QR ids), qrimage, constants
    middleware/               auth (JWT), admin (role), validate (zod), error
    services/                 users, qrcodes, items, customizations, contacts
    routes/                   auth, owner, public, admin
  scripts/                    seedAdmin.js, e2e.js
client/
  src/
    components/ItemPageTemplate.jsx   shared by live preview + public page
    pages/                    Login, Register, Dashboard, ActivateQr, ItemEdit,
                              Customize, QrView, PublicQr, admin/*
```

## Security &amp; privacy highlights

- Owners can only read/modify their own QR codes, items, customizations and status (ownership
  checks → 403 otherwise). Admin routes require the `admin` role.
- **Ownership = proof of possession, not knowledge of the QR id.** Each QR carries a secret
  activation code stored only as an HMAC (keyed by the QR id + a server pepper) and verified in
  constant time; the plaintext is shown once at generation, to be printed *with the product* (not in
  the scannable QR). Self-serve activation needs id **+** code; without the code a user files a request
  that an admin approves/rejects; admins can also assign immediately. Bad-code attempts are throttled
  per QR (lockout window) to stop brute force. States: `AVAILABLE → PENDING → ACTIVATED / DISABLED`,
  with claim outcomes `PENDING / APPROVED / REJECTED`.
- QR activation, claim review and id generation run in Firestore transactions → no duplicate
  activation / claim race / id clash.
- The QR encodes only the permanent URL — never owner/item/contact data, and never the activation code.
- The public endpoint exposes only contact fields the owner explicitly opted to show, and only
  while the item is LOST. User ids and password hashes never leave the server.
- All write endpoints validate input with zod.
```
