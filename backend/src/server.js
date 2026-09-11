import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import authRouter from './routes/auth.js';
import userRouter from './routes/user.js';
import merchantRouter from './routes/merchant.js';
import adminRouter from './routes/admin.js';
import vehicleRouter from './routes/vehicles.js';
import bookingRouter from './routes/bookings.js';
import aiRouter from './routes/ai.js';
import { ensureSchema, refresh, seedIfEmpty, pool } from './db/store.js';

const app = express();

const origins = env.FRONTEND_ORIGINS;
const corsOptions = {
  origin: (origin, cb) => {
    // Same-origin requests (curl, server-to-server) have no Origin header — allow.
    if (!origin) return cb(null, true);
    if (origins.includes(origin) || origins.includes('*')) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  let dbStatus = 'down';
  try {
    const c = await pool().connect();
    try { await c.query('SELECT 1'); dbStatus = 'up'; }
    finally { c.release(); }
  } catch { dbStatus = 'down'; }
  res.json({ ok: dbStatus === 'up', db: dbStatus, ts: Date.now() });
});

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/merchant', merchantRouter);
app.use('/api/admin', adminRouter);
app.use('/api/vehicles', vehicleRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/ai', aiRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

async function boot() {
  try {
    await ensureSchema();
    await seedIfEmpty();
    await refresh();
    console.log('[journey-junction] DB schema ready, data snapshot loaded');
  } catch (e) {
    console.error('[journey-junction] DB init failed:', e.message);
    // Don't exit — keep the server up so /api/health reports db=down. Render will
    // surface this in logs and the route still serves a meaningful answer.
  }
  app.listen(env.PORT, () => {
    console.log(`[journey-junction] API listening on port ${env.PORT}`);
    console.log(`[journey-junction] CORS origins: ${origins.join(', ')}`);
  });
}

boot();
