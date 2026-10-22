/* provider-profile.html (?id=) — public provider detail: photo, about, key numbers, services and pricing, reviews (in a sheet).
   Data calls are unchanged (LLApi.catalog.provider / services / reviews). "Book Now" goes to the existing request form. */
(function () {
  'use strict';
  var app = document.getElementById('app'), id = LL.q('id');
  var NATIVE = !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  var I_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  var I_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>';
  var I_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  var I_DOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>';
  var sheetEl = null;

  function closeSheet() { if (sheetEl) { sheetEl.classList.remove('open'); document.body.style.overflow = ''; } }
  function openReviews(p, list) {
    if (!list.length) return;
    if (!sheetEl) {
      sheetEl = document.createElement('div'); sheetEl.className = 'pp-sheet dc-sheet'; sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-label', 'Reviews');
      document.body.appendChild(sheetEl);
    }
    sheetEl.innerHTML = '<div class="pp-scrim"></div><div class="pp-panel"><div class="pp-grab"></div>' +
      '<h2 class="pp-h" style="margin-top:4px">Reviews</h2>' +
      '<p class="pp-note" style="margin-bottom:6px">' + (p.rating_avg != null ? '<span style="color:#f5a30a">★</span> <b>' + Number(p.rating_avg).toFixed(1) + '</b> · ' : '') + list.length + ' review' + (list.length === 1 ? '' : 's') + '</p>' +
      list.map(function (v) {
        return '<div class="pp-rv"><div class="t"><i>' + '★'.repeat(Math.max(0, Math.min(5, v.rating || 0))) + '</i><span>' + LL.esc(LL.date(v.created_on)) + '</span></div>' + (v.comment ? '<p>' + LL.esc(v.comment) + '</p>' : '') + '</div>';
      }).join('') + '</div>';
    sheetEl.querySelector('.pp-scrim').onclick = closeSheet;
    sheetEl.classList.add('open'); document.body.style.overflow = 'hidden';
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  function share(p) {
    var data = { title: p.business_name, text: p.business_name + ' on LifeLink' };
    if (!NATIVE) data.url = location.href;
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    try { navigator.clipboard.writeText(data.url || data.text).then(function () { LL.toast ? LL.toast('Link copied') : 0; }); } catch (e) {}
  }

  LL.whenAuth(function (me) {
    if (!id) { app.innerHTML = LL.empty('No provider selected', '', 'discovery.html', 'Find providers'); return; }
    app.innerHTML = '<div class="pp-hero"></div><div class="pp-sk"></div><div class="pp-sk"></div>';
    Promise.all([LLApi.catalog.provider(id), LLApi.catalog.services(id), LLApi.catalog.reviews(id)]).then(function (r) {
      var p = r[0]; if (!p) { app.innerHTML = LL.empty('Provider not found', 'They may not be verified yet.', 'discovery.html', 'Find providers'); return; }
      var services = r[1] || [], reviews = r[2] || [], n = p.review_count != null ? p.review_count : reviews.length;
      var canReq = !me || me.role === 'customer';
      var bookHref = me ? 'request.html?provider=' + encodeURIComponent(id) : 'signin.html?next=' + encodeURIComponent('request.html?provider=' + id);
      document.title = p.business_name + ' - LIFELINK';

      var hero = '<div class="pp-hero">' + (p.avatar_url ? '<img src="' + LL.esc(p.avatar_url) + '" alt="' + LL.esc(p.business_name) + '" decoding="async">' : '<div class="ini" aria-hidden="true">' + LL.esc(LL.initials(p.business_name)) + '</div>') +
        '<div class="pp-top"><button class="pp-ic" id="ppBack" aria-label="Back">' + I_BACK + '</button><button class="pp-ic" id="ppShare" aria-label="Share">' + I_SHARE + '</button></div></div>';

      var rating = p.rating_avg != null
        ? '<button class="pp-rate' + (reviews.length ? '' : ' off') + '" id="ppRate" aria-label="Show reviews"><span class="st">★</span><b>' + Number(p.rating_avg).toFixed(1) + '</b><span>(' + n + ' review' + (n === 1 ? '' : 's') + ')</span></button>'
        : '<span>No reviews yet</span>';
      var tags = [];
      if (p.category) tags.push(p.category);
      (p.skills || []).forEach(function (s) { if (tags.indexOf(s) < 0) tags.push(s); });

      var stats = [];
      if (p.years_experience != null) stats.push('<div class="pp-stat"><b>' + LL.esc(p.years_experience) + (p.years_experience === 1 ? ' Year' : ' Years') + '</b><span>Experience</span></div>');
      stats.push('<' + (reviews.length ? 'button id="ppRev" class="pp-stat tap"' : 'div class="pp-stat"') + '><b>' + n + '</b><span>Reviews</span></' + (reviews.length ? 'button' : 'div') + '>');
      stats.push('<div class="pp-stat"><b>' + (p.jobs_done || 0) + '</b><span>Jobs done</span></div>');

      var svc = services.length
        ? '<div class="pp-list">' + services.map(function (s, i) {
            return '<div class="pp-row" style="animation-delay:' + Math.min(i, 8) * 50 + 'ms">' + I_DOT + '<div><b>' + LL.esc(s.title) + '</b>' + (s.description ? '<small>' + LL.esc(s.description) + '</small>' : '') + '</div><em>' + LL.naira(s.base_price_kobo) + '+</em></div>';
          }).join('') + '</div>'
        : '<p class="pp-note">This provider has not listed services yet. Send a request to discuss your job.</p>';

      app.innerHTML = hero + '<div class="pp-card"><span class="pp-vf">' + I_OK + 'Verified Provider</span>' +
        '<h1 class="pp-n">' + LL.esc(p.business_name) + '</h1>' +
        '<div class="pp-meta">' + rating + (p.service_area ? '<span>•</span><span>' + LL.esc(p.service_area) + '</span>' : '') + '<span>•</span><span class="pp-av' + (p.available ? ' on' : '') + '">' + (p.available ? 'Available' : 'Not taking work') + '</span></div>' +
        (tags.length ? '<div class="pp-tags">' + tags.map(function (t) { return '<span>' + LL.esc(t) + '</span>'; }).join('') + '</div>' : '') +
        (p.bio ? '<h2 class="pp-h">About</h2><p class="pp-about">' + LL.esc(p.bio) + '</p>' : '') +
        '<div class="pp-stats">' + stats.join('') + '</div>' +
        '<h2 class="pp-h">Services &amp; Pricing</h2>' + svc +
        '</div>' + (canReq ? '<div class="pp-ctaw"><a class="pp-cta" href="' + bookHref + '">Book Now</a></div>' : '');

      document.getElementById('ppBack').onclick = function () { if (history.length > 1) history.back(); else location.href = NATIVE ? 'home.html' : 'discovery.html'; };
      document.getElementById('ppShare').onclick = function () { share(p); };
      var open = function () { openReviews(p, reviews); };
      var a = document.getElementById('ppRate'), b = document.getElementById('ppRev');
      if (a && reviews.length) a.onclick = open; if (b) b.onclick = open;
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  });
})();
