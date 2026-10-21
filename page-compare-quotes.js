/* compare-quotes.html — customer reviews quotes on a request (?request=<id>) or lists their requests. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var state = { req: null, quotes: [], provs: {}, sort: 'price', chat: null };

  function listView() {
    app.innerHTML = LL.loading('your requests');
    LLApi.customer.requests().then(function (rows) {
      if (!rows.length) { app.innerHTML = LL.empty('No requests yet', 'Describe a job and verified providers will send you quotes.', 'request.html', 'Request a service'); return; }
      app.innerHTML = '<div class="space-y-3">' + rows.map(function (r) {
        return '<a href="compare-quotes.html?request=' + LL.esc(r.id) + '" class="block bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 transition">' +
          '<div class="flex items-center justify-between gap-3"><p class="font-extrabold text-slate-900">' + LL.esc(r.category_text || 'Service request') + '</p>' + LL.badge(r.status) + '</div>' +
          '<p class="text-sm text-slate-600 mt-1 line-clamp-2">' + LL.esc(r.description) + '</p>' +
          '<p class="text-xs font-semibold text-slate-400 mt-2">' + LL.esc(r.location_area) + ' · ' + LL.esc(LL.ago(r.created_at)) + '</p></a>';
      }).join('') + '</div>';
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  }

  function sorted() {
    var qs = state.quotes.filter(function (q) { return q.status === 'sent' || q.status === 'pending' || q.status === 'accepted'; });
    var p = function (q) { return state.provs[q.provider_id] || {}; };
    qs.sort(function (a, b) {
      if (state.sort === 'rating') return (p(b).rating_avg || 0) - (p(a).rating_avg || 0);
      if (state.sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      return a.price_kobo - b.price_kobo;
    });
    return qs;
  }

  function render() {
    var r = state.req, open = r.status === 'open' || r.status === 'quoted';
    var qs = sorted();
    var html = '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-3">' +
      '<div class="flex flex-wrap items-center justify-between gap-3"><h1 class="text-xl font-extrabold text-slate-900">' + LL.esc(r.category_text || 'Service request') + '</h1>' + LL.badge(r.status) + '</div>' +
      '<p class="text-sm text-slate-700 whitespace-pre-wrap">' + LL.esc(r.description) + '</p>' +
      '<p class="text-xs font-semibold text-slate-500">' + LL.esc(r.location_area) + ' · ' + LL.esc(LL.cap(r.urgency)) + (r.preferred_date ? ' · preferred ' + LL.esc(LL.date(r.preferred_date)) + (r.preferred_window ? ' (' + LL.esc(r.preferred_window) + ')' : '') : '') + ' · sent ' + LL.esc(LL.ago(r.created_at)) + '</p>' +
      '<div id="gallery" class="flex flex-wrap gap-2"></div>' +
      (open ? '<div><button id="cancelReq" class="text-xs font-extrabold text-rose-600 hover:text-rose-700">Cancel this request</button></div>' : '') +
      '</section>';
    html += '<div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-extrabold text-slate-900">Quotes (' + qs.length + ')</h2>' +
      '<label class="text-xs font-bold text-slate-500">Sort by <select id="sortSel" class="ml-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"><option value="price">Lowest price</option><option value="rating">Highest rated</option><option value="newest">Newest</option></select></label></div>';
    if (!qs.length) {
      html += LL.empty(open ? 'No quotes yet' : 'No active quotes', open ? 'Providers have been notified. You will get a notification when a quote arrives.' : '');
    } else {
      html += '<div class="space-y-3">' + qs.map(function (q) {
        var p = state.provs[q.provider_id] || {};
        var accepted = q.status === 'accepted';
        return '<article class="bg-white border ' + (accepted ? 'border-emerald-400' : 'border-slate-200') + ' rounded-3xl p-5 space-y-3">' +
          '<div class="flex items-start justify-between gap-3"><div class="flex items-center gap-3 min-w-0">' + LL.avatar(p.business_name, p.avatar_url, 'w-12 h-12') +
          '<div class="min-w-0"><a href="provider-profile.html?id=' + LL.esc(q.provider_id) + '" class="font-extrabold text-slate-900 hover:text-emerald-700 truncate block">' + LL.esc(p.business_name || 'Provider') + '</a>' +
          '<p class="text-xs font-semibold text-slate-500">' + (p.rating_avg != null ? LL.stars(p.rating_avg) + ' (' + (p.review_count || 0) + ') · ' : 'No reviews yet · ') + (p.jobs_done || 0) + ' jobs done</p></div></div>' +
          '<div class="text-right shrink-0"><p class="text-xl font-extrabold text-slate-900">' + LL.naira(q.price_kobo) + '</p>' + (q.arrival_text ? '<p class="text-[11px] font-semibold text-slate-500">' + LL.esc(q.arrival_text) + '</p>' : '') + '</div></div>' +
          (q.message ? '<p class="text-sm text-slate-700 bg-slate-50 rounded-2xl p-3 whitespace-pre-wrap">' + LL.esc(q.message) + '</p>' : '') +
          '<div class="flex flex-wrap gap-2">' +
          (open ? '<button data-accept="' + LL.esc(q.id) + '" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-5 py-2.5 rounded-xl">Accept quote</button>' : '') +
          (accepted ? '<span class="text-sm font-extrabold text-emerald-700 py-2.5">Accepted</span>' : '') +
          '<button data-chat="' + LL.esc(q.provider_id) + '" class="border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-sm px-5 py-2.5 rounded-xl">Message</button></div></article>';
      }).join('') + '</div>';
    }
    html += '<section id="chatBox" class="hidden bg-white border border-slate-200 rounded-3xl p-5 space-y-3"><div class="flex justify-between items-center"><h3 id="chatTitle" class="font-extrabold text-slate-900"></h3><button id="chatClose" class="text-xs font-bold text-slate-400 hover:text-slate-700">Close</button></div><div id="chatMount"></div></section>';
    app.innerHTML = html;
    var sel = document.getElementById('sortSel'); sel.value = state.sort; sel.onchange = function () { state.sort = sel.value; render(); };
    if (r.media_paths && r.media_paths.length) LL.signedGallery(document.getElementById('gallery'), 'request-media', r.media_paths);
    var c = document.getElementById('cancelReq');
    if (c) c.onclick = function () {
      LL.confirm({ title: 'Cancel this request?', body: 'Providers will no longer be able to quote on it.', confirmText: 'Cancel request', danger: true }).then(function (ok) {
        if (!ok) return;
        LLApi.customer.cancelRequest(r.id).then(function () { LL.toast('Request cancelled.'); load(); }, function (e) { LL.toast(e.message, true); });
      });
    };
    app.querySelectorAll('[data-accept]').forEach(function (b) {
      b.onclick = function () {
        var q = state.quotes.filter(function (x) { return x.id === b.getAttribute('data-accept'); })[0];
        var p = state.provs[q.provider_id] || {};
        LL.confirm({ title: 'Accept this quote?', body: 'You will book ' + (p.business_name || 'this provider') + ' for ' + LL.naira(q.price_kobo) + ', which you pay to them directly. ₦100 is reserved from your LifeLink wallet (and ₦100 from theirs) and only charged once they arrive and you confirm it. Other quotes on this request will be declined.', confirmText: 'Accept and book' }).then(function (ok) {
          if (!ok) return;
          LL.busy(b, 'Booking…', function () { return LLApi.customer.acceptQuote(q.id); }).then(function (bookingId) {
            var id = bookingId && bookingId.id ? bookingId.id : bookingId;
            LL.toast('Quote accepted.'); setTimeout(function () { LL.go('booking.html?id=' + encodeURIComponent(id)); }, 500);
          }, function (e) {
            LL.toast(e.message, true);
            if (/wallet needs/i.test(e.message)) setTimeout(function () { LL.go('dashboard.html?section=wallet'); }, 1800);
          });
        });
      };
    });
    app.querySelectorAll('[data-chat]').forEach(function (b) {
      b.onclick = function () {
        var pid = b.getAttribute('data-chat'), p = state.provs[pid] || {};
        LLApi.messages.open(r.id, pid).then(function (conv) {
          var id = conv && conv.id ? conv.id : conv;
          document.getElementById('chatBox').classList.remove('hidden');
          document.getElementById('chatTitle').textContent = 'Chat with ' + (p.business_name || 'provider');
          if (state.chat) state.chat.destroy();
          state.chat = LLChat.mount(document.getElementById('chatMount'), id);
          document.getElementById('chatBox').scrollIntoView({ behavior: 'smooth' });
        }, function (e) { LL.toast(e.message, true); });
      };
    });
    var cc = document.getElementById('chatClose'); cc.onclick = function () { if (state.chat) state.chat.destroy(); state.chat = null; document.getElementById('chatBox').classList.add('hidden'); };
  }

  function load(quiet) {
    var id = LL.q('request');
    if (!quiet) app.innerHTML = LL.loading('quotes');
    return Promise.all([LLApi.customer.request(id), LLApi.customer.quotes(id), LLApi.catalog.providers()]).then(function (r) {
      if (!r[0]) { app.innerHTML = LL.empty('Request not found', 'It may have been removed, or it belongs to another account.', 'compare-quotes.html', 'See your requests'); return; }
      state.req = r[0]; state.quotes = r[1];
      state.provs = {}; r[2].forEach(function (p) { state.provs[p.provider_id] = p; });
      render();
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  }

  LL.ready(function () {
    if (LL.q('request')) {
      LL.onLive(function () { var cb = document.getElementById('chatBox'); if (cb && !cb.classList.contains('hidden')) return; LL.quiet(app, function () { return load(true); }); });
      load();
    } else listView();
  });
})();
