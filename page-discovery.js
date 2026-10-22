/* discovery.html — public provider directory from public_providers (verified providers only).
   Data, filtering and sorting are unchanged; this file only changes how results are presented. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var all = [];
  var NATIVE = !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  var ICON_TOOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 00-5 5L3 18l3 3 6.7-6.7a4 4 0 005-5l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>';
  var ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';

  function photo(p) {
    if (p.avatar_url) return '<div class="pc-ph"><img src="' + LL.esc(p.avatar_url) + '" alt="" loading="lazy" decoding="async"></div>';
    return '<div class="pc-ph" aria-hidden="true">' + LL.esc(LL.initials(p.business_name)) + '</div>';
  }
  function card(p, i) {
    var id = LL.esc(p.provider_id);
    var rating = p.rating_avg != null
      ? '<span class="st">★ ' + Number(p.rating_avg).toFixed(1) + '</span><span>(' + (p.review_count || 0) + ')</span>'
      : '<span>No reviews yet</span>';
    var avail = '<span class="pc-a" style="color:' + (p.available ? 'var(--ll-primary)' : 'var(--ll-text-2)') + '">' + (p.available ? 'Available' : 'Busy') + '</span>';
    return '<article class="pc" style="animation-delay:' + Math.min(i, 8) * 45 + 'ms">' +
      '<a href="provider-profile.html?id=' + id + '" aria-label="View ' + LL.esc(p.business_name) + '">' + photo(p) + '</a>' +
      '<div class="pc-b">' +
        '<div class="pc-n"><a href="provider-profile.html?id=' + id + '">' + LL.esc(p.business_name) + '</a><span class="pc-v">' + ICON_OK + 'Verified</span></div>' +
        '<p class="pc-r">' + rating + (p.service_area ? '<span class="dot">•</span><span>' + LL.esc(p.service_area) + '</span>' : '') + avail + '</p>' +
        '<p class="pc-c">' + ICON_TOOL + LL.esc(p.category || 'Service provider') + '</p>' +
        (p.min_price_kobo != null ? '<p class="pc-p">From ' + LL.naira(p.min_price_kobo) + '</p>' : '<p class="pc-r">' + (p.jobs_done || 0) + ' jobs done</p>') +
        '<a class="pc-btn" href="provider-profile.html?id=' + id + '">Request quote</a>' +
      '</div></article>';
  }

  /* ---------- category chips (built from the real categories; they drive the existing #cat filter) ---------- */
  function buildChips(cats) {
    var box = $('chips');
    box.innerHTML = ['All'].concat(cats).map(function (c) {
      return '<button type="button" class="dc-chip" role="tab" data-c="' + LL.esc(c === 'All' ? '' : c) + '" aria-selected="false">' + LL.esc(c) + '</button>';
    }).join('');
    box.onclick = function (e) {
      var b = e.target.closest('.dc-chip'); if (!b) return;
      $('cat').value = b.getAttribute('data-c'); $('cat').dispatchEvent(new Event('change'));
    };
  }
  function syncChips() {
    var v = $('cat').value, sel = null;
    [].forEach.call($('chips').children, function (b) { var on = b.getAttribute('data-c') === v; b.setAttribute('aria-selected', String(on)); if (on) sel = b; });
    if (sel && sel.scrollIntoView) { try { sel.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) {} }
  }
  function filterCount() {
    var n = ($('area').value ? 1 : 0) + ($('avail').checked ? 1 : 0), b = $('fCount');
    b.textContent = n; b.hidden = !n;
  }

  function draw() {
    var t = $('search').value.trim().toLowerCase(), c = $('cat').value, a = $('area').value, av = $('avail').checked, s = $('sort').value;
    var rows = all.filter(function (p) {
      if (c && p.category !== c) return false;
      if (a && String(p.service_area || '').toLowerCase().indexOf(a.toLowerCase()) < 0) return false;
      if (av && !p.available) return false;
      if (t && (p.business_name + ' ' + (p.category || '') + ' ' + (p.bio || '') + ' ' + (p.skills || []).join(' ') + ' ' + (p.service_area || '')).toLowerCase().indexOf(t) < 0) return false;
      return true;
    });
    rows.sort(function (x, y) {
      if (s === 'price') return (x.min_price_kobo == null ? 1e15 : x.min_price_kobo) - (y.min_price_kobo == null ? 1e15 : y.min_price_kobo);
      if (s === 'jobs') return (y.jobs_done || 0) - (x.jobs_done || 0);
      return (y.rating_avg == null ? -1 : y.rating_avg) - (x.rating_avg == null ? -1 : x.rating_avg);
    });
    $('count').textContent = rows.length + ' provider' + (rows.length === 1 ? '' : 's');
    $('results').innerHTML = rows.length ? rows.map(card).join('') : '<div style="grid-column:1/-1">' + (all.length ? LL.empty('No providers match', 'Try removing a filter.') : LL.empty('No verified providers yet', 'Providers appear here once an administrator has verified them.', 'request.html', 'Post a request anyway')) + '</div>';
    syncChips(); filterCount();
  }

  function sheet(open) { $('fsheet').classList.toggle('open', open); document.body.style.overflow = open ? 'hidden' : ''; }

  function init() {
    $('results').innerHTML = '<div class="pc-sk"></div><div class="pc-sk"></div><div class="pc-sk"></div>';
    Promise.all([LLApi.catalog.providers(), LLApi.catalog.categories()]).then(function (r) {
      all = r[0];
      var cats = LLApi.uniq(all.map(function (p) { return p.category; })).sort();
      $('cat').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return '<option>' + LL.esc(c) + '</option>'; }).join('');
      buildChips(cats);
      var areas = LLApi.uniq(all.map(function (p) { return p.service_area; })).sort();
      $('area').innerHTML = '<option value="">Any area</option>' + areas.map(function (c) { return '<option>' + LL.esc(c) + '</option>'; }).join('');
      var qc = LL.q('category'); if (qc) { var m = r[1].filter(function (c) { return c.slug === qc || c.name.toLowerCase() === qc.toLowerCase(); })[0]; if (m && cats.indexOf(m.name) >= 0) $('cat').value = m.name; }
      var qs = LL.q('q'); if (qs) $('search').value = qs;
      var qa = (LL.q('area') || '').toLowerCase(); if (qa) { areas.forEach(function (x) { if (String(x).toLowerCase().indexOf(qa) >= 0 && !$('area').value) $('area').value = x; }); }
      draw();
    }).catch(function (e) { $('results').innerHTML = '<div style="grid-column:1/-1">' + LL.error(e.message) + '</div>'; });
    ['search', 'cat', 'area', 'avail', 'sort'].forEach(function (id) { $(id).addEventListener(id === 'search' ? 'input' : 'change', draw); });

    /* app-bar and filter sheet controls */
    $('dcBack').onclick = function () { if (history.length > 1) history.back(); else location.href = NATIVE ? 'home.html' : 'index.html'; };
    $('dcFind').onclick = function () { $('search').focus(); try { $('search').scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} };
    $('filtersBtn').onclick = function () { sheet(true); };
    $('fscrim').onclick = function () { sheet(false); };
    $('fDone').onclick = function () { sheet(false); };
    $('fReset').onclick = function () { $('area').value = ''; $('avail').checked = false; $('cat').value = ''; draw(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sheet(false); });
  }
  LL.whenAuth(init);
})();
