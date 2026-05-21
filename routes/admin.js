const express  = require('express');
const router   = express.Router();
const supabase = require('../database/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [
      { count: total_businesses },
      { count: pending_ads },
      { count: pending_panels },
      { count: total_locations },
      { count: claimed_spots },
      { count: total_spots },
      { data: revenueData }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'business'),
      supabase.from('ads').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('redirect_links').select('*', { count: 'exact', head: true }).eq('panel_status', 'pending').eq('use_panel', true),
      supabase.from('locations').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('ad_spots').select('*', { count: 'exact', head: true }).neq('status', 'available'),
      supabase.from('ad_spots').select('*', { count: 'exact', head: true }),
      supabase.from('payments').select('amount, payment_type').eq('status', 'completed')
    ]);

    const payments = revenueData || [];
    const total_revenue   = payments.reduce((s, p) => s + p.amount, 0);
    const presale_revenue = payments.filter(p => p.payment_type === 'presale').reduce((s, p) => s + p.amount, 0);

    res.json({ total_businesses, pending_ads, pending_panels, total_locations, claimed_spots, total_spots, total_revenue, presale_revenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/businesses
router.get('/businesses', async (req, res) => {
  try {
    const { data: users } = await supabase.from('users').select('id, email, business_name, contact_name, phone, created_at').eq('role', 'business').order('created_at', { ascending: false });

    const enriched = await Promise.all((users || []).map(async u => {
      const [{ count: spots_count }, { count: ads_count }, { data: pays }] = await Promise.all([
        supabase.from('ad_spots').select('*', { count: 'exact', head: true }).eq('claimed_by', u.id),
        supabase.from('ads').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
        supabase.from('payments').select('amount').eq('user_id', u.id).eq('status', 'completed')
      ]);
      return { ...u, spots_count, ads_count, total_paid: (pays || []).reduce((s, p) => s + p.amount, 0) };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/spots
router.get('/spots', async (req, res) => {
  const { data } = await supabase
    .from('ad_spots')
    .select('*, locations(name, city), users(business_name)')
    .order('locations(name)', { ascending: true });
  res.json((data || []).map(s => ({ ...s, location_name: s.locations?.name, city: s.locations?.city, claimed_by_name: s.users?.business_name, locations: undefined, users: undefined, custom_price: s.custom_price || null })));
});

// POST /api/admin/spots/:id/release
router.post('/spots/:id/release', async (req, res) => {
  await supabase.from('ad_spots').update({ status: 'available', claimed_by: null, claim_type: null, claimed_at: null, expires_at: null }).eq('id', req.params.id);
  res.json({ success: true });
});

// GET /api/admin/notifications
router.get('/notifications', async (req, res) => {
  const { data } = await supabase
    .from('notifications')
    .select('*, users(business_name)')
    .order('created_at', { ascending: false })
    .limit(50);
  res.json((data || []).map(n => ({ ...n, business_name: n.users?.business_name, users: undefined })));
});


// POST /api/admin/locations/:id/slots — set exact slot count
router.post('/locations/:id/slots', async (req, res) => {
  try {
    const { slot_count } = req.body;
    const count = parseInt(slot_count);
    if (!count || count < 1 || count > 50)
      return res.status(400).json({ error: 'Slot count must be between 1 and 50' });

    // Get all current slots
    const { data: currentSlots } = await supabase
      .from('ad_spots')
      .select('id, status, name')
      .eq('location_id', req.params.id);

    const current = currentSlots || [];
    const claimed = current.filter(s => s.status !== 'available');
    const available = current.filter(s => s.status === 'available');

    // Can't go below number of claimed slots
    if (count < claimed.length)
      return res.status(409).json({
        error: `Cannot reduce below ${claimed.length} slot(s) — ${claimed.length} are currently claimed by businesses.`
      });

    // Null out all FK references to available slots before deleting
    if (available.length > 0) {
      const availIds = available.map(s => s.id);

      // Null payments.spot_id
      const { error: pe } = await supabase.from('payments').update({ spot_id: null }).in('spot_id', availIds);
      if (pe) console.error('payments null error:', pe.message);

      // Null ads.spot_id
      const { error: ae } = await supabase.from('ads').update({ spot_id: null }).in('spot_id', availIds);
      if (ae) console.error('ads null error:', ae.message);

      // Delete slots
      const { error: delError } = await supabase
        .from('ad_spots')
        .delete()
        .in('id', availIds);
      if (delError) throw delError;
    }

    // Only insert after delete is confirmed complete
    const newCount = count - claimed.length;
    if (newCount > 0) {
      const newSlots = Array.from({ length: newCount }, (_, i) => ({
        location_id: req.params.id,
        name: `Slot ${i + 1}`,
        status: 'available',
        price: 299
      }));
      const { error: insError } = await supabase.from('ad_spots').insert(newSlots);
      if (insError) throw insError;
    }

    // Sync screen_count to intended count
    await supabase.from('locations').update({ screen_count: count }).eq('id', req.params.id);

    res.json({ success: true, slot_count: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/spots/:id/price — set custom price for a slot
router.post('/spots/:id/price', async (req, res) => {
  try {
    const { custom_price } = req.body;
    const price = custom_price !== null && custom_price !== undefined
      ? parseFloat(custom_price)
      : null;

    const { error } = await supabase
      .from('ad_spots')
      .update({ custom_price: price })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, custom_price: price });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
