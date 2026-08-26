import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db, saveDB } from '../db/store.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { splitBookingAmount } from '../services/payment.js';

const router = Router();

const createSchema = z.object({
  vehicle_id: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  upi_reference: z.string().min(4),
  screenshot_url: z.string().optional(),
});

const paySchema = z.object({
  upi_reference: z.string().min(4),
  screenshot_url: z.string().optional(),
});

function computeDurationDays(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 1;
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1);
}

function isAdvanceVerified(booking, store) {
  const adv = store.payments.find(p => p.booking_id === booking.id && p.stage === 'advance');
  return !!(adv && adv.verified_by_admin);
}

export function paginate(list, page, limit) {
  const p = Math.max(1, parseInt(page) || 1);
  const l = Math.max(1, Math.min(100, parseInt(limit) || 10));
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / l));
  const start = (p - 1) * l;
  const items = list.slice(start, start + l);
  return { items, total, page: p, limit: l, pages };
}

export function enrichBooking(b, store) {
  const s = store || db();
  const v = s.vehicles.find(x => x.id === b.vehicle_id);
  const u = s.users.find(x => x.id === b.user_id);
  const m = s.merchants.find(x => x.id === b.merchant_id);
  return {
    ...b,
    vehicle_title: v?.title,
    vehicle_image: v?.image_urls?.[0],
    vehicle_category: v?.category,
    user_name: u?.full_name,
    user_email: u?.email,
    merchant_name: m?.business_name,
    duration_days: computeDurationDays(b.start_date, b.end_date),
    advance_verified: isAdvanceVerified(b, s),
    balance_verified: !!(s.payments.find(p => p.booking_id === b.id && p.stage === 'balance' && p.verified_by_admin)),
  };
}

router.post('/', verifyToken, requireRole('user'), (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    if (end < start) throw new HttpError(400, 'end_date must be on/after start_date');
    const days = computeDurationDays(data.start_date, data.end_date);

    const store = db();
    const user = store.users.find(u => u.id === req.user.sub);
    if (!user || user.kyc_status !== 'approved') throw new HttpError(403, 'KYC must be approved before booking');

    const v = store.vehicles.find(x => x.id === data.vehicle_id);
    if (!v) throw new HttpError(404, 'Vehicle not found');
    if (!v.is_available) throw new HttpError(409, 'Vehicle not available');

    const total = v.price_per_day * days;
    const split = splitBookingAmount(total);

    const booking = {
      id: uuid(),
      user_id: user.id,
      vehicle_id: data.vehicle_id,
      merchant_id: v.merchant_id,
      start_date: data.start_date,
      end_date: data.end_date,
      total_amount: total,
      advance_amount: split.advance,
      balance_amount: split.balance,
      payment_status: 'pending_advance',
      booking_status: 'awaiting_payment',
      commission_amount: split.commission,
      merchant_payout: split.merchantPayout,
      created_at: new Date().toISOString(),
    };
    store.payments.push({
      id: uuid(),
      booking_id: booking.id,
      stage: 'advance',
      amount: split.advance,
      upi_reference: data.upi_reference,
      screenshot_url: data.screenshot_url,
      verified_by_admin: false,
      created_at: new Date().toISOString(),
    });
    store.bookings.push(booking);
    saveDB(store);
    res.status(201).json(enrichBooking(booking, store));
  } catch (e) { next(e); }
});

router.post('/:id/pay/advance', verifyToken, requireRole('user'), (req, res, next) => {
  try {
    const data = paySchema.parse(req.body);
    const store = db();
    const b = store.bookings.find(x => x.id === req.params.id && x.user_id === req.user.sub);
    if (!b) throw new HttpError(404, 'Booking not found');
    if (b.payment_status !== 'pending_advance') throw new HttpError(409, 'Advance already paid or booking closed');
    store.payments.push({
      id: uuid(),
      booking_id: b.id,
      stage: 'advance',
      amount: b.advance_amount,
      upi_reference: data.upi_reference,
      screenshot_url: data.screenshot_url,
      verified_by_admin: false,
      created_at: new Date().toISOString(),
    });
    b.payment_status = 'advance_paid';
    saveDB(store);
    res.json({ ok: true, next: 'awaiting admin verification', booking: enrichBooking(b, store) });
  } catch (e) { next(e); }
});

router.post('/:id/pay/balance', verifyToken, requireRole('user'), (req, res, next) => {
  try {
    const data = paySchema.parse(req.body);
    const store = db();
    const b = store.bookings.find(x => x.id === req.params.id && x.user_id === req.user.sub);
    if (!b) throw new HttpError(404, 'Booking not found');
    if (b.payment_status !== 'advance_paid') throw new HttpError(409, 'Advance must be paid first');
    if (b.booking_status !== 'ongoing') throw new HttpError(409, 'Vehicle not yet handed over — balance payment unlocks after merchant hands over');
    store.payments.push({
      id: uuid(),
      booking_id: b.id,
      stage: 'balance',
      amount: b.balance_amount,
      upi_reference: data.upi_reference,
      screenshot_url: data.screenshot_url,
      verified_by_admin: false,
      created_at: new Date().toISOString(),
    });
    b.payment_status = 'fully_paid';
    saveDB(store);
    res.json({ ok: true, next: 'awaiting admin verification', booking: enrichBooking(b, store) });
  } catch (e) { next(e); }
});

router.post('/:id/handover', verifyToken, requireRole('merchant'), (req, res, next) => {
  try {
    const store = db();
    const b = store.bookings.find(x => x.id === req.params.id);
    if (!b) throw new HttpError(404, 'Booking not found');
    if (b.merchant_id !== req.user.sub) throw new HttpError(403, 'Not your booking');
    if (b.payment_status !== 'advance_paid') throw new HttpError(409, 'Advance must be paid before handover');
    if (!isAdvanceVerified(b, store)) throw new HttpError(409, 'Advance payment must be verified by admin before handover');
    if (b.booking_status === 'ongoing') throw new HttpError(409, 'Vehicle already handed over');
    const v = store.vehicles.find(x => x.id === b.vehicle_id);
    if (!v) throw new HttpError(404, 'Vehicle not found');

    b.booking_status = 'ongoing';
    b.handed_over_at = new Date().toISOString();
    v.is_available = false;
    saveDB(store);

    res.json({ ok: true, booking: enrichBooking(b, store), vehicle: v });
  } catch (e) { next(e); }
});

router.post('/:id/complete', verifyToken, requireRole('merchant'), (req, res, next) => {
  try {
    const store = db();
    const b = store.bookings.find(x => x.id === req.params.id);
    if (!b) throw new HttpError(404, 'Booking not found');
    if (b.merchant_id !== req.user.sub) throw new HttpError(403, 'Not your booking');
    if (b.booking_status !== 'ongoing') throw new HttpError(409, 'Booking is not ongoing');
    b.booking_status = 'completed';
    b.completed_at = new Date().toISOString();
    const v = store.vehicles.find(x => x.id === b.vehicle_id);
    if (v) v.is_available = true;
    saveDB(store);
    res.json({ ok: true, booking: enrichBooking(b, store) });
  } catch (e) { next(e); }
});

router.get('/:id', verifyToken, (req, res) => {
  const store = db();
  const b = store.bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const { sub, role } = req.user;
  if (role === 'user' && b.user_id !== sub) return res.status(403).json({ error: 'Forbidden' });
  if (role === 'merchant' && b.merchant_id !== sub) return res.status(403).json({ error: 'Forbidden' });
  res.json(enrichBooking(b, store));
});

export default router;
