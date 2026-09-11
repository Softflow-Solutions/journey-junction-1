import { Router } from 'express';
import { z } from 'zod';
import { db, saveDB } from '../db/store.js';

const router = Router();

const searchSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  category: z.enum(['2_wheeler', '4_wheeler']).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  seating: z.coerce.number().optional(),
  q: z.string().optional(),
});

const ACTIVE_BOOKING_STATES = new Set(['awaiting_payment', 'confirmed', 'ongoing']);

function isVehicleBooked(vehicleId, store) {
  return !!store.bookings.find(b =>
    b.vehicle_id === vehicleId
    && ACTIVE_BOOKING_STATES.has(b.booking_status)
    && b.payment_status !== 'pending_advance'
  );
}

router.get('/search', async (req, res, next) => {
  try {
    const params = searchSchema.parse(req.query);
    const store = await saveDB();
    const results = store.vehicles
      .filter(v => v.is_available)
      .map(v => {
        const m = store.merchants.find(x => x.id === v.merchant_id);
        const booked = isVehicleBooked(v.id, store);
        return {
          ...v,
          merchant_name: m?.business_name,
          city: m?.city,
          state: m?.state,
          is_approved: m?.is_approved,
          availability_status: booked ? 'booked' : 'available',
        };
      })
      .filter(v => {
        if (!v.is_approved) return false;
        if (params.city && v.city !== params.city) return false;
        if (params.state && v.state !== params.state) return false;
        if (params.category && v.category !== params.category) return false;
        if (params.minPrice !== undefined && Number(v.price_per_day) < params.minPrice) return false;
        if (params.maxPrice !== undefined && Number(v.price_per_day) > params.maxPrice) return false;
        if (params.seating !== undefined && v.seating_capacity !== params.seating) return false;
        if (params.q && !`${v.title} ${v.description ?? ''}`.toLowerCase().includes(params.q.toLowerCase())) return false;
        return true;
      });
    res.json(results);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const store = await saveDB();
    const v = store.vehicles.find(x => x.id === req.params.id);
    if (!v) return res.status(404).json({ error: 'Vehicle not found' });
    const m = store.merchants.find(x => x.id === v.merchant_id);
    const booked = isVehicleBooked(v.id, store);
    res.json({
      ...v,
      merchant_name: m?.business_name,
      city: m?.city,
      state: m?.state,
      is_approved: m?.is_approved,
      availability_status: booked ? 'booked' : (v.is_available ? 'available' : 'unavailable'),
    });
  } catch (e) { next(e); }
});

export default router;
