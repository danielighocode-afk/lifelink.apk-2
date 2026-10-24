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
  var TICK = '<svg class="pp-tick" viewBox="0 0 24 24" role="img" aria-label="Verified provider"><title>Verified provider</title><circle cx="12" cy="12" r="11" fill="#7C3AED"/><path d="M7.3 12.4l3.3 3.3 6.1-6.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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

  /* ---- Catalogue: work photos (no prices) and, for Business Owners, products with prices ---- */
  var CHAT_FEE = 50;
  function storeLink(u) {
    if (!u) return '';
    var shown = String(u).replace(/^https?:\/\//i, '').replace(/\/$/, ''); if (shown.length > 38) shown = shown.slice(0, 37) + '…';
    return '<a class="ll-slink" href="' + LL.esc(u) + '" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1"/></svg><span>' + LL.esc(shown) + '</span></a>';
  }
  function catalogueHtml(items, p) {
    var biz = p.provider_type === 'service_business';
    if (!items.length) return '';
    var hasProd = items.some(function (x) { return x.kind === 'product'; }), hasWork = items.some(function (x) { return x.kind === 'work'; });
    return '<h2 class="pp-h">Catalogue</h2><div class="pc-wrap">' +
      (hasProd && hasWork ? '<div class="pc-chips"><button type="button" data-pcf="all" aria-pressed="true">All</button><button type="button" data-pcf="work" aria-pressed="false">Work</button><button type="button" data-pcf="product" aria-pressed="false">Products</button></div>' : '') +
      '<div class="pc-grid" id="pcGrid">' + items.map(function (x) { return itemTile(x); }).join('') + '</div>' +
      '</div>';
  }
  function itemTile(x) {
    return '<button type="button" class="pc-it" data-pci="' + LL.esc(x.id) + '" data-pck="' + LL.esc(x.kind) + '"><span class="pc-img"><img src="' + LL.esc(x.image_url) + '" alt="' + LL.esc(x.title) + '" loading="lazy" decoding="async"></span>' +
      '<b>' + LL.esc(x.title) + '</b>' + (x.kind === 'product' && x.price_kobo != null ? '<span class="pc-pr">' + LL.esc(LL.naira(x.price_kobo)) + '</span>' : (x.description ? '<small>' + LL.esc(x.description.length > 40 ? x.description.slice(0, 40) + '…' : x.description) + '</small>' : '')) + '</button>';
  }
  function bindCatalogue(items, p, me) {
    var grid = document.getElementById('pcGrid'); if (!grid) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-pcf]'), function (b) {
      b.onclick = function () {
        var f = b.getAttribute('data-pcf');
        Array.prototype.forEach.call(document.querySelectorAll('[data-pcf]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        Array.prototype.forEach.call(grid.children, function (t) { t.style.display = (f === 'all' || t.getAttribute('data-pck') === f) ? '' : 'none'; });
      };
    });
    grid.onclick = function (e) {
      var t = e.target.closest && e.target.closest('[data-pci]'); if (!t) return;
      var it = items.filter(function (x) { return x.id === t.getAttribute('data-pci'); })[0]; if (it) itemSheet(it, p, me);
    };
  }
  function itemSheet(it, p, me) {
    var isProd = it.kind === 'product', canChat = isProd && (!me || me.role === 'customer');
    var el = document.createElement('div'); el.className = 'pc-ov';
    el.innerHTML = '<div class="pc-sh" role="dialog" aria-modal="true"><img src="' + LL.esc(it.image_url) + '" alt="' + LL.esc(it.title) + '"><h3>' + LL.esc(it.title) + '</h3>' +
      (isProd && it.price_kobo != null ? '<div class="pc-pr">' + LL.esc(LL.naira(it.price_kobo)) + '</div>' : '') +
      (it.description ? '<p>' + LL.esc(it.description) + '</p>' : '') +
      (canChat ? '<button type="button" class="pc-btn" id="pcChat">Chat about this</button><div class="pc-note">₦' + CHAT_FEE + ' from you and ₦' + CHAT_FEE + ' from the seller opens the chat. If they do not reply within 24 hours, your ₦' + CHAT_FEE + ' is returned.</div>' : '') +
      '<button type="button" class="pc-btn" id="pcClose" style="background:transparent;color:inherit;border:1px solid rgba(100,116,139,.35)">Close</button></div>';
    function close() { el.remove(); document.body.style.overflow = ''; }
    el.onclick = function (e) { if (e.target === el) close(); };
    document.body.appendChild(el); document.body.style.overflow = 'hidden';
    document.getElementById('pcClose').onclick = close;
    var cb = document.getElementById('pcChat');
    if (cb) cb.onclick = function () {
      if (!me) { location.href = 'signin.html?next=' + encodeURIComponent('provider-profile.html?id=' + id); return; }
      LL.confirm({ title: 'Start a chat about this product?', body: '₦' + CHAT_FEE + ' will be taken from your wallet and ₦' + CHAT_FEE + ' from the seller. If the seller does not reply within 24 hours, your ₦' + CHAT_FEE + ' is returned. Reopening the same chat later is free.', confirmText: 'Start chat' }).then(function (ok) {
        if (!ok) return;
        LL.busy(cb, 'Opening…', function () { return LLApi.messages.openProduct(it.id); }).then(function (convId) {
          location.href = 'dashboard.html?section=messages&c=' + encodeURIComponent(convId);
        }, function (er) {
          var m = (er && er.message) || 'Could not open the chat.';
          if (/wallet needs at least/i.test(m)) { LL.toast(m, true); setTimeout(function () { location.href = 'dashboard.html?section=wallet'; }, 1600); }
          else LL.toast(m, true);
        });
      });
    };
  }

  LL.whenAuth(function (me) {
    if (!id) { app.innerHTML = LL.empty('No provider selected', '', 'discovery.html', 'Find providers'); return; }
    app.innerHTML = '<div class="pp-hero"></div><div class="pp-sk"></div><div class="pp-sk"></div>';
    Promise.all([LLApi.catalog.provider(id), LLApi.catalog.services(id), LLApi.catalog.reviews(id), LLApi.catalog.items(id).catch(function () { return []; })]).then(function (r) {
      var p = r[0]; if (!p) { app.innerHTML = LL.empty('Provider not found', 'They may not be verified yet.', 'discovery.html', 'Find providers'); return; }
      var items = r[3] || [], services = r[1] || [], reviews = r[2] || [], n = p.review_count != null ? p.review_count : reviews.length;
      var canReq = !me || me.role === 'customer';
      var bookHref = me ? 'request.html?provider=' + encodeURIComponent(id) : 'signin.html?next=' + encodeURIComponent('request.html?provider=' + id);
      document.title = p.business_name + ' - LIFELINK';

      var hero = '<div class="pp-hero">' + (p.banner_url ? '<img src="' + LL.esc(p.banner_url) + '" alt="" decoding="async">' : '') +
        '<div class="pp-top"><button class="pp-ic" id="ppBack" aria-label="Back">' + I_BACK + '</button><button class="pp-ic" id="ppShare" aria-label="Share">' + I_SHARE + '</button></div></div>';

      var rating = p.rating_avg != null
        ? '<button class="pp-rate' + (reviews.length ? '' : ' off') + '" id="ppRate" aria-label="Show reviews"><span class="st">★</span><b>' + Number(p.rating_avg).toFixed(1) + '</b><span>(' + n + ' review' + (n === 1 ? '' : 's') + ')</span></button>'
        : '<span>No reviews yet</span>';
      var tags = [];
      if (p.category) tags.push(p.category);
      (p.skills || []).forEach(function (s) { if (tags.indexOf(s) < 0) tags.push(s); });

      var stats = [];
      if (p.years_experience != null && Number(p.years_experience) > 0) stats.push('<div class="pp-stat"><b>' + LL.esc(p.years_experience) + (p.years_experience === 1 ? ' Year' : ' Years') + '</b><span>Experience</span></div>');
      stats.push('<' + (reviews.length ? 'button id="ppRev" class="pp-stat tap"' : 'div class="pp-stat"') + '><b>' + n + '</b><span>Reviews</span></' + (reviews.length ? 'button' : 'div') + '>');
      stats.push('<div class="pp-stat"><b>' + (p.jobs_done || 0) + '</b><span>Jobs done</span></div>');

      var svc = services.length
        ? '<div class="pp-list">' + services.map(function (s, i) {
            return '<div class="pp-row" style="animation-delay:' + Math.min(i, 8) * 50 + 'ms">' + I_DOT + '<div><b>' + LL.esc(s.title) + '</b>' + (s.description ? '<small>' + LL.esc(s.description) + '</small>' : '') + '</div><em>' + LL.naira(s.base_price_kobo) + '+</em></div>';
          }).join('') + '</div>'
        : '<p class="pp-note">This provider has not listed services yet. Send a request to discuss your job.</p>';

      app.innerHTML = hero + '<div class="pp-card"><div class="pp-pic"><span>' + (p.avatar_url ? '<img src="' + LL.esc(p.avatar_url) + '" alt="' + LL.esc(p.business_name) + '" decoding="async">' : LL.esc(LL.initials(p.business_name))) + '</span></div>' +
        '<div class="pp-nrow"><h1 class="pp-n">' + LL.esc(p.business_name) + '</h1>' + TICK + '</div>' +
        '<div class="pp-meta">' + rating + (p.service_area ? '<span>•</span><span>' + LL.esc(p.service_area) + '</span>' : '') + '<span>•</span><span class="pp-avl' + (p.available ? ' on' : '') + '">' + (p.available ? 'Available' : 'Not taking work') + '</span></div>' +
        (tags.length ? '<div class="pp-tags">' + tags.map(function (t) { return '<span>' + LL.esc(t) + '</span>'; }).join('') + '</div>' : '') +
        (p.bio ? '<h2 class="pp-h">About</h2><p class="pp-about">' + LL.esc(p.bio) + '</p>' : '') + storeLink(p.store_url) +
        '<div class="pp-stats">' + stats.join('') + '</div>' +
        catalogueHtml(items, p) +
        '<h2 class="pp-h">Services &amp; Pricing</h2>' + svc +
        '</div>' + (canReq ? '<div class="pp-ctaw"><a class="pp-cta" href="' + bookHref + '">Book Now</a></div>' : '');

      bindCatalogue(items, p, me);
      document.getElementById('ppBack').onclick = function () { if (history.length > 1) history.back(); else location.href = NATIVE ? 'home.html' : 'discovery.html'; };
      document.getElementById('ppShare').onclick = function () { share(p); };
      var open = function () { openReviews(p, reviews); };
      var a = document.getElementById('ppRate'), b = document.getElementById('ppRev');
      if (a && reviews.length) a.onclick = open; if (b) b.onclick = open;
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  });
})();
