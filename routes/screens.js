const express  = require('express');
const router   = express.Router();
const axios    = require('axios');
const supabase = require('../database/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

const CTRL_URL = process.env.LED_CONTROLLER_URL || 'http://localhost:5000';
const CTRL_KEY = process.env.LED_CONTROLLER_KEY || '';

// Build screen params from stored config
function buildScreen(config) {
  return {
    host:      config.tailscale_ip,
    port:      config.port      || 16674,
    ftpPort:   config.ftp_port  || 21,
    username:  config.username  || 'admin',
    password:  config.password,
    serial:    config.serial,
    width:     config.width,
    height:    config.height,
    duration:  config.slide_duration || 12,
    mediaPath: config.media_path || '/var/novasoft/media',
    id:        config.tailscale_ip,
  };
}

async function ctrl(endpoint, method = 'post', extra = {}) {
  const res = await axios({
    method,
    url: `${CTRL_URL}${endpoint}`,
    headers: { 'x-api-key': CTRL_KEY, 'Content-Type': 'application/json' },
    data: extra,
    timeout: 15000,
  });
  return res.data;
}

async function getConfig(locationId) {
  const { data } = await supabase
    .from('locations')
    .select('screen_config, name')
    .eq('id', locationId)
    .single();
  if (!data?.screen_config) throw new Error('Screen not configured for this location');
  return { config: data.screen_config, name: data.name };
}

// GET /api/screens/:id/config
router.get('/:id/config', async (req, res) => {
  try {
    const { data } = await supabase.from('locations').select('screen_config').eq('id', req.params.id).single();
    res.json({ config: data?.screen_config || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/screens/:id/config — save screen parameters
router.post('/:id/config', async (req, res) => {
  try {
    const { tailscale_ip, port, ftp_port, username, password, serial, width, height, slide_duration, media_path } = req.body;
    if (!tailscale_ip || !password || !serial || !width || !height)
      return res.status(400).json({ error: 'tailscale_ip, password, serial, width and height are required' });

    const config = { tailscale_ip, port: port || 16674, ftp_port: ftp_port || 21, username: username || 'admin', password, serial, width: Number(width), height: Number(height), slide_duration: Number(slide_duration) || 12, media_path: media_path || '/var/novasoft/media' };
    const { error } = await supabase.from('locations').update({ screen_config: config }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, config });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/screens/:id/status
router.post('/:id/status', async (req, res) => {
  try {
    const { config } = await getConfig(req.params.id);
    const data = await ctrl('/status', 'post', buildScreen(config));
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/screens/:id/on
router.post('/:id/on', async (req, res) => {
  try {
    const { config } = await getConfig(req.params.id);
    const data = await ctrl('/screen-on', 'post', buildScreen(config));
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/screens/:id/off
router.post('/:id/off', async (req, res) => {
  try {
    const { config } = await getConfig(req.params.id);
    const data = await ctrl('/screen-off', 'post', buildScreen(config));
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/screens/:id/brightness
router.post('/:id/brightness', async (req, res) => {
  try {
    const { config } = await getConfig(req.params.id);
    const value = Number(req.body.value);
    if (isNaN(value) || value < 0 || value > 100)
      return res.status(400).json({ error: 'value must be 0-100' });
    const data = await ctrl('/brightness', 'post', { ...buildScreen(config), value });
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/screens/:id/restart
router.post('/:id/restart', async (req, res) => {
  try {
    const { config } = await getConfig(req.params.id);
    const data = await ctrl('/restart', 'post', buildScreen(config));
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/screens/:id/ftp-test
router.post('/:id/ftp-test', async (req, res) => {
  try {
    const { config } = await getConfig(req.params.id);
    const data = await ctrl('/ftp-test', 'post', buildScreen(config));
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// POST /api/screens/:id/publish — publish approved ads to screen
router.post('/:id/publish', async (req, res) => {
  try {
    const { config } = await getConfig(req.params.id);
    const data = await ctrl('/publish', 'post', buildScreen(config));
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// GET /api/screens/:id/publish-status
router.get('/:id/publish-status', async (req, res) => {
  try {
    const { config } = await getConfig(req.params.id);
    const data = await ctrl('/publish-status', 'post', buildScreen(config));
    res.json(data);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
