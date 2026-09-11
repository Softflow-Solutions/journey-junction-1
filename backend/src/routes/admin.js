import { Router } from 'express';
import { z } from 'zod';
import {
  db, saveDB,
  setUserKycStatus, updateMerchantKyc,
  verifyPayment, updateBookingPayment,
} from '../db/store.js';
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

router.get('/kyc/pending', async (_req, res, next) => {
  try {
    const store = await saveDB();
    res.json({
      users: store.users.filter(u => u.kyc_status === 'pending' && u.role !== 'admin').map(({ password_hash, ...r }) => r),
      merchants: store.merchants.filter(m => m.kyc_status === 'pending').map(({ password_hash, ...r }) => r),
    });
  } catch (e) { next(e); }
});

router.post('/kyc/approve', async (req, res, next) => {
  try {
    const schema = z.object({ type: z.enum(['user', 'merchant']), id: z.string() });
    const data = schema.parse(req.body);
    if (data.type === 'user') {
      await setUserKycStatus(data.id, 'approved');
    } else {
      await updateMerchantKyc(data.id, { kyc_status: 'approved', is_approved: true });
    }
    await saveDB();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/kyc/reject', async (req, res, next) => {
  try {
    const schema = z.object({ type: z.enum(['user', 'merchant']), id: z.string() });
    const data = schema.parse(req.body);
    if (data.type === 'user') {
      await setUserKycStatus(data.id, 'rejected');
    } else {
      await updateMerchantKyc(data.id, { kyc_status: 'rejected', is_approved: false });
    }
    await saveDB();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/users', async (_req, res, next) => {
  try {
    const store = await saveDB();
    const users = store.users.filter(u => u.role !== 'admin').map(({ password_hash, ...r }) => r);
    res.json(users);
  } catch (e) { next(e); }
});

router.get('/merchants', async (_req, res, next) => {
  try {
    const store = await saveDB();
    const merchants = store.merchants.map(({ password_hash, ...r }) => r);
    res.json(merchants);
  } catch (e) { next(e); }
});

router.get('/vehicles', async (_req, res, next) => {
  try {
    const store = await saveDB();
    const vehicles = store.vehicles.map(v => ({
      ...v,
      merchant_name: store.merchants.find(m => m.id === v.merchant_id)?.business_name,
      availability_status: vehicleAvailability(v, store),
    }));
    res.json(vehicles);
  } catch (e) { next(e); }
});

router.get('/bookings', async (req, res, next) => {
  try {
    const store = await saveDB();
    const sortKey = String(req.query.sort || 'date');
    const order = String(req.query.order || 'desc');
    const enriched = store.bookings.map(b => enrichBooking(b, store));
    const sorted = sortBookings(enriched, sortKey, order);
    if (req.query.page || req.query.limit) {
      const { items, total, page, limit, pages } = paginate(sorted, req.query.page, req.query.limit);
      return res.json({ items, total, page, limit, pages });
    }
    res.json(sorted);
  } catch (e) { next(e); }
});

router.get('/payments/pending', async (_req, res, next) => {
  try {
    const store = await saveDB();
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
  } catch (e) { next(e); }
});

router.post('/payments/verify', async (req, res, next) => {
  try {
    const schema = z.object({ payment_id: z.string() });
    const { payment_id } = schema.parse(req.body);
    const payment = await verifyPayment(payment_id, req.user.sub);
    if (!payment) throw new HttpError(404, 'Payment not found');
    if (payment.stage === 'advance') {
      await updateBookingPayment(payment.booking_id, 'advance_paid', 'confirmed');
    }
    await saveDB();
    const store = db();
    const b = store.bookings.find(x => x.id === payment.booking_id);
    res.json({ ok: true, booking: b ? enrichBooking(b, store) : null });
  } catch (e) { next(e); }
});

router.get('/finance/summary', async (_req, res, next) => {
  try {
    const store = await saveDB();
    const paid = store.bookings.filter(b => b.payment_status === 'fully_paid' || b.payment_status === 'advance_paid');
    const gross = paid.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const commission = paid.reduce((s, b) => s + Number(b.commission_amount || 0), 0);
    const merchantPayout = paid.reduce((s, b) => s + Number(b.merchant_payout || 0), 0);
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
  } catch (e) { next(e); }
});

export default router;
