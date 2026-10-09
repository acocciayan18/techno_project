# Firebase / Firestore setup

The server runs in one of three DB modes, chosen in `server/.env`. Default is **memory**
(no Firebase needed). Switch to Firestore with either option below.

Files already scaffolded for you:

| File | Purpose |
|------|---------|
| `server/.env` | mode + secrets (gitignored; JWT secret pre-generated) |
| `server/serviceAccount.example.json` | template for your cloud key |
| `firestore.rules` | denies all direct client access (all access is via the backend) |
| `firebase.json` | emulator ports + rules path |
| `.firebaserc` | your project id (replace `your-project-id`) |

---

## Option B — real Firebase Firestore (cloud)

1. Go to <https://console.firebase.google.com> → **Add project** (any name).
2. Left sidebar → **Build → Firestore Database → Create database** → *Production mode* → pick a region.
3. **Project settings (gear) → Service accounts → Generate new private key.** A JSON downloads.
4. Save that file as **`server/serviceAccount.json`** (exact name; it's gitignored).
5. Edit `server/.env`:
   ```ini
   # comment this out:
   # DB_MODE=memory
   # uncomment these:
   DB_MODE=cloud
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
   ```
6. Create the admin user, then run:
   ```bash
   cd server
   npm run seed:admin
   npm run dev
   ```
   Health check should show `"dbMode":"cloud"`: <http://localhost:4000/api/health>
7. (Optional, recommended) publish the lockdown rules so nobody hits Firestore directly:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use your-project-id           # or edit .firebaserc first
   firebase deploy --only firestore:rules
   ```

> Alternative to the file: paste the key JSON (one line) into `.env` as
> `FIREBASE_SERVICE_ACCOUNT={...}` and set `DB_MODE=cloud`. Use one method, not both.

---

## Option C — Firestore emulator (local, no cloud project)

```bash
npm install -g firebase-tools
firebase emulators:start --only firestore      # Firestore on :8080, UI on :4001
```

In `server/.env`:
```ini
# DB_MODE=memory        <- comment out
DB_MODE=emulator
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_PROJECT_ID=demo-lostfound
```

Then `npm run seed:admin && npm run dev`. Health check shows `"dbMode":"emulator"`.

---

## Making an account an admin (manual, in Firestore)

Admin is just a field on the user document. To promote any account:

| What | Value |
|------|-------|
| Collection | `users` |
| Document | the account's auto-generated doc id (the `uid`) |
| Field | `role` |
| Value | `admin`  *(string; normal accounts have `user`)* |

**Document path:** `users/{uid}` → set field `role` = `admin`.

Steps in the Firebase console:

1. **Firestore Database → `users` collection.**
2. Find the account's document. Each doc's id is the `uid`; the human-readable
   `username` is a field inside it, so scan for the `username` you want (e.g. `ayan`).
3. Click the `role` field and change its value from `admin`/`user` → **`admin`** (string).
   If the field is missing, **Add field** → name `role`, type `string`, value `admin`.
4. Save. The change takes effect on that user's next login (a new JWT carries the role).
   If they're already logged in, have them log out and back in.

To demote, set `role` back to `user`.

> Prefer a seeded admin instead? Set `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` in
> `server/.env`, then `npm run seed:admin`.

## Notes

- Queries use only single-field equality — **no composite indexes required**.
- The browser never talks to Firestore directly; the Express backend uses the Admin SDK (which
  bypasses `firestore.rules`), so the deny-all rules are safe and intentional.
- Never commit `server/serviceAccount.json` or `server/.env` (both gitignored).
