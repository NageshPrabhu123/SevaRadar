// SevaRadar outbox: chat messages, bookings, cancellations, ratings and notification updates
// made without internet are saved on the device and sent automatically when the connection returns.
// Must load BEFORE lib/supabase.js.
(function () {
  const KEY = 'sr_outbox';
  const TABLES = ['chat_messages', 'appointments', 'feedback', 'notifications'];
  const realFetch = window.fetch.bind(window);

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const save = (q) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (_) {} };
  const tableOf = (url) => { const m = String(url).match(/\.supabase\.co\/rest\/v1\/([^?/]+)/); return m && m[1]; };
  const plainHeaders = (h) => { const o = {}; if (h) new Headers(h).forEach((v, k) => (o[k] = v)); return o; };

  // Reply to the app as if the server accepted it, so screens carry on normally
  function fakeResponse(item) {
    const prefer = item.headers.prefer || '';
    let body = null, status = item.method === 'POST' ? 201 : 204;
    if (prefer.includes('return=representation')) {
      let rows = [];
      try { rows = JSON.parse(item.body || 'null'); } catch (_) {}
      if (rows && !Array.isArray(rows)) rows = [rows];
      rows = rows || [];
      status = item.method === 'POST' ? 201 : 200;
      body = (item.headers.accept || '').includes('vnd.pgrst.object') ? JSON.stringify(rows[0] || null) : JSON.stringify(rows);
    }
    return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
  }

  function enqueue(item) {
    const q = load(); q.push(item); save(q);
    window.dispatchEvent(new CustomEvent('sr-queued', { detail: item }));
    return fakeResponse(item);
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const table = method !== 'GET' && method !== 'HEAD' ? tableOf(url) : null;
    if (!table || !TABLES.includes(table)) return realFetch(input, init);

    const item = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      url, method, table,
      headers: plainHeaders(init && init.headers),
      body: init && typeof init.body === 'string' ? init.body : null,
      at: new Date().toISOString()
    };
    if (!navigator.onLine) return enqueue(item);
    try {
      return await realFetch(input, init);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      return enqueue(item); // network dropped mid-request
    }
  };

  let flushing = false;
  window.srOutbox = {
    list: load,
    async flush() {
      if (flushing || !navigator.onLine) return 0;
      flushing = true;
      let sent = 0;
      try {
        let q = load();
        while (q.length) {
          const it = q[0];
          let res;
          try { res = await realFetch(it.url, { method: it.method, headers: it.headers, body: it.body }); }
          catch (_) { break; }                 // still no connection: try again later
          if (res.status >= 500) break;        // server problem: try again later
          q.shift(); save(q);                  // sent (or rejected as invalid): remove
          if (res.ok) sent++;
        }
      } finally { flushing = false; }
      if (sent) window.dispatchEvent(new CustomEvent('sr-flushed', { detail: sent }));
      return sent;
    }
  };
  window.addEventListener('online', () => window.srOutbox.flush());
  window.addEventListener('load', () => setTimeout(() => window.srOutbox.flush(), 1500));
})();
