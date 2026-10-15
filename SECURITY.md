# TagBack — Security & Real-Time Notes

Covers the abuse / rate-limiting hardening and the real-time (SSE) layer, plus the
protections that already existed and the risks that remain. Audience: whoever
deploys and maintains the backend.

---

## 1. Rate limiting & abuse protection

### How the limiter works
`server/src/middleware/rateLimit.js` is a fixed-window counter, keyed by a
**bucket** (per route) plus an **identity**:

- `keyBy: 'user'` — the authenticated account (uid from the signed JWT). Cannot be
  escaped by refreshing, opening new tabs, or calling the API directly; all share
  the one key.
- `keyBy: 'ip'` — the client IP, for endpoints hit before login. Correct **only**
  when `trust proxy` is set in production (see §5).

Limits are deliberately generous — a backstop against scripts and runaway loops,
sized so no realistic human workflow is throttled. They are **not** the primary
guarantee for any flow; the hard guards (account lockout, per-QR activation
lockout, ownership checks) stand on their own.

### Applied limits

| Area | Endpoint(s) | Key | Limit |
|------|-------------|-----|-------|
| Login | `POST /api/auth/login` | IP | 100 / 15 min |
| Registration | `POST /api/auth/register` | IP | 30 / hour |
| Password reset request | `POST /api/auth/forgot-password` | IP | 30 / 15 min |
| Password reset submit | `POST /api/auth/reset-password` | IP | 30 / 15 min |
| QR activation | `POST /api/owner/qr/activate` | user | 40 / 15 min |
| Claim request | `POST /api/owner/qr/claim-request` | user | 30 / hour |
| Photo write | `POST /api/owner/items/:id/photo[-url]` | user | 20 / min |
| Finder "found" report | `POST /api/q/:id/found` | IP | 5 / min |
| Public read | `GET /api/q/:id`, `/api/qr/:id/image.{png,svg}`, `/api/qr/:id/url` | IP | 240 / min |
| SSE connect | `GET /api/stream` | IP | 120 / min |
| Self endpoints | `GET /api/auth/me`, `PUT /api/auth/me/settings` | user | 120 / min |
| **Everything else (owner)** | all `/api/owner/*` | user | 480 / min |
| **Everything else (admin)** | all `/api/admin/*` | user | 480 / min |

The two global backstops cover "rapid clicking", repeated editing, and any
endpoint without a dedicated limit, keyed per account. The **public-read** limiter
closes the last unauthenticated surface that had no cap; the **self** limiter covers
the two authed endpoints on the auth router (which has no per-account global cap of
its own). SSE also has a **per-account concurrent-connection cap** (see §3).

### Abuse vectors and how each is addressed
- **Login brute force** — per-account lockout (5 fails → 15 min) in
  `services/users.js`, independent of IP; plus the per-IP login cap to blunt
  username spray. Responses are identical for unknown-user vs wrong-password (no
  enumeration).
- **Mass / multi-account creation** — a layered signup guard (see §1a) sits on top
  of the per-IP registration cap: bot heuristics (honeypot + submit timing), an
  optional CAPTCHA, canonical-email de-duplication (defeats gmail dot/`+tag`
  aliasing), and a strike-based cooldown keyed on **both** IP and recovery email.
  Usernames remain unique and case-folded so `Ayan`/`ayan` can't become two accounts.
- **Password-reset / email bombing** — per-IP caps on request + submit; the
  forgot-password response is generic regardless of whether the account or its
  recovery email exists. Reset tokens are 256-bit, single-use, hashed at rest,
  1-hour TTL.
- **QR activation-code brute force** — per-QR lockout (5 wrong codes → 15 min) in
  `qrcodes.activate()`, **plus** a per-user cap so an attacker can't sidestep the
  per-QR counter by spreading attempts across many QR ids. Codes are high-entropy
  and compared in constant time against an HMAC (never stored in clear).
- **Claim-queue flooding** — per-user cap on claim requests.
- **File upload abuse** — 5 MB cap (device + URL import), mimetype allowlist,
  magic-byte signature re-check (a spoofed `.png` is rejected), identical-bytes
  dedupe, and a per-user write cap. URL import is SSRF-guarded (scheme/credential
  checks, private-IP + redirect + DNS-rebinding blocks, timeout, size cap).
- **Duplicate submissions** — found-reports de-dupe server-side while unread;
  photo re-uploads of identical bytes are idempotent.
- **Public scraping / id-enumeration** — the QR id space is 36^8 (≈2.8e12), so
  guessing an active id is already infeasible; the per-IP public-read cap bounds
  sweep rate and QR-image CPU cost on top of that. No private data (serial numbers,
  hidden contact fields, owner identity) is ever on a public response regardless of
  item/QR state.
- **SSE connection exhaustion** — a per-IP connect limiter bounds handshake churn
  (each handshake costs a live-user DB lookup) and a per-account concurrent cap
  (`SSE.MAX_CONN_PER_USER = 12`, `lib/events.js`) bounds held sockets — the oldest is
  dropped so a new tab always connects. Together they stop fd/memory exhaustion from
  a client or a script holding a valid token.

### 1a. Account-abuse prevention (signup)

Registration is the one endpoint where a raw per-IP counter is the *wrong* primary
guard — it would punish a shared NAT (a classroom, an office) of honest signups
while an attacker rotates IPs to stay under it. So the real protection is a layered
guard (`routes/auth.js` → `services/signupGuard.js`, `lib/captcha.js`, `lib/email.js`)
that targets the abuse *signature*, not signup volume. Every check runs **server-side**;
the client fields are only hints the server re-derives or ignores.

| Layer | What it catches | Behaviour |
|-------|-----------------|-----------|
| Per-IP rate limit (existing) | Raw signup floods | 30/hr/IP, 429 |
| Honeypot field (`website`) | Automated form-fillers | Hidden from humans; any value → refused |
| Submit timing (`elapsedMs`) | Scripted insta-submits | Below `ABUSE.MIN_FORM_FILL_MS` → refused |
| CAPTCHA (optional) | Headless bots | Enforced only when `CAPTCHA_SECRET` set; fails closed |
| Canonical-email de-dupe | Same inbox, many "emails" | gmail dots + `+tag` folded; raw + canonical both checked |
| Strike cooldown | Repeated blocked attempts | 5 strikes/hr on a signal → 1 hr refusal |

Design choices that protect legitimate users:

- **Fail-open bot fields.** Honeypot and timing are only acted on when present and
  bad. An API client or older build that omits them is never blocked by them alone,
  so normal registration keeps working.
- **Strikes count only *bad* attempts** (bot signal, failed CAPTCHA, duplicate
  recovery email) — never successful or merely username-taken signups. A burst of
  real signups records zero strikes, so a shared IP is never thrown into cooldown.
- **Not IP-alone.** A strike is recorded against the IP **and** the canonical
  recovery email, so rotating only one of them doesn't escape the cooldown.
- **Vague refusal message.** A tripped bot/CAPTCHA/cooldown check returns a generic
  "couldn't process this sign-up" — it never reveals which layer fired, so a script
  can't tune around it, while real duplicate-username / duplicate-email errors stay
  specific and field-mapped so a human can fix them.
- **Existing accounts untouched.** The canonical-email field is written going
  forward; the duplicate check also matches the raw address, so accounts saved
  before the field existed are still caught without a migration.

The strike counters are process-local (same single-instance caveat as the rate
limiter and SSE registry — see §5.2); move to a shared store before scaling out.

### Input validation
Every mutating route validates its body with a zod schema (`middleware/validate.js`)
and enforces the length ceilings in `lib/constants.js → TEXT_LIMITS`. JSON bodies
are capped at 1 MB.

---

## 2. Authentication & authorization (already in place, verified)
- JWT bearer tokens (7-day expiry), re-checked against the **live** user on every
  request — a deleted or disabled account is rejected immediately even with a
  still-valid token.
- Tokens carry a per-account `tokenVersion`; a password change (admin edit or
  self-reset) bumps it (`services/users.js`), so every JWT minted before the change
  is rejected by `requireAuth` **and** the SSE handshake. Open sessions are kicked
  live on an admin password change; a self-reset invalidates the old token on its
  next request. Legacy tokens/accounts default to version 0 on both sides, so the
  check is inert until a password actually changes.
- Owner routes enforce `qr.ownerUid === req.user.uid` on every read and write.
- Admin routes require role `admin`; there is **no** admin direct-assignment path —
  ownership comes only from the owner's code or admin approval of a filed claim.
- Passwords hashed with bcrypt. Activation-code HMAC is peppered (server-only).
- **New:** the server refuses to start in a production-shaped deploy
  (`NODE_ENV=production` or `DB_MODE=cloud`) if `JWT_SECRET` is missing, the dev
  default, or under 32 chars — a known signing key would let anyone forge an admin
  token.

No CSRF protection is needed: auth is a bearer token in the `Authorization`
header, not a cookie, so there is no ambient credential for a cross-site request to
abuse.

---

## 3. Real-time synchronization (SSE)

`GET /api/stream` is a Server-Sent Events channel, one per signed-in tab
(`server/src/routes/stream.js`, bus in `server/src/lib/events.js`; client in
`client/src/lib/realtime.js`).

**What updates live** (no manual refresh): finder "found" notifications & the bell
badge; the admin activation-request queue and its badge; QR status changes
(ACTIVE/LOST/RECOVERED, activate, admin disable/enable/delete); item edits and
customization/contact edits; owner dashboard and admin inventory/stats/items/users
(including the open admin QR drawer and user drawer); new signups (admin table +
stat); and the signed-in account itself via the `me` resource — a theme change syncs
to the user's other tabs, and an admin editing a user's name/username reflects in that
user's live session. Changes propagate across a user's own devices, to admins, and
between users (e.g. admin approves → claimant's dashboard updates).

**Public finder page.** `/q/:id` is served to **anonymous** finders, who hold no token
and open no SSE stream, so it can't be nudged. Instead `PublicQr.jsx` **polls every
15 s** while open, so an owner marking the item found/lost (or editing its info)
reaches an already-open finder page without a manual reload (~15 s staleness). The
page carries no private data regardless of state (see §1), so the poll exposes nothing
a single fetch wouldn't. No unauthenticated SSE endpoint is introduced.

**Security model.** The stream never carries record data — only "resource X
changed" nudges. The client then refetches through the normal authenticated REST
endpoints, so the stream can't leak anything a client couldn't already load, and
all authorization stays on the existing routes. Events are addressed to a specific
uid or to admins only; a user is never sent another account's nudge.

**Auth.** EventSource can't send an `Authorization` header, so the JWT is passed as
`?token=` and verified with the same secret and the same live-user re-check as
`requireAuth` (disabled/deleted accounts can't open or keep a stream). When an
admin disables an account, its open streams are closed and the client ends the
session immediately (`kick` event), not just on its next REST call.

**Connection limits.** Reconnect attempts are rate-limited per IP (`RATE_LIMIT.STREAM`,
120/min) since each handshake runs a live-user DB lookup, and the number of streams
held open for one account is capped (`SSE.MAX_CONN_PER_USER = 12`); when exceeded the
oldest socket is closed so the newest tab still connects. These bound both reconnect
churn and socket/fd exhaustion without affecting a normal multi-tab/multi-device user.

**Connection handling.** The browser auto-reconnects (server sends `retry: 5000`);
on each reconnect the client revalidates all cached resources to reconcile anything
missed during the outage (SSE has no replay). A heartbeat comment every 25 s keeps
idle proxies from closing the socket. If the stream is unavailable (old browser,
SSE-stripping proxy), the app still works — the existing stale-while-revalidate
cache and the 60 s notifications poll are unchanged; real-time only makes updates
appear sooner.

---

## 4. Testing
- `cd server && npm run test:e2e` — 165 checks over the full HTTP surface, incl. the
  rate-limit trips (activation per-user, claim per-user, registration per-IP,
  **public-read per-IP**), the **signup-abuse layer** (honeypot, submit-timing,
  canonical-email de-dupe, strike cooldown, and that a well-formed signup with the
  anti-bot fields still succeeds), the **SSE per-account connection cap**, and all
  pre-existing authz / lockout / SSRF / enumeration tests. Runs in-process against
  the memory DB (zero setup).
- Real-time path verified end-to-end (stream auth, owner notification nudge, live
  kick on disable) during development against the memory DB.
- `cd client && npm test` — component tests pass; `npm run build` succeeds.

---

## 5. Remaining risks & recommendations

1. **`TRUST_PROXY` must be set in production.** The per-IP limits (login, register,
   forgot/reset, finder report, **public read**, **SSE connect**) key on `req.ip`.
   Behind a proxy (Render/Fly/Nginx) without `TRUST_PROXY=<hops>`, every request
   looks like it comes from the proxy and the IP limits collapse into one shared
   bucket. Set it to the hop count (Render/Fly = 1). Never set it when the app is
   directly internet-facing — that lets clients spoof `X-Forwarded-For`. See
   `server/.env.example`.
2. **Single-instance only.** Both the rate-limit counters and the SSE connection
   registry live in process memory. On a horizontally scaled fleet, limits would be
   per-instance (looser than intended) and an event raised on instance A wouldn't
   reach a client connected to instance B. Move both to a shared store (Redis
   pub/sub + counters) before scaling out. Today the backend runs as one long-lived
   instance, so this is acceptable.
3. **SSE token in URL.** The stream passes the bearer token as a query param (SSE
   has no header support). It's the same token the client already holds, scoped
   identically and re-checked, but query strings can appear in proxy/access logs.
   Mitigations if that matters: a short-lived one-time stream ticket, or shorter
   JWT lifetimes. Keep stream access logs tight.
4. **Account-lockout as a nuisance DoS.** An attacker who knows a username can
   trip its 15-min login lockout by failing 5 times. This is the standard
   lockout tradeoff (it protects against password guessing); the per-IP login cap
   limits how fast it can be done at scale. Consider step-up (CAPTCHA) instead of a
   hard lock if targeted lockout becomes a problem.
5. **Serverless note.** Neither the in-memory limiter nor SSE survives a serverless
   model (per-invocation isolation, no long-lived connections). The backend is
   designed for a persistent host; keep it there, or swap in the shared-store +
   managed-pub/sub equivalents.
6. **Secrets hygiene.** Ensure `server/.env` (real JWT secret, SMTP, Cloudinary
   keys) is never committed — it's gitignored; rotate anything that has ever been
   shared.
