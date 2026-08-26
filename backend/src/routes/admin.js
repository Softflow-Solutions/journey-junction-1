import { Router } from 'express';
import { z } from 'zod';
import { db, saveDB } from '../db/store.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { enrichBooking, paginate } from './bookings.js';

const router = Router();

router.use(verifyToken, requireRole('admin'));

const ACTIVE_BOOKING_STATES = new Set(['awaiting_payment', 'confirmed', 'ongoing']);

function vehicleAvailability(v, store) {
  if (v.is_available === false) {
    const active = store.bookings.find(b => b.vehicle_id === v.id && ACTIVE_BOOKING_STATES.has(b.booking_status) && b.payment_status !== 'pending_advance');
    return active ? 'booked' : 'unavailable';
  }
  const active = store.bookings.find(b => b.vehicle_id === v.id && ACTIVE_BOOKING_STATES.has(b.booking_status) && b.payment_status !== 'pending_advance');
  return active ? 'booked' : 'available';
}

function sortBookings(list, sortKey, order) {
  const mult = order === 'desc' ? -1 : 1;
  const sorted = [...list];
  sorted.sort((a, b) => {
    let av, bv;
    switch (sortKey) {
      case 'customer':
        av = (a.user_name || '').toLowerCase();
        bv = (b.user_name || '').toLowerCase();
        break;
      case 'amount':
        av = a.total_amount || 0;
        bv = b.total_amount || 0;
        break;
      case 'status':
        av = `${a.payment_status}|${a.booking_status}`;
        bv = `${b.payment_status}|${b.booking_status}`;
        break;
      case 'date':
      default:
        av = a.created_at || '';
        bv = b.created_at || '';
        break;
    }
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    return 0;
  });
  return sorted;
}

router.get('/kyc/pending', (_req, res) => {
  const store = db();
  res.json({
    users: store.users.filter(u => u.kyc_status === 'pending' && u.role !== 'admin').map(({ password_hash, ...r }) => r),
    merchants: store.merchants.filter(m => m.kyc_status === 'pending').map(({ password_hash, ...r }) => r),
  });
});

router.post('/kyc/approve', (req, res, next) => {
  try {
    const schema = z.object({ type: z.enum(['user', 'merchant']), id: z.string() });
    const data = schema.parse(req.body);
    const store = db();
    if (data.type === 'user') {
      const u = store.users.find(x => x.id === data.id);
      if (!u) throw new HttpError(404, 'Not found');
      u.kyc_status = 'approved';
    } else {
      const m = store.merchants.find(x => x.id === data.id);
      if (!m) throw new HttpError(404, 'Not found');
      m.kyc_status = 'approved';
      m.is_approved = true;
    }
    saveDB(store);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/kyc/reject', (req, res, next) => {
  try {
    const schema = z.object({ type: z.enum(['user', 'merchant']), id: z.string() });
    const data = schema.parse(req.body);
    const store = db();
    if (data.type === 'user') {
      const u = store.users.find(x => x.id === data.id);
      if (u) u.kyc_status = 'rejected';
    } else {
      const m = store.merchants.find(x => x.id === data.id);
      if (m) { m.kyc_status = 'rejected'; m.is_approved = false; }
    }
    saveDB(store);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/users', (_req, res) => {
  const users = db().users.filter(u => u.role !== 'admin').map(({ password_hash, ...r }) => r);
  res.json(users);
});

router.get('/merchants', (_req, res) => {
  const merchants = db().merchants.map(({ password_hash, ...r }) => r);
  res.json(merchants);
});

router.get('/vehicles', (_req, res) => {
  const store = db();
  const vehicles = store.vehicles.map(v => ({
    ...v,
    merchant_name: store.merchants.find(m => m.id === v.merchant_id)?.business_name,
    availability_status: vehicleAvailability(v, store),
  }));
  res.json(vehicles);
});

router.get('/bookings', (req, res) => {
  const store = db();
  const sortKey = String(req.query.sort || 'date');
  const order = String(req.query.order || 'desc');
  const enriched = store.bookings.map(b => enrichBooking(b, store));
  const sorted = sortBookings(enriched, sortKey, order);
  if (req.query.page || req.query.limit) {
    const { items, total, page, limit, pages } = paginate(sorted, req.query.page, req.query.limit);
    return res.json({ items, total, page, limit, pages });
  }
  res.json(sorted);
});

router.get('/payments/pending', (_req, res) => {
  const store = db();
  const payments = store.payments
    .filter(p => !p.verified_by_admin)
    .map(p => {
      const b = store.bookings.find(x => x.id === p.booking_id);
      const v = b ? store.vehicles.find(x => x.id === b.vehicle_id) : null;
      return {
        ...p,
        booking_id_text: p.booking_id,
        booking_status: b?.booking_status,
        payment_status: b?.payment_status,
        user_name: store.users.find(u => u.id === b?.user_id)?.full_name,
        vehicle_title: v?.title,
        merchant_name: b ? store.merchants.find(m => m.id === b.merchant_id)?.business_name : null,
        amount_inr: p.amount,
      };
    });
  res.json(payments);
});

router.post('/payments/verify', (req, res, next) => {
  try {
    const schema = z.object({ payment_id: z.string() });
    const { payment_id } = schema.parse(req.body);
    const store = db();
    const p = store.payments.find(x => x.id === payment_id);
    if (!p) throw new HttpError(404, 'Payment not found');
    p.verified_by_admin = true;
    p.verified_at = new Date().toISOString();
    p.verified_by = req.user.sub;
    const b = store.bookings.find(x => x.id === p.booking_id);
    if (b && p.stage === 'advance' && b.payment_status === 'pending_advance') {
      b.payment_status = 'advance_paid';
      if (b.booking_status === 'awaiting_payment') b.booking_status = 'confirmed';
    }
    saveDB(store);
    res.json({ ok: true, booking: b ? enrichBooking(b, store) : null });
  } catch (e) { next(e); }
});

router.get('/finance/summary', (_req, res) => {
  const store = db();
  const paid = store.bookings.filter(b => b.payment_status === 'fully_paid' || b.payment_status === 'advance_paid');
  const gross = paid.reduce((s, b) => s + b.total_amount, 0);
  const commission = paid.reduce((s, b) => s + b.commission_amount, 0);
  const merchantPayout = paid.reduce((s, b) => s + b.merchant_payout, 0);
  res.json({
    gross,
    commission,
    payout: merchantPayout,
    merchant_payout: merchantPayout,
    bookings: paid.length,
    total_bookings: store.bookings.length,
    users: store.users.length,
    merchants: store.merchants.length,
    vehicles: store.vehicles.length,
  });
});

export default router;
