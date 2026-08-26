import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const DATA_FILE = path.join(process.cwd(), 'data.json');

function emptyDb(){
  return { users: [], merchants: [], vehicles: [], bookings: [], payments: [], chat_logs: [] };
}

function seedSync(db) {
  // Sync seed using pre-hashed passwords (bcrypt is async — pre-computed at module load)
  const adminHash = bcrypt.hashSync('admin1234', 8);
  const demoHash = bcrypt.hashSync('demo1234', 8);
  const now = new Date().toISOString();

  db.users.push({
    id: uuid(),
    email: 'admin@journeyjunction.com',
    password_hash: demoHash,
    full_name: 'Super Admin',
    role: 'admin',
    kyc_status: 'approved',
    created_at: now,
  });

  const userId = uuid();
  db.users.push({
    id: userId,
    email: 'aman@example.com',
    password_hash: demoHash,
    full_name: 'Aman Verma',
    phone: '+91 98765 43210',
    role: 'user',
    kyc_status: 'approved',
    driving_license_url: 'https://example.com/dl.jpg',
    id_document_url: 'https://example.com/aadhaar.jpg',
    id_document_type: 'Aadhaar',
    created_at: now,
  });

  db.users.push({
    id: uuid(),
    email: 'rohit@example.com',
    password_hash: demoHash,
    full_name: 'Rohit Sharma',
    phone: '+91 99887 76655',
    role: 'user',
    kyc_status: 'pending',
    driving_license_url: 'https://example.com/rohit-dl.jpg',
    id_document_url: 'https://example.com/rohit-aadhaar.jpg',
    id_document_type: 'Aadhaar',
    created_at: now,
  });

  const m1 = uuid();
  db.merchants.push({
    id: m1,
    email: 'fleet@approved.com',
    password_hash: demoHash,
    business_name: 'Approved Fleet Co',
    owner_name: 'Raj Rao',
    state: 'MH',
    city: 'Mumbai',
    address: 'Andheri East',
    kyc_status: 'approved',
    business_doc_url: 'https://example.com/gst.pdf',
    identity_doc_url: 'https://example.com/pan.pdf',
    is_approved: true,
    created_at: now,
  });

  const m2 = uuid();
  db.merchants.push({
    id: m2,
    email: 'lux@rides.com',
    password_hash: demoHash,
    business_name: 'Lux Rides',
    owner_name: 'Priya Mehta',
    state: 'DL',
    city: 'Delhi',
    kyc_status: 'approved',
    is_approved: true,
    created_at: now,
  });

  db.merchants.push({
    id: uuid(),
    email: 'citymotors@example.com',
    password_hash: demoHash,
    business_name: 'CityMotors Pvt Ltd',
    owner_name: 'Vikram Joshi',
    state: 'MH',
    city: 'Pune',
    kyc_status: 'pending',
    is_approved: true,
    created_at: now,
  });

  const vehicles = [
    { merchant_id: m1, title: 'Honda Civic Type R 2019', category: '4_wheeler', seating_capacity: 4, price_per_day, description: 'Premium sport sedan, fully loaded', image_urls: ['https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800'] },
    { merchant_id: m1, title: 'Maruti Swift Dzire', category: '4_wheeler', seating_capacity: 5, price_per_day, description: 'AC, music system, perfect for city', image_urls: ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'] },
    { merchant_id: m1, title: 'Hyundai Creta', category: '4_wheeler', seating_capacity: 5, price_per_day, description: 'SUV, automatic transmission', image_urls: ['https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800'] },
    { merchant_id: m2, title: 'Ferrari 488 Spider', category: '4_wheeler', seating_capacity: 2, price_per_day, description: 'Luxury supercar experience', image_urls: ['https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800'] },
    { merchant_id: m2, title: 'Mercedes C300', category: '4_wheeler', seating_capacity: 5, price_per_day, description: 'Executive sedan', image_urls: ['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800'] },
    { merchant_id: m1, title: 'Royal Enfield Classic', category: '2_wheeler', seating_capacity: 2, price_per_day, description: 'Iconic thumper', image_urls: ['https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=800'] },
    { merchant_id: m1, title: 'Honda Activa', category: '2_wheeler', seating_capacity: 2, price_per_day, description: 'Scooter for city commute', image_urls: ['https://images.unsplash.com/photo-1591025207163-942350e47db2?w=800'] },
  ];
  for (const v of vehicles) {
    db.vehicles.push({ id: uuid(), created_at, is_available, ...v });
  }
}

export function loadDB(){
  if (!fs.existsSync(DATA_FILE)) {
    const db = emptyDb();
    seedSync(db);
    saveDB(db);
    return db;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.vehicles && parsed.vehicles.length > 0 && (!parsed.vehicles[0].image_urls || parsed.vehicles[0].image_urls.length === 0)) {
      seedSync(parsed);
      saveDB(parsed);
    }
    return parsed;
  } catch {
    const db = emptyDb();
    saveDB(db);
    return db;
  }
}

export function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

let _db= null;
export function db(){
  if (!_db) _db = loadDB();
  return _db;
}

