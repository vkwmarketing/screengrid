const express  = require('express');
const router   = express.Router();
const supabase = require('../database/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

// POST /api/offers — admin sends a private offer to a business
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { user_id, spot_id, offered_price, months, message } = req.body;
    if (!user_id || !spot_id || !offered_price)
      return res.status(400).json({ error: 'user_id, spot_id and offered_price are required' });
    const numMonths = parseInt(months) || 1;

    // Get spot + location info
    const { data: spot } = await supabase
      .from('ad_spots')
      .select('*, locations(name, address, city, daily_foot_traffic)')
      .eq('id', spot_id)
      .single();

    if (!spot) return res.status(404).json({ error: 'Spot not found' });
    if (spot.status !== 'available')
      return res.status(409).json({ error: 'This slot is not available' });

    // Get business info
    const { data: business } = await supabase
      .from('users')
      .select('business_name, email')
      .eq('id', user_id)
      .single();

    if (!business) return res.status(404).json({ error: 'Business not found' });

    // Create the offer
    const { data: offer, error } = await supabase
      .from('offers')
      .insert({
        user_id,
        spot_id,
        offered_price: parseFloat(offered_price),
        months: numMonths,
        message: message || null,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    // Notify the business
    await supabase.from('notifications').insert({
      user_id,
      type: 'special_offer',
      title: '🎁 You Have a Special Offer!',
      message: `We have a private offer for you: ${spot.name} at ${spot.locations?.name} — $${offered_price}/mo for ${numMonths} month${numMonths > 1 ? 's' : ''} upfront ($${(parseFloat(offered_price) * numMonths).toFixed(0)} total). ${message || 'Check your dashboard to claim it.'}`
    });

    res.json({ success: true, offer_id: offer.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/offers/my — business sees their offers
router.get('/my', authenticate, async (req, res) => {
  const { data } = await supabase
    .from('offers')
    .select('*, ad_spots(name, status, locations(name, address, city, daily_foot_traffic, base_monthly_price))')
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  res.json((data || []).map(o => ({
    ...o,
    spot_name:      o.ad_spots?.name,
    location_name:  o.ad_spots?.locations?.name,
    address:        o.ad_spots?.locations?.address,
    city:           o.ad_spots?.locations?.city,
    daily_traffic:  o.ad_spots?.locations?.daily_foot_traffic,
    standard_price: o.ad_spots?.locations?.base_monthly_price,
    spot_status:    o.ad_spots?.status,
    ad_spots: undefined
  })));
});

// POST /api/offers/:id/accept — business accepts offer
router.post('/:id/accept', authenticate, async (req, res) => {
  try {
    const { data: offer } = await supabase
      .from('offers')
      .select('*, ad_spots(status, location_id, locations(name, presale_price))')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status !== 'pending') return res.status(409).json({ error: 'Offer already used' });
    if (offer.ad_spots?.status !== 'available') return res.status(409).json({ error: 'Slot no longer available' });

    // Set custom_price on the spot and claim it
    const months = offer.months || 1;
    const totalAmount = offer.offered_price * months;
    const expiresAt = new Date(Date.now() + months * 30 * 86400000).toISOString();

    await supabase.from('ad_spots').update({
      custom_price: offer.offered_price,
      status: 'claimed',
      claimed_by: req.user.id,
      claim_type: 'full',
      claimed_at: new Date().toISOString(),
      expires_at: expiresAt
    }).eq('id', offer.spot_id);

    // Record payment for full upfront amount
    await supabase.from('payments').insert({
      user_id: req.user.id,
      spot_id: offer.spot_id,
      amount: totalAmount,
      payment_type: 'offer',
      status: 'completed'
    });

    // Mark offer as accepted
    await supabase.from('offers').update({ status: 'accepted' }).eq('id', offer.id);

    // Notify admin
    await supabase.from('notifications').insert({
      type: 'offer_accepted',
      title: '✅ Offer Accepted',
      message: `${req.user.business_name} accepted your private offer for $${offer.offered_price}/mo`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/offers/:id/decline — business declines offer
router.post('/:id/decline', authenticate, async (req, res) => {
  try {
    const { data: offer } = await supabase
      .from('offers')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    await supabase.from('offers').update({ status: 'declined' }).eq('id', offer.id);

    // Notify admin
    await supabase.from('notifications').insert({
      type: 'offer_declined',
      title: '❌ Offer Declined',
      message: `${req.user.business_name} declined your private offer`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/offers/all — admin sees all offers
router.get('/all', authenticate, requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from('offers')
    .select('*, users(business_name, email), ad_spots(name, price, locations(name, base_monthly_price))')
    .order('created_at', { ascending: false });

  res.json((data || []).map(o => ({
    ...o,
    business_name:  o.users?.business_name,
    email:          o.users?.email,
    spot_name:      o.ad_spots?.name,
    location_name:  o.ad_spots?.locations?.name,
    standard_price: o.ad_spots?.locations?.base_monthly_price,
    users: undefined, ad_spots: undefined
  })));
});

module.exports = router;
