// Postgres-backed store. Same surface as the old JSON store: `db()`, `saveDB()`.
// `db()` returns an in-memory snapshot of all tables (cached per request cycle);
// route code can keep reading/writing fields on those objects, then call the
// explicit `persist*` helpers below for actual writes. `saveDB()` is kept as a
// no-op so route files don't need to change.

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const { Pool } = pg;

let _pool = null;

export function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required. Set it in backend/.env or the Render env vars.');
  }
  _pool = new Pool({
    connectionString: url,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  return _pool;
}

const TABLES = ['users', 'merchants', 'vehicles', 'bookings', 'payments', 'chat_logs', 'promotions'];

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE kyc_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE vehicle_category_enum AS ENUM ('2_wheeler', '4_wheeler');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_status_enum AS ENUM ('pending_advance', 'advance_paid', 'fully_paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE booking_status_enum AS ENUM ('confirmed', 'ongoing', 'completed', 'cancelled', 'awaiting_payment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_stage_enum AS ENUM ('advance', 'balance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE chat_role_enum AS ENUM ('user', 'assistant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('user', 'merchant', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role user_role_enum NOT NULL DEFAULT 'user',
  kyc_status kyc_status_enum NOT NULL DEFAULT 'pending',
  driving_license_url TEXT,
  driving_license_front_url TEXT,
  driving_license_back_url TEXT,
  id_document_url TEXT,
  id_document_type VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  business_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255) NOT NULL,
  state VARCHAR(64) NOT NULL,
  city VARCHAR(64) NOT NULL,
  address TEXT,
  kyc_status kyc_status_enum NOT NULL DEFAULT 'pending',
  business_doc_url TEXT,
  identity_doc_url TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  category vehicle_category_enum NOT NULL,
  seating_capacity INT NOT NULL,
  price_per_day DECIMAL(10,2) NOT NULL,
  description TEXT,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_merchant ON vehicles(merchant_id);

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 90),
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  advance_amount DECIMAL(10,2) NOT NULL,
  balance_amount DECIMAL(10,2) NOT NULL,
  payment_status payment_status_enum NOT NULL DEFAULT 'pending_advance',
  booking_status booking_status_enum NOT NULL DEFAULT 'confirmed',
  commission_amount DECIMAL(10,2) NOT NULL,
  merchant_payout DECIMAL(10,2) NOT NULL,
  handed_over_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_merchant ON bookings(merchant_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  stage payment_stage_enum NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  upi_reference VARCHAR(128) NOT NULL,
  screenshot_url TEXT,
  verified_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(64) NOT NULL,
  role chat_role_enum NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_logs(session_id, created_at);
`;

export async function ensureSchema() {
  const c = await pool().connect();
  try {
    await c.query(SCHEMA);
  } finally {
    c.release();
  }
}

function row(row) {
  // pg returns DATE columns as Date objects and DECIMAL as strings.
  // The route code treats them as strings/ISO, so normalize here.
  if (!row) return row;
  const out = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'bigint') out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

export async function loadAll() {
  const c = await pool().connect();
  try {
    const result = {};
    for (const t of TABLES) {
      const r = await c.query(`SELECT * FROM ${t}`);
      result[t] = r.rows.map(row);
    }
    // Vehicle image_urls comes back as a Postgres array — route code expects an array,
    // pg already gives us one. rows.map(row) above kept it as-is.
    return result;
  } finally {
    c.release();
  }
}

// `db()` returns an in-memory snapshot. Cache per process; routes can mutate
// the snapshot freely and then call `saveDB()` at the end (no-op) OR use the
// explicit helpers below. The mutation pattern in routes still works for
// read-after-write semantics within the same Express request.
let _snapshot = null;
let _snapshotLoadedAt = 0;
const SNAPSHOT_TTL_MS = 5_000; // ponytail: small TTL keeps reads fresh on Render cold-starts

export function db() {
  if (!_snapshot || Date.now() - _snapshotLoadedAt > SNAPSHOT_TTL_MS) {
    throw new Error('db() called before data layer was initialised. Call loadAll() at boot.');
  }
  return _snapshot;
}

export async function refresh() {
  _snapshot = await loadAll();
  _snapshotLoadedAt = Date.now();
  return _snapshot;
}

// `saveDB()` is the route-facing function used everywhere in routes. With
// Postgres it's a no-op (writes go through the explicit helpers below), but
// we keep it as a thin refresh so any read-modify-write done on the snapshot
// is visible to the next request.
export async function saveDB() {
  await refresh();
}

// ---------------- explicit write helpers ----------------
// Routes that mutate the DB call these. Each helper returns the inserted/
// updated row so the route can keep its current "push then read back" shape.

export async function insertUser(u) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `INSERT INTO users (id, email, password_hash, full_name, phone, role, kyc_status,
         driving_license_url, driving_license_front_url, driving_license_back_url,
         id_document_url, id_document_type, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      [
        u.id, u.email, u.password_hash, u.full_name, u.phone || null, u.role || 'user',
        u.kyc_status || 'pending',
        u.driving_license_url || null, u.driving_license_front_url || null, u.driving_license_back_url || null,
        u.id_document_url || null, u.id_document_type || null,
        u.created_at || new Date().toISOString(),
      ]
    );
    return r.rows[0] ? row(r.rows[0]) : null;
  } finally { c.release(); }
}

export async function insertMerchant(m) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `INSERT INTO merchants (id, email, password_hash, business_name, owner_name, state, city,
         address, kyc_status, business_doc_url, identity_doc_url, is_approved, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      [
        m.id, m.email, m.password_hash, m.business_name, m.owner_name, m.state, m.city,
        m.address || null, m.kyc_status || 'pending',
        m.business_doc_url || null, m.identity_doc_url || null,
        m.is_approved ?? false,
        m.created_at || new Date().toISOString(),
      ]
    );
    return r.rows[0] ? row(r.rows[0]) : null;
  } finally { c.release(); }
}

export async function updateMerchantKyc(id, patch) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `UPDATE merchants SET
        business_doc_url = COALESCE($2, business_doc_url),
        identity_doc_url = COALESCE($3, identity_doc_url),
        kyc_status = COALESCE($4, kyc_status),
        is_approved = COALESCE($5, is_approved),
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, patch.business_doc_url ?? null, patch.identity_doc_url ?? null,
       patch.kyc_status ?? null, patch.is_approved ?? null]
    );
    return r.rows[0] ? row(r.rows[0]) : null;
  } finally { c.release(); }
}

export async function updateUserKyc(id, patch) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `UPDATE users SET
        driving_license_url = COALESCE($2, driving_license_url),
        driving_license_front_url = COALESCE($3, driving_license_front_url),
        driving_license_back_url = COALESCE($4, driving_license_back_url),
        id_document_url = COALESCE($5, id_document_url),
        id_document_type = COALESCE($6, id_document_type),
        kyc_status = COALESCE($7, kyc_status),
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, patch.driving_license_url ?? null,
       patch.driving_license_front_url ?? null, patch.driving_license_back_url ?? null,
       patch.id_document_url ?? null, patch.id_document_type ?? null,
       patch.kyc_status ?? null]
    );
    return r.rows[0] ? row(r.rows[0]) : null;
  } finally { c.release(); }
}

export async function setUserKycStatus(id, status) {
  const c = await pool().connect();
  try {
    await c.query(`UPDATE users SET kyc_status = $2, updated_at = NOW() WHERE id = $1`, [id, status]);
  } finally { c.release(); }
}

export async function insertVehicle(v) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `INSERT INTO vehicles (id, merchant_id, title, category, seating_capacity, price_per_day,
         description, image_urls, is_available, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [v.id, v.merchant_id, v.title, v.category, v.seating_capacity, v.price_per_day,
       v.description || null, v.image_urls || [], v.is_available ?? true,
       v.created_at || new Date().toISOString()]
    );
    return row(r.rows[0]);
  } finally { c.release(); }
}

export async function updateVehicle(id, merchantId, patch) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `UPDATE vehicles SET
        title = COALESCE($3, title),
        category = COALESCE($4, category),
        seating_capacity = COALESCE($5, seating_capacity),
        price_per_day = COALESCE($6, price_per_day),
        description = COALESCE($7, description),
        image_urls = COALESCE($8, image_urls),
        is_available = COALESCE($9, is_available),
        updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2 RETURNING *`,
      [id, merchantId,
       patch.title ?? null, patch.category ?? null,
       patch.seating_capacity ?? null, patch.price_per_day ?? null,
       patch.description ?? null, patch.image_urls ?? null,
       patch.is_available ?? null]
    );
    return r.rows[0] ? row(r.rows[0]) : null;
  } finally { c.release(); }
}

export async function deleteVehicle(id, merchantId) {
  const c = await pool().connect();
  try {
    await c.query(`DELETE FROM vehicles WHERE id = $1 AND merchant_id = $2`, [id, merchantId]);
  } finally { c.release(); }
}

export async function setVehicleAvailability(id, available) {
  const c = await pool().connect();
  try {
    await c.query(`UPDATE vehicles SET is_available = $2, updated_at = NOW() WHERE id = $1`, [id, available]);
  } finally { c.release(); }
}

export async function insertBooking(b) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `INSERT INTO bookings (id, user_id, vehicle_id, merchant_id, start_date, end_date,
         total_amount, advance_amount, balance_amount, payment_status, booking_status,
         commission_amount, merchant_payout, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [b.id, b.user_id, b.vehicle_id, b.merchant_id,
       b.start_date, b.end_date,
       b.total_amount, b.advance_amount, b.balance_amount,
       b.payment_status || 'pending_advance', b.booking_status || 'awaiting_payment',
       b.commission_amount, b.merchant_payout,
       b.created_at || new Date().toISOString()]
    );
    return row(r.rows[0]);
  } finally { c.release(); }
}

export async function updateBookingPayment(id, paymentStatus, bookingStatus) {
  const c = await pool().connect();
  try {
    await c.query(
      `UPDATE bookings SET payment_status = $2, booking_status = COALESCE($3, booking_status), updated_at = NOW() WHERE id = $1`,
      [id, paymentStatus, bookingStatus ?? null]
    );
  } finally { c.release(); }
}

export async function setBookingHandover(id) {
  const c = await pool().connect();
  try {
    await c.query(
      `UPDATE bookings SET booking_status = 'ongoing', handed_over_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
  } finally { c.release(); }
}

export async function setBookingComplete(id) {
  const c = await pool().connect();
  try {
    await c.query(
      `UPDATE bookings SET booking_status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
  } finally { c.release(); }
}

export async function insertPayment(p) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `INSERT INTO payments (id, booking_id, stage, amount, upi_reference, screenshot_url,
         verified_by_admin, verified_at, verified_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [p.id, p.booking_id, p.stage, p.amount, p.upi_reference,
       p.screenshot_url || null, p.verified_by_admin || false,
       p.verified_at || null, p.verified_by || null,
       p.created_at || new Date().toISOString()]
    );
    return row(r.rows[0]);
  } finally { c.release(); }
}

export async function verifyPayment(id, adminId) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `UPDATE payments SET verified_by_admin = TRUE, verified_at = NOW(), verified_by = $2
       WHERE id = $1 RETURNING *`,
      [id, adminId]
    );
    return r.rows[0] ? row(r.rows[0]) : null;
  } finally { c.release(); }
}

export async function insertChatLog(l) {
  const c = await pool().connect();
  try {
    const r = await c.query(
      `INSERT INTO chat_logs (id, user_id, session_id, role, message, created_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [l.id, l.user_id || null, l.session_id, l.role, l.message,
       l.created_at || new Date().toISOString()]
    );
    return row(r.rows[0]);
  } finally { c.release(); }
}

// ---------------- seed ----------------

export async function seedIfEmpty() {
  const c = await pool().connect();
  try {
    const r = await c.query(`SELECT COUNT(*)::int AS n FROM users`);
    if (r.rows[0].n > 0) return false; // already seeded
  } finally { c.release(); }

  const demoHash = await bcrypt.hash('demo1234', 8);
  const adminHash = await bcrypt.hash('admin1234', 8);
  const now = new Date().toISOString();

  const admin = await insertUser({
    id: uuid(), email: 'admin@journeyjunction.com', password_hash: adminHash,
    full_name: 'Super Admin', role: 'admin', kyc_status: 'approved', created_at: now,
  });
  await insertUser({
    id: uuid(), email: 'aman@example.com', password_hash: demoHash,
    full_name: 'Aman Verma', phone: '+91 98765 43210', role: 'user', kyc_status: 'approved',
    driving_license_url: 'https://example.com/dl.jpg',
    id_document_url: 'https://example.com/aadhaar.jpg', id_document_type: 'Aadhaar',
    created_at: now,
  });
  await insertUser({
    id: uuid(), email: 'rohit@example.com', password_hash: demoHash,
    full_name: 'Rohit Sharma', phone: '+91 99887 76655', role: 'user', kyc_status: 'pending',
    driving_license_url: 'https://example.com/rohit-dl.jpg',
    id_document_url: 'https://example.com/rohit-aadhaar.jpg', id_document_type: 'Aadhaar',
    created_at: now,
  });

  const m1 = await insertMerchant({
    id: uuid(), email: 'fleet@approved.com', password_hash: demoHash,
    business_name: 'Approved Fleet Co', owner_name: 'Raj Rao',
    state: 'MH', city: 'Mumbai', address: 'Andheri East', kyc_status: 'approved',
    business_doc_url: 'https://example.com/gst.pdf', identity_doc_url: 'https://example.com/pan.pdf',
    is_approved: true, created_at: now,
  });
  const m2 = await insertMerchant({
    id: uuid(), email: 'lux@rides.com', password_hash: demoHash,
    business_name: 'Lux Rides', owner_name: 'Priya Mehta',
    state: 'DL', city: 'Delhi', kyc_status: 'approved',
    is_approved: true, created_at: now,
  });
  await insertMerchant({
    id: uuid(), email: 'citymotors@example.com', password_hash: demoHash,
    business_name: 'CityMotors Pvt Ltd', owner_name: 'Vikram Joshi',
    state: 'MH', city: 'Pune', kyc_status: 'pending',
    is_approved: true, created_at: now,
  });

  const seeds = [
    { merchant_id: m1.id, title: 'Honda Civic Type R 2019', category: '4_wheeler', seating_capacity: 4, price_per_day: 4500, description: 'Premium sport sedan, fully loaded', image_urls: ['https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800'] },
    { merchant_id: m1.id, title: 'Maruti Swift Dzire', category: '4_wheeler', seating_capacity: 5, price_per_day: 1200, description: 'AC, music system, perfect for city', image_urls: ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'] },
    { merchant_id: m1.id, title: 'Hyundai Creta', category: '4_wheeler', seating_capacity: 5, price_per_day: 2200, description: 'SUV, automatic transmission', image_urls: ['https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800'] },
    { merchant_id: m2.id, title: 'Ferrari 488 Spider', category: '4_wheeler', seating_capacity: 2, price_per_day: 15000, description: 'Luxury supercar experience', image_urls: ['https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800'] },
    { merchant_id: m2.id, title: 'Mercedes C300', category: '4_wheeler', seating_capacity: 5, price_per_day: 8500, description: 'Executive sedan', image_urls: ['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800'] },
    { merchant_id: m1.id, title: 'Royal Enfield Classic', category: '2_wheeler', seating_capacity: 2, price_per_day: 600, description: 'Iconic thumper', image_urls: ['https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=800'] },
    { merchant_id: m1.id, title: 'Honda Activa', category: '2_wheeler', seating_capacity: 2, price_per_day: 400, description: 'Scooter for city commute', image_urls: ['https://images.unsplash.com/photo-1591025207163-942350e47db2?w=800'] },
  ];
  for (const v of seeds) {
    await insertVehicle({ id: uuid(), ...v, is_available: true, created_at: now });
  }
  return true;
}

// Legacy exports for callers that imported them from the JSON store era.
// Routes import `loadDB`, but server.js will call `ensureSchema + refresh` at
// boot instead — keeping these as thin async wrappers prevents breaking those imports.
export async function loadDB() {
  await refresh();
  return _snapshot;
}
