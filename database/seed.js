require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

async function seed() {
  console.log('🌱 Seeding ScreenGrid database...\n');

  // ── Admin user ─────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@screengrid.co';
  const adminPass  = process.env.ADMIN_PASSWORD || 'AdminSG2024!';

  const { data: existingAdmin } = await supabase
    .from('users')
    .select('id')
    .eq('email', adminEmail)
    .single();

  if (!existingAdmin) {
    const hashed = bcrypt.hashSync(adminPass, 10);
    const { error } = await supabase.from('users').insert({
      email: adminEmail,
      password: hashed,
      business_name: 'ScreenGrid',
      contact_name: 'Admin',
      role: 'admin'
    });
    if (error) console.error('Admin error:', error.message);
    else console.log('✅ Admin user created:', adminEmail);
  } else {
    console.log('ℹ️  Admin already exists, skipping');
  }

  // ── Sample locations ───────────────────────────────────────
  const { count } = await supabase
    .from('locations')
    .select('*', { count: 'exact', head: true });

  if (count > 0) {
    console.log('ℹ️  Locations already seeded, skipping');
    console.log('\n✅ Database ready!');
    return;
  }

  const locations = [
    {
      name: 'Fairview Park Mall - Main Entrance',
      address: '2960 Kingsway Dr', city: 'Kitchener',
      latitude: 43.4516, longitude: -80.5144,
      daily_foot_traffic: 8500, weekly_foot_traffic: 59500, monthly_foot_traffic: 255000,
      demographics: { age: '18-45', gender: '55% F / 45% M', income: 'Mid-High' },
      screen_count: 3,
      description: 'Prime position at the main mall entrance — maximum visibility for every shopper.',
      base_monthly_price: 349.00, presale_price: 50.00
    },
    {
      name: 'Victoria Park - Pavilion Screen',
      address: '83 Weber St E', city: 'Kitchener',
      latitude: 43.4509, longitude: -80.4924,
      daily_foot_traffic: 4200, weekly_foot_traffic: 29400, monthly_foot_traffic: 126000,
      demographics: { age: '16-35', gender: '50% F / 50% M', income: 'Mid' },
      screen_count: 2,
      description: 'High foot traffic park area, popular with youth and families year-round.',
      base_monthly_price: 249.00, presale_price: 50.00
    },
    {
      name: 'King St & Frederick - Downtown Corner',
      address: '1 King St W', city: 'Kitchener',
      latitude: 43.4516, longitude: -80.4925,
      daily_foot_traffic: 12000, weekly_foot_traffic: 84000, monthly_foot_traffic: 360000,
      demographics: { age: '20-50', gender: '48% F / 52% M', income: 'Mid-High' },
      screen_count: 4,
      description: 'Busiest downtown intersection — unbeatable exposure in the heart of Kitchener.',
      base_monthly_price: 499.00, presale_price: 50.00
    },
    {
      name: 'Conestoga Mall - Food Court',
      address: '550 King St N', city: 'Waterloo',
      latitude: 43.4854, longitude: -80.5303,
      daily_foot_traffic: 7200, weekly_foot_traffic: 50400, monthly_foot_traffic: 216000,
      demographics: { age: '15-40', gender: '52% F / 48% M', income: 'Mid' },
      screen_count: 2,
      description: 'Food court screens — captive audience during dining, perfect for food & lifestyle brands.',
      base_monthly_price: 299.00, presale_price: 50.00
    },
    {
      name: 'Uptown Waterloo - Willis Way',
      address: '75 King St S', city: 'Waterloo',
      latitude: 43.4668, longitude: -80.5219,
      daily_foot_traffic: 5800, weekly_foot_traffic: 40600, monthly_foot_traffic: 174000,
      demographics: { age: '19-35', gender: '49% F / 51% M', income: 'High' },
      screen_count: 2,
      description: 'Trendy uptown district popular with university students and young professionals.',
      base_monthly_price: 299.00, presale_price: 50.00
    }
  ];

  for (const loc of locations) {
    const { data: inserted, error } = await supabase
      .from('locations')
      .insert(loc)
      .select()
      .single();

    if (error) { console.error(`Location error (${loc.name}):`, error.message); continue; }

    // Create a spot per screen
    const spots = Array.from({ length: loc.screen_count }, (_, i) => ({
      location_id: inserted.id,
      name: `Screen ${i + 1}`,
      price: loc.base_monthly_price || 125
    }));

    const { error: spotErr } = await supabase.from('ad_spots').insert(spots);
    if (spotErr) console.error(`Spot error for ${loc.name}:`, spotErr.message);
    else console.log(`✅ ${loc.name} (${loc.screen_count} spots)`);
  }

  console.log('\n✅ Database seeded and ready!');
  console.log(`🔑 Admin login: ${adminEmail}`);
}

seed().catch(err => { console.error(err); process.exit(1); });
