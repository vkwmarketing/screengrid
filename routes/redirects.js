const express  = require('express');
const router   = express.Router();
const QRCode   = require('qrcode');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const supabase = require('../database/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => cb(null, `panel_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/redirects — create or update QR link
router.post('/', authenticate, upload.single('bg_image'), async (req, res) => {
  try {
    const { slug, redirect_url, use_panel, panel_bg_color, coupon_code, coupon_description, panel_headline, panel_subtext } = req.body;

    if (!slug || !/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ error: 'Slug must be lowercase letters, numbers, and hyphens only' });

    const { data: existing } = await supabase.from('redirect_links').select('id, user_id').eq('slug', slug).maybeSingle();
    if (existing && existing.user_id !== req.user.id)
      return res.status(409).json({ error: 'This link slug is already taken' });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const qrUrl   = `${baseUrl}/${slug}?source=qr`;
    const qrData  = await QRCode.toDataURL(qrUrl, { color: { dark: '#2D6BE4', light: '#0A1628' }, width: 300 });
    const qrFilename = `qr_${slug}.png`;
    fs.writeFileSync(`./uploads/${qrFilename}`, Buffer.from(qrData.split(',')[1], 'base64'));

    const usePanel = use_panel === 'true' || use_panel === true || use_panel === '1';
    // Simple redirects go live immediately; panels require admin approval first
    const payload  = {
      redirect_url,
      use_panel: usePanel,
      panel_bg_color,
      panel_bg_image: req.file?.filename || null,
      coupon_code,
      coupon_description,
      panel_headline,
      panel_subtext,
      panel_status: usePanel ? 'pending' : 'approved',
      is_active: !usePanel,   // redirect URLs active immediately; panels wait for approval
      qr_code_url: qrFilename
    };

    if (existing) {
      await supabase.from('redirect_links').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('redirect_links').insert({ slug, user_id: req.user.id, business_name: req.user.business_name, ...payload });
    }

    res.json({ success: true, url: qrUrl, qr_code: qrData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/redirects/my
router.get('/my', authenticate, async (req, res) => {
  const { data } = await supabase.from('redirect_links').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
  res.json(data || []);
});

// GET /api/redirects/preview/:id — admin or owner only
router.get('/preview/:id', (req, res, next) => {
  // Allow token via query param for new-tab preview links
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authenticate, async (req, res) => {
  try {
    const { data: link } = await supabase
      .from('redirect_links')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!link) return res.status(404).json({ error: 'Not found' });

    // Only admin or the owner can preview
    if (req.user.role !== 'admin' && link.user_id !== req.user.id)
      return res.status(403).json({ error: 'Access denied' });

    res.send(generatePanelHtml(link));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/redirects/check/:slug
router.get('/check/:slug', async (req, res) => {
  const { data } = await supabase.from('redirect_links').select('id, user_id').eq('slug', req.params.slug).maybeSingle();
  res.json({ available: !data });
});

// GET /api/redirects/all — admin sees all panels
router.get('/all', authenticate, requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from('redirect_links')
    .select('*, users(business_name, email)')
    .eq('use_panel', true)
    .order('created_at', { ascending: false });
  res.json((data || []).map(r => ({ ...r, business_name: r.users?.business_name || r.business_name, email: r.users?.email, users: undefined })));
});

// GET /api/redirects/pending — admin
router.get('/pending', authenticate, requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from('redirect_links')
    .select('*, users(business_name, email)')
    .eq('panel_status', 'pending')
    .eq('use_panel', true)
    .order('created_at', { ascending: true });
  res.json((data || []).map(r => ({ ...r, biz_name: r.users?.business_name, email: r.users?.email, users: undefined })));
});

// POST /api/redirects/:id/approve — admin
router.post('/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const { data: link } = await supabase.from('redirect_links').select('*').eq('id', req.params.id).single();
    if (!link) return res.status(404).json({ error: 'Not found' });
    await supabase.from('redirect_links').update({ panel_status: 'approved', is_active: true }).eq('id', req.params.id);
    await supabase.from('notifications').insert({ user_id: link.user_id, type: 'panel_approved', title: '✅ Coupon Panel Approved!', message: `Your panel for /${link.slug} is now live!` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/redirects/:id/reject — admin
router.post('/:id/reject', authenticate, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: link } = await supabase.from('redirect_links').select('*').eq('id', req.params.id).single();
    if (!link) return res.status(404).json({ error: 'Not found' });
    // Delete the record entirely — frees the slug so business can resubmit
    await supabase.from('redirect_links').delete().eq('id', req.params.id);
    await supabase.from('notifications').insert({
      user_id: link.user_id,
      type: 'panel_rejected',
      title: '❌ Panel Rejected',
      message: reason || 'Your coupon panel was rejected and your link has been released. Please create a new one with the requested changes.'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/redirects/notifications
router.get('/notifications', authenticate, async (req, res) => {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  res.json(data || []);
});

// POST /api/redirects/notifications/:id/read
router.post('/notifications/:id/read', authenticate, async (req, res) => {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  res.json({ success: true });
});

function generatePanelHtml(link) {
  const bgStyle = link.panel_bg_image
    ? `background:url('/uploads/${link.panel_bg_image}') center/cover no-repeat;`
    : `background:${link.panel_bg_color || '#0A1628'};`;

  const isPending = link.panel_status === 'pending';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${link.business_name} — ${isPending ? 'Preview (Pending Approval)' : 'Exclusive Offer'}</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;${bgStyle}padding:20px}
    .overlay{position:fixed;inset:0;background:rgba(6,13,26,.75);backdrop-filter:blur(2px)}
    .preview-banner{position:fixed;top:0;left:0;right:0;z-index:9999;background:#7c4a00;border-bottom:1px solid #a86200;color:#ffe0a0;font-size:13px;padding:10px 20px;text-align:center;font-family:'DM Sans',sans-serif}
    .card{position:relative;z-index:1;background:rgba(14,26,52,.92);border:1px solid rgba(45,107,228,.35);border-radius:24px;padding:48px 40px;max-width:480px;width:100%;text-align:center;box-shadow:0 32px 80px rgba(0,0,0,.6);${isPending ? 'margin-top:44px' : ''}}
    .brand{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:#2D6BE4;margin-bottom:6px}
    .powered{font-size:11px;color:#4a6080;margin-bottom:32px;letter-spacing:1px}
    .headline{font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:900;line-height:1;color:#E8EFF8;margin-bottom:12px;text-transform:uppercase}
    .subtext{font-size:16px;color:#8BA3C7;margin-bottom:36px;line-height:1.6}
    .coupon-box{background:linear-gradient(135deg,rgba(45,107,228,.15),rgba(45,107,228,.05));border:1.5px dashed rgba(45,107,228,.5);border-radius:16px;padding:28px;margin-bottom:32px}
    .coupon-label{font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#4F9EFF;margin-bottom:12px}
    .coupon-code{font-family:'Barlow Condensed',sans-serif;font-size:48px;font-weight:800;color:#fff;letter-spacing:6px;text-transform:uppercase;margin-bottom:8px}
    .coupon-desc{font-size:14px;color:#8BA3C7}
    .copy-btn{background:#2D6BE4;color:#fff;border:none;padding:14px 32px;border-radius:12px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;cursor:pointer;width:100%;transition:.2s;margin-bottom:16px}
    .copy-btn:hover{background:#3D7BF5;transform:translateY(-1px)}
    .footer-note{font-size:12px;color:#3a5070}
  </style>
</head>
<body>
  ${isPending ? '<div class="preview-banner">👁️ <strong>Preview Only</strong> — This panel is pending admin approval and is not yet public</div>' : ''}
  <div class="overlay"></div>
  <div class="card">
    <div class="brand">${link.business_name}</div>
    <div class="powered">Powered by ScreenGrid</div>
    <h1 class="headline">${link.panel_headline || 'Exclusive Offer'}</h1>
    <p class="subtext">${link.panel_subtext || 'Show this code at the register to redeem.'}</p>
    ${link.coupon_code ? `
    <div class="coupon-box">
      <div class="coupon-label">Your Coupon Code</div>
      <div class="coupon-code">${link.coupon_code}</div>
      ${link.coupon_description ? `<div class="coupon-desc">${link.coupon_description}</div>` : ''}
    </div>
    <button class="copy-btn" onclick="navigator.clipboard.writeText('${link.coupon_code}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>this.textContent='📋 Tap to Copy Code',2000)})">📋 Tap to Copy Code</button>` : ''}
    <div class="footer-note">screengrid.co</div>
  </div>
</body>
</html>`;
}

module.exports = router;
