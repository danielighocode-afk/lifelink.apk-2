/* LifeLink app shell (customer: app.html, provider: provider-app.html). Keeps the main tabs alive in frames, so tapping
   a tab just shows the one already loaded: no reload, no waiting, and each tab keeps its place. Other screens slide
   over the current tab. UI only: the pages inside run exactly as before; this file never touches Supabase, payments,
   maps or push. */
(function () {
  'use strict';
  var ROLE = document.body.getAttribute('data-ll-role') === 'provider' ? 'provider' : 'customer';
  var CFG = ROLE === 'provider' ? {
    home: 'pdash', dash: 'pdash', api: 'LLPDash', homeHref: 'provider-dashboard.html',
    files: { 'provider-dashboard.html': 'pdash', 'provider-request.html': 'preq' },
    urls: { pdash: 'provider-dashboard.html', preq: 'provider-request.html' },
    exit: /^(signin|index|welcome|admin|app|provider-app|home|dashboard|profile)\.html$/i,
    warm: [['preq', 900]]
  } : {
    home: 'home', dash: 'dash', api: 'LLDash', homeHref: 'home.html',
    files: { 'home.html': 'home', 'dashboard.html': 'dash', 'profile.html': 'prof' },
    urls: { home: 'home.html', dash: 'dashboard.html?section=bookings', prof: 'profile.html' },
    exit: /^(signin|index|welcome|admin|app|provider-app|provider-[a-z-]+)\.html$/i,
    warm: [['prof', 600], ['dash', 2400]]
  };
  var KEY = CFG.files, host = document.getElementById('llFrames'), frames = {}, active = CFG.home;
  var over = null, depth = 0, popping = false, PB = History.prototype.back;
  // provider sections that live under another tab in the tab bar
  var SEC_TAB = { quotes: 'bookings', wallet: 'profile', services: 'profile', reviews: 'profile' };

  function file(href) { try { var u = new URL(href, location.href); return u.origin === location.origin ? u.pathname.split('/').pop() : ''; } catch (e) { return ''; } }
  function parse(href) {
    var u; try { u = new URL(href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;
    var f = u.pathname.split('/').pop(), key = KEY[f]; if (!key) return null;
    if (key === CFG.dash && (ROLE === 'provider' || f === 'dashboard.html')) {
      var sec = new URLSearchParams(u.search).get('section') || '';
      if (ROLE === 'customer' && (!sec || sec === 'overview')) return { key: 'home', file: 'home.html', search: '' };
      return { key: key, file: f, search: '?section=' + (sec || 'overview'), full: u.search };
    }
    return { key: key, file: f, search: '' };
  }
  function ensure(key, url) {
    var f = frames[key];
    if (!f) {
      f = document.createElement('iframe'); f.className = 'sh-f'; f.name = 'llTab'; f.title = key; f.src = url;
      f.setAttribute('allow', 'geolocation; clipboard-write; camera; microphone');
      f.addEventListener('load', function () { copyTheme(f); });
      host.appendChild(f); frames[key] = f;
    }
    return f;
  }
  function curFile(f) { try { return f.contentWindow.location.pathname.split('/').pop(); } catch (e) { return ''; } }
  function dashSearch() { try { var w = frames[CFG.dash] && frames[CFG.dash].contentWindow; return w ? new URLSearchParams(w.location.search) : null; } catch (e) { return null; } }
  function activate(key) {
    active = key;
    Object.keys(frames).forEach(function (k) { frames[k].classList.toggle('on', k === key); });
    sync();
  }

  /* Other screens (book a service, find providers, tracking, payment, settings...) slide over the current tab.
     The tab underneath is never reloaded, so closing the screen drops you back exactly where you were. */
  function closeOver() {
    if (!over) return false;
    var el = over; over = null; depth = 0; el.classList.remove('on');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    return true;
  }
  function push(href) {
    var u; try { u = new URL(href, location.href); } catch (e) { return false; }
    var f = u.pathname.split('/').pop();
    if (u.origin !== location.origin || !/^[a-z0-9_-]+\.html$/i.test(f) || KEY[f] || CFG.exit.test(f)) return false;
    if (over) { over.src = u.href; return true; }
    var el = document.createElement('iframe'); el.className = 'sh-f sh-over'; el.name = 'llover'; el.title = 'screen';
    el.setAttribute('allow', 'geolocation; clipboard-write; camera; microphone');
    el.addEventListener('load', function () { if (el !== over) return; if (popping) { popping = false; depth = Math.max(1, depth - 1); } else depth++; copyTheme(el); });
    el.src = u.href; host.appendChild(el); over = el; depth = 0;
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('on'); }); });
    return true;
  }
  function popOver() {
    if (over && depth > 1) { popping = true; try { PB.call(over.contentWindow.history); } catch (e) { popping = false; closeOver(); } return true; }
    return closeOver();
  }
  function popFrom(win) {   // called by history.back() inside any frame
    if (over && over.contentWindow === win) return popOver();
    var f = frames[active];
    if (f && f.contentWindow === win) {
      if (curFile(f) && !KEY[curFile(f)]) { try { PB.call(win.history); } catch (e) {} return true; }
      back(); return true;
    }
    try { PB.call(win.history); } catch (e) {}
    return true;
  }
  function show(href) {
    var t = parse(href); if (!t) return false;
    closeOver();
    var f = frames[t.key];
    if (t.key === CFG.dash && t.search) {
      var w = f && f.contentWindow, api = w && w[CFG.api], q = ROLE === 'provider' ? (t.full || '') : t.search;
      if (ROLE === 'provider' && !t.full) q = '?section=overview';
      if (f && api && api.ready) { try { api.go(q); } catch (e) { f.src = t.file + q; } }
      else if (f) f.src = t.file + q;
      else ensure(t.key, t.file + q);
    } else {
      f = ensure(t.key, CFG.urls[t.key]);
      var cf = curFile(f); if (cf && cf !== t.file) f.src = CFG.urls[t.key];   // tapping a tab while deep inside it returns to its first screen
    }
    activate(t.key); return true;
  }
  function sync() {
    var nav = document.querySelector('.ll-tabbar'); if (!nav) return;
    var sp = dashSearch(), ds = '?section=' + ((sp && sp.get('section')) || 'overview');
    if (ROLE === 'provider') { var s2 = ds.slice(9); ds = '?section=' + (SEC_TAB[s2] || s2); }
    [].forEach.call(nav.querySelectorAll('a.ll-tab'), function (a) {
      var t = parse(a.getAttribute('href')), cur = !!t && t.key === active && (t.key !== CFG.dash || t.search === ds);
      if (cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function back() {   // Android back button: close the screen on top, step back inside the tab, return toward Home, else let the app close
    if (over) return popOver();
    var f = frames[active], cf = f ? curFile(f) : '';
    if (cf && !KEY[cf]) { try { PB.call(f.contentWindow.history); return true; } catch (e) {} }
    if (ROLE === 'provider') {
      if (active === 'pdash') {
        var sp = dashSearch(), w = f && f.contentWindow;
        if (sp && w && w.LLPDash && w.LLPDash.ready) {
          if (sp.get('c') || sp.get('cu')) { w.LLPDash.go('?section=messages'); sync(); return true; }
          if ((sp.get('section') || 'overview') !== 'overview') { w.LLPDash.go('?section=overview'); sync(); return true; }
        }
        return false;
      }
      show(CFG.homeHref); return true;
    }
    if (active !== 'home') { show('home.html'); return true; }
    return false;
  }
  function copyTheme(f) {
    try {
      var s = document.documentElement, d = f.contentDocument.documentElement;
      ['data-theme', 'data-theme-pref'].forEach(function (a) { if (s.getAttribute(a)) d.setAttribute(a, s.getAttribute(a)); });
      d.style.colorScheme = s.style.colorScheme;
    } catch (e) {}
  }
  function size() { var n = document.querySelector('.ll-tabbar'); if (n) document.documentElement.style.setProperty('--sh-tab', n.offsetHeight + 'px'); }

  document.addEventListener('click', function (e) {   // tab bar taps switch frames instead of loading a page
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey) return;
    var a = e.target && e.target.closest ? e.target.closest('.ll-tabbar a[href]') : null; if (!a) return;
    if (show(a.getAttribute('href'))) e.preventDefault();
  }, true);
  new MutationObserver(function () { if (document.querySelector('.ll-tabbar')) { size(); sync(); } }).observe(document.body, { childList: true });
  new MutationObserver(function () { Object.keys(frames).forEach(function (k) { copyTheme(frames[k]); }); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-pref'] });
  window.addEventListener('resize', size);

  window.LLShell = {
    show: show, push: push, sync: sync, back: back, popFrom: popFrom,
    isTab: function (u) { return !!parse(u); },
    isExit: function (u) { return CFG.exit.test(file(u) || String(u).split(/[?#]/)[0]); }
  };
  ensure(CFG.home, CFG.urls[CFG.home]); activate(CFG.home);
  // warm the other tabs once Home has settled, so the first tap on them is instant
  frames[CFG.home].addEventListener('load', function () {
    CFG.warm.forEach(function (w) { setTimeout(function () { ensure(w[0], CFG.urls[w[0]]); }, w[1]); });
  });
})();
