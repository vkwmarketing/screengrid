-- ============================================================
-- ScreenGrid — Supabase Schema
-- Paste this into your Supabase project → SQL Editor → Run
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  password        TEXT NOT NULL,
  business_name   TEXT,
  contact_name    TEXT,
  phone           TEXT,
  role            TEXT DEFAULT 'business',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Locations (LED screens / ad boards)
CREATE TABLE IF NOT EXISTS locations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  address               TEXT NOT NULL,
  city                  TEXT NOT NULL,
  latitude              FLOAT NOT NULL,
  longitude             FLOAT NOT NULL,
  daily_foot_traffic    INTEGER DEFAULT 0,
  weekly_foot_traffic   INTEGER DEFAULT 0,
  monthly_foot_traffic  INTEGER DEFAULT 0,
  demographics          JSONB DEFAULT '{}',
  screen_count          INTEGER DEFAULT 1,
  description           TEXT,
  image_url             TEXT,
  is_active             BOOLEAN DEFAULT true,
  base_monthly_price    FLOAT DEFAULT 299.00,
  presale_price         FLOAT DEFAULT 50.00,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Ad Spots (individual screens within a location)
CREATE TABLE IF NOT EXISTS ad_spots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  status      TEXT DEFAULT 'available',   -- available | presale | claimed
  claimed_by  UUID REFERENCES users(id),
  claim_type  TEXT,                        -- presale | full
  claimed_at  TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  price       FLOAT DEFAULT 299.00
);

-- Ads (submitted by businesses for admin review)
CREATE TABLE IF NOT EXISTS ads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  spot_id           UUID REFERENCES ad_spots(id),
  title             TEXT NOT NULL,
  file_url          TEXT,
  file_type         TEXT,
  status            TEXT DEFAULT 'pending',  -- pending | approved | rejected | improved
  admin_notes       TEXT,
  improved_file_url TEXT,
  submitted_at      TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ
);

-- QR Redirect Links
CREATE TABLE IF NOT EXISTS redirect_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT UNIQUE NOT NULL,
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name       TEXT NOT NULL,
  redirect_url        TEXT,
  use_panel           BOOLEAN DEFAULT false,
  panel_bg_color      TEXT DEFAULT '#1a1a2e',
  panel_bg_image      TEXT,
  coupon_code         TEXT,
  coupon_description  TEXT,
  panel_headline      TEXT,
  panel_subtext       TEXT,
  panel_status        TEXT DEFAULT 'pending',  -- pending | approved | rejected
  qr_code_url         TEXT,
  is_active           BOOLEAN DEFAULT true,
  scan_count          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id),
  spot_id           UUID REFERENCES ad_spots(id),
  amount            FLOAT NOT NULL,
  payment_type      TEXT NOT NULL,   -- presale | full
  status            TEXT DEFAULT 'pending',
  stripe_payment_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT,
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (recommended for production)
-- For now, using service role key bypasses RLS — enable when ready
-- ============================================================
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
-- (etc.)
