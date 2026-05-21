const express  = require('express');
const router   = express.Router();
const supabase = require('../database/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

const PUBLIC_LOCATION_SELECT = 'id, name, address, city, latitude, longitude, daily_foot_traffic, weekly_foot_traffic, monthly_foot_traffic, demographics, screen_count, description, image_url, is_active, base_monthly_price, presale_price, launch_date, ad_spots(id, name, status, price)';

function publicSpot(s) {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    price: s.status === 'available' ? s.price : null
  };
}

function publicLocation(loc) {
  const spots = (loc.ad_spots || []).map(publicSpot);
  const safeLoc = {
    id: loc.id,
    name: loc.name,
    address: loc.address,
    city: loc.city,
    latitude: loc.latitude,
    longitude: loc.longitude,
    daily_foot_traffic: loc.daily_foot_traffic,
    weekly_foot_traffic: loc.weekly_foot_traffic,
    monthly_foot_traffic: loc.monthly_foot_traffic,
    demographics: loc.demographics,
    screen_count: loc.screen_count,
    description: loc.description,
    image_url: loc.image_url,
    is_active: loc.is_active,
    base_monthly_price: loc.base_monthly_price,
    presale_price: loc.presale_price,
    launch_date: loc.launch_date,
    total_spots: spots.length,
    available_spots: spots.filter(s => s.status === 'available').length,
    spots
  };

  if (loc.distance !== undefined) safeLoc.distance = loc.distance;
  return safeLoc;
}

// Haversine distance in km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// GET /api/locations — all active locations with spot counts
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select(PUBLIC_LOCATION_SELECT)
      .eq('is_active', true)
      .order('daily_foot_traffic', { ascending: false });
    if (error) throw error;

    res.json({
      locations: (data || []).map(publicLocation)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/nearby/search?lat=&lng=&radius=
router.get('/nearby/search', async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    const { data, error } = await supabase
      .from('locations')
      .select(PUBLIC_LOCATION_SELECT)
      .eq('is_active', true);
    if (error) throw error;

    const nearby = (data || [])
      .map(loc => ({ ...loc, distance: haversine(parseFloat(lat), parseFloat(lng), loc.latitude, loc.longitude) }))
      .filter(loc => loc.distance <= parseFloat(radius))
      .sort((a, b) => a.distance - b.distance)
      .map(publicLocation);

    res.json({ locations: nearby });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/:id — single location with spots
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select(PUBLIC_LOCATION_SELECT)
      .eq('id', req.params.id)
      .eq('is_active', true)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(publicLocation(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/locations — admin create
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, city, latitude, longitude, daily_foot_traffic, weekly_foot_traffic, monthly_foot_traffic, demographics, screen_count, description, base_monthly_price, presale_price, launch_date } = req.body;

    const { data: loc, error } = await supabase
      .from('locations')
      .insert({ name, address, city, latitude, longitude, daily_foot_traffic, weekly_foot_traffic, monthly_foot_traffic, demographics: demographics || {}, screen_count: screen_count || 1, description, base_monthly_price: base_monthly_price || 125, presale_price: presale_price || 50, launch_date: launch_date || null })
      .select()
      .single();
    if (error) throw error;

    const count = parseInt(screen_count) || 1;
    const spots = Array.from({ length: count }, (_, i) => ({ location_id: loc.id, name: `Slot ${i + 1}` }));
    await supabase.from('ad_spots').insert(spots);

    res.json({ id: loc.id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/locations/:id — admin update
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, city, latitude, longitude, daily_foot_traffic, weekly_foot_traffic, monthly_foot_traffic, demographics, description, base_monthly_price, is_active, launch_date, presale_price } = req.body;
    const { error } = await supabase
      .from('locations')
      .update({ name, address, city, latitude, longitude, daily_foot_traffic, weekly_foot_traffic, monthly_foot_traffic, demographics: demographics || {}, description, base_monthly_price, is_active, launch_date: launch_date || null })
      .eq('id', req.params.id);
    if (error) throw error;

    // Sync available slot prices to new base price (only slots without a custom_price)
    if (base_monthly_price) {
      await supabase
        .from('ad_spots')
        .update({ price: base_monthly_price })
        .eq('location_id', req.params.id)
        .is('custom_price', null);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
