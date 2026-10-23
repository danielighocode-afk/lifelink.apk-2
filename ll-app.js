/* LifeLink app shell: role-aware bottom tab bar, "More" sheet and theme control.
   UI only. Reads the signed-in role from LL (lifelink.js); never touches Supabase, bookings, maps or wallet code. */
(function () {
  'use strict';
  var page = (document.body && document.body.getAttribute('data-ll-page')) || '';
  var HIDE = { signin: 1, admin: 1, welcome: 1 };
  var cap = window.Capacitor, NATIVE = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  if (NATIVE) document.documentElement.classList.add('ll-native');
  function plug(n) { return NATIVE && cap.Plugins && cap.Plugins[n] ? cap.Plugins[n] : null; }
  if (NATIVE) { try { var ps = document.createElement('script'); ps.src = 'll-push.js'; ps.defer = true; document.head.appendChild(ps); } catch (e) {} }   // push notifications (Android app only)

  /* ---------------- theme ---------------- */
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme(pref) {
    var dark = pref === 'dark' || (pref === 'system' && mq && mq.matches);
    var r = document.documentElement;
    r.setAttribute('data-theme', dark ? 'dark' : 'light'); r.setAttribute('data-theme-pref', pref); r.style.colorScheme = dark ? 'dark' : 'light';
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? '#101A18' : '#F5F8F6';
    document.querySelectorAll('.ll-seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pref') === pref)); });
    var sb = plug('StatusBar'); if (sb) { try { sb.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); sb.setBackgroundColor({ color: dark ? '#101A18' : '#F5F8F6' }); } catch (e) {} }
  }
  function setPref(pref) { try { localStorage.setItem('ll-theme', pref); } catch (e) {} applyTheme(pref); }
  window.LLApp = { setTheme: function (p) { setPref(p); }, getTheme: function () { return getPref(); } };
  function getPref() { return document.documentElement.getAttribute('data-theme-pref') || 'system'; }
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (getPref() === 'system') applyTheme('system'); });

  /* ---------------- icons (one consistent stroke set) ---------------- */
  function ic(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var I = {
    home: ic('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    search: ic('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    jobs: ic('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>'),
    chat: ic('<path d="M21 12c0 4.4-4 8-9 8-1.5 0-2.9-.3-4.2-.9L3 20l1.4-3.7C3.5 15 3 13.6 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/>'),
    more: ic('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    shield: ic('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
    wallet: ic('<path d="M3 8a3 3 0 013-3h12a3 3 0 013 3v9a3 3 0 01-3 3H6a3 3 0 01-3-3z"/><path d="M16 13h2"/><path d="M3 9h18"/>'),
    star: ic('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
    cog: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    tools: ic('<path d="M14.7 6.3a4 4 0 00-5 5L3 18l3 3 6.7-6.7a4 4 0 005-5l-2.5 2.5-2.4-.6-.6-2.4z"/>'),
    quote: ic('<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 13h6M10 17h6"/>'),
    id: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 5.4-1.5 6 0M14 10h4M14 14h4"/>'),
    out: ic('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>'),
    sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: ic('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>')
  };

  /* ---------------- tab sets per role ---------------- */
  function tabsFor(role) {
    if (role === 'customer') return [
      { k: 'home', l: 'Home', i: I.home, h: NATIVE ? 'home.html' : 'dashboard.html', m: function (p, s) { return NATIVE ? (p === 'home.html' || p === 'discovery.html' || p === 'provider-profile.html' || p === 'request.html' || p === 'compare-quotes.html') : (p === 'dashboard.html' && (!s || s === 'overview' || s === 'requests')); } },
      { k: 'bk', l: 'Bookings', i: I.jobs, h: 'dashboard.html?section=bookings', m: function (p, s) { return (p === 'dashboard.html' && s === 'bookings') || p === 'tracking.html' || p === 'booking.html'; } },
      { k: 'wal', l: 'Wallet', i: I.wallet, h: 'dashboard.html?section=wallet', m: function (p, s) { return (p === 'dashboard.html' && s === 'wallet') || p === 'payment.html'; } },
      { k: 'msg', l: 'Messages', i: I.chat, h: 'dashboard.html?section=messages', badge: true, m: function (p, s) { return p === 'dashboard.html' && s === 'messages'; } },
      { k: 'pf', l: 'Profile', i: I.user, h: 'profile.html', m: function (p) { return p === 'profile.html' || p === 'settings.html'; } }
    ];
    if (role === 'provider') return [
      { k: 'home', l: 'Home', i: I.home, h: 'provider-dashboard.html', m: function (p, s) { return p === 'provider-dashboard.html' && !s; } },
      { k: 'req', l: 'Requests', i: I.search, h: 'provider-request.html', m: function (p) { return p === 'provider-request.html'; } },
      { k: 'bk', l: 'Jobs', i: I.jobs, h: 'provider-dashboard.html?section=bookings', m: function (p, s) { return p === 'provider-dashboard.html' && (s === 'bookings' || s === 'quotes'); } },
      { k: 'msg', l: 'Messages', i: I.chat, h: 'provider-dashboard.html?section=messages', badge: true, m: function (p, s) { return p === 'provider-dashboard.html' && s === 'messages'; } },
      { k: 'more', l: 'Profile', i: I.user, h: 'provider-dashboard.html?section=profile', m: function (p, s) { return p === 'settings.html' || (p === 'provider-dashboard.html' && (s === 'wallet' || s === 'profile' || s === 'services' || s === 'reviews')); } }
    ];
    if (role === 'admin') return null;
    return [   // signed out
      { k: 'home', l: 'Home', i: I.home, h: NATIVE ? 'home.html' : 'index.html', m: function (p) { return p === 'index.html' || p === 'home.html' || p === ''; } },
      { k: 'find', l: 'Find', i: I.search, h: 'discovery.html', m: function (p) { return p === 'discovery.html' || p === 'provider-profile.html'; } },
      { k: 'safe', l: 'Safety', i: I.shield, h: 'trust-safety.html', m: function (p) { return p === 'trust-safety.html'; } },
      { k: 'in', l: 'Sign in', i: I.user, h: 'signin.html', m: function () { return false; } }
    ];
  }
  function moreFor(role) {
    if (role === 'customer') return [
      ['Book a service', I.plus, 'request.html'], ['Find providers', I.search, 'discovery.html'],
      ['My requests', I.quote, 'dashboard.html?section=requests'], ['Reviews', I.star, 'dashboard.html?section=reviews'],
      ['Settings', I.cog, 'settings.html'], ['Trust & safety', I.shield, 'trust-safety.html']
    ];
    return [
      ['Wallet', I.wallet, 'provider-dashboard.html?section=wallet'], ['Quotes', I.quote, 'provider-dashboard.html?section=quotes'],
      ['My services', I.tools, 'provider-dashboard.html?section=services'], ['Reviews', I.star, 'provider-dashboard.html?section=reviews'],
      ['Profile', I.user, 'provider-dashboard.html?section=profile'], ['Verification', I.id, 'provider-verification.html'],
      ['Settings', I.cog, 'settings.html'], ['Trust & safety', I.shield, 'trust-safety.html']
    ];
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------- mount ---------------- */
  function themeSeg() {
    return '<h3>Appearance</h3><div class="ll-seg" role="group" aria-label="Theme">' +
      ['light', 'dark', 'system'].map(function (p) { return '<button type="button" data-pref="' + p + '" aria-pressed="' + (getPref() === p) + '">' + p[0].toUpperCase() + p.slice(1) + '</button>'; }).join('') + '</div>';
  }
  function bindSeg(root) { root.querySelectorAll('.ll-seg button').forEach(function (b) { b.onclick = function () { setPref(b.getAttribute('data-pref')); }; }); }

  function mountThemeFab() {
    if (document.querySelector('.ll-theme-fab') || HIDE[page]) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'll-theme-fab'; b.setAttribute('aria-label', 'Switch theme');
    function paint() { b.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? I.sun : I.moon; b.firstChild.setAttribute('width', 20); b.firstChild.setAttribute('height', 20); }
    b.onclick = function () { setPref(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); paint(); };
    new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    paint(); document.body.appendChild(b);
  }

  function mountTabs(profile) {
    if (HIDE[page] || document.querySelector('.ll-tabbar')) return;
    var role = profile ? profile.role : null;
    var tabs = tabsFor(role); if (!tabs) return;
    var file = location.pathname.split('/').pop() || 'index.html';
    var section = new URLSearchParams(location.search).get('section') || '';

    var nav = document.createElement('nav'); nav.className = 'll-tabbar' + (tabs.length === 4 ? ' cols-4' : ''); nav.setAttribute('aria-label', 'Main');
    nav.innerHTML = tabs.map(function (t) {
      var cur = t.m && t.m(file, section);
      if (t.more) return '<button type="button" class="ll-tab" data-more aria-haspopup="dialog"' + (cur ? ' aria-current="page"' : '') + '>' + t.i + '<em style="font-style:normal">' + t.l + '</em></button>';
      if (t.cta) return '<a class="ll-tab ll-tab-cta" href="' + esc(t.h) + '"' + (cur ? ' aria-current="page"' : '') + '><span class="ll-cta">' + t.i + '</span><em>' + t.l + '</em></a>';
      return '<a class="ll-tab" href="' + esc(t.h) + '"' + (cur ? ' aria-current="page"' : '') + '>' + t.i + '<span>' + t.l + '</span>' + (t.badge ? '<b class="ll-badge" data-badge hidden></b>' : '') + '</a>';
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('ll-has-tabbar');

    if (!role) return;
    var wrap = document.createElement('div'); wrap.className = 'll-sheet-wrap';
    var name = (profile.full_name || 'Your account');
    wrap.innerHTML = '<div class="ll-scrim" data-close></div><div class="ll-sheet" role="dialog" aria-modal="true" aria-label="More"><div class="ll-grabber"></div>' +
      '<p style="margin:0 4px 4px;font-weight:800;font-size:17px">' + esc(name) + '</p><p style="margin:0 4px 6px;font-size:12.5px;color:var(--ll-text-2);font-weight:600;text-transform:capitalize">' + esc(role) + ' account</p>' +
      '<div class="ll-sheet-grid">' + moreFor(role).map(function (m) { return '<a class="ll-sheet-link" href="' + esc(m[2]) + '">' + m[1] + '<span>' + esc(m[0]) + '</span></a>'; }).join('') + '</div>' +
      themeSeg() + '<button type="button" class="ll-sheet-link danger" data-signout>' + I.out + '<span>Sign out</span></button></div>';
    document.body.appendChild(wrap);
    bindSeg(wrap);
    var openBtn = nav.querySelector('[data-more]');
    if (!openBtn && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    function close() { wrap.classList.remove('open'); document.removeEventListener('keydown', onKey); if (openBtn) openBtn.focus(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    if (openBtn) openBtn.onclick = function () { wrap.classList.add('open'); document.addEventListener('keydown', onKey); var f = wrap.querySelector('a,button'); if (f) f.focus(); };
    wrap.querySelector('[data-close]').onclick = close;
    wrap.querySelector('[data-signout]').onclick = function () { if (window.LL && LL.signOut) LL.signOut(); };
  }

  /* ---------------- app-style extras (read-only; no business logic) ---------------- */
  function quickActions(role) {
    var pg = (location.pathname.split('/').pop() || ''); if (pg !== 'dashboard.html' && pg !== 'provider-dashboard.html') return;
    var host = document.getElementById('app'); if (!host || !host.parentNode || document.querySelector('.ll-quick')) return;
    var sec = new URLSearchParams(location.search).get('section') || 'overview'; if (sec !== 'overview') return;
    var items = role === 'customer' ? [
      ['Book service', I.plus, 'request.html'], ['Find pros', I.search, 'discovery.html'], ['Bookings', I.jobs, 'dashboard.html?section=bookings'], ['Wallet', I.wallet, 'dashboard.html?section=wallet']
    ] : [
      ['Requests', I.search, 'provider-request.html'], ['Quotes', I.quote, 'provider-dashboard.html?section=quotes'], ['My services', I.tools, 'provider-dashboard.html?section=services'], ['Wallet', I.wallet, 'provider-dashboard.html?section=wallet']
    ];
    var d = document.createElement('nav'); d.className = 'll-quick'; d.setAttribute('aria-label', 'Quick actions');
    d.innerHTML = items.map(function (a, i) { return '<a href="' + esc(a[2]) + '" style="animation-delay:' + (i * 60) + 'ms"><span>' + a[1] + '</span><em>' + esc(a[0]) + '</em></a>'; }).join('');
    host.parentNode.insertBefore(d, host);
  }
  function unreadBadge(profile) {
    var b = document.querySelector('[data-badge]'); if (!b || !window.LLApi || !LLApi.messages || !LLApi.messages.unreadTotal) return;
    function go() { LLApi.messages.unreadTotal(profile.id).then(function (n) { n = Number(n) || 0; b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; }, function () {}); }
    go(); setInterval(go, 60000);
  }
  function nativeGlue(profile) {
    if (!NATIVE) return;
    var file = location.pathname.split('/').pop() || 'index.html';
    // the app's first screen is home.html (find a service). Providers and admins go straight to their own workspace.
    if (profile && file === 'home.html' && (profile.role === 'provider' || profile.role === 'admin') && window.LL && LL.home) { location.replace(LL.home(profile.role)); return; }
    var app = plug('App');
    if (app && app.addListener) {
      var roots = { 'index.html': 1, 'home.html': 1, 'dashboard.html': 1, 'provider-dashboard.html': 1, 'welcome.html': 1, 'admin.html': 1 };
      app.addListener('backButton', function () {
        var sheet = document.querySelector('.ll-sheet-wrap.open');
        if (sheet) { sheet.classList.remove('open'); return; }
        var fs = document.querySelector('.dc-sheet.open'); if (fs) { fs.classList.remove('open'); document.body.style.overflow = ''; return; }
        var atRoot = roots[file] && !new URLSearchParams(location.search).get('section');
        if (!atRoot && history.length > 1) history.back(); else if (app.exitApp) app.exitApp();
      });
    }
    var sp = plug('SplashScreen'); if (sp && sp.hide) { try { sp.hide({ fadeOutDuration: 250 }); } catch (e) {} }
    applyTheme(getPref());
  }

  function init(retries) {
    mountThemeFab();
    if (!window.LL || !LL.whenAuth) { if (retries > 0) return setTimeout(function () { init(retries - 1); }, 150); mountTabs(null); return nativeGlue(null); }
    LL.whenAuth(function (p) { mountTabs(p); if (p) { quickActions(p.role); unreadBadge(p); } nativeGlue(p); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(20); }); else init(20);
})();
