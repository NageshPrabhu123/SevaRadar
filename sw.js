// SevaRadar service worker: makes the app installable and usable offline.
const VERSION = 'sr-v11';
const PACK = 'sr-mappack'; // downloaded offline map, kept across updates
const SHELL = VERSION + '-shell';
const DATA = VERSION + '-data';
const TILES = VERSION + '-tiles';
const MAX_TILES = 2500;

const SHELL_FILES = [
  './', 'index.html', 'about.html', 'pwa.js', 'outbox.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/favicon-64.png'
];
const CDN_FILES = [
  'lib/supabase.js', 'lib/email.min.js', 'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css',
  'lib/leaflet/images/marker-icon.png', 'lib/leaflet/images/marker-icon-2x.png', 'lib/leaflet/images/marker-shadow.png',
  'lib/leaflet/images/layers.png', 'lib/leaflet/images/layers-2x.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // Add one by one so a single failure doesn't stop installation
    await Promise.all([...SHELL_FILES, ...CDN_FILES].map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

// ── Privacy: what may be saved on this device ──
// Public listings (doctors, shops, blood banks, hospitals) + ONLY queries filtered by the logged-in user's own ID.
// Never: the users table (passwords), team list, other people's records, admin lists.
const PUBLIC_TABLES = ['doctors', 'medical_shops', 'blood_banks', 'emergency_hospitals'];
const NEVER_TABLES = ['users', 'team_members'];
const USER_KEY = '/__sr_user__';
let currentUser; // undefined = not loaded yet
async function getUser() {
  if (currentUser === undefined) { const u = await getJSON(USER_KEY); currentUser = (u && u.id) || null; }
  return currentUser;
}
async function mayStore(u) {
  const url = new URL(u);
  const table = url.pathname.split('/')[3] || '';
  if (NEVER_TABLES.includes(table)) return false;
  const me = await getUser();
  if (me && decodeURIComponent(url.search).includes(me)) return true;        // the user's own data
  if (PUBLIC_TABLES.includes(table)) {
    const sel = url.searchParams.get('select') || '*';
    return sel !== '*' || table === 'emergency_hospitals';                    // public columns only
  }
  return false;
}
async function clearPersonal() {
  const cache = await caches.open(DATA);
  for (const k of await cache.keys()) {
    if (k.url.includes('/rest/v1/') || k.url.endsWith(META_KEY) || k.url.includes('/storage/v1/')) await cache.delete(k);
  }
  meta = {};
}

// ── Background refresh: re-download every saved database answer while there is network ──
const CREDS_KEY = '/__sr_creds__', META_KEY = '/__sr_meta__';
let meta = null, metaTimer = null;
async function getJSON(key) { const r = await (await caches.open(DATA)).match(key); return r ? r.json() : null; }
async function putJSON(key, obj) {
  await (await caches.open(DATA)).put(key, new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } }));
}
async function rememberAccept(u, accept) {
  if (!meta) meta = (await getJSON(META_KEY)) || {};
  if (meta[u] === (accept || '')) return;
  meta[u] = accept || '';
  clearTimeout(metaTimer); metaTimer = setTimeout(() => putJSON(META_KEY, meta), 1000);
}
let refreshing = null;
function refreshAll() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const creds = await getJSON(CREDS_KEY);
    if (!creds || !creds.key) return 0;
    if (!meta) meta = (await getJSON(META_KEY)) || {};
    const cache = await caches.open(DATA);
    const keys = (await cache.keys()).filter(r => r.url.includes('/rest/v1/'));
    let ok = 0;
    for (let i = 0; i < keys.length; i += 4) {
      await Promise.all(keys.slice(i, i + 4).map(async (k) => {
        if (!(await mayStore(k.url))) { await cache.delete(k); return; }
        try {
          const res = await fetch(k.url, { headers: { apikey: creds.key, Authorization: 'Bearer ' + creds.key, Accept: meta[k.url] || 'application/json' } });
          if (res.ok) { await cache.put(k, res); ok++; }
        } catch (_) {}
      }));
    }
    await putJSON('/__sr_synced__', { at: Date.now(), count: ok });
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'sr-synced', at: Date.now(), count: ok }));
    return ok;
  })().finally(() => { refreshing = null; });
  return refreshing;
}
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'sr-creds' && d.key) e.waitUntil(putJSON(CREDS_KEY, { key: d.key }));
  if (d.type === 'sr-refresh') e.waitUntil(refreshAll());
  if (d.type === 'sr-pack' && e.ports[0]) e.waitUntil((async () => {
    const pack = await caches.open(PACK);
    let saved = 0, failed = 0;
    await Promise.all((d.urls || []).map(async (u) => {
      try {
        if (await pack.match(u)) { saved++; return; }
        let res = await caches.match(u);
        if (!res) { try { res = await fetch(u, { mode: 'cors' }); } catch (_) { res = await fetch(u, { mode: 'no-cors' }); } }
        if (res && (res.ok || res.type === 'opaque')) { await pack.put(u, res); saved++; } else failed++;
      } catch (_) { failed++; }
    }));
    e.ports[0].postMessage({ saved, failed });
  })());
  if (d.type === 'sr-user') e.waitUntil((async () => {
    const prev = await getUser(), next = d.id || null;
    if (prev !== next) { await clearPersonal(); currentUser = next; await putJSON(USER_KEY, { id: next }); }
  })());
});
// Chrome on Android/desktop can refresh even while the app is closed (installed app only)
self.addEventListener('periodicsync', (e) => { if (e.tag === 'sr-refresh') e.waitUntil(refreshAll()); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION) && k !== PACK).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

async function networkFirst(req, cacheName, ms, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req), ms);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    if (fallback) return fallback();
    throw err;
  }
}

async function cacheFirst(req, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) {
    cache.put(req, res.clone());
    if (limit) cache.keys().then(k => { if (k.length > limit) k.slice(0, k.length - limit).forEach(x => cache.delete(x)); });
  }
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || net;
}

const offlineJson = () => new Response(JSON.stringify({ message: 'You are offline and this data has not been saved yet.', code: 'OFFLINE' }),
  { status: 503, headers: { 'Content-Type': 'application/json' } });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;            // bookings, sign-ups etc. need the network
  const url = new URL(req.url);

  // App pages
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL, 4000, async () =>
      (await caches.match(url.pathname.endsWith('about.html') ? 'about.html' : 'index.html')) || offlineJson()));
    return;
  }
  // Supabase data (doctors, medical shops, blood banks, hospitals, appointments...)
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')) {
    e.respondWith((async () => {
      if (await mayStore(req.url)) {
        rememberAccept(req.url, req.headers.get('accept'));
        return networkFirst(req, DATA, 6000, offlineJson);
      }
      try { return await fetch(req); } catch (_) { return offlineJson(); }   // not saved on device
    })());
    return;
  }
  // Uploaded files (certificates etc.)
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/')) {
    return; // uploaded documents (certificates) are never saved on the device
  }
  // Map tiles
  if (url.hostname.includes('basemaps.cartocdn.com') || url.hostname.includes('arcgisonline.com') || url.hostname.includes('tile.openstreetmap.org')) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreVary: true });   // offline map pack or recently viewed
      if (hit) return hit;
      return cacheFirst(req, TILES, MAX_TILES);
    })().catch(() => new Response('', { status: 504 })));
    return;
  }
  // Libraries and fonts
  if (['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  // Own files
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req, SHELL));
  }
});
