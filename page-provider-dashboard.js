/* provider-dashboard.html — provider workspace. Sections via ?section=. */
(function () {
  'use strict';
  var app = document.getElementById('app'), me = null, prov = null, section = LL.q('section') || 'overview';
  var TITLES = { overview: 'Overview', quotes: 'My quotes', bookings: 'Bookings', messages: 'Messages', services: 'My services', reviews: 'Reviews', profile: 'Profile & availability', wallet: 'Wallet' };
  function card(i) { return '<section class="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-3">' + i + '</section>'; }
  var STAT_IC = {
    'Open requests': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"/>',
    'Pending quotes': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z"/>',
    'Active bookings': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m-3 0h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z"/>',
    'Jobs done': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>'
  };
  function stat(l, n, h) { return '<a href="' + h + '" class="pv-stat bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 block"><span class="ic"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24">' + (STAT_IC[l] || '') + '</svg></span><span><b>' + n + '</b><em>' + l + '</em></span></a>'; }
  function reqMap(ids) { return LLApi.provider.requestsByIds(ids).then(function (rows) { var m = {}; rows.forEach(function (r) { m[r.id] = r; }); return m; }).catch(function () { return {}; }); }

  var S = {
    overview: function () {
      return Promise.all([LLApi.provider.requests(), LLApi.provider.myQuotes(), LLApi.provider.bookings(), LLApi.provider.reviews()]).then(function (r) {
        var open = r[0].filter(function (x) { return x.status === 'open' || x.status === 'quoted'; }).length;
        var h = '<section class="pv-hero rounded-3xl bg-emerald-600 text-white"><small>Welcome back</small><h2>' + LL.esc(prov.business_name || 'Your business') + '</h2><div class="pv-hero-row"><span>' + (prov.rating_avg != null ? '★ ' + Number(prov.rating_avg).toFixed(1) : 'No reviews yet') + '</span><span>' + (prov.jobs_done || 0) + ' jobs done</span><span>' + (prov.available ? 'Accepting work' : 'Not accepting work') + '</span></div></section>';
        if (prov.verification_status !== 'verified') h += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 flex flex-wrap justify-between gap-2"><span>Verification status: <strong>' + LL.esc(prov.verification_status) + '</strong>. You can send quotes once verified.</span><a href="provider-verification.html" class="font-extrabold underline">Open verification</a></div>';
        h += '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">' + stat('Open requests', open, 'provider-request.html') + stat('Pending quotes', r[1].filter(function (q) { return q.status === 'pending'; }).length, '?section=quotes') + stat('Active bookings', r[2].filter(function (b) { return ['pending_payment', 'paid', 'in_progress'].indexOf(b.status) >= 0; }).length, '?section=bookings') + stat('Jobs done', prov.jobs_done || 0, '?section=bookings') + '</div>';
        h += card('<div class="flex justify-between items-center"><h2 class="font-extrabold">Your rating</h2><span>' + (prov.rating_avg != null ? LL.stars(prov.rating_avg) : '<span class="text-sm text-slate-400 font-semibold">No reviews yet</span>') + '</span></div><p class="text-sm text-slate-500">' + r[3].length + ' review' + (r[3].length === 1 ? '' : 's') + ' · availability: <strong>' + (prov.available ? 'accepting work' : 'not accepting work') + '</strong></p>');
        return h;
      });
    },
    quotes: function () {
      return LLApi.provider.myQuotes().then(function (qs) {
        return reqMap(qs.map(function (q) { return q.request_id; })).then(function (rm) {
          return qs.length ? '<div class="space-y-3">' + qs.map(function (q) { var x = rm[q.request_id] || {}; return '<a href="provider-request.html?id=' + LL.esc(q.request_id) + '" class="block bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-300"><div class="flex justify-between"><p class="font-extrabold">' + LL.esc(x.category_text || 'Request') + '</p>' + LL.badge(q.status) + '</div><p class="text-lg font-extrabold mt-1">' + LL.naira(q.price_kobo) + '</p><p class="text-xs text-slate-400 font-semibold">' + LL.esc(LL.ago(q.created_at)) + '</p></a>'; }).join('') + '</div>' : LL.empty('No quotes yet', 'Browse open requests and send your first quote.', 'provider-request.html', 'See requests');
        });
      });
    },
    bookings: function () {
      return LLApi.provider.bookings().then(function (bs) {
        return Promise.all([reqMap(bs.map(function (b) { return b.request_id; })), LLApi.names().catch(function () { return {}; })]).then(function (r) {
          if (!bs.length) return LL.empty('No bookings yet', 'Bookings appear when a customer accepts your quote.');
          return '<div class="space-y-3">' + bs.map(function (b) {
            var x = r[0][b.request_id] || {}, c = (r[1][b.customer_id] || {}).display_name || 'Customer';
            var act = '';
            var mk = function (attr, txt, cls) { return '<button data-' + attr + '="' + LL.esc(b.id) + '" class="' + cls + ' font-extrabold text-xs px-4 py-2 rounded-xl">' + txt + '</button>'; };
            if (b.status === 'confirmed') act = mk('way', 'I am on the way', 'bg-emerald-600 text-white') + ' ' + mk('arr', 'I have arrived', 'bg-slate-900 text-white');
            if (b.status === 'provider_on_the_way') act = mk('arr', 'I have arrived', 'bg-emerald-600 text-white');
            if (b.status === 'arrived' && b.fee_status !== 'charged') act = '<span class="text-xs font-semibold text-amber-700">Waiting for the customer to confirm you have arrived</span>';
            if (b.status === 'arrived' && b.fee_status === 'charged') act = mk('start', 'Start job', 'bg-emerald-600 text-white');
            if (b.status === 'in_progress') act = mk('done', 'Mark completed', 'bg-emerald-600 text-white');
            if (['provider_on_the_way', 'arrived'].indexOf(b.status) >= 0) act += ' <a href="tracking.html?id=' + LL.esc(b.id) + '" class="text-xs font-extrabold text-emerald-700 underline">Open map</a>';
            if (['confirmed', 'provider_on_the_way', 'arrived'].indexOf(b.status) >= 0 && b.fee_status !== 'charged') act += ' <button data-cancel="' + LL.esc(b.id) + '" class="text-xs font-extrabold text-rose-600 underline">Cancel booking</button>';
            if (['confirmed', 'provider_on_the_way', 'arrived', 'in_progress', 'completed', 'disputed'].indexOf(b.status) >= 0) act += ' <a href="dispute.html?booking=' + LL.esc(b.id) + '" class="text-xs font-extrabold text-slate-500 underline">Report a problem</a>';
            return card('<div class="flex justify-between items-center"><p class="font-extrabold">' + LL.esc(x.category_text || 'Job') + ' · ' + LL.esc(c) + '</p>' + LL.badge(b.status) + '</div><p class="text-sm text-slate-600">' + LL.esc(x.location_area || '') + '</p><p class="text-sm">' + LL.naira(b.price_kobo) + (b.scheduled_for ? ' · ' + LL.esc(LL.dateTime(b.scheduled_for)) : ' · no time set') + '</p><div class="flex flex-wrap items-center gap-3">' + act + '</div>');
          }).join('') + '</div>';
        });
      });
    },
    messages: function () {
      return Promise.all([LLApi.messages.conversations(), LLApi.names().catch(function () { return {}; })]).then(function (r) {
        var convs = r[0], nm = r[1];
        if (!convs.length) return LL.empty('No conversations yet', 'Message a customer from a request.', 'provider-request.html', 'See requests');
        return LLApi.messages.summaries(convs, me.id).then(function (sum) {
          var sel = LL.q('c') || convs[0].id, cur = convs.filter(function (c) { return c.id === sel; })[0] || convs[0];
          var nameOf = function (c) { return (nm[c.customer_id] || {}).display_name || 'Customer'; };
          setTimeout(function () { var el = document.getElementById('chatMount'); if (el) LLChat.mount(el, cur.id); }, 0);
          return '<div class="grid lg:grid-cols-3 gap-4"><div class="space-y-2">' + convs.map(function (c) { var s = sum[c.id] || {}; return '<a href="?section=messages&c=' + LL.esc(c.id) + '" class="flex items-center gap-3 p-3 rounded-2xl border ' + (c.id === cur.id ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 bg-white') + '">' + LL.avatar(nameOf(c), null, 'w-10 h-10') + '<div class="min-w-0 flex-1"><p class="font-extrabold text-sm truncate">' + LL.esc(nameOf(c)) + '</p><p class="text-xs text-slate-500 truncate">' + LL.esc(s.last ? s.last.body : 'No messages yet') + '</p></div>' + (s.unread ? '<span class="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">' + s.unread + '</span>' : '') + '</a>'; }).join('') + '</div><div class="lg:col-span-2">' + card('<div class="flex justify-between"><h2 class="font-extrabold">' + LL.esc(nameOf(cur)) + '</h2><a class="text-xs font-extrabold text-emerald-700" href="provider-request.html?id=' + LL.esc(cur.request_id) + '">View request</a></div><div id="chatMount"></div>') + '</div></div>';
        });
      });
    },
    services: function () {
      return Promise.all([LLApi.provider.services(), LLApi.catalog.categories()]).then(function (r) {
        var cats = r[1];
        var h = card('<h2 class="font-extrabold">Add a service</h2><form id="sf" class="grid sm:grid-cols-2 gap-3" novalidate><input id="st" maxlength="120" class="field" placeholder="Service title"><input id="sp" inputmode="decimal" class="field" placeholder="Starting price (₦)"><select id="sc" class="field"><option value="">Category (optional)</option>' + cats.map(function (c) { return '<option value="' + LL.esc(c.id) + '">' + LL.esc(c.name) + '</option>'; }).join('') + '</select><input id="sd" maxlength="500" class="field" placeholder="Short description (optional)"><button class="sm:col-span-2 bg-emerald-600 text-white font-extrabold py-3 rounded-2xl">Add service</button></form>');
        h += r[0].length ? '<div class="space-y-3">' + r[0].map(function (s) { return card('<div class="flex justify-between items-start gap-3"><div><p class="font-extrabold">' + LL.esc(s.title) + '</p><p class="text-sm text-slate-500">' + LL.esc(s.description || '') + '</p></div><div class="text-right"><p class="font-extrabold">' + LL.naira(s.base_price_kobo) + '</p>' + (s.active ? '' : LL.badge('withdrawn').replace('Withdrawn', 'Hidden')) + '</div></div><div class="flex gap-3 text-xs font-extrabold"><button data-toggle="' + LL.esc(s.id) + '" data-active="' + s.active + '" class="text-slate-600">' + (s.active ? 'Hide' : 'Show') + '</button><button data-del="' + LL.esc(s.id) + '" class="text-rose-600">Delete</button></div>'); }).join('') + '</div>' : LL.empty('No services listed', 'Add what you offer and your starting price so customers can find you.');
        setTimeout(function () {
          document.getElementById('sf').onsubmit = function (e) {
            e.preventDefault();
            var t = document.getElementById('st').value.trim(), k = LL.toKobo(document.getElementById('sp').value);
            if (t.length < 2) { LL.toast('Enter a service title.', true); return; }
            if (!isFinite(k) || k < 0) { LL.toast('Enter a valid price.', true); return; }
            LLApi.provider.saveService({ title: t, priceKobo: k, categoryId: document.getElementById('sc').value || null, description: document.getElementById('sd').value.trim() }).then(function () { LL.toast('Service added.'); render(); }, function (er) { LL.toast(er.message, true); });
          };
          app.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { LL.confirm({ title: 'Delete this service?', confirmText: 'Delete', danger: true }).then(function (ok) { if (ok) LLApi.provider.deleteService(b.getAttribute('data-del')).then(render, function (er) { LL.toast(er.message, true); }); }); }; });
          app.querySelectorAll('[data-toggle]').forEach(function (b) { b.onclick = function () { var s = r[0].filter(function (x) { return x.id === b.getAttribute('data-toggle'); })[0]; LLApi.provider.saveService({ id: s.id, title: s.title, description: s.description, priceKobo: s.base_price_kobo, categoryId: s.category_id, active: !s.active }).then(render, function (er) { LL.toast(er.message, true); }); }; });
        }, 0);
        return h;
      });
    },
    reviews: function () {
      return LLApi.provider.reviews().then(function (rs) { return rs.length ? '<div class="space-y-3">' + rs.map(function (v) { return card('<div class="flex justify-between"><span class="text-amber-500 font-extrabold">' + '★'.repeat(v.rating) + '</span><span class="text-xs text-slate-400 font-semibold">' + LL.esc(LL.date(v.created_at)) + '</span></div>' + (v.comment ? '<p class="text-sm text-slate-700">' + LL.esc(v.comment) + '</p>' : '') + '<p class="text-xs font-semibold text-slate-500">' + (v.recommend ? 'Recommends you' : 'Does not recommend') + '</p>'); }).join('') + '</div>' : LL.empty('No reviews yet', 'Reviews appear after customers rate completed jobs.'); });
    },
    profile: function () {
      setTimeout(function () {
        document.getElementById('pf').onsubmit = function (e) {
          e.preventDefault();
          var y = document.getElementById('py').value;
          LL.busy(document.getElementById('ps'), 'Saving…', function () {
            return LLApi.provider.update({ business_name: document.getElementById('pn').value.trim(), bio: document.getElementById('pb').value.trim() || null, service_area: document.getElementById('pa').value.trim() || null, years_experience: y === '' ? null : Number(y), available: document.getElementById('pv').checked, skills: document.getElementById('pk').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) });
          }).then(function () { LL.toast('Profile saved.'); }, function (er) { LL.toast(er.message, true); });
        };
        var av = document.getElementById('pav'); if (av) av.onchange = function () { if (av.files[0]) LLApi.uploadAvatar(av.files[0]).then(function () { LL.toast('Photo updated.'); setTimeout(function () { location.reload(); }, 600); }, function (er) { LL.toast(er.message, true); }); };
      }, 0);
      return Promise.resolve(card('<h2 class="font-extrabold">Profile</h2><form id="pf" class="space-y-3" novalidate><div><label class="lbl">Photo (JPG or PNG, up to 2 MB)</label><input id="pav" type="file" accept="image/jpeg,image/png,image/webp" class="text-sm"></div><div><label class="lbl" for="pn">Business name</label><input id="pn" class="field" maxlength="120" value="' + LL.esc(prov.business_name) + '"></div><div><label class="lbl" for="pb">About you</label><textarea id="pb" rows="4" maxlength="1000" class="field resize-none">' + LL.esc(prov.bio || '') + '</textarea></div><div class="grid sm:grid-cols-2 gap-3"><div><label class="lbl" for="pa">Service area</label><input id="pa" class="field" maxlength="160" value="' + LL.esc(prov.service_area || '') + '"></div><div><label class="lbl" for="py">Years of experience</label><input id="py" type="number" min="0" max="80" class="field" value="' + (prov.years_experience == null ? '' : prov.years_experience) + '"></div></div><div><label class="lbl" for="pk">Skills (comma separated)</label><input id="pk" class="field" value="' + LL.esc((prov.skills || []).join(', ')) + '"></div><label class="flex items-center gap-2 text-sm font-bold"><input id="pv" type="checkbox"' + (prov.available ? ' checked' : '') + '> I am currently accepting work</label><button id="ps" class="w-full bg-emerald-600 text-white font-extrabold py-3 rounded-2xl">Save profile</button></form>'));
    },
    wallet: function () { setTimeout(function () { LLWallet.mount(document.getElementById('walletMount'), { role: 'provider' }); }, 0); return Promise.resolve('<div id="walletMount"></div>'); }
  };


  // ---- Live location sharing: runs on every provider section while a booking is on the way / arrived (not yet started). ----
  var shares = {};
  function banner(kind, msg) {
    var el = document.getElementById('llShareBanner');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'llShareBanner'; el.className = 'fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-50 rounded-2xl border px-4 py-3 text-xs font-extrabold shadow-lg'; document.body.appendChild(el); }
    el.className = el.className.replace(/bg-\S+|border-\S+|text-\S+/g, '') + (kind === 'ok' ? ' bg-emerald-50 border-emerald-200 text-emerald-800' : ' bg-amber-50 border-amber-200 text-amber-800');
    el.textContent = msg;
  }
  function syncSharing() {
    return LLApi.provider.bookings().then(function (bs) {
      var want = {};
      bs.forEach(function (b) { if (b.status === 'provider_on_the_way') want[b.id] = true; });
      Object.keys(shares).forEach(function (id) { if (!want[id]) { shares[id].stop(); delete shares[id]; } });
      Object.keys(want).forEach(function (id) { if (!shares[id]) shares[id] = LLMap.share(id, function (k, m) { banner(k, m); }); });
      if (!Object.keys(shares).length) banner('ok', '');
    }).catch(function () {});
  }

  // Booking action buttons on the Bookings section.
  function bindBookingActions() {
    var acts = { way: ['markOnTheWay', 'Customer notified. Keep the app open so your location can be shared.'], start: ['startBooking', 'Job started.'], done: ['completeBooking', 'Job marked completed.'] };
    Object.keys(acts).forEach(function (k) {
      app.querySelectorAll('[data-' + k + ']').forEach(function (b) {
        b.onclick = function () {
          var bid = b.getAttribute('data-' + k);
          LL.busy(b, 'Saving…', function () { return LLApi.provider[acts[k][0]](bid); }).then(function () {
            if (k === 'way') { LL.goWithToast('tracking.html?id=' + encodeURIComponent(bid), 'You are on the way. The customer has been notified.'); return; }
            LL.toast(acts[k][1]); LL.quiet(app, function () { return render(true); });
          }, function (e) { LL.toast(e.message, true); });
        };
      });
    });
    app.querySelectorAll('[data-arr]').forEach(function (b) {
      b.onclick = function () {
        var bid = b.getAttribute('data-arr');
        LL.busy(b, 'Checking GPS…', function () { return LLApi.provider.arrived(bid, false); }).then(function (mode) {
          LL.toast(mode === 'gps' ? 'Arrival verified by GPS. The LifeLink fee has been charged.' : 'The customer has been asked to confirm your arrival.'); LL.quiet(app, function () { return render(true); });
        }, function (e) {
          if (/could not get a recent, accurate GPS/i.test(e.message)) {
            LL.confirm({ title: 'GPS is not working?', body: 'If your phone cannot send a good location, the customer can confirm your arrival instead. If you are outdoors with location allowed, wait a few seconds and try again.', confirmText: 'Ask the customer to confirm' }).then(function (ok) {
              if (!ok) return;
              LL.busy(b, 'Saving…', function () { return LLApi.provider.arrived(bid, true); }).then(function () { LL.toast('The customer has been asked to confirm your arrival.'); LL.quiet(app, function () { return render(true); }); }, function (e2) { LL.toast(e2.message, true); });
            });
          } else LL.toast(e.message, true);
        });
      };
    });
    app.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.onclick = function () {
        LL.confirm({ title: 'Cancel this booking?', body: 'The platform fee reserved from both wallets is returned. The customer will be told.', confirmText: 'Cancel booking', danger: true }).then(function (ok) {
          if (!ok) return;
          LL.busy(b, 'Cancelling…', function () { return LLApi.provider.cancelBooking(b.getAttribute('data-cancel')); }).then(function () { LL.toast('Booking cancelled.'); LL.quiet(app, function () { return render(true); }); }, function (e) { LL.toast(e.message, true); });
        });
      };
    });
  }

  function render(quiet) {
    if (!quiet) app.innerHTML = LL.loading(TITLES[section].toLowerCase());
    return S[section]().then(function (h) { app.innerHTML = h; bindBookingActions(); syncSharing(); }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  }
  LL.ready(function (profile) {
    me = profile;
    if (!S[section]) section = 'overview';
    LL.initSidebar(profile, section);
    LLApi.provider.me().then(function (p) {
      if (!p) { LL.go('provider-onboarding.html'); return; }
      prov = p;
      LL.setHeader(TITLES[section], p.business_name);
      LLApi.messages.unreadTotal(profile.id).then(function (n) { LL.setBadge('navMsgBadge', n); }, function () {});
      render();
      if (section !== 'messages' && section !== 'profile' && section !== 'services' && section !== 'wallet') LL.onLive(function () { LL.quiet(app, function () { return render(true); }); });
      setInterval(syncSharing, 30000);
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  });
})();
