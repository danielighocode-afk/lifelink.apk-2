/* provider-dashboard.html — provider workspace. Sections via ?section=. */
(function () {
  'use strict';
  var app = document.getElementById('app'), me = null, prov = null, section = LL.q('section') || 'overview';
  var TITLES = { overview: 'Overview', quotes: 'My quotes', bookings: 'Bookings', messages: 'Messages', services: 'My services', reviews: 'Reviews', profile: 'Profile & availability', wallet: 'Wallet' };
  function card(i) { return '<section class="pv-card" style="padding:16px;display:grid;gap:10px">' + i + '</section>'; }
  function stat(l, n, h) { return '<a href="' + h + '" class="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 block"><p class="text-3xl font-extrabold">' + n + '</p><p class="text-xs font-extrabold uppercase tracking-wider text-slate-400 mt-1">' + l + '</p></a>'; }
  function reqMap(ids) { return LLApi.provider.requestsByIds(ids).then(function (rows) { var m = {}; rows.forEach(function (r) { m[r.id] = r; }); return m; }).catch(function () { return {}; }); }

  var S = {
    overview: function () {
      return Promise.all([LLApi.provider.requests(), LLApi.provider.myQuotes(), LLApi.provider.bookings(), LLApi.provider.reviews(), LLApi.provider.services().catch(function () { return null; })]).then(function (r) {
        var open = r[0].filter(function (x) { return x.status === 'open' || x.status === 'quoted'; });
        var active = r[2].filter(function (b) { return ['pending_payment', 'paid', 'confirmed', 'provider_on_the_way', 'arrived', 'in_progress'].indexOf(b.status) >= 0; }).length;
        var done = r[2].filter(function (b) { return b.status === 'completed' && b.completed_at; });
        var day = function (d) { var x = new Date(d); return x.getFullYear() * 400 + x.getMonth() * 32 + x.getDate(); }, t0 = new Date(), y0 = new Date(Date.now() - 864e5);
        var sum = function (k) { return done.filter(function (b) { return day(b.completed_at) === day(k); }).reduce(function (n, b) { return n + (b.price_kobo || 0); }, 0); };
        var today = sum(t0), yday = sum(y0), pct = yday > 0 ? Math.round((today - yday) / yday * 100) : null;
        var hr = t0.getHours(), hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
        var first = ((me && me.full_name) || prov.business_name || 'there').split(' ')[0];
        var rating = prov.rating_avg != null ? Number(prov.rating_avg).toFixed(1) : '–';
        var ver = prov.verification_status === 'verified';
        var ic = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
        var tile = function (cls, icon, label, n, href) { return '<a class="pv-card pv-stat ' + cls + '" href="' + href + '"><i>' + icon + '</i><b>' + n + '</b><span>' + label + '</span></a>'; };
        var h = '<div class="pv-wrap">';
        h += '<div class="pv-hello"><h2>' + hello + ', ' + LL.esc(first) + ' 👋</h2><p>Here’s what’s happening with your services today.</p></div>';
        if (!ver) h += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 flex flex-wrap justify-between gap-2"><span>Verification status: <strong>' + LL.esc(prov.verification_status) + '</strong>. You can send quotes once verified.</span><a href="provider-verification.html" class="font-extrabold underline">Open verification</a></div>';
        h += '<a class="pv-card pv-id" href="provider-account.html"><span class="pv-av">' + (me && me.avatar_url ? '<img src="' + LL.esc(me.avatar_url) + '" alt="">' : LL.esc(LL.initials(prov.business_name || (me && me.full_name) || 'P'))) + '</span><span class="mid">' +
          (ver ? '<span class="pv-chip-ok">' + ic('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>') + 'Verified provider</span>' : '<span class="pv-chip-warn">Not verified yet</span>') +
          '<b>' + LL.esc(prov.business_name || 'Your business') + '</b><small>★ ' + rating + ' (' + r[3].length + ' review' + (r[3].length === 1 ? '' : 's') + ') · ' + LL.esc(prov.category || 'Provider') + (prov.years_experience ? ' · ' + prov.years_experience + ' yrs' : '') + '</small></span>' + ic('<path d="M9 5l7 7-7 7"/>') + '</a>';
        h += '<div class="pv-earn"><div class="row"><small>Today’s earnings</small><button type="button" class="eye" id="pvEye" aria-label="Show or hide amount">' + ic('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>') + '</button></div><span class="amt" id="pvAmt" data-v="' + LL.esc(LL.naira(today)) + '">' + LL.naira(today) + '</span>' +
          (pct == null ? '<span class="pv-trend">' + done.filter(function (b) { return day(b.completed_at) === day(t0); }).length + ' job(s) completed today</span>' : '<span class="pv-trend">' + (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct) + '%</span><span class="sub">vs. yesterday</span>') + '</div>';
        h += '<div class="pv-stats">' + tile('b', ic('<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>'), 'New requests', open.length, 'provider-request.html') +
          tile('g', ic('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/>'), 'Active bookings', active, '?section=bookings') +
          tile('b', ic('<path d="M5 12l4.5 4.5L19 7"/>'), 'Completed jobs', prov.jobs_done || 0, '?section=bookings') +
          tile('g', ic('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'), 'Rating', rating, '?section=reviews') + '</div>';
        var tip = !ver ? ['Get verified to send quotes', 'Verified providers can quote on every request and rank higher.', 'provider-verification.html', 'Verify now']
          : (r[4] && r[4].length < 3 ? ['Grow your business', 'Add more services so you show up in more searches and get more requests.', '?section=services', 'Add services'] : ['Win more jobs', 'Reply to new requests quickly. Fast quotes are accepted more often.', 'provider-request.html', 'See requests']);
        h += '<div class="pv-grow"><span class="ic">' + ic('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>') + '</span><div style="position:relative;z-index:1"><b>' + tip[0] + '</b><p>' + tip[1] + '</p><a href="' + tip[2] + '">' + tip[3] + '</a></div></div>';
        h += '<div class="pv-h"><h3>Recent requests</h3><a href="provider-request.html">View all</a></div>';
        if (!open.length) h += '<div class="pv-card" style="padding:18px;font-size:13px;font-weight:600;color:var(--pv-ink2)">No open requests right now. New ones appear here as customers post them.</div>';
        else h += open.slice(0, 3).map(function (x) {
          var u = x.urgency === 'emergency' ? ['hi', 'High priority'] : x.urgency === 'soon' ? ['md', 'Medium'] : ['lo', 'Low'];
          return '<a class="pv-card pv-req" href="provider-request.html?id=' + LL.esc(x.id) + '"><div class="top"><span class="pv-ic">' + ic('<path d="M14.7 6.3a4 4 0 00-5 5L3 18l3 3 6.7-6.7a4 4 0 005-5l-2.5 2.5-2.4-.6-.6-2.4z"/>') + '</span><span class="mid"><b>' + LL.esc(x.category_text || 'Service request') + '</b><small>' + LL.esc(x.location_area) + ' · ' + LL.esc(LL.ago(x.created_at)) + '</small></span><span class="pv-tag ' + u[0] + '">' + u[1] + '</span></div></a>';
        }).join('');
        return h + '</div>';
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
          var cnt = { up: 0, now: 0, past: 0 }; bs.forEach(function (b) { cnt[['confirmed', 'pending_payment', 'paid'].indexOf(b.status) >= 0 ? 'up' : ['provider_on_the_way', 'arrived', 'in_progress'].indexOf(b.status) >= 0 ? 'now' : 'past']++; });
          return '<div class="pv-wrap"><div class="pv-chips" id="pvChips"><button type="button" data-f="all" aria-pressed="true">All <em>' + bs.length + '</em></button><button type="button" data-f="up" aria-pressed="false">Upcoming <em>' + cnt.up + '</em></button><button type="button" data-f="now" aria-pressed="false">In progress <em>' + cnt.now + '</em></button><button type="button" data-f="past" aria-pressed="false">Past <em>' + cnt.past + '</em></button></div>' + bs.map(function (b) {
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
            var g = ['confirmed', 'pending_payment', 'paid'].indexOf(b.status) >= 0 ? 'up' : ['provider_on_the_way', 'arrived', 'in_progress'].indexOf(b.status) >= 0 ? 'now' : 'past';
            return '<div class="pv-card pv-bk" data-g="' + g + '"><div class="top"><span class="pv-ic' + (g === 'now' ? ' b' : '') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/></svg></span><span class="mid" style="flex:1;min-width:0"><b style="display:block;font-size:15px;font-weight:800">' + LL.esc(x.category_text || 'Job') + '</b><small style="font-size:12.5px;font-weight:600;color:var(--pv-ink2)">' + LL.esc(x.location_area || '') + (b.scheduled_for ? ' · ' + LL.esc(LL.dateTime(b.scheduled_for)) : ' · no time set') + '</small></span>' + LL.badge(b.status) + '</div><p class="price">' + LL.naira(b.price_kobo) + '</p><div class="who"><span class="pv-av">' + LL.esc(LL.initials(c)) + '</span>' + LL.esc(c) + '</div><div class="acts">' + act + '</div></div>';
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
          return '<div class="grid lg:grid-cols-3 gap-4"><div class="space-y-2"><label class="pv-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="pvConvSearch" type="search" placeholder="Search customers…"></label>' + convs.map(function (c) { var s = sum[c.id] || {}; return '<a href="?section=messages&c=' + LL.esc(c.id) + '" class="flex items-center gap-3 p-3 rounded-2xl border ' + (c.id === cur.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white') + '">' + LL.avatar(nameOf(c), null, 'w-10 h-10') + '<div class="min-w-0 flex-1"><p class="font-extrabold text-sm truncate">' + LL.esc(nameOf(c)) + '</p><p class="text-xs text-slate-500 truncate">' + LL.esc(s.last ? s.last.body : 'No messages yet') + '</p></div>' + (s.unread ? '<span class="bg-sky-700 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">' + s.unread + '</span>' : '') + '</a>'; }).join('') + '</div><div class="lg:col-span-2">' + card('<div class="flex justify-between"><h2 class="font-extrabold">' + LL.esc(nameOf(cur)) + '</h2><a class="text-xs font-extrabold text-emerald-700" href="provider-request.html?id=' + LL.esc(cur.request_id) + '">View request</a></div><div id="chatMount"></div>') + '</div></div>';
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
    wallet: function () {
      return LLApi.provider.bookings().catch(function () { return []; }).then(function (bs) {
        var done = bs.filter(function (b) { return b.status === 'completed'; }), now = new Date();
        var total = done.reduce(function (n, b) { return n + (b.price_kobo || 0); }, 0);
        var month = done.filter(function (b) { var d = new Date(b.completed_at || b.updated_at || 0); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).reduce(function (n, b) { return n + (b.price_kobo || 0); }, 0);
        setTimeout(function () { LLWallet.mount(document.getElementById('walletMount'), { role: 'provider' }); }, 0);
        return '<div class="pv-wrap"><div class="pv-hello"><h2>Wallet</h2><p>Your job earnings and your LifeLink platform credit.</p></div>' +
          '<div class="pv-h"><h3>Job earnings</h3></div>' +
          '<div class="pv-card pv-earn3"><div><b>' + LL.naira(month) + '</b><span>This month</span></div><div><b>' + LL.naira(total) + '</b><span>All time</span></div><div><b>' + done.length + '</b><span>Jobs completed</span></div></div>' +
          '<p class="pv-note">Job payments go directly from the customer to you. They do not pass through this wallet.</p>' +
          '<div class="pv-h"><h3>Platform wallet</h3></div><div id="walletMount"></div></div>';
      });
    },
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

  function bindPv() {
    var eye = document.getElementById('pvEye'), amt = document.getElementById('pvAmt');
    if (eye && amt) eye.onclick = function () { var hid = amt.getAttribute('data-h') === '1'; amt.setAttribute('data-h', hid ? '0' : '1'); amt.textContent = hid ? amt.getAttribute('data-v') : '••••••'; };
    var ch = document.getElementById('pvChips');
    if (ch) ch.onclick = function (e) {
      var b = e.target.closest('button[data-f]'); if (!b) return; var f = b.getAttribute('data-f');
      ch.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      app.querySelectorAll('.pv-bk').forEach(function (c) { c.style.display = (f === 'all' || c.getAttribute('data-g') === f) ? '' : 'none'; });
    };
    var q = document.getElementById('pvConvSearch');
    if (q) q.oninput = function () { var t = q.value.toLowerCase(); q.closest('.space-y-2').querySelectorAll('a[href*="section=messages"]').forEach(function (a) { a.style.display = a.textContent.toLowerCase().indexOf(t) >= 0 ? '' : 'none'; }); };
  }

  function render(quiet) {
    if (!quiet) app.innerHTML = LL.loading(TITLES[section].toLowerCase());
    return S[section]().then(function (h) { app.innerHTML = h; bindBookingActions(); bindPv(); syncSharing(); }).catch(function (e) { app.innerHTML = LL.error(e.message); });
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
