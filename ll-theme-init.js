/* LifeLink theme bootstrap. Loaded synchronously in <head> so the right theme is set before first paint.
   Preference is stored in localStorage under "ll-theme": "light" | "dark" | "system" (default). Cosmetic only. */
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('ll-theme') || 'system'; } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.setAttribute('data-theme-pref', pref);
  root.style.colorScheme = dark ? 'dark' : 'light';
  var m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.content = dark ? '#101A18' : '#F5F8F6';
  try { var fs = localStorage.getItem('ll-font'); if (fs === 'small') root.style.fontSize = '93.75%'; else if (fs === 'large') root.style.fontSize = '112.5%'; } catch (e) {}
})();

/* Native app (Capacitor APK) only: first launch shows the welcome screens once, then the app opens on home.html (find a service). Normal browsers are never redirected. */
(function () {
  try {
    var cap = window.Capacitor;
    var native = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
    var file = location.pathname.split('/').pop() || 'index.html';
    var forced = /[?&]welcome=1\b/.test(location.search);
    if ((native || forced) && file === 'index.html') location.replace(forced || !localStorage.getItem('ll-welcomed') ? 'welcome.html' : 'home.html');
  } catch (e) {}
})();

/* ---- Phones and the app: never draw the old customer dashboard, and never draw the customer Home for a provider.
   Uses the role remembered on this device and redirects before the first paint (this script runs in <head>), so nothing old can flash. ---- */
(function () {
  try {
    var cap = window.Capacitor, mm = window.matchMedia;
    var appLike = !!((cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) || navigator.standalone ||
      (mm && (mm('(display-mode: standalone)').matches || mm('(max-width: 820px) and (pointer: coarse)').matches)));
    if (!appLike) return;
    var role = null, c = JSON.parse(localStorage.getItem('ll-profile-cache-v1') || 'null');
    if (c && c.profile && c.profile.id) role = c.profile.role;
    if (!role) return;
    var file = location.pathname.split('/').pop() || 'index.html', sec = (location.search.match(/[?&]section=([^&]*)/) || [])[1];
    if (file === 'dashboard.html' && role === 'customer' && (!sec || sec === 'overview')) location.replace('home.html');
    else if (file === 'home.html' && role === 'provider') location.replace('provider-dashboard.html');
    else if (file === 'home.html' && role === 'admin') location.replace('admin.html');
  } catch (e) {}
})();

/* ---- Opening animation (app + installed web app) and the "no old layout flash" cover.
   splash: a fresh open from the icon shows the LifeLink gradient + logo, holds until the page is ready, then opens as a circle from the centre.
   cover : on dashboard pages (phones/app), a plain page-coloured cover hides the static shell until the first render has drawn.
   Pages call window.llReady() once their first real content is drawn. Other pages become ready on load. Desktop browsers are untouched. ---- */
(function () {
  try {
    var de = document.documentElement, cap = window.Capacitor, mm = window.matchMedia;
    var native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
    var standalone = !!(navigator.standalone || (mm && mm('(display-mode: standalone)').matches));
    var appLike = native || standalone || !!(mm && mm('(max-width: 820px) and (pointer: coarse)').matches);
    if (!appLike) { window.llReady = function () {}; return; }
    var file = location.pathname.split('/').pop() || 'index.html';
    var HOLD = file === 'dashboard.html' || file === 'provider-dashboard.html';
    var booted = false, t0 = 0, seen = false;
    try { booted = !!sessionStorage.getItem('ll-booted'); t0 = +sessionStorage.getItem('ll-boot-t') || 0; seen = !!sessionStorage.getItem('ll-splash-seen'); } catch (e) {}
    var splash = (native || standalone) && !booted && !/[?&]nosplash=1\b/.test(location.search);
    if (!splash && !HOLD) { window.llReady = function () {}; return; }
    var now = Date.now();
    if (splash && !t0) { t0 = now; try { sessionStorage.setItem('ll-boot-t', String(t0)); } catch (e) {} }
    var dark = de.getAttribute('data-theme') === 'dark';
    var css = '@property --llr{syntax:"<length>";inherits:false;initial-value:0px}' +
      'html.ll-boot::before{content:"";position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483640;pointer-events:none;background:linear-gradient(155deg,#0f5aa8 0%,#0b8a72 55%,#18b785 100%)}' +
      'html.ll-boot::after{content:"";position:fixed;left:50%;top:50%;width:min(46vw,300px);aspect-ratio:904/828;margin:calc(min(46vw,300px)*-.458) 0 0 calc(min(46vw,300px)*-.5);z-index:2147483641;pointer-events:none;background:url(images/lifelink-logo-white.png) center/contain no-repeat;animation:llLogoIn .6s cubic-bezier(.2,.8,.2,1) both}' +
      'html.ll-boot.ll-still::after{animation:none}' +
      'html.ll-boot.ll-reveal::before,html.ll-boot.ll-reveal::after{-webkit-mask-image:radial-gradient(circle at 50% 50%,transparent var(--llr),#000 calc(var(--llr) + 2px));mask-image:radial-gradient(circle at 50% 50%,transparent var(--llr),#000 calc(var(--llr) + 2px));animation:llOpen .62s cubic-bezier(.5,0,.2,1) forwards}' +
      'html.ll-boot.ll-fade::before,html.ll-boot.ll-fade::after{animation:llFade .35s ease forwards}' +
      'html.ll-cover::before{content:"";position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483640;pointer-events:none;background:' + (dark ? '#101A18' : '#F5F8F6') + '}' +
      'html.ll-cover.ll-uncover::before{animation:llFade .22s ease forwards}' +
      'html.ll-boot::view-transition-old(root),html.ll-boot::view-transition-new(root){animation:none}' +
      '@keyframes llLogoIn{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}' +
      '@keyframes llOpen{from{--llr:0px}to{--llr:150vmax}}' +
      '@keyframes llFade{to{opacity:0}}' +
      '@media (prefers-reduced-motion:reduce){html.ll-boot::after{animation:none}}';
    var st = document.createElement('style'); st.id = 'll-boot-css'; st.textContent = css; (document.head || de).appendChild(st);
    de.classList.add(splash ? 'll-boot' : 'll-cover');
    if (splash && seen) de.classList.add('ll-still');
    if (splash) { try { sessionStorage.setItem('ll-splash-seen', '1'); } catch (e) {} }
    // The status bar matches the gradient while the splash is up.
    function bar(on) {
      try {
        var sb = cap && cap.Plugins && cap.Plugins.StatusBar; if (!sb) return;
        if (on) { sb.setBackgroundColor({ color: '#0f5aa8' }); sb.setStyle({ style: 'DARK' }); }
        else if (window.LLApp && LLApp.setTheme && LLApp.getTheme) LLApp.setTheme(LLApp.getTheme());
      } catch (e) {}
    }
    if (splash && native) bar(true);
    var ready = false, done = false, minAt = splash ? t0 + 1000 : 0, maxAt = (splash ? t0 : now) + (splash ? 4500 : 2500);
    function finish() {
      if (done) return; done = true;
      var canReveal = !!(window.CSS && CSS.supports && CSS.supports('mask-image', 'radial-gradient(circle at 50% 50%,transparent 0,#000 2px)')) &&
        !!(window.CSS && CSS.registerProperty) && !(mm && mm('(prefers-reduced-motion: reduce)').matches);
      if (splash) {
        try { sessionStorage.setItem('ll-booted', '1'); } catch (e) {}
        de.classList.add(canReveal ? 'll-reveal' : 'll-fade'); bar(false);
        setTimeout(function () { de.classList.remove('ll-boot', 'll-reveal', 'll-fade', 'll-still'); if (st.parentNode) st.parentNode.removeChild(st); }, 750);
      } else {
        de.classList.add('ll-uncover');
        setTimeout(function () { de.classList.remove('ll-cover', 'll-uncover'); if (st.parentNode) st.parentNode.removeChild(st); }, 300);
      }
    }
    function check() {
      if (done) return;
      var t = Date.now();
      if (t >= maxAt || (ready && t >= minAt)) finish(); else setTimeout(check, Math.max(30, Math.min(120, (ready ? minAt : maxAt) - t)));
    }
    window.llReady = function () { if (ready) return; ready = true; check(); };
    setTimeout(check, 60);
    if (!HOLD) window.addEventListener('load', function () { setTimeout(window.llReady, 150); });
  } catch (e) { window.llReady = window.llReady || function () {}; }
})();

/* ---- page slide direction (used by the view-transition CSS in ll-app.css). Must run in <head>, before first paint. ---- */
(function () {
  var de = document.documentElement, KEY = 'll-nav-dir';
  function store(v) { try { sessionStorage.setItem(KEY, v); } catch (e) {} }
  function read() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  // Tapping a bottom tab: slide left or right depending on whether the tab is before or after the current one.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('.ll-tabbar a.ll-tab') : null;
    if (!a) return;
    var tabs = [].slice.call(document.querySelectorAll('.ll-tabbar .ll-tab')), cur = -1;
    tabs.forEach(function (t, i) { if (t.getAttribute('aria-current') === 'page') cur = i; });
    var idx = tabs.indexOf(a);
    store(cur >= 0 && idx >= 0 && idx < cur ? 'tab-back' : 'fwd');
  }, true);
  window.addEventListener('pageswap', function (e) {
    try {
      if (!e.viewTransition) return;
      var dir = read(), act = e.activation;
      if (!dir && act && act.navigationType === 'traverse' && act.entry && act.from) dir = act.entry.index < act.from.index ? 'back' : 'fwd';
      dir = dir || 'fwd';
      store(dir); de.setAttribute('data-ll-nav', dir);
    } catch (err) {}
  });
  window.addEventListener('pagereveal', function (e) {
    try {
      if (!e.viewTransition) return;
      var dir = read() || 'fwd';
      de.setAttribute('data-ll-nav', dir);
      e.viewTransition.finished.then(function () { try { sessionStorage.removeItem(KEY); } catch (x) {} de.removeAttribute('data-ll-nav'); }, function () { try { sessionStorage.removeItem(KEY); } catch (x) {} });
    } catch (err) {}
  });
})();
