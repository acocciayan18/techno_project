// Chooses the Firestore backend based on environment, and exposes a uniform { db, FieldValue }.
//
//   DB_MODE=memory (or no cloud/emulator config)  -> in-memory store (zero setup)
//   FIRESTORE_EMULATOR_HOST set                    -> firebase-admin against the emulator
//   service account provided                       -> firebase-admin against real Firestore
//
// Services only use the common subset of the Firestore API, so all three are interchangeable.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createMemoryFirestore, FieldValue as MemoryFieldValue } from './memoryFirestore.js';

let db;
let FieldValue;
let mode;
// The initialized firebase-admin namespace when running against the emulator or
// real cloud, else null (memory mode never loads firebase-admin). The storage
// layer reuses this so it never re-initializes the app.
let adminApp = null;

function loadServiceAccount() {
  // Inline JSON wins; otherwise read the key file from GOOGLE_APPLICATION_CREDENTIALS.
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) {
    const abs = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  }
  return null;
}

function initAdmin() {
  // Lazy import so projects running in memory mode don't need firebase-admin resolved at load.
  return import('firebase-admin').then(({ default: admin }) => {
    if (!admin.apps.length) {
      if (process.env.FIRESTORE_EMULATOR_HOST) {
        // Emulator needs only a project id; no real credentials.
        admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-lostfound' });
      } else {
        const sa = loadServiceAccount();
        if (!sa) {
          throw new Error(
            'Cloud DB mode requires credentials: set GOOGLE_APPLICATION_CREDENTIALS to your ' +
              'serviceAccount.json path, or FIREBASE_SERVICE_ACCOUNT to the key JSON.'
          );
        }
        // Use the project the key actually belongs to (overridable via FIREBASE_PROJECT_ID).
        admin.initializeApp({
          credential: admin.credential.cert(sa),
          projectId: process.env.FIREBASE_PROJECT_ID || sa.project_id,
        });
      }
    }
    return admin;
  });
}

const wantsCloud =
  process.env.DB_MODE === 'cloud' ||
  !!process.env.FIREBASE_SERVICE_ACCOUNT ||
  !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
const wantsEmulator = process.env.DB_MODE === 'emulator' || !!process.env.FIRESTORE_EMULATOR_HOST;

if (wantsCloud || wantsEmulator) {
  mode = wantsEmulator ? 'emulator' : 'cloud';
  const admin = await initAdmin();
  adminApp = admin;
  db = admin.firestore();
  FieldValue = admin.firestore.FieldValue;
} else {
  mode = 'memory';
  db = createMemoryFirestore();
  FieldValue = MemoryFieldValue;
}

export { db, FieldValue, mode, adminApp };
