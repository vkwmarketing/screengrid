const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const supabase = require('../database/supabase');
const { authenticate } = require('../middleware/auth');

const sign = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, business_name: user.business_name },
  process.env.JWT_SECRET || 'sg-secret',
  { expiresIn: '30d' }
);

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, business_name, contact_name, phone } = req.body;
    if (!email || !password || !business_name)
      return res.status(400).json({ error: 'Email, password and business name are required' });

    const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashed = bcrypt.hashSync(password, 10);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ email, password: hashed, business_name, contact_name, phone })
      .select()
      .single();
    if (error) throw error;

    // Welcome notification
    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'welcome',
      title: 'Welcome to ScreenGrid!',
      message: 'Your account is ready. Explore ad locations and claim a spot!'
    });

    res.json({ token: sign(user), user: { id: user.id, email: user.email, business_name: user.business_name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: sign(user), user: { id: user.id, email: user.email, business_name: user.business_name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const { data } = await supabase.from('users').select('id,email,business_name,contact_name,phone,role,created_at').eq('id', req.user.id).single();
  res.json(data);
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res) => {
  const { business_name, contact_name, phone } = req.body;
  await supabase.from('users').update({ business_name, contact_name, phone }).eq('id', req.user.id);
  res.json({ success: true });
});

module.exports = router;
