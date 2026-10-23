/* provider-request.html — provider sees open requests; detail (?id=) to quote, withdraw, decline, message. */
(function () {
  'use strict';
  var app = document.getElementById('app'), chat = null, prov = null;

  function board() {
    app.innerHTML = LL.loading('requests');
    Promise.all([LLApi.provider.requests(), LLApi.provider.myQuotes()]).then(function (r) {
      var mine = {}; r[1].forEach(function (q) { if (!mine[q.request_id] || q.status === 'pending') mine[q.request_id] = q; });
      var rows = r[0].filter(function (x) { return x.status === 'open' || x.status === 'quoted' || mine[x.id]; });
      var grp = function (x) { var q = mine[x.id]; return !q ? 'new' : q.status === 'accepted' ? 'acc' : 'quo'; };
      var cnt = { new: 0, quo: 0, acc: 0 }; rows.forEach(function (x) { cnt[grp(x)]++; });
      var h = '<div class="pv-wrap"><div class="pv-hello"><h2>Requests</h2><p>Jobs customers are asking for near you.</p></div>';
      if (prov && prov.verification_status !== 'verified') h += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Your account is <strong>' + LL.esc(prov.verification_status) + '</strong>. You can browse requests, but you can only send quotes once an administrator verifies you.</div>';
      if (!rows.length) { app.innerHTML = h + '</div>' + LL.empty('No open requests right now', 'New requests appear here as customers post them.'); return; }
      h += '<div class="pv-chips" id="pvReqChips"><button type="button" data-f="all" aria-pressed="true">All <em>' + rows.length + '</em></button><button type="button" data-f="new" aria-pressed="false">New <em>' + cnt.new + '</em></button><button type="button" data-f="quo" aria-pressed="false">Quoted <em>' + cnt.quo + '</em></button><button type="button" data-f="acc" aria-pressed="false">Accepted <em>' + cnt.acc + '</em></button></div>';
      h += rows.map(function (x) {
        var q = mine[x.id], g = grp(x), u = x.urgency === 'emergency' ? ['hi', 'High priority'] : x.urgency === 'soon' ? ['md', 'Medium'] : ['lo', 'Low'];
        var qt = q ? '<span class="pv-tag ' + (q.status === 'accepted' ? 'ok' : 'in') + '" style="margin-left:6px">' + (q.status === 'accepted' ? 'Accepted' : 'Quoted') + '</span>' : '';
        return '<a href="provider-request.html?id=' + LL.esc(x.id) + '" class="pv-card pv-req" data-g="' + g + '"><div class="top"><span class="pv-ic' + (g === 'quo' ? ' b' : '') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 00-5 5L3 18l3 3 6.7-6.7a4 4 0 005-5l-2.5 2.5-2.4-.6-.6-2.4z"/></svg></span><span class="mid"><b>' + LL.esc(x.category_text || 'Service request') + '</b><small>' + LL.esc(x.location_area) + ' · ' + LL.esc(LL.ago(x.created_at)) + (x.direct_provider_id ? ' · sent directly to you' : '') + '</small></span><span><span class="pv-tag ' + u[0] + '">' + u[1] + '</span>' + qt + '</span></div>' +
          '<p>' + LL.esc(x.description) + '</p><div class="pv-btns"><span>View details</span><span class="p">' + (q ? 'Open quote' : 'Send quote') + '</span></div></a>';
      }).join('') + '</div>';
      app.innerHTML = h;
      var ch = document.getElementById('pvReqChips');
      if (ch) ch.onclick = function (e) {
        var bt = e.target.closest('button[data-f]'); if (!bt) return; var f = bt.getAttribute('data-f');
        ch.querySelectorAll('button').forEach(function (z) { z.setAttribute('aria-pressed', z === bt ? 'true' : 'false'); });
        app.querySelectorAll('.pv-req').forEach(function (c) { c.style.display = (f === 'all' || c.getAttribute('data-g') === f) ? '' : 'none'; });
      };
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
      var u = x.urgency === 'emergency' ? ['hi', 'High priority'] : x.urgency === 'soon' ? ['md', 'Medium'] : ['lo', 'Low'];
      var h = '<div class="pv-wrap"><a href="provider-request.html" class="pv-back"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>All requests</a>' +
        '<section class="pv-rhero"><h1>' + LL.esc(x.category_text || 'Service request') + '</h1><div class="meta">' + LL.esc(x.location_area) + ' · ' + LL.esc(LL.ago(x.created_at)) + '</div><div class="tags"><span class="pv-tag ' + u[0] + '">' + u[1] + '</span>' + LL.badge(x.status) + '</div></section>' +
        '<section class="pv-card pv-info"><h3>Job description</h3><p class="desc">' + LL.esc(x.description) + '</p><div class="pv-kv"><div><span>Location</span><b>' + LL.esc(x.location_area) + '</b></div>' +
        (x.preferred_date ? '<div><span>Preferred time</span><b>' + LL.esc(LL.date(x.preferred_date)) + (x.preferred_window ? ' (' + LL.esc(x.preferred_window) + ')' : '') + '</b></div>' : '') +
        (cname ? '<div><span>Customer</span><b>' + LL.esc(cname) + '</b></div>' : '') + '<div><span>Posted</span><b>' + LL.esc(LL.ago(x.created_at)) + '</b></div></div><div id="gal" class="flex flex-wrap gap-2"></div></section>';
      if (live) h += '<section class="pv-card pv-qcard"><div class="flex justify-between items-center"><h2>Your quote</h2>' + LL.badge(live.status) + '</div><div class="big">' + LL.naira(live.price_kobo) + '</div>' + (live.arrival_text ? '<p>Arrival: ' + LL.esc(live.arrival_text) + '</p>' : '') + (live.message ? '<p>' + LL.esc(live.message) + '</p>' : '') + (live.status === 'pending' ? '<button id="wd" class="text-xs font-extrabold text-rose-600" style="justify-self:start;margin-top:4px">Withdraw quote</button>' : '') + '</section>';
      else if (canQuote) h += '<form id="qf" class="pv-card pv-form" novalidate><h2>Send a quote</h2>' +
        '<div><label class="lbl" for="qp">Your price</label><div class="pv-pw"><b>₦</b><input id="qp" inputmode="decimal" class="field" placeholder="e.g. 15000"></div></div>' +
        '<div><label class="lbl" for="qa">When can you arrive?</label><input id="qa" maxlength="120" class="field" placeholder="e.g. Tomorrow morning"></div>' +
        '<div><label class="lbl" for="qm">Message (optional)</label><textarea id="qm" rows="3" maxlength="1000" class="field resize-none"></textarea></div>' +
        '<button id="qs" class="pv-go">Send quote</button></form>';
      else if (!live && prov && prov.verification_status !== 'verified') h += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">You need to be verified before you can quote. <a class="underline" href="provider-verification.html">Check verification status</a>.</div>';
      if (!live) h += '<p class="pv-fee">A customer can only accept your quote while your LifeLink wallet has at least ₦100 available. That ₦100 is reserved on acceptance and charged only when you arrive and the customer confirms. <a href="provider-dashboard.html?section=wallet">Open wallet</a></p>';
      h += '<div class="pv-acts"><button id="msg" type="button">Message customer</button>' +
        ((x.status === 'open' || x.status === 'quoted') && !live ? '<button id="dec" type="button">Decline request</button>' : '') + '</div>' +
        '<section id="chatBox" class="hidden pv-card" style="padding:16px"><div id="chatMount"></div></section></div>';
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
