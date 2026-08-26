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

const app = express();
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/merchant', merchantRouter);
app.use('/api/admin', adminRouter);
app.use('/api/vehicles', vehicleRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/ai', aiRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`[journey-junction] API listening on, http://localhost:${env.PORT}`);
});
