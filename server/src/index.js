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
import streamRoutes from './routes/stream.js';
import { notFound, errorHandler } from './middleware/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Behind a reverse proxy / load balancer (Render, Fly, Nginx, …) the real client
  // IP is in X-Forwarded-For, not the socket. Our per-IP rate limits (login,
  // register, forgot/reset, finder "found" reports) key on req.ip, so this MUST be
  // set in prod or every request looks like it comes from the proxy and all IP
  // limits collapse into one shared bucket. Default off (direct connection in dev);
  // set TRUST_PROXY to the number of proxy hops in front of the app (Render = 1),
  // or 'true'/'false'. Never leave it 'true' when directly internet-facing — that
  // lets a client spoof X-Forwarded-For and forge its IP.
  const tp = process.env.TRUST_PROXY;
  if (tp !== undefined && tp !== '') {
    app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp === 'true');
  }

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
  app.use('/api', streamRoutes); // /api/stream (SSE real-time nudges)
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

// Fail fast if a real deployment is left on the dev-default JWT secret: a known
// signing key lets anyone forge a token for any user (including admin). Only
// enforced for a production-shaped deploy (NODE_ENV=production or cloud DB); dev /
// memory / the e2e suite keep working with zero config.
function assertSecrets() {
  const isProd = process.env.NODE_ENV === 'production' || dbMode === 'cloud';
  if (!isProd) return;
  const secret = process.env.JWT_SECRET || '';
  if (!secret || secret === 'change-me-to-a-long-random-secret' || secret.length < 32) {
    throw new Error(
      'Refusing to start: set a strong JWT_SECRET (32+ random chars) in production. ' +
        'The default/short secret lets tokens be forged.'
    );
  }
}

// Start only when run directly (not when imported by tests).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  assertSecrets();
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
