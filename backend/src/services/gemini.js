import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

let client= null;

function getClient(){
  if (!env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client;
}

const MODEL_NAME = 'gemini-3.6-flash';

async function withRetry(fn, attempts = 3){
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

const SYSTEM_PROMPT = `You are the Journey Junction AI assistant — a vehicle rental marketplace.
Answer user queries about vehicle availability, booking process, two-stage UPI payments (50% advance, 50% balance), pricing, KYC requirements, and platform policies.
Be concise, friendly, and reference specific vehicles when possible.
Never fabricate prices or vehicles that are not in the provided context.`;

export async function generateChatReply(history, userMessage, vehicleContext){
  const local = localReply(userMessage, vehicleContext);
  const c = getClient();
  if (!c) return `[demo] ${local}`;
  try {
    const model = c.getGenerativeModel({ model: MODEL_NAME });
    const safeHistory = (history || [])
      .filter(h => h && h.message && (h.role === 'user' || h.role === 'assistant' || h.role === 'model'))
      .map(h => ({
        role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(h.message) }],
      }));
    const chat = model.startChat({
      systemInstruction: { role: 'system', parts: [{ text: `${SYSTEM_PROMPT}\n\nVehicle context:\n${vehicleContext || 'No vehicle context loaded.'}` }] },
      history: safeHistory,
    });
    const result = await withRetry(() => chat.sendMessage(userMessage));
    return result.response.text();
  } catch {
    return local;
  }
}

function localReply(msg, ctx){
  const m = String(msg || '').toLowerCase();
  const vehicles = ctx ? ctx.split('; ').filter(Boolean) : [];
  if (/family|trip|holiday|vacation|group/.test(m)) {
    const suv = vehicles.filter(v => /suv|7|fortuner|innova|scorpio|crysta|harrier|safari/.test(v.toLowerCase())).slice(0, 3);
    if (suv.length) return `For a family trip, an SUV or 7-seater is ideal. Based on availability: ${suv.join('; ')}. Pick one with good boot space and AC.`;
    return `For a family trip, prefer 6–7 seater SUVs or MPVs. Tell me your city and budget for specific picks.`;
  }
  if (/cheap|budget|low|affordable/.test(m)) {
    return `Budget rides are typically 2-wheelers or hatchbacks. Available now: ${vehicles.slice(0, 4).join('; ') || 'search to see options'}. Advance 50% via UPI.`;
  }
  if (/book|booking|how|reserve|pay|payment|advance|upi/.test(m)) {
    return `Booking flow: pick vehicle → choose dates → pay 50% advance via UPI → admin verifies → merchant hands over → pay balance 50%. Two-stage keeps it safe for both sides.`;
  }
  if (/kyc|document|license|aadhaar|pan/.test(m)) {
    return `KYC: upload driving licence (front + back) and one ID (Aadhaar / PAN / Passport / Voter ID) from My Profile → Driving Licence. Admin verifies within 24h.`;
  }
  if (/cancel|refund/.test(m)) {
    return `Cancellations are allowed from My Bookings. Refund policy depends on how close to the start date — see the booking detail.`;
  }
  if (/available|show|list/.test(m) && vehicles.length) {
    return `Currently available (sample): ${vehicles.slice(0, 6).join('; ')}.`;
  }
  return `I can help with bookings, payments, KYC, and vehicle picks. Try asking: "family trip options", "budget rides", "how to pay", "cancel booking".`;
}

export async function generateRecommendations(userHistory, vehicles, preferences){
  // ponytail: when GEMINI_API_KEY missing or quota exhausted, fall back to local preference-based ranking.
  const ranked = rankLocally(vehicles, preferences, userHistory);
  if (!ranked.length) return [];
  const c = getClient();
  if (!c) return ranked;
  const model = c.getGenerativeModel({ model: MODEL_NAME });
  const prompt = `You are recommending rental vehicles on Journey Junction. Currency is INR (₹).
User preferences derived from booking history: ${JSON.stringify(preferences || {})}
Recent user bookings: ${JSON.stringify(userHistory.slice(0, 10))}
Available vehicles (in INR per day): ${JSON.stringify(vehicles.slice(0, 30).map(v => ({ id: v.id, title: v.title, category: v.category, price_per_day: v.price_per_day, seating: v.seating_capacity })))}
Rank these vehicles for this user. Prefer matching favourite category and price band. Return ONLY a JSON array of {id, reason, score}. No prose.`;
  try {
    const result = await withRetry(() => model.generateContent(prompt));
    const text = result.response.text();
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart === -1) return ranked;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return parsed.length ? parsed : ranked;
  } catch {
    return ranked;
  }
}

function rankLocally(vehicles, prefs, history){
  const favCat = prefs?.favourite_category || 'any';
  const band = prefs?.price_band || 'any';
  const bandRange = band === 'budget' ? [0, 800] : band === 'mid' ? [800, 2500] : band === 'premium' ? [2500, Infinity] : [0, Infinity];
  const scored = vehicles.map(v => {
    let s = 0;
    if (favCat !== 'any' && v.category === favCat) s += 5;
    if (v.price_per_day >= bandRange[0] && v.price_per_day < bandRange[1]) s += 3;
    s += Math.max(0, 5 - v.price_per_day / 500);
    return { v, s };
  }).sort((a, b) => b.s - a.s).slice(0, 5);
  return scored.map(({ v, s }) => ({
    id: v.id,
    reason: favCat !== 'any' && v.category === favCat
      ? `Matches your favourite ${favCat.replace('_', ' ')} category`
      : band !== 'any' && v.price_per_day >= bandRange[0] && v.price_per_day < bandRange[1]
      ? `Fits your usual ${band} price band`
      : `Popular match based on your history`,
    score: Number(s.toFixed(2)),
  }));
}