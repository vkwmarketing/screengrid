const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const supabase = require('../database/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => cb(null, `ad_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|mp4|mov|avi|webm|pdf/.test(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  }
});

// POST /api/ads/submit
router.post('/submit', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { title, spot_id } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { data: ad, error } = await supabase
      .from('ads')
      .insert({ user_id: req.user.id, spot_id: spot_id || null, title, file_url: req.file.filename, file_type: req.file.mimetype, status: 'pending' })
      .select()
      .single();
    if (error) throw error;

    await supabase.from('notifications').insert({ type: 'new_ad', title: 'New Ad Submitted', message: `${req.user.business_name} submitted: ${title}` });
    res.json({ id: ad.id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ads/my
router.get('/my', authenticate, async (req, res) => {
  const { data } = await supabase.from('ads').select('*').eq('user_id', req.user.id).order('submitted_at', { ascending: false });
  res.json(data || []);
});

// GET /api/ads/pending — admin
router.get('/pending', authenticate, requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from('ads')
    .select('*, users(business_name, email)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  res.json((data || []).map(a => ({ ...a, business_name: a.users?.business_name, email: a.users?.email, users: undefined })));
});

// GET /api/ads/all — admin
router.get('/all', authenticate, requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from('ads')
    .select('*, users(business_name, email)')
    .order('submitted_at', { ascending: false });
  res.json((data || []).map(a => ({ ...a, business_name: a.users?.business_name, email: a.users?.email, users: undefined })));
});

// POST /api/ads/:id/approve — admin
router.post('/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const { admin_notes } = req.body;
    const { data: ad } = await supabase.from('ads').select('*').eq('id', req.params.id).single();
    if (!ad) return res.status(404).json({ error: 'Not found' });

    await supabase.from('ads').update({ status: 'approved', admin_notes: admin_notes || null, reviewed_at: new Date().toISOString(), approved_at: new Date().toISOString() }).eq('id', req.params.id);
    await supabase.from('notifications').insert({ user_id: ad.user_id, type: 'ad_approved', title: '✅ Ad Approved!', message: `Your ad "${ad.title}" is now live.` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ads/:id/reject — admin
router.post('/:id/reject', authenticate, requireAdmin, async (req, res) => {
  try {
    const { admin_notes } = req.body;
    const { data: ad } = await supabase.from('ads').select('*').eq('id', req.params.id).single();
    if (!ad) return res.status(404).json({ error: 'Not found' });

    await supabase.from('ads').update({ status: 'rejected', admin_notes, reviewed_at: new Date().toISOString() }).eq('id', req.params.id);
    await supabase.from('notifications').insert({ user_id: ad.user_id, type: 'ad_rejected', title: '❌ Ad Needs Changes', message: `Your ad "${ad.title}" needs revisions: ${admin_notes}` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ads/:id/improve — admin uploads improved version
router.post('/:id/improve', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { admin_notes } = req.body;
    const { data: ad } = await supabase.from('ads').select('*').eq('id', req.params.id).single();
    if (!ad) return res.status(404).json({ error: 'Not found' });

    await supabase.from('ads').update({ status: 'improved', improved_file_url: req.file?.filename, admin_notes, reviewed_at: new Date().toISOString() }).eq('id', req.params.id);
    await supabase.from('notifications').insert({ user_id: ad.user_id, type: 'ad_improved', title: '✨ Improved Ad Ready', message: `We improved your ad "${ad.title}". Please review and approve.` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ads/:id/accept-improvement — business accepts improved version
router.post('/:id/accept-improvement', authenticate, async (req, res) => {
  try {
    const { data: ad } = await supabase.from('ads').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!ad) return res.status(404).json({ error: 'Not found' });
    await supabase.from('ads').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
