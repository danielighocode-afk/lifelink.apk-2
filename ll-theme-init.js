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
})();

/* Native app (Capacitor APK) only: first launch shows the welcome screens once. Normal browsers are never redirected. */
(function () {
  try {
    var cap = window.Capacitor;
    var native = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
    var file = location.pathname.split('/').pop() || 'index.html';
    var forced = /[?&]welcome=1\b/.test(location.search);
    if ((native || forced) && file === 'index.html' && (forced || !localStorage.getItem('ll-welcomed'))) location.replace('welcome.html');
  } catch (e) {}
})();
