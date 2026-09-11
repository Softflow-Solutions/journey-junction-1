import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import {
  db, saveDB,
  insertVehicle, updateVehicle, deleteVehicle,
  updateMerchantKyc,
} from '../db/store.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { enrichBooking, paginate } from './bookings.js';

const router = Router();

const vehicleSchema = z.object({
  title: z.string().min(2),
  category: z.enum(['2_wheeler', '4_wheeler']),
  seating_capacity: z.number().int().min(1).max(50),
  price_per_day: z.number().positive(),
  description: z.string().optional(),
  image_urls: z.array(z.string()).default([]),
  is_available: z.boolean().default(true),
});

const ACTIVE_BOOKING_STATES = new Set(['awaiting_payment', 'confirmed', 'ongoing']);

function vehicleAvailability(v, store) {
  const active = store.bookings.find(b => b.vehicle_id === v.id && ACTIVE_BOOKING_STATES.has(b.booking_status) && b.payment_status !== 'pending_advance');
  if (active) return 'booked';
  return v.is_available ? 'available' : 'unavailable';
}

async function ensureApproved(merchantId) {
  const store = await saveDB();
  const m = store.merchants.find(x => x.id === merchantId);
  if (!m) throw new HttpError(404, 'Merchant not found');
  if (!m.is_approved) throw new HttpError(403, 'Merchant not approved by admin. Wait for KYC approval.');
  return m;
}

const IMAGE_POOL = {
  bike: ['https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=800', 'https://images.unsplash.com/photo-1591025207163-942350e47db2?w=800', 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800'],
  scooter: ['https://images.unsplash.com/photo-1591025207163-942350e47db2?w=800', 'https://images.unsplash.com/photo-1604147706283-d7119b5b822c?w=800'],
  sedan: ['https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800', 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800', 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800'],
  suv: ['https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800', 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800'],
  hatchback: ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800', 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800'],
  luxury: ['https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800', 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800'],
  default4w: ['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800'],
  default2w: ['https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800'],
};

function pickImage(title, category) {
  const t = title.toLowerCase();
  if (category === '2_wheeler') {
    if (t.includes('activa') || t.includes('scooter') || t.includes('access')) return IMAGE_POOL.scooter[Math.floor(Math.random() * IMAGE_POOL.scooter.length)];
    return IMAGE_POOL.bike[Math.floor(Math.random() * IMAGE_POOL.bike.length)];
  }
  if (t.includes('ferrari') || t.includes('lamborghini') || t.includes('porsche') || t.includes('mercedes') || t.includes('bmw') || t.includes('audi') || t.includes('luxury')) return IMAGE_POOL.luxury[Math.floor(Math.random() * IMAGE_POOL.luxury.length)];
  if (t.includes('suv') || t.includes('creta') || t.includes('fortuner') || t.includes('nexon') || t.includes('scorpio') || t.includes('xuv')) return IMAGE_POOL.suv[Math.floor(Math.random() * IMAGE_POOL.suv.length)];
  if (t.includes('swift') || t.includes('i20') || t.includes('alto') || t.includes('wagon')) return IMAGE_POOL.hatchback[Math.floor(Math.random() * IMAGE_POOL.hatchback.length)];
  if (t.includes('civic') || t.includes('city') || t.includes('dzire') || t.includes('verna') || t.includes('sedan')) return IMAGE_POOL.sedan[Math.floor(Math.random() * IMAGE_POOL.sedan.length)];
  return IMAGE_POOL.default4w[0];
}

router.post('/kyc/submit', verifyToken, requireRole('merchant'), async (req, res, next) => {
  try {
    const schema = z.object({ business_doc_url: z.string(), identity_doc_url: z.string() });
    const data = schema.parse(req.body);
    const store = await saveDB();
    const m = store.merchants.find(x => x.id === req.user.sub);
    if (!m) return res.status(404).json({ error: 'Not found' });
    await updateMerchantKyc(m.id, {
      business_doc_url: data.business_doc_url,
      identity_doc_url: data.identity_doc_url,
      kyc_status: 'pending',
    });
    await saveDB();
    res.json({ ok: true, kyc_status: 'pending' });
  } catch (e) { next(e); }
});

router.get('/dashboard', verifyToken, requireRole('merchant'), async (req, res, next) => {
  try {
    const store = await saveDB();
    const id = req.user.sub;
    res.json({
      vehicles: store.vehicles.filter(v => v.merchant_id === id).length,
      bookings: store.bookings.filter(b => b.merchant_id === id).length,
      earnings: store.bookings.filter(b => b.merchant_id === id).reduce((s, b) => s + Number(b.merchant_payout || 0), 0),
    });
  } catch (e) { next(e); }
});

router.post('/vehicles', verifyToken, requireRole('merchant'), async (req, res, next) => {
  try {
    await ensureApproved(req.user.sub);
    const data = vehicleSchema.parse(req.body);
    const v = {
      id: uuid(),
      merchant_id: req.user.sub,
      title: data.title,
      category: data.category,
      seating_capacity: data.seating_capacity,
      price_per_day: data.price_per_day,
      description: data.description,
      image_urls: data.image_urls.length > 0 ? data.image_urls : [pickImage(data.title, data.category)],
      is_available: data.is_available ?? true,
      created_at: new Date().toISOString(),
    };
    await insertVehicle(v);
    await saveDB();
    res.status(201).json(v);
  } catch (e) { next(e); }
});

router.get('/vehicles', verifyToken, requireRole('merchant'), async (req, res, next) => {
  try {
    const store = await saveDB();
    res.json(
      store.vehicles
        .filter(v => v.merchant_id === req.user.sub)
        .map(v => ({ ...v, availability_status: vehicleAvailability(v, store) }))
    );
  } catch (e) { next(e); }
});

router.put('/vehicles/:id', verifyToken, requireRole('merchant'), async (req, res, next) => {
  try {
    await ensureApproved(req.user.sub);
    const data = vehicleSchema.partial().parse(req.body);
    const store = await saveDB();
    const v = store.vehicles.find(x => x.id === req.params.id && x.merchant_id === req.user.sub);
    if (!v) return res.status(404).json({ error: 'Not found' });
    const updated = await updateVehicle(v.id, req.user.sub, data);
    await saveDB();
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete('/vehicles/:id', verifyToken, requireRole('merchant'), async (req, res, next) => {
  try {
    const store = await saveDB();
    const i = store.vehicles.findIndex(v => v.id === req.params.id && v.merchant_id === req.user.sub);
    if (i < 0) return res.status(404).json({ error: 'Not found' });
    await deleteVehicle(req.params.id, req.user.sub);
    await saveDB();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/bookings', verifyToken, requireRole('merchant'), async (req, res, next) => {
  try {
    const store = await saveDB();
    const sortKey = String(req.query.sort || 'date');
    const order = String(req.query.order || 'desc');
    const enriched = store.bookings
      .filter(b => b.merchant_id === req.user.sub)
      .map(b => enrichBooking(b, store));
    const mult = order === 'desc' ? -1 : 1;
    enriched.sort((a, b) => {
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
    if (req.query.page || req.query.limit) {
      const { items, total, page, limit, pages } = paginate(enriched, req.query.page, req.query.limit);
      return res.json({ items, total, page, limit, pages });
    }
    res.json(enriched);
  } catch (e) { next(e); }
});

router.get('/earnings', verifyToken, requireRole('merchant'), async (req, res, next) => {
  try {
    const store = await saveDB();
    const bs = store.bookings.filter(b => b.merchant_id === req.user.sub);
    const gross = bs.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const commission = bs.reduce((s, b) => s + Number(b.commission_amount || 0), 0);
    const payout = bs.reduce((s, b) => s + Number(b.merchant_payout || 0), 0);
    const paid = bs.filter(b => b.payment_status === 'fully_paid' || b.payment_status === 'advance_paid');
    const paidGross = paid.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const paidCommission = paid.reduce((s, b) => s + Number(b.commission_amount || 0), 0);
    const paidPayout = paid.reduce((s, b) => s + Number(b.merchant_payout || 0), 0);
    res.json({
      gross, commission, payout,
      bookings: bs.length,
      paid_gross: paidGross,
      paid_commission: paidCommission,
      paid_payout: paidPayout,
      paid_count: paid.length,
    });
  } catch (e) { next(e); }
});

export default router;
