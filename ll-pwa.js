/* LifeLink PWA layer (browser / iPhone home-screen app only; does nothing inside the native Android app).
   1) registers the service worker  2) on iPhone Safari, nudges people to Add to Home Screen (needed for notifications)
   3) once signed in and installed, offers "Turn on notifications" (iOS needs a tap) and saves the web-push subscription in
   public.device_tokens (platform 'web')  4) removes it on sign-out. Never touches bookings, wallet or maps. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return;
  if (window.__llPwa) return; window.__llPwa = true;

  var cfg = window.LL_PWA_CONFIG || {};
  var ua = navigator.userAgent || '';
  var IOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var STANDALONE = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  var page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
  var QUIET = { signin: 1, welcome: 1, admin: 1, index: 1, offline: 1 };   // no banners on these pages
  var K_TOKEN = 'll_wp_token', K_SAVED = 'll_wp_saved', K_IOS = 'll_pwa_ios_hide', K_ASK = 'll_wp_hide';
  var DAY = 864e5;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function hidden(k, days) { var t = Number(get(k) || 0); return t && Date.now() - t < days * DAY; }
  function client() { return window.LLSB ? window.LLSB.getClient() : Promise.reject(new Error('supabase-client.js did not load.')); }
  function meId() { var L = window.LL; return L && L.me && L.me.id ? L.me.id : null; }

  /* ---- 1) service worker ---- */
  var swReady = null;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    swReady = navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).catch(function (e) { console.warn('[pwa] service worker failed:', e && e.message); return null; });
  }

  /* ---- small bottom banner ---- */
  function banner(id, title, text, actionLabel, onAction, onClose) {
    if (document.getElementById(id)) return;
    if (!document.getElementById('ll-pwa-css')) {
      var s = document.createElement('style'); s.id = 'll-pwa-css';
      s.textContent = '.ll-pwab{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:9999;max-width:460px;margin:0 auto;padding:14px 16px;border-radius:16px;background:#fff;color:#1f2937;border:1px solid #e3ebf3;border-left:5px solid #11a97a;box-shadow:0 12px 32px -10px rgba(10,35,81,.35);font:14px/1.45 system-ui,-apple-system,sans-serif}' +
        '.ll-pwab b{display:block;font-size:15px;color:#0a2351;margin-bottom:2px}.ll-pwab p{margin:0 0 10px;color:#475569}.ll-pwab div{display:flex;gap:8px;justify-content:flex-end}' +
        '.ll-pwab button{border:0;border-radius:10px;padding:9px 14px;font:600 14px system-ui,sans-serif;cursor:pointer}.ll-pwab .go{color:#fff;background:linear-gradient(135deg,#0a5fd6,#11a97a)}.ll-pwab .no{background:#f1f5f9;color:#334155}' +
        '@media(prefers-color-scheme:dark){.ll-pwab{background:#0f1c30;color:#c5d2e6;border-color:#1b2a42}.ll-pwab b{color:#e8f0ff}.ll-pwab p{color:#9fb0c8}.ll-pwab .no{background:#1b2a42;color:#c5d2e6}}';
      document.head.appendChild(s);
    }
    var el = document.createElement('div'); el.className = 'll-pwab'; el.id = id; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    var b = document.createElement('b'); b.textContent = title;
    var p = document.createElement('p'); p.textContent = text;
    var row = document.createElement('div');
    var no = document.createElement('button'); no.className = 'no'; no.type = 'button'; no.textContent = 'Not now';
    no.onclick = function () { el.remove(); if (onClose) onClose(); };
    row.appendChild(no);
    if (actionLabel) {
      var go = document.createElement('button'); go.className = 'go'; go.type = 'button'; go.textContent = actionLabel;
      go.onclick = function () { el.remove(); onAction(); };
      row.appendChild(go);
    }
    el.appendChild(b); el.appendChild(p); el.appendChild(row);
    document.body.appendChild(el);
  }

  /* ---- 2) iPhone in Safari: explain Add to Home Screen ---- */
  if (IOS && !STANDALONE && !QUIET[page] && !hidden(K_IOS, 7)) {
    setTimeout(function () {
      banner('ll-pwa-ios', 'Add LifeLink to your Home Screen', 'Tap the Share button, then Add to Home Screen. This is how you get booking and quote notifications on iPhone.', null, null, function () { set(K_IOS, String(Date.now())); });
    }, 4000);
  }

  /* ---- 3) web push ---- */
  var supported = !!(window.PushManager && 'serviceWorker' in navigator && 'Notification' in window);
  function keyBytes(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function save(sub) {
    var uid = meId(); if (!uid || !sub) return Promise.resolve();
    var j = sub.toJSON(), token = JSON.stringify({ endpoint: j.endpoint, keys: j.keys });
    set(K_TOKEN, token);
    var stamp = uid + ':' + j.endpoint;
    if (get(K_SAVED) === stamp) return Promise.resolve();
    return client().then(function (sb) { return sb.rpc('register_device_token', { p_token: token, p_platform: 'web' }); })
      .then(function (r) { if (r && r.error) throw r.error; set(K_SAVED, stamp); })
      .catch(function (e) { console.warn('[pwa] could not save the notification subscription:', e && e.message); });
  }
  function subscribe() {
    return (swReady || Promise.resolve(null)).then(function (reg) {
      if (!reg) throw new Error('service worker not ready');
      return reg.pushManager.getSubscription().then(function (s) {
        return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.vapidPublicKey) });
      });
    }).then(save);
  }
  function enable() {                       // must be called from a tap (iOS rule)
    if (!supported || !cfg.vapidPublicKey) return Promise.resolve('unsupported');
    return Notification.requestPermission().then(function (p) { return p === 'granted' ? subscribe().then(function () { return p; }) : p; });
  }
  window.LLWebPush = { supported: supported && !!cfg.vapidPublicKey, enable: enable, permission: function () { return supported ? Notification.permission : 'unsupported'; } };

  function offer() {
    if (!supported || !cfg.vapidPublicKey || !swReady) return;
    if (IOS && !STANDALONE) return;         // iPhone only allows push from the Home Screen app
    var perm = Notification.permission;
    if (perm === 'granted') { subscribe(); return; }
    if (perm !== 'default' || QUIET[page] || hidden(K_ASK, 14)) return;
    banner('ll-pwa-push', 'Turn on notifications', 'Get alerts when a provider sends a quote, accepts your booking or is on the way.', 'Turn on',
      function () { enable(); }, function () { set(K_ASK, String(Date.now())); });
  }
  var tries = 0;
  (function wait() {                        // wait for sign-in (LL.me), up to about 40 seconds
    if (meId()) { setTimeout(offer, 2500); return; }
    if (++tries < 40) setTimeout(wait, 1000);
  })();

  /* ---- 4) sign-out: forget this browser's subscription first (never blocks sign-out for more than 3 s) ---- */
  function removeToken() {
    var token = get(K_TOKEN); del(K_SAVED); del(K_TOKEN);
    var work = token ? client().then(function (sb) { return sb.from('device_tokens').delete().eq('token', token); }).catch(function () {}) : Promise.resolve();
    work = work.then(function () {
      return supported && navigator.serviceWorker.getRegistration().then(function (r) { return r && r.pushManager.getSubscription(); }).then(function (s) { return s && s.unsubscribe(); });
    }).catch(function () {});
    return Promise.race([work, new Promise(function (r) { setTimeout(r, 3000); })]);
  }
  (function hook(n) {
    var A = window.LLAuth;
    if (!A || typeof A.signOut !== 'function') { if (n > 0) setTimeout(function () { hook(n - 1); }, 300); return; }
    if (A.signOut.__llWp) return;
    var orig = A.signOut, w = function () { var self = this, a = arguments; return removeToken().then(function () { return orig.apply(self, a); }); };
    w.__llWp = true; A.signOut = w;
  })(20);
})();
