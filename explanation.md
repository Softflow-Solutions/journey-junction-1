# Journey Junction — Project Explanation

A vehicle rental marketplace for 2-wheelers and 4-wheelers. Customers book from verified fleet owners, pay in two UPI stages, and an AI assistant helps them pick vehicles. Merchants list and manage their fleet. Admin verifies KYC and payments.

This document explains every part of the project — what stack is used and why, the folder layout, how data flows, the database, how AI works, how to run it locally, and how to deploy each piece.

---

## 1. Tech Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) | Single repo serves customer + merchant + admin pages. Server-side routing + CSS Modules give a mobile-friendly shell without a separate mobile app. React lets us reuse the booking component across roles. |
| Backend | Express.js (Node 24, ESM) | Lightweight, runs on every host (Render, Railway, Fly). Pairs naturally with `bcryptjs` + `jsonwebtoken` + `zod`. ESM keeps imports clean. |
| Persistence | JSON file (`backend/data.json`) | The MVP deliberately uses a flat JSON store wrapped in `db()/saveDB()` so the API stays the same when we switch to Postgres later. `pg` is already a declared dependency for that migration. |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | Stateless tokens keep horizontal scaling simple. Bcrypt with cost 8 for real passwords; non-empty password accepted as a demo-bypass for the seeded accounts. |
| Validation | `zod` | Strong typed request validation at every route. Avoids manual `if`-chains, gives a clean 400 response shape. |
| AI | Google Gemini (`@google/generative-ai`) | Generous free tier, good at short conversational answers. `gemini-3.6-flash` is fast + cheap. Service falls back to a local intent-based responder when the key is missing or quota is exhausted. |
| HTTP client | `fetch` via `lib/api.ts` | No extra dependency. Single helper adds the JWT, handles JSON, throws on non-2xx. |
| File uploads | `multer` (declared) + data-URL preview | License + ID images are stored as base64 data-URLs for the MVP to avoid a storage provider. Easy to swap to S3/Cloudinary later. |
| CORS | `cors` middleware | Locks the API to `FRONTEND_URL` so a malicious site can't steal tokens. |

### Why these picks

- **One language end-to-end** — TypeScript on the frontend, modern JS on the backend, both Node 18+ capable. Less context-switching than mixing Python or Go.
- **No paid infra required** — JSON store, free Gemini tier, free Vercel/Render/Neon tiers. You can demo the whole product at zero cost.
- **Composable AI** — Gemini is wrapped in a thin `services/gemini.js`. The local fallback means the chat feature never breaks even when the key quota runs out.
- **Three roles, one codebase** — `/customer`, `/merchant`, `/admin` are separate Next.js routes but share `lib/` helpers, status labels, and INR formatting.

---

## 2. Project Structure

```
journey-junction/
├── backend/
│   ├── src/
│   │   ├── server.js               # Express bootstrap
│   │   ├── config/env.js           # env loader, defaults
│   │   ├── db/
│   │   │   ├── store.js            # JSON persistence (db(), saveDB())
│   │   │   └── schema.sql          # Reference Postgres schema
│   │   ├── middleware/
│   │   │   ├── auth.js             # verifyToken, requireRole, signToken
│   │   │   └── error.js            # HttpError class + errorHandler
│   │   ├── routes/
│   │   │   ├── auth.js             # /login, /register/user, /register/merchant
│   │   │   ├── user.js             # /kyc/submit, /profile, /bookings
│   │   │   ├── merchant.js         # fleet CRUD, earnings, bookings, handover
│   │   │   ├── admin.js            # KYC, payments, finance, listings
│   │   │   ├── vehicles.js         # public search + detail
│   │   │   ├── bookings.js         # create + pay advance/balance + handover
│   │   │   └── ai.js               # /chat, /recommendations
│   │   └── services/
│   │       ├── gemini.js           # Gemini client + local fallback
│   │       └── payment.js          # commission / payout math
│   ├── data.json                   # JSON database (live)
│   ├── .env                        # PORT, JWT_SECRET, GEMINI_API_KEY, etc.
│   └── package.json                # ESM, scripts: start / dev
├── frontend/
│   ├── app/
│   │   ├── page.tsx                # Landing
│   │   ├── login/, register/       # Auth pages
│   │   ├── customer/page.tsx       # Customer mobile shell (home/search/detail/...)
│   │   ├── merchant/page.tsx       # Merchant dashboard
│   │   └── admin/page.tsx          # Admin dashboard
│   ├── lib/
│   │   ├── api.ts                  # fetch wrapper
│   │   ├── format.ts               # formatINR, PLACEHOLDER
│   │   ├── status.ts               # label/tone helpers
│   │   └── pagination.ts           # Paged<T>, <Pagination>
│   ├── app/**/*.module.css         # CSS Modules per page
│   ├── next.config.js, tsconfig.json
│   └── package.json
└── explanation.md                  # this file
```

---

## 3. Backend Architecture

### 3.1 Bootstrap (`server.js`)

1. Load env via `config/env.js`.
2. Enable CORS (only `FRONTEND_URL`), JSON body parser with a 2 MB limit (enough for base64 images).
3. Mount routers under `/api/{auth,user,merchant,admin,vehicles,bookings,ai}`.
4. 404 fallback, then the global `errorHandler`.

### 3.2 Auth middleware

`middleware/auth.js` exports:

- `signToken({sub, role, email})` — 7-day JWT signed with `JWT_SECRET`.
- `verifyToken(req, res, next)` — reads `Authorization: Bearer <token>`, verifies, attaches `req.user = {sub, role, email}`.
- `requireRole(role)` — 403 unless `req.user.role === role`.

The chain on every protected route: `verifyToken, requireRole(...)`.

### 3.3 Error middleware

`HttpError(status, message)` is thrown by route handlers, caught by `errorHandler`, returned as `{error: message}` with the right HTTP code. Zod failures bubble up as 400 with the issue path + message.

### 3.4 Persistence layer

`db/store.js` exposes:

```js
db()          // returns the in-memory JSON object
saveDB(s)     // writes back to data.json (atomic write to .tmp, then rename)
```

Every route follows the same pattern:

```js
const store = db();
const x = store.users.find(...);
store.bookings.push(newBooking);
saveDB(store);
```

This keeps the surface tiny and lets us swap the body of `db()` to a Postgres pool later without changing a single route.

### 3.5 Payments service

`services/payment.js` is the only place commission math lives:

```
total_amount      = days * price_per_day
advance_amount    = total / 2
balance_amount    = total / 2
commission_amount = total * 0.30     (PLATFORM_COMMISSION_PCT)
merchant_payout   = total - commission
```

Used at booking creation. Admins and merchants see these on every booking row.

---

## 4. Data Flow

### 4.1 Auth

```
[register form] → POST /api/auth/register/user → bcrypt hash → saveDB
                 → signToken → { token, user, role: 'user' } → localStorage
[login form]    → POST /api/auth/login  → lookup by email
                 → bcrypt.compare OR (demo bypass: password.length > 0)
                 → signToken → return role-specific payload
```

The Next.js client stores the JWT in `localStorage.jj_token`, role in `jj_role`, basic profile in `jj_user`. `lib/api.ts` reads the token on every request.

### 4.2 Booking flow (the core)

```
1. Customer opens /customer → HomeScreen
   GET /api/vehicles/search?category=...
   list filtered to hide currently-booked vehicles
2. Detail screen → dates picked + UPI ref entered
   POST /api/bookings  {vehicle_id, start_date, end_date, upi_reference}
   - Zod validates body
   - Computes total/advance/balance/commission/payout
   - booking.payment_status = 'pending_advance'
   - booking.booking_status = 'awaiting_payment'
   - Creates a payments row (stage='advance', upi_reference)
   - Returns enriched booking (with vehicle_title, image, duration_days)

3. Admin sees new pending payment
   GET /api/admin/payments/pending
   POST /api/admin/payments/verify {payment_id}
   - Flips verified_by_admin=true
   - booking.payment_status = 'advance_paid'
   - booking.booking_status = 'confirmed'  (only if previously awaiting_payment)

4. Customer opens My Bookings → sees 'Confirmed'
   (awaiting_payment bookings are hidden until admin verifies)

5. Merchant marks vehicle handed over
   POST /api/bookings/:id/handover
   - Guard: payment_status=advance_paid AND advance verified
   - Sets booking.booking_status='ongoing', handed_over_at=now
   - Sets vehicle.is_available=false

6. Customer opens /customer → that vehicle no longer appears in home/search

7. Merchant marks completed
   POST /api/bookings/:id/complete (merchant route)
   - booking.booking_status='completed'
   - vehicle.is_available=true  (vehicle is re-listed)
```

### 4.3 KYC flow

```
Customer submits KYC from My Profile → Driving Licence
POST /api/user/kyc/submit {
  driving_license_front_url,
  driving_license_back_url,
  id_document_url,
  id_document_type
}
- Stored on user.kyc_status='pending'
- Object.assign keeps backwards-compat field driving_license_url = front_url

Admin → KYC tab → pending list
POST /api/admin/kyc/approve {user_id}   → kyc_status='approved'
POST /api/admin/kyc/reject  {user_id}  → kyc_status='rejected'
```

The admin KYC card renders two thumbnails (DL front, DL back) plus the ID document.

---

## 5. Database Schema

The project ships with **two schemas**:
1. `backend/src/db/schema.sql` — target PostgreSQL schema (declarative reference).
2. `backend/data.json` — the live JSON store used today.

Both express the same domain.

### 5.1 Tables / collections

**users (customers)**
```
id              UUID PK
email           unique
password_hash   bcrypt
full_name
phone
role            'user' (admins share this table, role='admin')
kyc_status      pending | approved | rejected
driving_license_url         (kept = front_url for back-compat)
driving_license_front_url
driving_license_back_url
id_document_url
id_document_type
created_at, updated_at
```

**merchants**
```
id, email, password_hash, business_name, owner_name,
state, city, address,
kyc_status, business_doc_url, identity_doc_url,
is_approved, created_at, updated_at
```

**vehicles**
```
id, merchant_id FK,
title, category ('2_wheeler'|'4_wheeler'),
seating_capacity, price_per_day, description,
image_urls (text[]),
is_available bool,
created_at, updated_at
```

**promotions**
```
id, merchant_id, vehicle_id (nullable = applies to whole fleet),
discount_percent, valid_from, valid_to, is_active
```

**bookings**
```
id, user_id, vehicle_id, merchant_id,
start_date, end_date,
total_amount, advance_amount, balance_amount,
payment_status  ('pending_advance'|'advance_paid'|'fully_paid'),
booking_status  ('awaiting_payment'|'confirmed'|'ongoing'|'completed'|'cancelled'),
handed_over_at  (set when merchant hands over),
commission_amount, merchant_payout,
created_at, updated_at
```

**payments**
```
id, booking_id,
stage ('advance'|'balance'),
amount,
upi_reference, screenshot_url,
verified_by_admin bool, verified_at,
created_at
```

**chat_logs**
```
id, user_id (nullable for guest sessions), session_id,
role ('user'|'assistant'), message, created_at
```

### 5.2 Migrations & switching to Postgres

`pg` is already in dependencies. To migrate:

1. Replace `db()` body with `new Pool({connectionString: env.DATABASE_URL})` and a query helper.
2. Map each `store.X.find/push/filter` to SQL — the call sites already use single-collection access patterns.
3. Run `schema.sql` once at deploy time.

---

## 6. AI Integration

### 6.1 Where it lives

`services/gemini.js` — wraps `@google/generative-ai` with:

- Lazy client construction (`getClient()`).
- A `withRetry(fn, attempts=3)` helper for transient 429/5xx.
- A **local intent-based fallback** (`localReply`, `rankLocally`) so the product works with no key OR when quota is exhausted.

Two public functions:

```
generateChatReply(history, userMessage, vehicleContext)   → string
generateRecommendations(userHistory, vehicles, prefs)     → [{id, reason, score}]
```

Both try Gemini first; on any error or missing key, they return local output. Users never see a broken chat.

### 6.2 Chatbot (`POST /api/ai/chat`)

Input:
```json
{ "message": "family trip", "session_id": "optional" }
```

Steps inside `routes/ai.js`:
1. Validate body with zod.
2. Build **vehicle context** from store: list of currently-available vehicles (title, category, price_per_day, seating). Skips merchant-hidden fields.
3. Load last N messages of `chat_logs` for this `session_id` (history cap = 10).
4. Call `generateChatReply(history, message, context)`.
5. Persist user + assistant messages to `chat_logs`.
6. Return `{reply, session_id}`.

System prompt anchors the model:
> "You are the Journey Junction AI assistant — a vehicle rental marketplace. Answer user queries about vehicle availability, booking process, two-stage UPI payments (50% advance, 50% balance), pricing, KYC requirements, and platform policies."

**Where the data comes from:**
- Vehicle names, prices, categories → the JSON store (`store.vehicles`).
- Conversation history → `chat_logs` rows for the same `session_id`.
- User identity (when logged in) → JWT in `Authorization` header.

The frontend chat panel is a floating `💬` button in `/customer`, `/merchant`, `/admin`. It opens `ChatPanel` which calls `/api/ai/chat` and streams the reply inline.

### 6.3 Recommendations (`GET /api/ai/recommendations`)

Steps inside `routes/ai.js`:

1. Require authenticated user (JWT).
2. Pull **the user's last 20 bookings** + each vehicle's category and price.
3. Build a **preference summary** with `buildPreferenceSummary()`:
   - `favourite_category`: most-booked category.
   - `avg_price_per_day`: mean of past prices.
   - `price_band`: budget (<800) | mid (800–2500) | premium (2500+).
4. List **available vehicles** the user has not already booked (active or recent).
5. Call `generateRecommendations(userHistory, vehicles, preferences)`.
6. Return `{recommendations: [{id, reason, score}]}`.

**How ranking works:**
- Local fallback (`rankLocally`): score = +5 if category matches favourite, +3 if price in band, +5-(price/500) tiebreaker. Top 5 returned.
- Gemini path: prompt includes the user's preference summary, last 10 bookings, and a compact list of candidates. Model returns a JSON array of `{id, reason, score}`. The route extracts the JSON and returns it.

The frontend renders the result as a horizontal strip on the customer home (5 cards: image, title, price, reason). Fires on mount via `useEffect([token])`.

### 6.4 Local fallback details

`localReply()` is a regex-driven intent router:

| Trigger | Reply |
|---|---|
| family / trip / group | Suggest 7-seater / SUV if any in context, else generic |
| cheap / budget | List budget vehicles from context |
| book / pay / advance / UPI | Explain two-stage payment flow |
| KYC / document / license | Explain DL front+back + ID upload |
| cancel / refund | Cancellation pointer |
| available / list | Show up to 6 from context |
| (default) | Hints at suggested prompts |

`rankLocally()` produces deterministic, fast recommendations — no external API call needed.

---

## 7. Installing & Running Locally

### 7.1 Prerequisites

- Node.js **18+** (developed on Node 24).
- A Gemini API key — optional. Without it, chat uses the local fallback.

### 7.2 Clone and configure

```bash
git clone <your-repo-url> journey-junction
cd journey-junction
```

### 7.3 Backend

```bash
cd backend
cp .env.example .env
# edit .env (see table below)
npm install
npm run dev          # node --watch src/server.js → http://localhost:4000
```

`.env` keys:

| Key | Default | Purpose |
|---|---|---|
| `PORT` | 4000 | API port |
| `JWT_SECRET` | dev-secret-change-me | JWT signing key |
| `FRONTEND_URL` | http://localhost:3000 | CORS origin |
| `PLATFORM_COMMISSION_PCT` | 30 | Commission percent |
| `GEMINI_API_KEY` | (empty) | Enables real Gemini chat/recos |

Seed accounts are created on first run inside `store.js`:
- Customer: `aman@example.com`
- Merchant: `fleet@approved.com`
- Admin: `admin@journeyjunction.com`

Passwords for demo: `demo1234` for user/merchant, `admin1234` for admin. Any non-empty password also works (demo bypass).

### 7.4 Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

The frontend reads `NEXT_PUBLIC_API_URL` if you want to point at a remote backend. Default: `http://localhost:4000/api`.

### 7.5 Verify

```bash
curl http://localhost:4000/api/health            # {ok:true}
curl http://localhost:3000                       # Landing
curl http://localhost:3000/customer              # Mobile shell
```

---

## 8. Deployment

### 8.1 Backend on Render

1. Push the repo to GitHub.
2. Render → **New** → **Web Service** → connect the repo.
3. Root directory: `backend`.
4. Build command: `npm install`.
5. Start command: `npm start`.
6. Environment variables:
   - `JWT_SECRET` = a long random string
   - `FRONTEND_URL` = your Vercel URL (set after frontend deploys)
   - `GEMINI_API_KEY` = your key (optional)
   - `PLATFORM_COMMISSION_PCT` = 30
7. Add a **persistent disk** mounted at `/opt/render/project/src/data` and point `data.json` there, or migrate to Postgres (see below).

After first deploy, copy the Render URL, e.g. `https://jj-api.onrender.com`.

### 8.2 Database on Neon

1. Sign in at neon.tech → **New project** → pick a region.
2. Copy the connection string (with `?sslmode=require`).
3. In Render → service → environment → add `DATABASE_URL`.
4. (Optional) Migrate by replacing `backend/src/db/store.js` body to use `pg.Pool`. The schema in `backend/src/db/schema.sql` already matches the JSON shape.

For the JSON-only MVP, Render's free instance restarts the disk — `data.json` resets on every deploy. If you need persistence without Postgres yet, use **Render's persistent disk** (1 GB free tier) mounted at a path you point the store to.

### 8.3 Frontend on Vercel

1. Vercel → **New project** → import the repo.
2. **Root directory**: `frontend` (configure under *Project Settings → General → Root Directory*).
3. Framework preset: Next.js (auto-detected).
4. Build command: `next build`.
5. Output directory: `.next`.
6. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://jj-api.onrender.com/api`
7. Deploy.

After first deploy, update `FRONTEND_URL` on Render to the new Vercel URL so CORS allows it.

### 8.4 Post-deploy checklist

- [ ] `curl https://jj-api.onrender.com/api/health` → 200.
- [ ] `curl https://<your-app>.vercel.app` → 200.
- [ ] Login as admin → KYC tab loads.
- [ ] Login as customer → home loads, recommendations strip visible.
- [ ] Booking flow end-to-end: search → book → admin verifies → merchant handover → merchant complete.

### 8.5 Production hardening (optional)

- Replace JSON store with Postgres (path already mapped in `schema.sql`).
- Move image uploads off base64 to S3/Cloudinary (`multer` already wired).
- Switch JWT to short-lived access + refresh tokens.
- Add rate limiting on `/api/ai/*` (5-min cache for repeat queries).
- Set up a CI deploy hook so `data.json` changes don't get redeployed as static files.

---

## 9. Where to look next

| Need to... | File |
|---|---|
| Add a route | `backend/src/routes/*.js` |
| Change a label/status | `frontend/lib/status.ts` |
| Change currency formatting | `frontend/lib/format.ts` |
| Change commission math | `backend/src/services/payment.js` |
| Tweak AI prompts / fallback | `backend/src/services/gemini.js` |
| Modify the customer UI | `frontend/app/customer/page.tsx` + `customer.module.css` |
| Modify merchant UI | `frontend/app/merchant/page.tsx` |
| Modify admin UI | `frontend/app/admin/page.tsx` |
| Reference DB shape | `backend/src/db/schema.sql` |

That's the whole product: three roles, one Express API, one Next.js app, one JSON store, one Gemini integration with a fallback. Plug in a Postgres URL + a real storage bucket and the same code is production-ready.