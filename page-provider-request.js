/* provider-request.html — provider sees open requests; detail (?id=) to quote, withdraw, decline, message. */
(function () {
  'use strict';
  var app = document.getElementById('app'), chat = null, prov = null;

  /* ---- Requests board (green + blue; one responsive design) ---- */
  var rqData = null, rqFilter = 'all', rqAsc = false, rqQ = '';
  function rqIc(p, s) { s = s || 22; return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var RQ = {
    wrench: rqIc('<path d="M14.7 6.3a4 4 0 005 5L21 12.6 12.6 21a2.1 2.1 0 01-3-3L18 9.6"/><path d="M14.7 6.3l-3-3M3.5 13.5l4 4"/>', 24),
    gear: rqIc('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>', 24),
    tap: rqIc('<path d="M6 8h9a3 3 0 013 3v1M6 8V5h5v3M6 8H3M18 12v3M18 18.5c-.8 0-1.3-.7-1.3-1.4 0-.6.9-1.8 1.3-2.3.4.5 1.3 1.7 1.3 2.3 0 .7-.5 1.4-1.3 1.4z"/>', 24),
    bolt: rqIc('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', 24),
    box: rqIc('<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>', 24),
    car: rqIc('<path d="M5 16V12l2-5h10l2 5v4M3 16h18v3H3zM7 13h.01M17 13h.01"/>', 24),
    pin: rqIc('<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', 15),
    cal: rqIc('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>', 15),
    search: rqIc('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    sort: rqIc('<path d="M4 6h16M7 12h10M10 18h4"/>')
  };
  function rqIcon(c) { c = String(c || ''); return /plumb|pipe|tap|water/i.test(c) ? RQ.tap : /electric|wiring|solar/i.test(c) ? RQ.bolt : /\bac\b|air|cool|hvac|fridge/i.test(c) ? RQ.gear : /deliver|courier|dispatch/i.test(c) ? RQ.box : /auto|car|mechanic|vehicle/i.test(c) ? RQ.car : RQ.wrench; }
  function rqState(x, q) {
    var s = q && q.status;
    if (s === 'accepted') return ['Accepted', 'ok', 'accepted'];
    if (s === 'pending') return ['Quoted', 'act', 'quoted'];
    if (s) return [s === 'withdrawn' ? 'Withdrawn' : s === 'expired' ? 'Expired' : 'Declined', 'bad', 'closed'];
    if (x.status === 'cancelled') return ['Cancelled', 'bad', 'closed'];
    return ['New Request', 'wait', 'new'];
  }
  function drawBoard() {
    var d = rqData, rows = rqAsc ? d.rows.slice().reverse() : d.rows;
    var chips = [['all', 'All'], ['new', 'New'], ['quoted', 'Quoted'], ['accepted', 'Accepted']];
    var h = '<div class="pr-head"><div><h1>Requests</h1><p>Manage incoming and active service requests</p></div><div class="pr-tools"><button type="button" data-rq-search aria-label="Search requests">' + RQ.search + '</button><button type="button" data-rq-sort aria-label="Sort requests">' + RQ.sort + '</button></div></div>';
    h += '<input type="search" class="pr-q" data-rq-q placeholder="Search requests" hidden>';
    if (prov && prov.verification_status !== 'verified') h += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Your account is <strong>' + LL.esc(prov.verification_status) + '</strong>. You can browse requests, but you can only send quotes once you are verified. <a href="provider-verification.html" class="underline font-extrabold">Open verification</a></div>';
    h += '<div class="pr-chips">' + chips.map(function (c) { return '<button type="button" data-rq-f="' + c[0] + '" aria-pressed="' + (rqFilter === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>';
    if (!rows.length) { app.innerHTML = h + LL.empty('No open requests right now', 'New requests appear here as customers post them.'); bindBoard(); return; }
    h += '<div class="pr-list">' + rows.map(function (x) {
      var q = d.mine[x.id], st = rqState(x, q), nm = (d.names[x.customer_id] || {}).display_name || '';
      var when = x.preferred_date ? LL.date(x.preferred_date) + (x.preferred_window ? ' · ' + x.preferred_window : '') : 'Posted ' + LL.ago(x.created_at);
      var srch = (String(x.category_text || '') + ' ' + nm + ' ' + (x.location_area || '') + ' ' + (x.description || '')).toLowerCase();
      return '<a href="provider-request.html?id=' + LL.esc(x.id) + '" class="pr-card" data-g="' + st[2] + '" data-q="' + LL.esc(srch) + '"><span class="pr-i">' + rqIcon(x.category_text) + '</span><div class="pr-m"><div class="pr-top"><div class="pr-tt"><b>' + LL.esc(x.category_text || 'Service request') + '</b><em>' + LL.esc(nm || 'Customer') + '</em></div><span class="pr-pill pr-' + st[1] + '">' + st[0] + '</span></div>' +
        (x.location_area ? '<p class="pr-r">' + RQ.pin + '<span>' + LL.esc(x.location_area) + '</span></p>' : '') +
        (x.description ? '<p class="pr-desc">' + LL.esc(x.description) + '</p>' : '') +
        '<div class="pr-bot"><p class="pr-r">' + RQ.cal + '<span>' + LL.esc(when) + '</span></p>' + (q ? '<strong>' + LL.naira(q.price_kobo) + '</strong>' : '<strong class="pr-cta">Tap to quote</strong>') + '</div>' +
        (x.direct_provider_id ? '<p class="pr-direct">Sent directly to you</p>' : '') + '</div></a>';
    }).join('') + '</div><p class="pv-none" data-rq-empty hidden>No requests in this view.</p>';
    app.innerHTML = h; bindBoard();
  }
  function bindBoard() {
    var cards = app.querySelectorAll('.pr-card'), inp = app.querySelector('[data-rq-q]'), empty = app.querySelector('[data-rq-empty]');
    function apply() {
      var n = 0, q = rqQ.trim().toLowerCase();
      cards.forEach(function (c) { var ok = (rqFilter === 'all' || c.getAttribute('data-g') === rqFilter) && (!q || c.getAttribute('data-q').indexOf(q) >= 0); c.hidden = !ok; if (ok) n++; });
      if (empty) empty.hidden = n > 0;
      app.querySelectorAll('[data-rq-f]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-rq-f') === rqFilter)); });
    }
    app.querySelectorAll('[data-rq-f]').forEach(function (b) { b.onclick = function () { rqFilter = b.getAttribute('data-rq-f'); apply(); }; });
    if (inp) { inp.value = rqQ; inp.hidden = !rqQ; inp.oninput = function () { rqQ = inp.value; apply(); }; }
    var sb = app.querySelector('[data-rq-search]'); if (sb && inp) sb.onclick = function () { inp.hidden = !inp.hidden; if (!inp.hidden) inp.focus(); else { rqQ = ''; inp.value = ''; apply(); } };
    var so = app.querySelector('[data-rq-sort]'); if (so) so.onclick = function () { rqAsc = !rqAsc; LL.toast(rqAsc ? 'Oldest first' : 'Newest first'); drawBoard(); };
    apply();
  }
  function board() {
    var ck = LL.me ? 'prov:req:' + LL.me.id : null, raw = ck ? LL.cache.get(ck) : null;
    function build(r) {
      var mine = {}; r[1].forEach(function (q) { if (!mine[q.request_id] || q.status === 'pending') mine[q.request_id] = q; });
      var rows = r[0].filter(function (x) { return x.status === 'open' || x.status === 'quoted' || mine[x.id]; });
      rqData = { rows: rows, mine: mine, names: r[2] };
      drawBoard();
    }
    var painted = false;
    if (raw) { try { build(JSON.parse(raw)); painted = true; } catch (e) { raw = null; } }
    if (!painted) app.innerHTML = LL.loading('requests');
    Promise.all([LLApi.provider.requests(), LLApi.provider.myQuotes(), LLApi.names().catch(function () { return {}; })]).then(function (r) {
      var json = JSON.stringify(r);
      if (ck) LL.cache.set(ck, json);
      if (json !== raw) build(r);
    }).catch(function (e) { if (!painted) app.innerHTML = LL.error(e.message); });
  }

  function detail(id) {
    app.innerHTML = LL.loading('request');
    Promise.all([LLApi.customer.request(id), LLApi.provider.myQuotes(), LLApi.names().catch(function () { return {}; })]).then(function (r) {
      var x = r[0]; if (!x) { app.innerHTML = LL.empty('Request not available', 'It may have been cancelled, or it is no longer open.', 'provider-request.html', 'Back to requests'); return; }
      var qs = r[1].filter(function (q) { return q.request_id === id; });
      var live = qs.filter(function (q) { return q.status === 'pending' || q.status === 'accepted'; })[0];
      var cname = (r[2][x.customer_id] || {}).display_name;
      var canQuote = prov && prov.verification_status === 'verified' && (x.status === 'open' || x.status === 'quoted') && !live;
      var h = '<a href="provider-request.html" class="text-xs font-extrabold text-emerald-700">&larr; All requests</a>' +
        '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-3"><div class="flex justify-between items-center gap-3"><h1 class="text-xl font-extrabold">' + LL.esc(x.category_text || 'Service request') + '</h1><div class="flex gap-2">' + LL.badge(x.urgency) + LL.badge(x.status) + '</div></div>' +
        '<p class="text-sm text-slate-700 whitespace-pre-wrap">' + LL.esc(x.description) + '</p>' +
        '<p class="text-xs font-semibold text-slate-500">' + LL.esc(x.location_area) + (x.preferred_date ? ' · preferred ' + LL.esc(LL.date(x.preferred_date)) + (x.preferred_window ? ' (' + LL.esc(x.preferred_window) + ')' : '') : '') + ' · ' + LL.esc(LL.ago(x.created_at)) + (cname ? ' · from ' + LL.esc(cname) : '') + '</p><div id="gal" class="flex flex-wrap gap-2"></div></section>';
      if (live) h += '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-2"><div class="flex justify-between"><h2 class="font-extrabold">Your quote</h2>' + LL.badge(live.status) + '</div><p class="text-2xl font-extrabold">' + LL.naira(live.price_kobo) + '</p>' + (live.arrival_text ? '<p class="text-sm text-slate-500">' + LL.esc(live.arrival_text) + '</p>' : '') + (live.message ? '<p class="text-sm text-slate-700">' + LL.esc(live.message) + '</p>' : '') + (live.status === 'pending' ? '<button id="wd" class="text-xs font-extrabold text-rose-600">Withdraw quote</button>' : '') + '</section>';
      else if (canQuote) h += '<form id="qf" class="bg-white border border-slate-200 rounded-3xl p-6 space-y-4" novalidate><h2 class="font-extrabold">Send a quote</h2>' +
        '<div><label class="lbl" for="qp">Your price (₦)</label><input id="qp" inputmode="decimal" class="field" placeholder="e.g. 15000"></div>' +
        '<div><label class="lbl" for="qa">When can you arrive?</label><input id="qa" maxlength="120" class="field" placeholder="e.g. Tomorrow morning"></div>' +
        '<div><label class="lbl" for="qm">Message (optional)</label><textarea id="qm" rows="3" maxlength="1000" class="field resize-none"></textarea></div>' +
        '<button id="qs" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-2xl">Send quote</button></form>';
      else if (!live && prov && prov.verification_status !== 'verified') h += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">You need to be verified before you can quote. <a class="underline" href="provider-verification.html">Check verification status</a>.</div>';
      if (!live) h += '<p class="text-xs font-semibold text-slate-500">A customer can only accept your quote while your LifeLink wallet has at least ₦100 available. That ₦100 is reserved on acceptance and charged only when you arrive and the customer confirms. <a class="underline text-emerald-700" href="provider-dashboard.html?section=wallet">Open wallet</a></p>';
      h += '<div class="flex flex-wrap gap-3"><button id="msg" class="border border-slate-200 hover:bg-slate-50 font-extrabold text-sm px-5 py-2.5 rounded-xl">Message customer</button>' +
        ((x.status === 'open' || x.status === 'quoted') && !live ? '<button id="dec" class="border border-rose-200 text-rose-700 hover:bg-rose-50 font-extrabold text-sm px-5 py-2.5 rounded-xl">Decline request</button>' : '') + '</div>' +
        '<section id="chatBox" class="hidden bg-white border border-slate-200 rounded-3xl p-5"><div id="chatMount"></div></section>';
      app.innerHTML = h;
      if (x.media_paths && x.media_paths.length) LL.signedGallery(document.getElementById('gal'), 'request-media', x.media_paths);
      var qf = document.getElementById('qf');
      if (qf) qf.onsubmit = function (e) {
        e.preventDefault();
        var kobo = LL.toKobo(document.getElementById('qp').value);
        if (!isFinite(kobo) || kobo < 100) { LL.toast('Enter a valid price.', true); return; }
        LL.busy(document.getElementById('qs'), 'Sending…', function () { return LLApi.provider.sendQuote({ requestId: id, priceKobo: kobo, arrival: document.getElementById('qa').value.trim(), message: document.getElementById('qm').value.trim() }); })
          .then(function () { LL.toast('Quote sent.'); detail(id); }, function (er) { LL.toast(er.message, true); });
      };
      var wd = document.getElementById('wd');
      if (wd) wd.onclick = function () { LL.confirm({ title: 'Withdraw this quote?', confirmText: 'Withdraw', danger: true }).then(function (ok) { if (ok) LLApi.provider.withdrawQuote(live.id).then(function () { LL.toast('Quote withdrawn.'); detail(id); }, function (er) { LL.toast(er.message, true); }); }); };
      var dec = document.getElementById('dec');
      if (dec) dec.onclick = function () { LL.confirm({ title: 'Decline this request?', body: 'It will be removed from your list.', confirmText: 'Decline', danger: true }).then(function (ok) { if (ok) LLApi.provider.declineRequest(id).then(function () { LL.toast('Request declined.'); LL.go('provider-request.html'); }, function (er) { LL.toast(er.message, true); }); }); };
      document.getElementById('msg').onclick = function () {
        LLApi.messages.open(id, null).then(function (conv) {
          var cid = conv && conv.id ? conv.id : conv;
          document.getElementById('chatBox').classList.remove('hidden');
          if (chat) chat.destroy(); chat = LLChat.mount(document.getElementById('chatMount'), cid);
        }, function (er) { LL.toast(er.message, true); });
      };
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  }

  LL.ready(function () {
    LLApi.provider.me().then(function (p) { prov = p; }, function () {}).then(function () {
      if (!prov) { app.innerHTML = LL.empty('Finish your provider application', 'You need to apply before you can see requests.', 'provider-onboarding.html', 'Start application'); return; }
      var id = LL.q('id'); if (id) detail(id); else board();
    });
  });
})();
