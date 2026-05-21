const express  = require('express');
const router   = express.Router();
const supabase = require('../database/supabase');
const { authenticate } = require('../middleware/auth');

// POST /api/payments/claim
router.post('/claim', authenticate, async (req, res) => {
  try {
    const { spot_id, claim_type } = req.body;

    const { data: spot } = await supabase
      .from('ad_spots')
      .select('*, locations(name, base_monthly_price, presale_price)')
      .eq('id', spot_id)
      .single();
    // custom_price is on the spot itself

    if (!spot) return res.status(404).json({ error: 'Spot not found' });
    if (spot.status !== 'available') return res.status(409).json({ error: 'Spot is not available' });

    // Always use location base price unless admin set a custom deal price for this slot
    const monthlyRate = spot.custom_price || spot.locations?.base_monthly_price || 125;
    const amount = claim_type === 'presale'
      ? (spot.locations?.presale_price || 50)
      : monthlyRate;

    const expiresAt = new Date(Date.now() + (claim_type === 'presale' ? 90 : 30) * 86400000).toISOString();

    // Update spot
    await supabase.from('ad_spots').update({
      status: claim_type === 'presale' ? 'presale' : 'claimed',
      claimed_by: req.user.id,
      claim_type,
      claimed_at: new Date().toISOString(),
      expires_at: expiresAt
    }).eq('id', spot_id);

    // Record payment (mock — no Stripe yet)
    await supabase.from('payments').insert({ user_id: req.user.id, spot_id, amount, payment_type: claim_type, status: 'completed' });

    // Notify business
    await supabase.from('notifications').insert({
      user_id: req.user.id,
      type: 'spot_claimed',
      title: claim_type === 'presale' ? '🎉 Presale Spot Reserved!' : '🎉 Ad Spot Claimed!',
      message: `You've secured "${spot.name}" at ${spot.locations?.name}. ${claim_type === 'presale' ? 'Full payment due at launch.' : 'Upload your ad to get started!'}`
    });

    res.json({ success: true, expires_at: expiresAt, amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/my-spots
router.get('/my-spots', authenticate, async (req, res) => {
  const { data } = await supabase
    .from('ad_spots')
    .select('*, locations(name, address, city, latitude, longitude, daily_foot_traffic, launch_date, presale_price, base_monthly_price)')
    .eq('claimed_by', req.user.id)
    .order('claimed_at', { ascending: false });
  res.json((data || []).map(s => ({ ...s, location_name: s.locations?.name, ...s.locations, locations: undefined })));
});

// GET /api/payments/my-payments
router.get('/my-payments', authenticate, async (req, res) => {
  const { data } = await supabase
    .from('payments')
    .select('*, ad_spots(name, locations(name))')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  res.json((data || []).map(p => ({
    ...p,
    spot_name: p.ad_spots?.name,
    location_name: p.ad_spots?.locations?.name,
    ad_spots: undefined
  })));
});

// GET /api/payments/pricing/:spot_id
router.get('/pricing/:spot_id', async (req, res) => {
  const { data: spot } = await supabase
    .from('ad_spots')
    .select('*, locations(name, base_monthly_price, presale_price)')
    .eq('id', req.params.spot_id)
    .single();
  if (!spot) return res.status(404).json({ error: 'Not found' });
  res.json({ presale: spot.locations?.presale_price || 50, monthly: spot.price || spot.locations?.base_monthly_price || 299, status: spot.status });
});

module.exports = router;
