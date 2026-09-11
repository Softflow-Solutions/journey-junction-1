# Journey Junction — Backend

Express.js + PostgreSQL (Neon) + Google Gemini AI. Production target: Render.

## Local setup

```bash
cd backend
cp .env.example .env
# fill in DATABASE_URL (Neon dev branch), JWT_SECRET, GEMINI_API_KEY, FRONTEND_URL
npm install
npm start            # http://localhost:4000
```

The server auto-creates the schema and seeds demo data (admin + 2 customers +
3 merchants + 7 vehicles) on first boot if the `users` table is empty.

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

## Demo credentials (seeded)

- Customer: `aman@example.com` / `demo1234`
- Customer (KYC pending): `rohit@example.com` / `demo1234`
- Merchant: `fleet@approved.com` / `demo1234`
- Merchant: `lux@rides.com` / `demo1234`
- Admin: `admin@journeyjunction.com` / `admin1234`

## Deploy to Render

1. Push the repo to GitHub.
2. Create a **Neon** project at <https://neon.tech>. Copy the **pooled** connection string (the URL with `-pooler` in the hostname — it's the one labelled "Pooled connection" in the Neon dashboard).
3. In **Render** → New → Web Service → connect the repo.
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
4. Set environment variables on the Render service:
   - `DATABASE_URL` — the Neon pooled URL (`?sslmode=require` at the end)
   - `JWT_SECRET` — long random string
   - `GEMINI_API_KEY` — optional
   - `FRONTEND_URL` — your Vercel URL, comma-separated if you want to allow multiple origins (e.g. `https://journey-junction.vercel.app,https://journey-junction-staging.vercel.app`)
   - `PLATFORM_COMMISSION_PCT` — `30` is the default
   - `NODE_ENV` — `production`
5. Deploy. After the first request hits, the schema is auto-created and demo data seeded.
6. Verify with `curl https://<your-render-url>/api/health` → should return `{ ok: true, db: 'up' }`.

`render.yaml` is included as a declarative blueprint — Render reads it on "New from Blueprint" deploys.

## Notes

- The data layer (`src/db/store.js`) is Postgres-only; the JSON-file fallback has been removed. On Render, the filesystem is ephemeral so a JSON store would reset on every redeploy.
- The login route no longer has a demo bypass — passwords are bcrypt-verified only.
- The health route does `SELECT 1` so it doubles as a DB-up signal for Render's health checks.
