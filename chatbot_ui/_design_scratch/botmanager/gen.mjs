import fs from 'fs';

/* ── Icon set: circle / rect / line / polyline / polygon / straight-line-only
   path only — no arcs, no curves — so nothing can render as a broken glyph. */
const ICONS = {
  search: '<circle cx="10" cy="10" r="6"/><line x1="20" y1="20" x2="14.5" y2="14.5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  chevronRight: '<polyline points="9 6 15 12 9 18"/>',
  chevronUp: '<polyline points="6 15 12 9 18 15"/>',
  menu: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  zap: '<polygon points="13 2 3 14 11 14 10 22 21 10 13 10 13 2"/>',
  sparkle: '<polygon points="12 3 13.5 10.5 21 12 13.5 13.5 12 21 10.5 13.5 3 12 10.5 10.5"/>',
  radio: '<circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="12" r="5.5" fill="none"/><circle cx="12" cy="12" r="9.5" fill="none"/>',
  bag: '<rect x="4" y="8" width="16" height="12" rx="2"/><polyline points="8 8 8 5 16 5 16 8"/>',
  share: '<circle cx="18" cy="5" r="2.2"/><circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="19" r="2.2"/><line x1="8" y1="10.8" x2="16" y2="6.6"/><line x1="8" y1="13.2" x2="16" y2="17.4"/>',
  folder: '<path d="M3 7 L3 18 L21 18 L21 9 L11 9 L9 7 Z"/>',
  bot: '<rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9" cy="13" r="1.4"/><circle cx="15" cy="13" r="1.4"/><line x1="12" y1="4" x2="12" y2="8"/><circle cx="12" cy="3" r="1"/>',
  alert: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.8"/>',
  bar: '<line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="7"/><line x1="19" y1="20" x2="19" y2="15"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>',
  calendar: '<rect x="4" y="6" width="16" height="14" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="4" x2="8" y2="8"/><line x1="16" y1="4" x2="16" y2="8"/>',
  filter: '<polygon points="4 5 20 5 14 13 14 19 10 21 10 13"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  home: '<path d="M4 11 L12 4 L20 11 L20 20 L4 20 Z"/><rect x="10" y="13" width="4" height="7"/>',
  message: '<path d="M4 5 L20 5 L20 16 L9 16 L4 20 Z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20 L4 16 L9 14 L14 16 L15 20 Z"/>',
  fileText: '<path d="M6 3 L14 3 L18 7 L18 21 L6 21 Z"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>',
  send: '<polygon points="3 11 21 3 13 21 11 13 3 11"/>',
  settings: '<circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="7.8" y2="16.2"/><line x1="16.2" y1="7.8" x2="19.1" y2="4.9"/>',
  edit: '<path d="M4 20 L4 16 L15 5 L19 9 L8 20 Z"/>',
  trash: '<rect x="6" y="8" width="12" height="12" rx="1"/><line x1="4" y1="8" x2="20" y2="8"/><line x1="9" y1="5" x2="15" y2="5"/>',
  play: '<polygon points="6 4 20 12 6 20"/>',
  pause: '<rect x="7" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>',
};
function icon(name, size = 18, strokeW = 1.8) {
  const body = ICONS[name] || ICONS.more;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/* ── Design tokens — lifted verbatim from chatbot_ui/src/index.css ── */
const CSS_BASE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root{
  --primary:#2563eb; --primary-dark:#1d4ed8;
  --success:#10b981; --warning:#f59e0b; --danger:#ef4444;
  --bg-base:#f8fafc; --bg-surface:#ffffff; --bg-card:#ffffff; --bg-hover:#f1f5f9;
  --border:#e2e8f0; --border-light:#cbd5e1;
  --text-primary:#0f172a; --text-secondary:#475569; --text-muted:#94a3b8;
  --radius:10px; --radius-sm:6px;
  --shadow:0 1px 3px 0 rgba(0,0,0,.06),0 1px 2px 0 rgba(0,0,0,.03);
  --shadow-sm:0 1px 2px 0 rgba(0,0,0,.04);
  --shadow-md:0 4px 12px 0 rgba(0,0,0,.06);
}
*{box-sizing:border-box;}
body{margin:0;font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg-base);color:var(--text-primary);-webkit-font-smoothing:antialiased;}
a{color:var(--primary);text-decoration:none;} a:hover{color:var(--primary-dark);}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 15px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;border:1px solid transparent;cursor:pointer;white-space:nowrap;}
.btn-primary{background:var(--primary);color:#fff;border-color:var(--primary);box-shadow:0 1px 2px rgba(37,99,235,.25);}
.btn-secondary{background:#fff;color:var(--text-primary);border-color:var(--border);}
.btn-sm{padding:6px 11px;font-size:12.5px;}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;}
.badge-primary{background:rgba(37,99,235,.08);color:var(--primary);border:1px solid rgba(37,99,235,.2);}
.badge-success{background:rgba(16,185,129,.08);color:var(--success);border:1px solid rgba(16,185,129,.2);}
.badge-muted{background:var(--bg-hover);color:var(--text-secondary);border:1px solid var(--border);}
.card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);}
.scrim{scrollbar-width:thin;}
`;

const NAV_ITEMS = [
  ['home', 'Dashboard'], ['message', 'Conversations'], ['users', 'Subscribers'],
  ['bot', 'Automation'], ['fileText', 'Post Publishing'], ['radio', 'Connect Account'],
  ['send', 'Broadcasts'], ['bag', 'In-Chat Orders'], ['calendar', 'Appointments'],
];

function sidebar() {
  const items = NAV_ITEMS.map(([ic, label]) => {
    const active = label === 'Automation';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:6px;font-size:13.5px;font-weight:${active ? 600 : 500};color:${active ? 'var(--primary)' : 'var(--text-secondary)'};background:${active ? 'rgba(37,99,235,.08)' : 'transparent'};">${icon(ic, 16)}<span>${label}</span></div>`;
  }).join('');
  return `
  <div style="width:260px;flex-shrink:0;background:#fff;border-right:1px solid var(--border);display:flex;flex-direction:column;">
    <div style="height:56px;padding:0 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);flex-shrink:0;">
      <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;">${icon('sparkle', 18)}</div>
      <div><div style="font-size:15px;font-weight:800;color:#0f172a;letter-spacing:-.3px;">Nexa Chatbot</div><div style="font-size:11px;color:#64748b;">Reseller Portal</div></div>
    </div>
    <div style="flex:1;padding:12px 10px;display:flex;flex-direction:column;gap:2px;">
      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;padding:8px 10px 4px;">Main</div>
      ${items}
    </div>
  </div>`;
}

function topbar() {
  return `
  <div style="height:56px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 20px;border-bottom:1px solid var(--border);background:#fff;">
    <div style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">${icon('menu', 16)}</div>
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="width:34px;height:34px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">${icon('bell', 16)}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">RJ</div>
        <span style="font-size:13px;font-weight:600;">Reseller Admin</span>
        ${icon('chevronDown', 13)}
      </div>
    </div>
  </div>`;
}

const PLATFORMS = {
  WHATSAPP: '#25d366', FACEBOOK: '#1877f2', INSTAGRAM: '#e1306c',
  TELEGRAM: '#229ed9', WEBCHAT: '#6366f1',
};
const FLOWS = [
  { name: 'Welcome Greeting', trigger: 'hi, hello, start', platform: 'WHATSAPP', status: 'Active', triggered: '1,204', edited: '2 days ago' },
  { name: 'FAQ Auto-Reply', trigger: '12 keywords', platform: 'FACEBOOK', status: 'Active', triggered: '892', edited: '5 days ago' },
  { name: 'Order Status Lookup', trigger: 'order, tracking', platform: 'WHATSAPP', status: 'Active', triggered: '441', edited: '1 week ago' },
  { name: 'Human Handoff', trigger: 'agent, help', platform: 'INSTAGRAM', status: 'Paused', triggered: '76', edited: '3 weeks ago' },
  { name: 'Discount Code Flow', trigger: 'promo, discount', platform: 'TELEGRAM', status: 'Active', triggered: '318', edited: '4 days ago' },
  { name: 'Appointment Booking', trigger: 'book, schedule', platform: 'WEBCHAT', status: 'Draft', triggered: '0', edited: 'Just now' },
];
const ACCOUNTS = [
  { name: 'Bikroy Shop', id: '+1 555 750 0259', platform: 'WHATSAPP', initials: 'BS' },
  { name: 'Nova Support', id: '@novasupport_bot', platform: 'TELEGRAM', initials: 'NS' },
  { name: 'Urban Café Page', id: 'Urban Café', platform: 'FACEBOOK', initials: 'UC' },
  { name: 'Glow Beauty IG', id: '@glow.beauty', platform: 'INSTAGRAM', initials: 'GB' },
  { name: 'Site Widget', id: 'nexa.io/widget', platform: 'WEBCHAT', initials: 'SW' },
];
const CATEGORIES = [
  ['bot', 'Bot Manager'], ['folder', 'Data Collection'], ['sparkle', 'AI'],
  ['radio', 'Engagement'], ['bag', 'Commerce'], ['share', 'Integrations'],
];
const SUBTABS = ['Keyword Replies', 'Message Templates', 'User Input Flows', 'Sequences'];

function statusBadge(status) {
  const map = { Active: 'badge-success', Paused: 'badge-muted', Draft: 'badge-muted' };
  return `<span class="badge ${map[status] || 'badge-muted'}">${status === 'Active' ? icon('check', 10, 2.4) : ''}${status}</span>`;
}
function platformDot(p) {
  return `<span style="width:8px;height:8px;border-radius:99px;background:${PLATFORMS[p]};display:inline-block;flex-shrink:0;"></span>`;
}

function page(title, contentHtml, w = 1560, h = 960) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet><style>${CSS_BASE}</style></helmet>
<div style="width:${w}px;height:${h}px;display:flex;background:var(--bg-base);overflow:hidden;font-family:'Inter',sans-serif;box-shadow:0 1px 0 rgba(0,0,0,.02);">
${sidebar()}
<div style="flex:1;display:flex;flex-direction:column;min-width:0;">
${topbar()}
<div class="scrim" style="flex:1;overflow:auto;">
${contentHtml}
</div>
</div>
</div>
</x-dc>
</body>
</html>`;
}

/* ════════════════════════════════════════════════════════════════════
   OPTION A — Icon Rail: slim vertical bot-avatar rail + one unified
   toolbar row combining category + sub-tab, flows as a card grid.
   ════════════════════════════════════════════════════════════════════ */
function optionA() {
  const rail = ACCOUNTS.map((a, i) => `
    <div style="position:relative;display:flex;align-items:center;justify-content:center;">
      ${i === 0 ? `<div style="position:absolute;left:-14px;width:3px;height:34px;background:var(--primary);border-radius:0 3px 3px 0;"></div>` : ''}
      <div title="${a.name}" style="width:42px;height:42px;border-radius:12px;background:${i === 0 ? 'var(--primary)' : '#fff'};border:1px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${i === 0 ? '#fff' : 'var(--text-secondary)'};box-shadow:${i === 0 ? '0 2px 8px rgba(37,99,235,.3)' : 'none'};">${a.initials}</div>
    </div>`).join('');

  const cats = CATEGORIES.map(([ic, label], i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:9px 3px;margin-right:26px;border-bottom:2px solid ${i === 0 ? 'var(--primary)' : 'transparent'};color:${i === 0 ? 'var(--primary)' : 'var(--text-secondary)'};font-weight:${i === 0 ? 700 : 600};font-size:13.5px;">${icon(ic, 15)}${label}</div>`).join('');

  const subtabs = SUBTABS.map((s, i) => `<div style="padding:5px 13px;border-radius:99px;font-size:12px;font-weight:600;background:${i === 0 ? 'var(--primary)' : '#fff'};color:${i === 0 ? '#fff' : 'var(--text-secondary)'};border:1px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'};">${s}</div>`).join('');

  const cards = FLOWS.map((f) => `
    <div class="card" style="padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;">${platformDot(f.platform)}<span style="font-weight:700;font-size:13.5px;">${f.name}</span></div>
        ${statusBadge(f.status)}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Trigger: ${f.trigger}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border);">
        <span style="font-size:11.5px;color:var(--text-muted);">${f.triggered} triggers · ${f.edited}</span>
        <div style="display:flex;gap:5px;color:var(--text-muted);">${icon('edit', 14)}${icon('more', 14)}</div>
      </div>
    </div>`).join('');

  return `
  <div style="display:flex;height:100%;">
    <div style="width:74px;flex-shrink:0;border-right:1px solid var(--border);background:#fff;display:flex;flex-direction:column;align-items:center;gap:12px;padding:18px 0;">
      ${rail}
      <div style="width:42px;height:42px;border-radius:12px;border:1.5px dashed var(--border-light);display:flex;align-items:center;justify-content:center;color:var(--text-muted);">${icon('plus', 16)}</div>
    </div>
    <div style="flex:1;padding:22px 28px;min-width:0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <div>
          <div style="font-size:19px;font-weight:800;display:flex;align-items:center;gap:8px;">Bikroy Shop <span class="badge badge-success">${icon('check', 10, 2.4)} Active</span></div>
          <div style="font-size:12.5px;color:var(--text-secondary);margin-top:2px;">+1 555 750 0259 · WhatsApp</div>
        </div>
        <div style="display:flex;gap:8px;">
          <div style="display:flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;color:var(--text-muted);font-size:13px;width:220px;">${icon('search', 14)}<span>Search this bot…</span></div>
          <button class="btn btn-primary">${icon('plus', 14)} Create Flow</button>
        </div>
      </div>

      <div style="display:flex;align-items:center;border-bottom:1px solid var(--border);margin-bottom:14px;">${cats}</div>
      <div style="display:flex;gap:8px;margin-bottom:20px;">${subtabs}</div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;">${cards}</div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════
   OPTION B — Sidebar Category Nav: a second vertical nav for
   categories/sub-tabs; content is a dense data table.
   ════════════════════════════════════════════════════════════════════ */
function optionB() {
  const catNav = CATEGORIES.map(([ic, label], i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;font-size:13px;font-weight:${i === 0 ? 700 : 500};color:${i === 0 ? 'var(--primary)' : 'var(--text-secondary)'};background:${i === 0 ? 'rgba(37,99,235,.08)' : 'transparent'};">${icon(ic, 15)}<span style="flex:1;">${label}</span>${i === 0 ? icon('chevronDown', 12) : ''}</div>
    ${i === 0 ? `<div style="display:flex;flex-direction:column;gap:1px;margin:2px 0 8px 34px;">${SUBTABS.map((s, j) => `<div style="padding:7px 10px;border-radius:6px;font-size:12.5px;font-weight:${j === 0 ? 700 : 500};color:${j === 0 ? 'var(--primary)' : 'var(--text-muted)'};background:${j === 0 ? '#fff' : 'transparent'};border:${j === 0 ? '1px solid var(--border)' : '1px solid transparent'};">${s}</div>`).join('')}</div>` : ''}`).join('');

  const rows = FLOWS.map((f) => `
    <tr style="border-top:1px solid var(--border);">
      <td style="padding:12px 16px;"><div style="display:flex;align-items:center;gap:9px;font-weight:600;font-size:13px;">${platformDot(f.platform)}${f.name}</div></td>
      <td style="padding:12px 16px;font-size:12.5px;color:var(--text-secondary);">${f.trigger}</td>
      <td style="padding:12px 16px;font-size:12.5px;color:var(--text-secondary);">${f.platform.charAt(0) + f.platform.slice(1).toLowerCase()}</td>
      <td style="padding:12px 16px;">${statusBadge(f.status)}</td>
      <td style="padding:12px 16px;font-size:12.5px;color:var(--text-muted);">${f.triggered}</td>
      <td style="padding:12px 16px;font-size:12.5px;color:var(--text-muted);">${f.edited}</td>
      <td style="padding:12px 16px;text-align:right;color:var(--text-muted);"><span style="margin-right:10px;display:inline-flex;vertical-align:middle;">${icon('edit', 14)}</span><span style="display:inline-flex;vertical-align:middle;">${icon('trash', 14)}</span></td>
    </tr>`).join('');

  return `
  <div style="display:flex;height:100%;">
    <div style="width:220px;flex-shrink:0;border-right:1px solid var(--border);background:#fff;padding:18px 12px;">
      <div style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:16px;">
        <div style="width:26px;height:26px;border-radius:7px;background:${PLATFORMS.WHATSAPP};display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">BS</div>
        <div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:700;">Bikroy Shop</div><div style="font-size:10.5px;color:var(--text-muted);">WhatsApp</div></div>
        ${icon('chevronDown', 13)}
      </div>
      <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;padding:0 10px 6px;">Categories</div>
      ${catNav}
    </div>
    <div style="flex:1;padding:22px 28px;min-width:0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="font-size:12px;color:var(--text-muted);">Automation <span style="margin:0 6px;">/</span> Bot Manager <span style="margin:0 6px;">/</span> <span style="color:var(--text-primary);font-weight:600;">Keyword Replies</span></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <h2 style="font-size:19px;font-weight:800;margin:0;">Keyword Replies</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary">${icon('filter', 14)} Filter</button>
          <button class="btn btn-primary">${icon('plus', 14)} Create Flow</button>
        </div>
      </div>
      <div class="card" style="overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:var(--bg-base);">
            <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">Name</th>
            <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">Trigger</th>
            <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">Channel</th>
            <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">Status</th>
            <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">Triggered</th>
            <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">Edited</th>
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════
   OPTION C — Card Gallery Home: searchable feature gallery instead of
   a tab maze; recently-edited strip up top.
   ════════════════════════════════════════════════════════════════════ */
function optionC() {
  const recents = FLOWS.slice(0, 3).map((f) => `<div style="display:flex;align-items:center;gap:7px;padding:6px 12px 6px 8px;border:1px solid var(--border);border-radius:99px;background:#fff;font-size:12px;font-weight:600;">${platformDot(f.platform)}${f.name}</div>`).join('');

  const features = [
    ['bot', 'Keyword Replies', 'Auto-respond to exact-match triggers', '6 active', 'Bot Manager'],
    ['fileText', 'Message Templates', 'Pre-approved WhatsApp templates', '3 approved', 'Bot Manager'],
    ['folder', 'User Input Flows', 'Reusable question-and-answer chains', '2 flows', 'Data Collection'],
    ['clock', 'Sequences', 'Timed follow-up message series', '4 running', 'Data Collection'],
    ['sparkle', 'AI Agents', 'LLM-powered reply agents', '1 agent', 'AI'],
    ['chip', 'AI Reply Settings', 'Tone, guardrails and fallback rules', 'Configured', 'AI'],
    ['radio', 'Comment Automation', 'Auto-reply to post comments', '2 rules', 'Engagement'],
    ['message', 'Chat Widget', 'Embeddable website chat bubble', 'Live', 'Engagement'],
    ['bag', 'Catalog & Orders', 'Product catalog and checkout flow', '18 products', 'Commerce'],
    ['share', 'Webhooks & Zapier', 'Push events to external tools', '1 connected', 'Integrations'],
  ];
  const groups = ['Bot Manager', 'Data Collection', 'AI', 'Engagement', 'Commerce', 'Integrations'];
  const sections = groups.map((g) => {
    const items = features.filter((f) => f[4] === g);
    if (!items.length) return '';
    const cards = items.map(([ic, title, desc, stat]) => `
      <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="width:36px;height:36px;border-radius:9px;background:rgba(37,99,235,.08);color:var(--primary);display:flex;align-items:center;justify-content:center;">${icon(ic, 17)}</div>
          <span style="color:var(--text-muted);">${icon('arrowRight', 15)}</span>
        </div>
        <div><div style="font-weight:700;font-size:13.5px;margin-bottom:2px;">${title}</div><div style="font-size:12px;color:var(--text-secondary);line-height:1.4;">${desc}</div></div>
        <div style="font-size:11.5px;font-weight:700;color:var(--primary);">${stat}</div>
      </div>`).join('');
    return `<div style="margin-bottom:22px;"><div style="font-size:12.5px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;">${g}</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">${cards}</div></div>`;
  }).join('');

  return `
  <div style="padding:24px 28px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:#fff;">
        <div style="width:24px;height:24px;border-radius:6px;background:${PLATFORMS.WHATSAPP};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;">BS</div>
        <span style="font-size:13px;font-weight:700;">Bikroy Shop</span>${icon('chevronDown', 13)}
      </div>
      <div style="flex:1;display:flex;align-items:center;gap:8px;margin:0 16px;padding:9px 14px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text-muted);font-size:13px;">${icon('search', 15)}<span>Search flows, templates, settings…</span></div>
      <button class="btn btn-primary">${icon('plus', 14)} Create</button>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:22px;">
      <span style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">Recent</span>
      ${recents}
    </div>

    ${sections}
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════
   OPTION D — Split Workspace: compact top nav + a right-hand insights
   panel with real numbers and quick actions.
   ════════════════════════════════════════════════════════════════════ */
function optionD() {
  const cats = CATEGORIES.map(([ic, label], i) => `<div style="display:flex;align-items:center;gap:6px;padding:7px 2px;margin-right:22px;border-bottom:2px solid ${i === 0 ? 'var(--primary)' : 'transparent'};color:${i === 0 ? 'var(--primary)' : 'var(--text-secondary)'};font-weight:${i === 0 ? 700 : 600};font-size:13px;">${icon(ic, 14)}${label}</div>`).join('');

  const rows = FLOWS.map((f) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid var(--border);">
      <div style="width:32px;height:32px;border-radius:8px;background:rgba(37,99,235,.08);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${icon('bot', 15)}</div>
      <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;">${f.name}</div><div style="font-size:11.5px;color:var(--text-muted);">${f.trigger}</div></div>
      ${platformDot(f.platform)}
      ${statusBadge(f.status)}
      <span style="color:var(--text-muted);">${icon('more', 15)}</span>
    </div>`).join('');

  const stat = (label, value, ic) => `
    <div style="display:flex;align-items:center;gap:12px;padding:14px;">
      <div style="width:38px;height:38px;border-radius:10px;background:rgba(37,99,235,.08);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${icon(ic, 18)}</div>
      <div><div style="font-size:19px;font-weight:800;line-height:1.1;">${value}</div><div style="font-size:11.5px;color:var(--text-secondary);font-weight:600;">${label}</div></div>
    </div>`;

  const activity = [
    ['Order Status Lookup triggered', '2 min ago'],
    ['Discount Code Flow edited', '4 hrs ago'],
    ['Human Handoff paused', 'Yesterday'],
  ].map(([t, ago]) => `<div style="padding:9px 0;border-top:1px solid var(--border);font-size:12px;"><div style="font-weight:600;">${t}</div><div style="color:var(--text-muted);font-size:11px;margin-top:1px;">${ago}</div></div>`).join('');

  return `
  <div style="display:flex;height:100%;">
    <div style="flex:1;padding:20px 24px;min-width:0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:18px;font-weight:800;">Bikroy Shop <span style="font-size:12px;font-weight:600;color:var(--text-muted);">· WhatsApp</span></div>
        <button class="btn btn-primary btn-sm">${icon('plus', 13)} Create Flow</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);margin-bottom:16px;">
        <div style="display:flex;">${cats}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--text-secondary);padding-bottom:8px;">Viewing: Keyword Replies ${icon('chevronDown', 12)}</div>
      </div>
      <div class="card">${rows}</div>
    </div>
    <div style="width:300px;flex-shrink:0;border-left:1px solid var(--border);background:#fff;padding:20px;">
      <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Insights</div>
      <div class="card" style="margin-bottom:20px;">
        ${stat('Total Flows', '6', 'folder')}
        <div style="border-top:1px solid var(--border);">${stat('Active Now', '4', 'zap')}</div>
        <div style="border-top:1px solid var(--border);">${stat('Msgs This Week', '2,847', 'bar')}</div>
      </div>
      <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Quick Actions</div>
      <div class="card" style="padding:6px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:9px;padding:9px 10px;font-size:12.5px;font-weight:600;">${icon('plus', 14)} Create Flow</div>
        <div style="display:flex;align-items:center;gap:9px;padding:9px 10px;font-size:12.5px;font-weight:600;color:var(--text-secondary);">${icon('alert', 14)} View Error Log</div>
        <div style="display:flex;align-items:center;gap:9px;padding:9px 10px;font-size:12.5px;font-weight:600;color:var(--text-secondary);">${icon('settings', 14)} Bot Settings</div>
      </div>
      <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Recent Activity</div>
      <div>${activity}</div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════
   OPTION E — Command Bar Minimal: borderless search-first header,
   underline category strip, airy list rows, few borders.
   ════════════════════════════════════════════════════════════════════ */
function optionE() {
  const cats = CATEGORIES.map(([ic, label], i) => `<div style="display:flex;align-items:center;gap:6px;padding-bottom:10px;margin-right:30px;border-bottom:2px solid ${i === 0 ? 'var(--primary)' : 'transparent'};color:${i === 0 ? 'var(--text-primary)' : 'var(--text-muted)'};font-weight:${i === 0 ? 700 : 500};font-size:13.5px;">${icon(ic, 14)}${label}</div>`).join('');

  const rows = FLOWS.map((f) => `
    <div style="display:flex;align-items:center;gap:14px;padding:16px 4px;border-bottom:1px solid var(--border);">
      ${platformDot(f.platform)}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;">${f.name}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:1px;">${f.trigger} · ${f.triggered} triggers · edited ${f.edited}</div>
      </div>
      ${statusBadge(f.status)}
      <div style="display:flex;gap:14px;color:var(--text-muted);">${icon('edit', 15)}${icon('more', 15)}</div>
    </div>`).join('');

  return `
  <div style="padding:28px 40px;max-width:980px;margin:0 auto;">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:22px;">
      <div style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;">Bikroy Shop ${icon('chevronDown', 13)}</div>
      <div style="flex:1;display:flex;align-items:center;gap:10px;font-size:14px;color:var(--text-muted);">${icon('search', 16)}<span>Search flows, templates, settings…</span><span style="margin-left:auto;font-size:11px;border:1px solid var(--border);border-radius:5px;padding:2px 6px;color:var(--text-muted);">⌘K</span></div>
      <button class="btn btn-primary">${icon('plus', 14)} Create</button>
    </div>
    <div style="display:flex;margin-bottom:4px;">${cats}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:20px;">Keyword Replies · Message Templates · User Input Flows · Sequences</div>
    <div>${rows}</div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════
   OPTION F — Accordion Overview: single scroll, expandable sections
   per category with a sticky anchor mini-nav.
   ════════════════════════════════════════════════════════════════════ */
function optionF() {
  const miniNav = CATEGORIES.map(([ic, label], i) => `<div style="display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;font-size:12.5px;font-weight:${i === 0 ? 700 : 500};color:${i === 0 ? 'var(--primary)' : 'var(--text-secondary)'};"><span style="width:6px;height:6px;border-radius:99px;background:${i === 0 ? 'var(--primary)' : 'var(--border-light)'};flex-shrink:0;"></span>${label}</div>`).join('');

  const rows = FLOWS.map((f) => `
    <div style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-top:1px solid var(--border);">
      ${platformDot(f.platform)}
      <div style="flex:1;min-width:0;font-weight:600;font-size:13px;">${f.name}</div>
      <span style="font-size:11.5px;color:var(--text-muted);">${f.trigger}</span>
      ${statusBadge(f.status)}
    </div>`).join('');

  const collapsedSections = CATEGORIES.slice(1).map(([ic, label], i) => `
    <div class="card" style="margin-bottom:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--bg-hover);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;">${icon(ic, 15)}</div>
        <span style="font-weight:700;font-size:13.5px;">${label}</span>
        <span class="badge badge-muted">${2 + i} items</span>
      </div>
      ${icon('chevronDown', 15)}
    </div>`).join('');

  return `
  <div style="display:flex;padding:22px 28px;gap:24px;">
    <div style="width:190px;flex-shrink:0;position:sticky;top:0;align-self:flex-start;">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;padding:0 10px 8px;">Jump to</div>
      ${miniNav}
    </div>
    <div style="flex:1;min-width:0;max-width:880px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-size:18px;font-weight:800;">Bikroy Shop <span style="font-size:12px;font-weight:600;color:var(--text-muted);">· WhatsApp</span></div>
        <button class="btn btn-primary btn-sm">${icon('plus', 13)} Create Flow</button>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:8px;background:rgba(37,99,235,.08);color:var(--primary);display:flex;align-items:center;justify-content:center;">${icon('bot', 15)}</div>
            <span style="font-weight:700;font-size:13.5px;">Bot Manager</span>
            <span class="badge badge-primary">6 items</span>
          </div>
          ${icon('chevronUp', 15)}
        </div>
        ${rows}
      </div>

      ${collapsedSections}
    </div>
  </div>`;
}

/* ── Write files ── */
fs.writeFileSync('Main.dc.html', page('Option A', optionA()));
fs.writeFileSync('OptionB.dc.html', page('Option B', optionB()));
fs.writeFileSync('OptionC.dc.html', page('Option C', optionC()));
fs.writeFileSync('OptionD.dc.html', page('Option D', optionD()));
fs.writeFileSync('OptionE.dc.html', page('Option E', optionE()));
fs.writeFileSync('OptionF.dc.html', page('Option F', optionF()));
console.log('wrote 6 artboards');
