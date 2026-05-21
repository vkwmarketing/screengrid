# ScreenGrid — Digital OOH Advertising Platform

Full-stack web app for managing digital out-of-home ad spots in the KW region.

---

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** Supabase (PostgreSQL)
- **Auth:** JWT + bcryptjs
- **File Uploads:** Multer (local disk)
- **QR Codes:** qrcode npm package
- **Maps:** Leaflet.js (dark CartoDB tiles)
- **Frontend:** Vanilla JS / HTML / CSS

---

## Quick Start

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) → New Project → note your **Project URL** and **service_role key** (Settings → API).

### 2. Run the schema
In Supabase → **SQL Editor**, paste and run the contents of `database/schema.sql`.

### 3. Install dependencies
```bash
npm install
```

### 4. Configure environment
```bash
cp .env.example .env
```
Fill in:
| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → service_role secret |
| `JWT_SECRET` | Any long random string |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Your choice |
| `BASE_URL` | Your domain (e.g. `https://screengrid.co`) |

### 5. Seed the database
```bash
npm run seed
```
This creates the admin account and 5 sample KW locations.

### 6. Start the server
```bash
node server.js
# or for development:
npm run dev
```

Open **http://localhost:3000**

---

## Pages

| URL | Description |
|---|---|
| `/` | Homepage — hero, map, pricing, how it works |
| `/map.html` | Full interactive locations map |
| `/login.html` | Login |
| `/signup.html` | Business registration |
| `/dashboard.html` | Business dashboard |
| `/admin.html` | Admin portal |

---

## Database

All tables live in your Supabase project. Schema is in `database/schema.sql`.  
The service role key bypasses Row Level Security — good for getting started. Enable RLS policies before going public.

---

## Deployment Notes
- Set `NODE_ENV=production` and `BASE_URL` to your domain
- Use a process manager (PM2) and reverse proxy (nginx/Caddy)
- `uploads/` directory must be on persistent storage
- For Stripe: add `STRIPE_SECRET_KEY` and wire up `routes/payments.js`

---

## Default Admin (set in .env)
- Email: `admin@screengrid.co`
- Password: `AdminSG2024!`
