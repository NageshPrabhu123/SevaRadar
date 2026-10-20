// SevaRadar: install button, offline banner, data pre-caching and offline symptom guide.
(function () {
  // ── Service worker ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ── Styles ──
  const css = document.createElement('style');
  css.textContent = `
  #sr-offline{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7c2d12;color:#fff;font:600 13px/1.4 'DM Sans',sans-serif;
    padding:10px 16px;text-align:center;transform:translateY(100%);transition:transform .3s;box-shadow:0 -4px 18px rgba(0,0,0,.2)}
  #sr-offline.show{transform:translateY(0)}
  #sr-offline.online{background:#0f9b58}
  #sr-install{position:fixed;right:16px;bottom:70px;z-index:9998;display:none;align-items:center;gap:8px;border:none;cursor:pointer;
    background:linear-gradient(135deg,#0f9b58,#0a7a44);color:#fff;font:700 14px 'DM Sans',sans-serif;padding:12px 18px;border-radius:30px;
    box-shadow:0 8px 24px rgba(15,155,88,.4)}
  #sr-install.show{display:flex}
  #sr-install .x{margin-left:4px;opacity:.7;font-weight:400}
  .sr-contact{margin-top:8px}
  .sr-addr{font-size:12px;color:#6b7280;margin-bottom:6px}
  .sr-btns{display:flex;gap:8px;flex-wrap:wrap}
  .sr-cbtn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:10px;font:700 13px 'DM Sans',sans-serif;
    text-decoration:none;background:#0f9b58;color:#fff;box-shadow:0 3px 10px rgba(15,155,88,.25)}
  .sr-cbtn.sms{background:#fff;color:#0a7a44;border:1.5px solid #0f9b58;box-shadow:none}
  .sr-nophone{font-size:12px;color:#9ca3af}
  .sr-next{background:linear-gradient(145deg,#0d1f1a,#0a3d27);color:#fff;border-radius:18px;padding:18px 20px;margin-bottom:16px;box-shadow:0 10px 30px rgba(15,155,88,.2)}
  .sr-next-top{display:flex;justify-content:space-between;align-items:center;font:700 12px 'DM Sans',sans-serif;letter-spacing:.5px;text-transform:uppercase;color:#6ee7b7;gap:8px;flex-wrap:wrap}
  .sr-off{background:rgba(110,231,183,.15);border:1px solid rgba(110,231,183,.35);padding:3px 10px;border-radius:20px;text-transform:none;letter-spacing:0}
  .sr-next-when{font:800 22px 'Syne',sans-serif;margin:10px 0 6px}
  .sr-next-doc{font-size:15px;font-weight:700}
  .sr-next-doc span{font-weight:400;color:rgba(255,255,255,.6)}
  .sr-next-row{font-size:13px;color:rgba(255,255,255,.75);margin-top:5px}
  .sr-next .sr-cbtn.sms{background:transparent;color:#fff;border-color:#6ee7b7}
  .sr-pending .chat-bubble{opacity:.6}`;
  document.head.appendChild(css);

  // ── Offline banner ──
  const bar = document.createElement('div');
  bar.id = 'sr-offline';
  bar.title = 'Tap to hide';
  bar.addEventListener('click', () => (bar.className = ''));
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bar));
  let hideTimer;
  function setNet(online, firstRun) {
    clearTimeout(hideTimer);
    if (online) {
      if (firstRun) return;
      bar.className = 'show online';
      bar.textContent = '✅ Back online — latest data is loading.';
      hideTimer = setTimeout(() => (bar.className = ''), 3000);
      precache();
    } else {
      bar.className = 'show';
      const ts = window.srLastSync ? srLastSync() : 0;
      const when = ts ? ' (last updated ' + new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ')' : '';
      bar.textContent = '📴 You are offline — showing saved data' + when + ': doctors, medical shops, blood banks and emergency numbers. Messages, bookings and cancellations are saved and sent when you are back online. (Tap to hide)';
    }
  }
  window.addEventListener('online', () => setNet(true));
  window.addEventListener('offline', () => setNet(false));
  document.addEventListener('DOMContentLoaded', () => setNet(navigator.onLine, true));

  // ── Install button ──
  let deferred = null;
  const btn = document.createElement('button');
  btn.id = 'sr-install';
  btn.innerHTML = '⬇️ Install SevaRadar <span class="x" title="Hide">✕</span>';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    let hidden = false;
    try { hidden = localStorage.getItem('sr_install_hidden') === '1'; } catch (_) {}
    if (!standalone() && !hidden) btn.classList.add('show');
  });
  btn.addEventListener('click', async (e) => {
    if (e.target.classList.contains('x')) {
      btn.classList.remove('show');
      try { localStorage.setItem('sr_install_hidden', '1'); } catch (_) {}
      return;
    }
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.classList.remove('show');
  });
  window.addEventListener('appinstalled', () => btn.classList.remove('show'));

  // ── Save key lists for offline use (same queries the app makes) ──
  function precache() {
    if (!navigator.onLine || typeof sb === 'undefined') return;
    try {
      sb.from('emergency_hospitals').select('*').then(() => {});
      sb.from('doctors').select('id,name,hospital,specialty,phone,lat,lng').eq('available', true).eq('status', 'approved').then(() => {});
      sb.from('medical_shops').select('id,name,address,phone,lat,lng,services,hours').eq('available', true).eq('status', 'approved').then(() => {});
      sb.from('blood_banks').select('id,name,address,phone,emergency_phone,lat,lng,blood_groups').eq('available', true).eq('status', 'approved').then(() => {});
    } catch (_) {}
  }
  window.addEventListener('load', () => setTimeout(precache, 4000));

  // ── Keep data on the device: ask the browser not to clear it ──
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ── After login, load every screen's data in the background so it is saved for offline use ──
  const run = async (fn) => { try { if (typeof fn === 'function') await fn(); } catch (_) {} };
  async function warmUp() {
    if (!navigator.onLine || typeof CR === 'undefined' || !CR || typeof CU === 'undefined' || !CU) return;
    const L = {
      patient: ['loadEmergency', 'loadMyAppts', 'loadFeedbackPanel', 'loadNotifications', 'loadPrescriptions', 'loadChatPanel'],
      doctor: ['loadNotifications', 'loadChatPanel'],
      medical: ['loadNotifications', 'loadChatPanel'],
      bloodbank: ['loadEmergency'],
      admin: []
    }[CR] || [];
    const PANEL = { loadEmergency: 'emergency', loadMyAppts: 'appts', loadFeedbackPanel: 'feedback', loadNotifications: 'notif', loadPrescriptions: 'rx', loadChatPanel: 'chat' };
    try {
      const T = { patient: 'patients', doctor: 'doctors', medical: 'medical_shops', bloodbank: 'blood_banks' }[CR];
      if (T) await sb.from(T).select('*').eq('id', CU.id).maybeSingle();   // own profile
    } catch (_) {}
    for (const name of L) {
      // Don't redraw the screen the user is looking at; the background refresh keeps its data current
      const on = document.getElementById('panel-' + PANEL[name]);
      if (on && on.classList.contains('on') && name !== 'loadChatPanel') continue;
      await run(window[name]);
    }
    // Chat history with every contact
    try {
      const ids = [...document.querySelectorAll('#chat-contacts-list .chat-contact')].map(e => e.id.replace('contact-', ''));
      for (const other of ids) {
        await sb.from('chat_messages').select('*')
          .or(`and(sender_id.eq.${CU.id},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${CU.id})`)
          .order('created_at', { ascending: true }).limit(100);
      }
    } catch (_) {}
    saveMapArea();
  }
  if (typeof window.setupApp === 'function') {
    const orig = window.setupApp;
    window.setupApp = function () { const r = orig.apply(this, arguments); setTimeout(warmUp, 2500); return r; };
  }
  window.addEventListener('online', () => setTimeout(warmUp, 3000));

  // ── Auto-sync: whenever there is network, refresh everything saved on the device ──
  const SYNC_EVERY = 5 * 60e3, DISCOVER_EVERY = 15 * 60e3;
  let lastSync = 0, lastDiscover = Date.now();
  async function swPost(msg) {
    try { const r = await navigator.serviceWorker.ready; (r.active || navigator.serviceWorker.controller).postMessage(msg); } catch (_) {}
  }
  function syncNow(force) {
    if (!navigator.onLine || document.hidden) return;
    if (!force && Date.now() - lastSync < 60e3) return;
    lastSync = Date.now();
    swPost({ type: 'sr-refresh' });                       // re-download all saved data
    if (Date.now() - lastDiscover > DISCOVER_EVERY) { lastDiscover = Date.now(); warmUp(); precache(); } // pick up new records
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(async (reg) => {
      if (typeof SB_KEY !== 'undefined') swPost({ type: 'sr-creds', key: SB_KEY });
      try {
        if (reg.periodicSync) {
          const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (st.state === 'granted') await reg.periodicSync.register('sr-refresh', { minInterval: 60 * 60e3 });
        }
      } catch (_) {}
      setTimeout(() => syncNow(true), 8000);
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'sr-synced') { try { localStorage.setItem('sr_synced_at', String(e.data.at)); } catch (_) {} }
    });
  }
  setInterval(() => syncNow(true), SYNC_EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(false); });
  window.addEventListener('online', () => setTimeout(() => syncNow(true), 2000));
  window.srLastSync = () => { try { return +localStorage.getItem('sr_synced_at') || 0; } catch (_) { return 0; } };

  // ── Tell the service worker who is logged in, so only this user's data is kept ──
  const setUser = (id) => swPost({ type: 'sr-user', id: id || null });
  if (typeof window.resolveProfile === 'function') {
    const origRP = window.resolveProfile;
    window.resolveProfile = async function (user) { if (user && user.id) { setUser(user.id); await new Promise(r => setTimeout(r, 150)); } return origRP.apply(this, arguments); };
  }
  if (typeof window.doSignOut === 'function') {
    const origSO = window.doSignOut;
    // Saved data stays for this person (so offline sign-in works); it is wiped when a different person signs in
    window.doSignOut = function () { return origSO.apply(this, arguments); };
  }

  // ── Save map tiles around the user (once a day) ──
  function tileXY(lat, lng, z) {
    const n = 2 ** z, r = lat * Math.PI / 180;
    return [Math.floor((lng + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
  }
  // ── Map fallback: if a detailed tile is missing (offline), show the nearest saved lower-zoom tile enlarged ──
  if (window.L && L.TileLayer) {
    L.TileLayer.addInitHook(function () {
      const layer = this;
      if (/Reference\//.test(layer._url || '')) return;            // skip label overlay (would look huge)
      layer.on('tileerror', (e) => {
        const t = e.tile, c = e.coords;
        const size = layer.getTileSize().x;
        const tryLevel = (d) => {
          if (d > 12 || c.z - d < 0) return;
          const px = c.x >> d, py = c.y >> d;
          const url = L.Util.template(layer._url, L.extend({}, layer.options, {
            x: px, y: py, z: c.z - d, s: layer._getSubdomain({ x: px, y: py }),
            r: L.Browser.retina ? '@2x' : ''
          }));
          const probe = new Image();
          probe.onload = () => {
            const sc = 1 << d, ox = (c.x - (px << d)) * size, oy = (c.y - (py << d)) * size;
            t.style.background = `url("${url}") -${ox}px -${oy}px / ${size * sc}px ${size * sc}px no-repeat`;
            t.style.opacity = 1;
            t.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // transparent, so the background shows
          };
          probe.onerror = () => tryLevel(d + 1);
          probe.src = url;
        };
        tryLevel(1);
      });
    });
  }

  // ── Offline map pack: satellite map saved on the device ──
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
  const LBL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/';
  function buildPack(lat, lng) {
    const out = new Set();
    const box = (z, s, n, w, e, labels) => {
      const [x1, y1] = tileXY(n, w, z), [x2, y2] = tileXY(s, e, z);
      for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) {
        out.add(SAT + `${z}/${y}/${x}`);
        if (labels) out.add(LBL + `${z}/${y}/${x}`);
      }
    };
    const around = (la, lo, km, z, labels) => {
      const dLa = km / 111, dLo = km / (111 * Math.cos(la * Math.PI / 180));
      box(z, la - dLa, la + dLa, lo - dLo, lo + dLo, labels);
    };
    for (let z = 3; z <= 8; z++) box(z, 6.5, 35.7, 68, 97.5, true);           // all of India
    if (lat != null) {
      for (let z = 9; z <= 11; z++) around(lat, lng, 60, z, true);            // district
      for (let z = 12; z <= 13; z++) around(lat, lng, 25, z, true);
      around(lat, lng, 8, 14, true);                                         // town
      around(lat, lng, 2.5, 15, true); around(lat, lng, 2.5, 16, false);     // neighbourhood
      around(lat, lng, 0.8, 17, false);
    }
    let places = [];
    try { places = [...(allDocs || []), ...(allMeds || []), ...(allBBs || [])].filter(p => p && p.lat && p.lng); } catch (_) {}
    places.slice(0, 60).forEach(pl => { around(+pl.lat, +pl.lng, 0.4, 15, true); around(+pl.lat, +pl.lng, 0.4, 16, false); });
    return [...out];
  }
  const packInfo = () => { try { return JSON.parse(localStorage.getItem('sr_pack') || 'null'); } catch (_) { return null; } };
  const kmBetween = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const onWifi = () => { const c = navigator.connection; return !c || (!c.saveData && (c.type === undefined || c.type === 'wifi' || c.type === 'ethernet')); };
  const getPos = () => new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res([p.coords.latitude, p.coords.longitude]), () => {
      try { if (typeof patLat !== 'undefined' && patLat) return res([patLat, patLng]); } catch (_) {}
      res(null);
    }, { maximumAge: 6e5, timeout: 10000 });
  });
  let packRunning = false;
  window.srMapPack = async function (userAsked) {
    const btn = document.getElementById('sr-pack-btn');
    if (packRunning) { if (userAsked) toast('⬇️ Offline map is already downloading…'); return; }
    if (!navigator.onLine) { if (userAsked) toast(packInfo() ? '🗺️ Offline map is saved on this device.' : '📴 Connect to the internet to download the offline map.', userAsked ? 'r' : 'g'); return; }
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) { if (userAsked) toast('Please reload the app once, then try again.', 'r'); return; }
    const pos = await getPos();
    const urls = buildPack(pos && pos[0], pos && pos[1]);
    const mb = Math.round(urls.filter(u => u.startsWith(SAT)).length * 0.025 + urls.filter(u => u.startsWith(LBL)).length * 0.006);
    if (userAsked && !confirm(`Download the satellite map for offline use?\n\nAbout ${mb} MB — all of India plus your area${pos ? '' : ' (allow location for your area)'} and saved doctors, shops and blood banks. Wi-Fi recommended.`)) return;
    packRunning = true;
    let done = 0, failed = 0;
    for (let i = 0; i < urls.length; i += 40) {
      if (!navigator.onLine || (i >= 200 && failed > done * 0.5)) break;
      const batch = urls.slice(i, i + 40);
      await new Promise(res => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (ev) => { failed += (ev.data && ev.data.failed) || 0; res(); };
        navigator.serviceWorker.controller.postMessage({ type: 'sr-pack', urls: batch }, [ch.port2]);
        setTimeout(res, 60000);
      });
      done += batch.length;
      if (btn) btn.textContent = `⬇️ ${Math.round(done / urls.length * 100)}%`;
    }
    packRunning = false;
    const complete = done >= urls.length && failed <= urls.length * 0.05;
    if (btn) btn.textContent = complete ? '✅ Offline map' : '⬇️ Offline map';
    if (complete) {
      try { localStorage.setItem('sr_pack', JSON.stringify({ at: Date.now(), lat: pos && pos[0], lng: pos && pos[1], tiles: urls.length })); } catch (_) {}
      toast(`🗺️ Offline map saved (${urls.length} tiles). Satellite view now works without internet.`);
    } else toast('⚠️ Map download paused — it will continue when you are back online.', 'r');
  };
  // Automatic: on Wi-Fi, download once, refresh monthly, or when the user has moved more than 30 km
  async function saveMapArea() {
    const info = packInfo();
    if (info && info.at) { const b = document.getElementById('sr-pack-btn'); if (b && !packRunning) b.textContent = '✅ Offline map'; }
    if (!onWifi()) return;
    if (info && Date.now() - info.at < 30 * 864e5) {
      if (info.lat == null) return;
      const pos = await getPos();
      if (!pos || kmBetween(info.lat, info.lng, pos[0], pos[1]) < 30) return;
    }
    srMapPack(false);
  }


  // ── Certificate viewer: opens inside the app, never shows the storage address ──
  window.viewCert = async function (u) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = '<div style="background:#fff;border-radius:14px;width:min(900px,100%);height:min(85vh,1000px);display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e5e7eb;font:700 15px DM Sans,sans-serif">📋 Doctor Certificate' +
      '<button style="border:none;background:#f3f4f6;border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:700">✕ Close</button></div>' +
      '<div class="cv-body" style="flex:1;display:flex;align-items:center;justify-content:center;background:#f9fafb;color:#6b7280;font:14px DM Sans,sans-serif">Loading…</div></div>';
    const close = () => { ov.remove(); if (ov._url) URL.revokeObjectURL(ov._url); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.tagName === 'BUTTON') close(); });
    document.body.appendChild(ov);
    const body = ov.querySelector('.cv-body');
    try {
      const res = await fetch(u);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      ov._url = URL.createObjectURL(blob);
      body.innerHTML = blob.type.startsWith('image/')
        ? '<img style="max-width:100%;max-height:100%;object-fit:contain" src="' + ov._url + '">'
        : '<iframe style="width:100%;height:100%;border:0" src="' + ov._url + '"></iframe>';
    } catch (_) {
      body.textContent = navigator.onLine ? 'Could not load the certificate.' : 'You are offline and this certificate is not saved yet.';
    }
  };

  // ── Appointments: call / SMS the doctor over the mobile network (no internet needed) ──
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const telOf = (p) => { let d = String(p || '').replace(/[^\d+]/g, ''); if (/^\d{10}$/.test(d)) d = '+91' + d; return d; };
  function apptDoc(a) { try { return (allDocs || []).find(d => d.id === a.doctor_id) || null; } catch (_) { return null; } }
  function smsText(a) {
    const dt = new Date(a.scheduled_at);
    const me = (typeof CP !== 'undefined' && CP && CP.name) ? CP.name : 'your patient';
    return `Hi Dr. ${a.doctor_name}, this is ${me} regarding my SevaRadar appointment on ` +
      `${dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. `;
  }
  function contactButtons(a, phone) {
    if (!phone) return '<span class="sr-nophone">Doctor phone not available</span>';
    return `<a class="sr-cbtn" href="tel:${phone}">📞 Call</a>` +
      `<a class="sr-cbtn sms" href="sms:${phone}?body=${encodeURIComponent(smsText(a))}">💬 SMS</a>`;
  }
  window.srContactRow = function (a) {
    if (['cancelled', 'declined'].includes(a.status)) return '';
    const doc = apptDoc(a), phone = telOf(doc && doc.phone);
    const addr = (doc && doc.address) || a.hospital || '';
    return `<div class="sr-contact">${addr ? `<div class="sr-addr">📍 ${esc(addr)}</div>` : ''}<div class="sr-btns">${contactButtons(a, phone)}</div></div>`;
  };
  window.srNextApptCard = function (list) {
    const now = Date.now() - 3600e3;
    const next = (list || []).filter(a => ['pending', 'accepted'].includes(a.status) && new Date(a.scheduled_at).getTime() >= now)
      .sort((x, y) => new Date(x.scheduled_at) - new Date(y.scheduled_at))[0];
    if (!next) return '';
    const dt = new Date(next.scheduled_at), doc = apptDoc(next), phone = telOf(doc && doc.phone);
    const addr = (doc && doc.address) || next.hospital || '';
    return `<div class="sr-next">
      <div class="sr-next-top"><span>📌 Your next appointment</span><span class="sr-off">✓ Available offline</span></div>
      <div class="sr-next-when">${dt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · ${dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
      <div class="sr-next-doc">👨‍⚕️ Dr. ${esc(next.doctor_name)} <span>· ${esc(next.specialty || '')}</span></div>
      ${addr ? `<div class="sr-next-row">📍 ${esc(addr)}</div>` : ''}
      ${phone ? `<div class="sr-next-row">☎️ ${esc(phone)}</div>` : ''}
      <div class="sr-next-row">Status: <b>${esc(next.status)}</b> · ${next.payment_method === 'upi' ? 'UPI' : 'Cash at clinic'} ₹${esc(next.fee)}</div>
      <div class="sr-btns" style="margin-top:12px">${contactButtons(next, phone)}</div>
    </div>`;
  };

  // ── Things saved while offline: tell the user, show pending chat messages ──
  const toast = (m, c) => { try { showToast(m, c || 'g'); } catch (_) {} };
  let qt;
  window.addEventListener('sr-queued', (e) => {
    clearTimeout(qt);
    qt = setTimeout(() => toast('📤 Saved on your device — it will be sent automatically when you are back online.'), 300);
    if (e.detail.table === 'chat_messages') setTimeout(showPendingChat, 50);
  });
  window.addEventListener('sr-flushed', (e) => {
    toast(`✅ Back online — ${e.detail} saved ${e.detail === 1 ? 'action was' : 'actions were'} sent.`);
    setTimeout(warmUp, 1500);
  });
  function showPendingChat() {
    try {
      if (typeof _chatOtherId === 'undefined' || !_chatOtherId || !window.srOutbox) return;
      const box = document.getElementById('cr-messages'); if (!box) return;
      box.querySelectorAll('.sr-pending').forEach(n => n.remove());
      for (const it of srOutbox.list()) {
        if (it.table !== 'chat_messages' || it.method !== 'POST') continue;
        let m; try { m = JSON.parse(it.body); } catch (_) { continue; }
        if (Array.isArray(m)) m = m[0];
        if (!m || m.receiver_id !== _chatOtherId) continue;
        const before = box.children.length;
        appendChatMsg({ ...m, id: 'pending', message: esc(m.message) + ' ⏳', created_at: it.at }, true);
        if (box.children.length > before) box.lastElementChild.classList.add('sr-pending');
      }
    } catch (_) {}
  }
  if (typeof window.loadRoomMessages === 'function') {
    const origLRM = window.loadRoomMessages;
    window.loadRoomMessages = async function () { const r = await origLRM.apply(this, arguments); showPendingChat(); return r; };
  }

  // ── Public emergency screen: no login needed, works offline with saved hospital list ──
  let emgHome = null;
  window.openPublicEmergency = function () {
    const panel = document.getElementById('panel-emergency');
    if (!panel || typeof loadEmergency !== 'function') return;
    let ov = document.getElementById('sr-emg-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'sr-emg-ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:var(--bg,#f0f7f3);overflow-y:auto;padding:16px';
      ov.innerHTML = '<div style="max-width:1100px;margin:0 auto"><button id="sr-emg-close" style="border:none;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:9px 16px;font:700 14px DM Sans,sans-serif;cursor:pointer;margin-bottom:12px">← Back</button><div id="sr-emg-slot"></div></div>';
      document.body.appendChild(ov);
      ov.querySelector('#sr-emg-close').onclick = closePublicEmergency;
    }
    emgHome = { parent: panel.parentNode, next: panel.nextSibling };
    ov.querySelector('#sr-emg-slot').appendChild(panel);
    panel.classList.add('on');
    ov.style.display = 'block';
    const go = () => run(loadEmergency);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => { try { patLat = p.coords.latitude; patLng = p.coords.longitude; } catch (_) {} go(); },
        () => go(), { maximumAge: 6e5, timeout: 8000 });
    } else go();
  };
  window.closePublicEmergency = function () {
    const ov = document.getElementById('sr-emg-ov'), panel = document.getElementById('panel-emergency');
    if (panel && emgHome) { emgHome.parent.insertBefore(panel, emgHome.next); if (!(typeof CU !== 'undefined' && CU)) panel.classList.remove('on'); }
    if (ov) ov.style.display = 'none';
  };

  // ── Offline symptom guide (used by the AI chat when there is no internet) ──
  const RED_FLAGS = [
    [/chest pain|chest tight|heart attack|सीने में दर्द|ಎದೆ ನೋವು/i, 'chest pain'],
    [/can'?t breathe|breathless|difficulty breathing|shortness of breath|सांस/i, 'breathing difficulty'],
    [/unconscious|fainted|not responding|seizure|fits|convulsion/i, 'unconsciousness or seizure'],
    [/stroke|face droop|slurred|one side weak|paraly/i, 'stroke signs'],
    [/heavy bleeding|bleeding a lot|accident|burn|poison|snake ?bite|dog ?bite/i, 'serious injury, bleeding, bite or poisoning'],
    [/suicid|kill myself|end my life|self.?harm/i, 'thoughts of self-harm']
  ];
  const MAP = [
    [/fever|cold|cough|body ache|weakness|vomit|loose motion|diarrh|headache|ಜ್ವರ|बुखार/i, 'General Physician'],
    [/child|baby|infant|kid|son|daughter|ಮಗು|बच्चा/i, 'Pediatrician'],
    [/pregnan|period|menstru|pcos|pcod|white discharge/i, 'Gynecologist'],
    [/bone|joint|knee|back pain|fracture|sprain|neck pain|shoulder/i, 'Orthopedist'],
    [/heart|palpitation|bp|blood pressure/i, 'Cardiologist'],
    [/tooth|teeth|gum|dental/i, 'Dentist'],
    [/skin|rash|itch|acne|pimple|allerg|hair fall/i, 'Dermatologist'],
    [/ear|nose|throat|tonsil|sinus/i, 'ENT Specialist'],
    [/eye|vision|blurr|spectacle/i, 'Ophthalmologist'],
    [/sugar|diabet|thyroid/i, 'Diabetologist'],
    [/numb|migraine|dizz|memory|tremor/i, 'Neurologist'],
    [/urine|kidney stone|prostate|burning urination/i, 'Urologist'],
    [/stress|anxi|depress|sad|can'?t sleep|insomnia|panic|mental/i, 'Psychologist/Therapist']
  ];
  window.offlineTriage = function (msg) {
    const head = '📴 Offline mode — basic guide only (AI needs internet).\n\n';
    for (const [re, label] of RED_FLAGS) {
      if (re.test(msg)) {
        if (label === 'thoughts of self-harm') {
          return head + '💛 You are not alone. Please talk to someone right now — call the Tele-MANAS helpline 14416 or 112. Open the Emergency tab for the nearest hospital.';
        }
        return head + '🚨 This may be an emergency (' + label + ').\nCall 108 for an ambulance or 112 now. Open the Emergency tab to call the nearest hospital — it works without internet.';
      }
    }
    const hits = [];
    for (const [re, spec] of MAP) if (re.test(msg) && !hits.includes(spec)) hits.push(spec);
    if (!hits.length) hits.push('General Physician');
    return head + '🩺 Suggested specialist: ' + hits.slice(0, 2).join(' or ') + '.\n\n' +
      'Saved doctors, medical shops and blood banks are still listed in the app. When you are back online, ask again for a fuller answer or book a consult.\n\n' +
      '⚠️ This is not a diagnosis. If symptoms get worse, call 108.';
  };
})();
