/* provider-request.html — provider sees open requests; detail (?id=) to quote, withdraw, decline, message. */
(function () {
  'use strict';
  var app = document.getElementById('app'), chat = null, prov = null;

  function board() {
    app.innerHTML = LL.loading('requests');
    Promise.all([LLApi.provider.requests(), LLApi.provider.myQuotes()]).then(function (r) {
      var mine = {}; r[1].forEach(function (q) { if (!mine[q.request_id] || q.status === 'pending') mine[q.request_id] = q; });
      var rows = r[0].filter(function (x) { return x.status === 'open' || x.status === 'quoted' || mine[x.id]; });
      var h = '<h1 class="text-xl font-extrabold text-slate-900">Requests</h1>';
      if (prov && prov.verification_status !== 'verified') h += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Your account is <strong>' + LL.esc(prov.verification_status) + '</strong>. You can browse requests, but you can only send quotes once an administrator verifies you.</div>';
      if (!rows.length) { app.innerHTML = h + LL.empty('No open requests right now', 'New requests appear here as customers post them.'); return; }
      app.innerHTML = h + '<div class="space-y-3">' + rows.map(function (x) {
        var q = mine[x.id];
        return '<a href="provider-request.html?id=' + LL.esc(x.id) + '" class="block bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 transition"><div class="flex justify-between items-center gap-3"><p class="font-extrabold text-slate-900">' + LL.esc(x.category_text || 'Service request') + '</p><div class="flex gap-2">' + LL.badge(x.urgency) + (q ? LL.badge(q.status === 'pending' ? 'quoted' : q.status) : '') + '</div></div>' +
          '<p class="text-sm text-slate-600 mt-1 line-clamp-2">' + LL.esc(x.description) + '</p><p class="text-xs font-semibold text-slate-400 mt-2">' + LL.esc(x.location_area) + ' · ' + LL.esc(LL.ago(x.created_at)) + (x.direct_provider_id ? ' · sent directly to you' : '') + '</p></a>';
      }).join('') + '</div>';
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
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
