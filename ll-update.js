/* LifeLink update prompt (native Android app only). Loaded by ll-app.js.
   On launch it reads the installed build number, fetches version.json from the latest GitHub release, and if a newer
   build exists shows "New version available - Update / Later". "Update" opens the APK download.
   Does nothing in a normal browser. Never touches Supabase, bookings, wallet or maps. If anything fails it stays silent. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())) return;
  if (window.__llUpdate) return; window.__llUpdate = true;

  var VERSION_URL = 'https://github.com/danielighocode-afk/lifelink.apk-2/releases/latest/download/version.json';
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // "Checked" is only remembered AFTER a check has really finished, so leaving the screen early can never cancel it for good.
  // It also checks again whenever the app is brought back to the front.
  var K_OK = 'll_update_ok', K_LATER = 'll_update_later';

  // Native HTTP avoids browser cross-site (CORS) limits and follows GitHub's redirect to the file.
  function fetchJson() {
    var H = cap.Plugins && cap.Plugins.CapacitorHttp;
    var u = VERSION_URL + '?t=' + Date.now();
    if (H && H.get) return H.get({ url: u, headers: { 'Cache-Control': 'no-cache' } }).then(function (r) { if (!r || r.status !== 200) throw new Error('status'); return typeof r.data === 'string' ? JSON.parse(r.data) : r.data; });
    return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('status'); return r.json(); });
  }
  function installedBuild() {
    var A = cap.Plugins && cap.Plugins.App;
    if (!A || !A.getInfo) return Promise.reject(new Error('no App plugin'));
    return A.getInfo().then(function (i) { return { code: parseInt(i.build, 10) || 0, name: i.version || '' }; });
  }

  function show(v, force) {
    if (document.getElementById('llUpd')) return;
    var d = document.createElement('div'); d.id = 'llUpd';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.55);padding:16px;font-family:inherit';
    d.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="llUpdT" style="width:100%;max-width:420px;background:var(--ll-surface,#fff);color:var(--ll-text,#0f172a);border-radius:24px;padding:22px 20px 18px;box-shadow:0 20px 50px rgba(0,0,0,.3)">' +
      '<h2 id="llUpdT" style="margin:0 0 6px;font-size:19px;font-weight:800">New version available</h2>' +
      '<p style="margin:0 0 10px;font-size:14px;opacity:.75">LifeLink ' + esc(v.versionName || '') + ' is ready.' + (force ? ' You need to update to keep using the app.' : '') + '</p>' +
      (v.notes ? '<p style="margin:0 0 14px;font-size:14px;font-weight:600">' + esc(v.notes) + '</p>' : '') +
      '<p style="margin:0 0 16px;font-size:12.5px;opacity:.65">Tap Update, open the downloaded file and tap Install. Your account and data stay as they are.</p>' +
      '<div style="display:flex;gap:10px">' + (force ? '' : '<button id="llUpdLater" style="flex:1;padding:13px;border-radius:14px;border:1px solid rgba(100,116,139,.35);background:transparent;color:inherit;font-weight:800;font-size:15px">Later</button>') +
      '<button id="llUpdGo" style="flex:1;padding:13px;border-radius:14px;border:0;background:var(--ll-primary,#07865f);color:#fff;font-weight:800;font-size:15px">Update</button></div></div>';
    document.body.appendChild(d);
    document.getElementById('llUpdGo').onclick = function () {
      try { window.open(v.apkUrl, '_system'); } catch (e) { location.href = v.apkUrl; }
    };
    var later = document.getElementById('llUpdLater');
    if (later) later.onclick = function () { sset(K_LATER, '1'); d.remove(); };   // hides it until the app is next opened
  }

  var running = false;
  function run(tries) {
    if (running || sget(K_LATER)) return;
    running = true;
    Promise.all([installedBuild(), fetchJson()]).then(function (r) {
      running = false;
      var cur = r[0], v = r[1];
      if (!v || !v.apkUrl || !/^https:\/\//.test(v.apkUrl)) { sset(K_OK, '1'); return; }
      var latest = parseInt(v.versionCode, 10) || 0;
      if (latest <= cur.code) { sset(K_OK, '1'); return; }   // up to date: done for this session
      var force = v.force === true;
      if (document.body) show(v, force); else document.addEventListener('DOMContentLoaded', function () { show(v, force); });
    }).catch(function () {
      running = false;   // offline or not ready yet: try again shortly (3 tries), otherwise stay silent
      if ((tries || 0) < 3) setTimeout(function () { run((tries || 0) + 1); }, 2500 * ((tries || 0) + 1));
    });
  }
  function start() { if (!sget(K_OK)) run(0); }
  // Starts as soon as the page structure exists (does not wait for images or the 2.5 s timer that could be cut short).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 400); }); else setTimeout(start, 400);
  // Coming back to the app from the background: look again.
  try {
    var A = cap.Plugins && cap.Plugins.App;
    if (A && A.addListener) A.addListener('appStateChange', function (st) { if (st && st.isActive) { try { sessionStorage.removeItem(K_OK); sessionStorage.removeItem(K_LATER); } catch (e) {} setTimeout(start, 400); } });
  } catch (e) {}
})();
