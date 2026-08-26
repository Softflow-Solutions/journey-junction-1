-- Journey Junction PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE kyc_status_enum AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE vehicle_category_enum AS ENUM ('2_wheeler', '4_wheeler');
CREATE TYPE payment_status_enum AS ENUM ('pending_advance', 'advance_paid', 'fully_paid');
CREATE TYPE booking_status_enum AS ENUM ('confirmed', 'ongoing', 'completed', 'cancelled');
CREATE TYPE payment_stage_enum AS ENUM ('advance', 'balance');
CREATE TYPE chat_role_enum AS ENUM ('user', 'assistant');
CREATE TYPE user_role_enum AS ENUM ('user', 'merchant', 'admin');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role user_role_enum NOT NULL DEFAULT 'user',
  kyc_status kyc_status_enum NOT NULL DEFAULT 'pending',
  driving_license_url TEXT,
  id_document_url TEXT,
  id_document_type VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE merchants (
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

CREATE TABLE vehicles (
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
CREATE INDEX idx_vehicles_merchant ON vehicles(merchant_id);
CREATE INDEX idx_vehicles_available ON vehicles(is_available) WHERE is_available = TRUE;

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 90),
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bookings (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_merchant ON bookings(merchant_id);

CREATE TABLE payments (
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

CREATE TABLE chat_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(64) NOT NULL,
  role chat_role_enum NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_session ON chat_logs(session_id, created_at);
