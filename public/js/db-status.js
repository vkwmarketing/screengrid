// Checks /api/status and injects a banner if the database is not configured.
(async function () {
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    if (data.db) return; // all good, nothing to show

    const banner = document.createElement('div');
    banner.id = 'db-banner';
    banner.innerHTML = `
      <span>
        ⚠️ <strong>Limited Mode</strong> — No database configured.
        Some features (login, ads, payments) are unavailable.
        Add <code>SUPABASE_URL</code> &amp; <code>SUPABASE_SERVICE_KEY</code> to your <code>.env</code> to enable everything.
      </span>
      <button onclick="document.getElementById('db-banner').remove()" aria-label="Dismiss">✕</button>
    `;

    // Inline styles so this works before CSS loads and can't be accidentally overridden
    Object.assign(banner.style, {
      position:       'fixed',
      top:            '0',
      left:           '0',
      right:          '0',
      zIndex:         '99999',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            '12px',
      padding:        '10px 20px',
      background:     '#7c4a00',
      borderBottom:   '1px solid #a86200',
      color:          '#ffe0a0',
      fontSize:       '13px',
      lineHeight:     '1.5',
      fontFamily:     "'DM Sans', sans-serif",
    });

    const btn = banner.querySelector('button');
    Object.assign(btn.style, {
      flexShrink:  '0',
      background:  'rgba(255,255,255,.15)',
      border:      'none',
      color:       '#ffe0a0',
      borderRadius:'6px',
      padding:     '4px 10px',
      cursor:      'pointer',
      fontSize:    '14px',
    });

    const code = banner.querySelectorAll('code');
    code.forEach(c => Object.assign(c.style, {
      background:   'rgba(0,0,0,.25)',
      borderRadius: '4px',
      padding:      '1px 5px',
      fontFamily:   'monospace',
    }));

    // Push page content down so nav isn't hidden behind banner
    document.documentElement.style.paddingTop = '44px';
    document.body.prepend(banner);
  } catch {
    // Server unreachable — don't show anything
  }
})();
