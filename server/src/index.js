import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mode as dbMode } from './config/firebase.js';
import { storageMode } from './config/storage.js';
import authRoutes from './routes/auth.js';
import ownerRoutes from './routes/owner.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { notFound, errorHandler } from './middleware/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins.length ? origins : true }));
  app.use(express.json({ limit: '1mb' }));

  // Serve uploaded item photos.
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.get('/api/health', (req, res) => res.json({ ok: true, dbMode, storageMode }));

  app.use('/api/auth', authRoutes);
  app.use('/api/owner', ownerRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes); // /api/public/... and /api/qr/...

  // Optionally serve the built React SPA (production) with history fallback so deep links
  // like /q/QR-000001 resolve to index.html. No-op if the client hasn't been built.
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    app.use(notFound);
  }

  app.use(errorHandler);
  return app;
}

// Start only when run directly (not when imported by tests).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  // In memory mode, auto-seed an admin so the demo is usable without a separate process.
  if (dbMode === 'memory') {
    const { findByUsername, createUser } = await import('./services/users.js');
    const { ROLE } = await import('./lib/constants.js');
    const username = (process.env.SEED_ADMIN_USERNAME || 'admin').toLowerCase();
    if (!(await findByUsername(username))) {
      await createUser({
        username,
        password: process.env.SEED_ADMIN_PASSWORD || 'admin12345',
        name: process.env.SEED_ADMIN_NAME || 'System Admin',
        role: ROLE.ADMIN,
      });
      console.log(`[server] memory mode: seeded admin ${username}`);
    }
  }
  const port = process.env.PORT || 4000;
  createApp().listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}  (DB mode: ${dbMode})`);
  });
}
