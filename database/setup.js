const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const db = new Database(path.join(__dirname, 'vkw.db'));

db.exec(`
  PRAGMA journal_mode=WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    business_name TEXT,
    contact_name TEXT,
    phone TEXT,
    role TEXT DEFAULT 'business',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    foot_traffic_daily INTEGER DEFAULT 0,
    foot_traffic_weekly INTEGER DEFAULT 0,
    foot_traffic_monthly INTEGER DEFAULT 0,
    demographics TEXT,
    screen_count INTEGER DEFAULT 1,
    description TEXT,
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    monthly_price REAL DEFAULT 299.00,
    presale_price REAL DEFAULT 50.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ad_spots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    spot_name TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    claimed_by INTEGER,
    claim_type TEXT,
    claimed_at DATETIME,
    expires_at DATETIME,
    monthly_price REAL DEFAULT 299.00,
    FOREIGN KEY (location_id) REFERENCES locations(id),
    FOREIGN KEY (claimed_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    spot_id INTEGER,
    title TEXT NOT NULL,
    file_url TEXT,
    file_type TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    improved_file_url TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    approved_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (spot_id) REFERENCES ad_spots(id)
  );

  CREATE TABLE IF NOT EXISTS redirect_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    business_name TEXT NOT NULL,
    redirect_url TEXT,
    use_panel INTEGER DEFAULT 0,
    panel_bg_color TEXT DEFAULT '#1a1a2e',
    panel_bg_image TEXT,
    coupon_code TEXT,
    coupon_description TEXT,
    panel_headline TEXT,
    panel_subtext TEXT,
    panel_status TEXT DEFAULT 'pending',
    qr_code_url TEXT,
    is_active INTEGER DEFAULT 1,
    scan_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    spot_id INTEGER,
    amount REAL NOT NULL,
    payment_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    stripe_payment_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed admin user
const adminEmail = process.env.ADMIN_EMAIL || 'admin@screengrid.co';
const adminPass = process.env.ADMIN_PASSWORD || 'AdminSG2024!';
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!adminExists) {
  const hashed = bcrypt.hashSync(adminPass, 10);
  db.prepare(`INSERT INTO users (email, password, business_name, contact_name, role) VALUES (?, ?, ?, ?, ?)`).run(
    adminEmail, hashed, 'ScreenGrid', 'Admin', 'admin'
  );
  console.log('✅ Admin user created:', adminEmail);
}

// Seed sample locations
const locationCount = db.prepare('SELECT COUNT(*) as c FROM locations').get().c;
if (locationCount === 0) {
  const locations = [
    {
      name: 'Fairview Park Mall - Main Entrance',
      address: '2960 Kingsway Dr',
      city: 'Kitchener',
      lat: 43.4516,
      lng: -80.5144,
      foot_traffic_daily: 8500,
      foot_traffic_weekly: 59500,
      foot_traffic_monthly: 255000,
      demographics: JSON.stringify({ age: '18-45', gender: '55% F / 45% M', income: 'Mid-High' }),
      screen_count: 3,
      description: 'Prime position at the main mall entrance — maximum visibility for every shopper.',
      monthly_price: 349.00,
      presale_price: 50.00
    },
    {
      name: 'Victoria Park - Pavilion Screen',
      address: '83 Weber St E',
      city: 'Kitchener',
      lat: 43.4509,
      lng: -80.4924,
      foot_traffic_daily: 4200,
      foot_traffic_weekly: 29400,
      foot_traffic_monthly: 126000,
      demographics: JSON.stringify({ age: '16-35', gender: '50% F / 50% M', income: 'Mid' }),
      screen_count: 2,
      description: 'High foot traffic park area, popular with youth and families year-round.',
      monthly_price: 249.00,
      presale_price: 50.00
    },
    {
      name: 'King St & Frederick - Downtown Corner',
      address: '1 King St W',
      city: 'Kitchener',
      lat: 43.4516,
      lng: -80.4925,
      foot_traffic_daily: 12000,
      foot_traffic_weekly: 84000,
      foot_traffic_monthly: 360000,
      demographics: JSON.stringify({ age: '20-50', gender: '48% F / 52% M', income: 'Mid-High' }),
      screen_count: 4,
      description: 'Busiest downtown intersection — unbeatable exposure in the heart of Kitchener.',
      monthly_price: 499.00,
      presale_price: 50.00
    },
    {
      name: 'Conestoga Mall - Food Court',
      address: '550 King St N',
      city: 'Waterloo',
      lat: 43.4854,
      lng: -80.5303,
      foot_traffic_daily: 7200,
      foot_traffic_weekly: 50400,
      foot_traffic_monthly: 216000,
      demographics: JSON.stringify({ age: '15-40', gender: '52% F / 48% M', income: 'Mid' }),
      screen_count: 2,
      description: 'Food court screens — captive audience during dining, perfect for food & lifestyle brands.',
      monthly_price: 299.00,
      presale_price: 50.00
    },
    {
      name: 'Uptown Waterloo - Willis Way',
      address: '75 King St S',
      city: 'Waterloo',
      lat: 43.4668,
      lng: -80.5219,
      foot_traffic_daily: 5800,
      foot_traffic_weekly: 40600,
      foot_traffic_monthly: 174000,
      demographics: JSON.stringify({ age: '19-35', gender: '49% F / 51% M', income: 'High' }),
      screen_count: 2,
      description: 'Trendy uptown district popular with university students and young professionals.',
      monthly_price: 299.00,
      presale_price: 50.00
    }
  ];

  const insertLoc = db.prepare(`INSERT INTO locations (name, address, city, lat, lng, foot_traffic_daily, foot_traffic_weekly, foot_traffic_monthly, demographics, screen_count, description, monthly_price, presale_price) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertSpot = db.prepare(`INSERT INTO ad_spots (location_id, spot_name, monthly_price) VALUES (?,?,?)`);

  for (const loc of locations) {
    const result = insertLoc.run(loc.name, loc.address, loc.city, loc.lat, loc.lng, loc.foot_traffic_daily, loc.foot_traffic_weekly, loc.foot_traffic_monthly, loc.demographics, loc.screen_count, loc.description, loc.monthly_price, loc.presale_price);
    for (let i = 1; i <= loc.screen_count; i++) {
      insertSpot.run(result.lastInsertRowid, `Screen ${i}`, loc.monthly_price);
    }
  }
  console.log('✅ Sample locations seeded');
}

console.log('✅ Database ready at database/vkw.db');
module.exports = db;
