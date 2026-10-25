/* home.html: the app's first screen ("find a service"). Read-only: real categories from Supabase, real name and
   unread count for the signed-in user. Search hands off to discovery.html exactly like the website homepage does. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- greeting, bell, provider card (depend on who is signed in) ---------- */
  function who(profile) {
    var hi = $('hi');
    $('signin').hidden = !!profile; $('bell').hidden = !profile;
    if (profile) {
      var first = String(profile.full_name || '').trim().split(/\s+/)[0] || 'there';
      hi.innerHTML = 'Hi,<b></b>'; hi.querySelector('b').textContent = first;
    } else {
      $('bell').hidden = true; $('signin').hidden = false;
    }
    if (profile && (profile.role === 'provider' || profile.role === 'admin')) $('pro').hidden = true;
    if (profile && profile.role === 'customer' && window.LLApi && LLApi.checklist) {
      var paint = function (w) { var m = $('pcMount'); if (m) m.innerHTML = LLApi.checklist.html(LLApi.checklist.customerItems(profile, w), { key: 'cust:' + profile.id }); };
      paint(null);
      LLApi.wallet.me().then(paint, function () {});
    }
  }
  if (window.LL && LL.whenAuth) LL.whenAuth(who); else who(null);

  /* ---------- search ---------- */
  $('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = ($('q').value || '').trim();
    location.href = 'discovery.html' + (q ? '?q=' + encodeURIComponent(q) : '');
  });

  /* ---------- banner carousel (swipe + slow auto-advance) ---------- */
  var track = $('bnTrack'), slides = [].slice.call(track.children), dots = [].slice.call($('bnDots').children), cur = 0, timer = 0, touching = false;
  function show(i) {
    if (i === cur) return; cur = i;
    slides.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
  }
  var raf = 0;
  track.addEventListener('scroll', function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { show(Math.round(track.scrollLeft / track.clientWidth)); }); }, { passive: true });
  function go(i) { track.scrollTo({ left: track.clientWidth * i, behavior: reduce ? 'auto' : 'smooth' }); }
  function tick() { if (touching || document.hidden) return; go((cur + 1) % slides.length); }
  function start() { if (reduce) return; clearInterval(timer); timer = setInterval(tick, 4800); }
  ['touchstart', 'pointerdown', 'mousedown'].forEach(function (ev) { track.addEventListener(ev, function () { touching = true; clearInterval(timer); }, { passive: true }); });
  ['touchend', 'pointerup', 'mouseup', 'touchcancel'].forEach(function (ev) { track.addEventListener(ev, function () { touching = false; start(); }, { passive: true }); });
  start();

  /* ---------- categories (real, from Supabase) ---------- */
  var ICON = {
    'home-services': '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    'repair-maintenance': '<path d="M14.7 6.3a4 4 0 00-5 5L3 18l3 3 6.7-6.7a4 4 0 005-5l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    'beauty-personal-care': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    'cleaning': '<path d="M12 3v4M8 7h8l1 4H7z"/><path d="M7 11l-1 10h12l-1-10"/>',
    'auto-repair': '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>'
  };
  var PHOTO = { 'home-services': 'home-services', 'repair-maintenance': 'repair-maintenance', 'beauty-personal-care': 'beauty-personal-care', 'cleaning': 'cleaning', 'auto-repair': 'auto-repair' };
  function svg(inner) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function href(c) { return 'discovery.html?category=' + encodeURIComponent(c.slug || c.name); }

  function render(cats) {
    // quick row: three favourites if present, else the first three, then "More"
    var want = ['home-services', 'repair-maintenance', 'beauty-personal-care'], pick = [];
    want.forEach(function (s) { cats.forEach(function (c) { if (c.slug === s) pick.push(c); }); });
    cats.forEach(function (c) { if (pick.length < 3 && pick.indexOf(c) < 0) pick.push(c); });
    $('quick').innerHTML = pick.slice(0, 3).map(function (c, i) {
      return '<a href="' + esc(href(c)) + '" style="animation-delay:' + (i * 60) + 'ms"><span>' + svg(ICON[c.slug] || '<circle cx="12" cy="12" r="8"/>') + '</span>' + esc(c.name) + '</a>';
    }).join('') + '<a href="discovery.html" style="animation-delay:180ms"><span>' + svg('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>') + '</span>More</a>';

    $('cats').innerHTML = cats.map(function (c, i) {
      var p = (window.LLApi && LLApi.categoryImage) ? LLApi.categoryImage(c) : (PHOTO[c.slug] ? 'images/services/' + PHOTO[c.slug] + '.jpeg' : null);
      var inner = '<img src="' + esc(p || (window.LLApi && LLApi.categoryPlaceholder) || '') + '" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=window.LLApi?LLApi.categoryPlaceholder:\'\'">';
      return '<a class="hm-cat" href="' + esc(href(c)) + '" style="animation-delay:' + (i * 50) + 'ms"><div class="ph">' + inner + '</div><em>' + esc(c.name) + '</em></a>';
    }).join('');
  }
  function failed() {
    $('cats').innerHTML = '<p class="hm-note">Categories could not load. Check your connection. <a href="home.html">Try again</a></p>';
    $('quick').innerHTML = '<a href="discovery.html"><span>' + svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>') + '</span>Find providers</a>';
  }
  function load() {
    var CK = 'categories', raw = null, hadCache = false;
    try { raw = window.LL && LL.cache ? LL.cache.get(CK) : null; var c0 = raw ? JSON.parse(raw) : null; if (c0 && c0.length) { render(c0); hadCache = true; } } catch (e) { raw = null; }
    if (!window.LLApi || !LLApi.catalog) { if (!hadCache) failed(); return; }
    LLApi.catalog.categories().then(function (cats) {
      if (!cats || !cats.length) { $('cats').innerHTML = '<p class="hm-note">No service categories have been added yet.</p>'; $('quick').innerHTML = ''; try { LL.cache.set(CK, '[]'); } catch (e) {} return; }
      var json = JSON.stringify(cats);
      if (json !== raw) { try { LL.cache.set(CK, json); } catch (e) {} render(cats); }
    }, function () { if (!hadCache) failed(); });
  }
  load();
})();
