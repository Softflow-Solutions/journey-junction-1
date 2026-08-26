import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db, saveDB } from '../db/store.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { generateChatReply, generateRecommendations } from '../services/gemini.js';

const router = Router();

const ACTIVE_BOOKING_STATES = new Set(['confirmed', 'ongoing']);

function buildPreferenceSummary(history, store) {
  if (!history.length) return null;
  const vehicleIds = history.map(h => h.vehicle_id);
  const bookedVehicles = store.vehicles.filter(v => vehicleIds.includes(v.id));
  const catCounts = {};
  let priceSum = 0, priceN = 0;
  for (const v of bookedVehicles) {
    if (!v) continue;
    catCounts[v.category] = (catCounts[v.category] || 0) + 1;
    if (typeof v.price_per_day === 'number') { priceSum += v.price_per_day; priceN++; }
  }
  const avgPrice = priceN ? Math.round(priceSum / priceN) : 0;
  const favouriteCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'any';
  const priceBand = avgPrice ? (avgPrice < 800 ? 'budget' : avgPrice < 2500 ? 'mid' : 'premium') : 'any';
  return {
    history_count: history.length,
    favourite_category: favouriteCategory,
    category_counts: catCounts,
    avg_price_per_day: avgPrice,
    price_band: priceBand,
  };
}

router.post('/chat', verifyToken, (req, res, next) => {
  try {
    const schema = z.object({ message: z.string().min(1), session_id: z.string().optional() });
    const data = schema.parse(req.body);
    const sessionId = data.session_id || uuid();
    const userId = req.user.sub;
    const store = db();
    store.chat_logs.push({ id: uuid(), user_id: userId, session_id: sessionId, role: 'user', message: data.message, created_at: new Date().toISOString() });
    const history= store.chat_logs.filter(c => c.session_id === sessionId).slice(-10).map(c => ({ role: c.role, message: c.message }));
    const ctx = store.vehicles
      .filter(v => {
        if (!v.is_available) return false;
        const m = store.merchants.find(x => x.id === v.merchant_id);
        if (!(m && m.is_approved)) return false;
        return !store.bookings.find(b =>
          b.vehicle_id === v.id
          && ACTIVE_BOOKING_STATES.has(b.booking_status)
          && b.payment_status !== 'pending_advance'
        );
      })
      .slice(0, 20)
      .map(v => `${v.title} (${v.category}, INR ₹${v.price_per_day}/day)`)
      .join('; ');
    return generateChatReply(history, data.message, ctx).then(reply => {
      store.chat_logs.push({ id: uuid(), user_id: userId, session_id: sessionId, role: 'assistant', message: reply, created_at: new Date().toISOString() });
      saveDB(store);
      res.json({ session_id: sessionId, reply });
    }).catch(next);
  } catch (e) { next(e); }
});

router.get('/recommendations', verifyToken, requireRole('user'), (req, res, next) => {
  try {
    const store = db();
    const userId = req.user.sub;
    const history = store.bookings.filter(b => b.user_id === userId).slice(0, 10);
    const bookedActiveIds = new Set(
      store.bookings
        .filter(b => b.user_id === userId && ACTIVE_BOOKING_STATES.has(b.booking_status) && b.payment_status !== 'pending_advance')
        .map(b => b.vehicle_id)
    );
    const vehicles = store.vehicles.filter(v => {
      if (!v.is_available) return false;
      if (bookedActiveIds.has(v.id)) return false;
      const m = store.merchants.find(x => x.id === v.merchant_id);
      return !!(m && m.is_approved);
    });
    const prefs = buildPreferenceSummary(history, store);
    generateRecommendations(history, vehicles, prefs).then(recs => {
      const vmap = new Map(vehicles.map(v => [v.id, v]));
      const enriched = (recs || []).map(r => {
        const v = vmap.get(r.id);
        if (!v) return r;
        const m = store.merchants.find(x => x.id === v.merchant_id);
        return {
          ...v,
          merchant_name: m?.business_name,
          reason: r.reason || 'Recommended match',
          score: r.score,
        };
      });
      res.json({ recommendations: enriched, preferences: prefs });
    }).catch(next);
  } catch (e) { next(e); }
});

export default router;
