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
