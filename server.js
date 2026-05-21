require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app      = express();
const PORT     = process.env.PORT || 3000;
const supabase = require('./database/supabase');
const DB_OK    = !!supabase;

// Ensure uploads dir exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads', { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ── Status endpoint (always available, no DB needed) ──────────────
app.get('/api/status', (req, res) => {
  res.json({
    db: DB_OK,
    message: DB_OK
      ? 'All systems operational'
      : 'Database not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to your .env file to enable all features.'
  });
});

// ── Gate: block all other /api/* routes when DB is not configured ─
app.use('/api', (req, res, next) => {
  if (!DB_OK) {
    return res.status(503).json({
      error: 'Database not configured',
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file, then restart the server.'
    });
  }
  next();
});

// ── API routes ────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/ads',       require('./routes/ads'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/payments',  require('./routes/payments'));
app.use('/api/redirects', require('./routes/redirects'));
app.use('/api/offers',    require('./routes/offers'));
app.use('/api/screens',   require('./routes/screens'));

// ── QR slug handler ───────────────────────────────────────────────
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  if (/\.|^api$|^uploads$/.test(slug)) return res.status(404).send('Not found');

  if (!DB_OK) return res.sendFile(path.join(__dirname, 'public', 'index.html'));

  const isQrScan = req.query.source === 'qr';

  try {
    const { data: link } = await supabase
      .from('redirect_links')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (!link) return res.sendFile(path.join(__dirname, 'public', 'index.html'));

    // Only increment scan_count for real QR scans
    if (isQrScan) {
      supabase.from('redirect_links').update({ scan_count: (link.scan_count || 0) + 1 }).eq('id', link.id).then(() => {});
    }

    // Strip ?source=qr so refreshing the page doesn't recount
    if (isQrScan) {
      if (!link.use_panel && link.redirect_url) return res.redirect(link.redirect_url);
      return res.redirect(307, `/${slug}`);
    }

    if (!link.use_panel && link.redirect_url) return res.redirect(link.redirect_url);
    res.send(generateCouponPanel(link));
  } catch {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

function generateCouponPanel(link) {
  const bgStyle = link.panel_bg_image
    ? `background:url('/uploads/${link.panel_bg_image}') center/cover no-repeat;`
    : `background:${link.panel_bg_color || '#0A1628'};`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${link.business_name} — Exclusive Offer</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;${bgStyle}padding:20px}
    .overlay{position:fixed;inset:0;background:rgba(6,13,26,.75);backdrop-filter:blur(2px)}
    .card{position:relative;z-index:1;background:rgba(14,26,52,.92);border:1px solid rgba(45,107,228,.35);border-radius:24px;padding:48px 40px;max-width:480px;width:100%;text-align:center;box-shadow:0 32px 80px rgba(0,0,0,.6)}
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
  <div class="overlay"></div>
  <div class="card">
    <div class="brand">${link.business_name}</div>
    <div class="powered">Powered by ScreenGrid</div>
    <h1 class="headline">${link.panel_headline || 'Exclusive Offer'}</h1>
    <p class="subtext">${link.panel_subtext || 'Show this code at the register to redeem.'}</p>
    ${link.coupon_code ? `
    <div class="coupon-box">
      <div class="coupon-label">Your Coupon Code</div>
      <div class="coupon-code" id="code">${link.coupon_code}</div>
      ${link.coupon_description ? `<div class="coupon-desc">${link.coupon_description}</div>` : ''}
    </div>
    <button class="copy-btn" onclick="copyCode()">📋 Tap to Copy Code</button>` : ''}
    <div class="footer-note">screengrid.co</div>
  </div>
  <script>
    function copyCode(){navigator.clipboard.writeText('${link.coupon_code}').then(()=>{const b=document.querySelector('.copy-btn');b.textContent='✅ Copied!';setTimeout(()=>b.textContent='📋 Tap to Copy Code',2000)});}
  </script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`\n🚀 ScreenGrid → http://localhost:${PORT}`);
  console.log(`📊 Admin portal  → http://localhost:${PORT}/admin.html`);
  if (!DB_OK) {
    console.log('\n⚠️  Running in LIMITED MODE — no database configured.');
    console.log('   Set SUPABASE_URL + SUPABASE_SERVICE_KEY in .env to enable full features.\n');
  } else {
    console.log('\n💡 First time? Run: npm run seed\n');
  }
});
