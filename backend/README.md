# Journey Junction — Backend

Express.js + PostgreSQL + Google Gemini AI.

## Setup

```bash
cd backend
cp .env.example .env
# edit DATABASE_URL, JWT_SECRET, GEMINI_API_KEY
npm install
psql $DATABASE_URL -f src/db/schema.sql
npm run db:seed   # creates super admin
npm run dev       # http://localhost:4000
```

## Endpoints

- `POST /api/auth/register/user`
- `POST /api/auth/register/merchant`
- `POST /api/auth/login`
- `GET  /api/auth/me` (Bearer)
- `GET  /api/vehicles/search?city=&state=&category=&minPrice=&maxPrice=&seating=`
- `GET  /api/vehicles/:id`
- `POST /api/bookings` (user)
- `POST /api/bookings/:id/pay/advance` (user)
- `POST /api/bookings/:id/pay/balance` (user)
- `POST /api/merchant/vehicles` (merchant)
- `POST /api/admin/kyc/approve` (admin)
- `POST /api/admin/payments/verify` (admin)
- `POST /api/ai/chat` (Bearer)
- `GET  /api/ai/recommendations` (user)

Two-stage payment: booking → 50% advance → admin verifies → 50% balance → admin verifies → fully paid. Commission split 30/70 stored on booking row.
