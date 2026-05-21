const express  = require('express');
const router   = express.Router();
const supabase = require('../database/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

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
      .select('*, ad_spots(id, name, status, price, custom_price)')
      .eq('is_active', true)
      .order('daily_foot_traffic', { ascending: false });
    if (error) throw error;

    res.json({
      locations: data.map(loc => ({
        ...loc,
        total_spots: loc.ad_spots.length,
        available_spots: loc.ad_spots.filter(s => s.status === 'available').length,
        spots: loc.ad_spots,
        ad_spots: undefined
      }))
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

    const { data } = await supabase
      .from('locations')
      .select('*, ad_spots(id, name, status, price, custom_price)')
      .eq('is_active', true);

    const nearby = (data || [])
      .map(loc => ({ ...loc, distance: haversine(parseFloat(lat), parseFloat(lng), loc.latitude, loc.longitude) }))
      .filter(loc => loc.distance <= parseFloat(radius))
      .sort((a, b) => a.distance - b.distance)
      .map(loc => ({
        ...loc,
        total_spots: loc.ad_spots.length,
        available_spots: loc.ad_spots.filter(s => s.status === 'available').length,
        spots: loc.ad_spots,
        ad_spots: undefined
      }));

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
      .select('*, ad_spots(*)')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ ...data, spots: data.ad_spots, ad_spots: undefined });
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
