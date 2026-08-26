import { Router } from 'express';
import { z } from 'zod';
import { db, saveDB } from '../db/store.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { enrichBooking, paginate } from './bookings.js';

const router = Router();

router.post('/kyc/submit', verifyToken, requireRole('user'), (req, res, next) => {
  try {
    const schema = z.object({
      driving_license_front_url: z.string(),
      driving_license_back_url: z.string(),
      id_document_url: z.string(),
      id_document_type: z.string().min(2),
    });
    const data = schema.parse(req.body);
    const store = db();
    const u = store.users.find(x => x.id === req.user.sub);
    if (!u) return res.status(404).json({ error: 'User not found' });
    Object.assign(u, {
      driving_license_front_url: data.driving_license_front_url,
      driving_license_back_url: data.driving_license_back_url,
      driving_license_url: data.driving_license_front_url,
      id_document_url: data.id_document_url,
      id_document_type: data.id_document_type,
      kyc_status: 'pending',
    });
    saveDB(store);
    res.json({ ok: true, kyc_status: u.kyc_status });
  } catch (e) { next(e); }
});

router.get('/profile', verifyToken, requireRole('user'), (req, res) => {
  const u = db().users.find(x => x.id === req.user.sub);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const { password_hash, ...rest } = u;
  res.json(rest);
});

router.get('/bookings', verifyToken, requireRole('user'), (req, res) => {
  const store = db();
  const all = store.bookings
    .filter(b => b.user_id === req.user.sub)
    .map(b => enrichBooking(b, store));
  const { items, total, page, limit, pages } = paginate(all, req.query.page, req.query.limit);
  res.json({ items, total, page, limit, pages });
});

export default router;
