/* provider-dashboard.html — provider workspace. Sections via ?section=. */
(function () {
  'use strict';
  var app = document.getElementById('app'), me = null, prov = null, section = LL.q('section') || 'overview';
  var TITLES = { overview: 'Overview', quotes: 'My quotes', bookings: 'Bookings', messages: 'Messages', services: 'My services', reviews: 'Reviews', profile: 'Profile & availability', wallet: 'Wallet' };
  function card(i) { return '<section class="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-3">' + i + '</section>'; }
  function stat(l, n, h) { return '<a href="' + h + '" class="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 block"><p class="text-3xl font-extrabold">' + n + '</p><p class="text-xs font-extrabold uppercase tracking-wider text-slate-400 mt-1">' + l + '</p></a>'; }
  function reqMap(ids) { return LLApi.provider.requestsByIds(ids).then(function (rows) { var m = {}; rows.forEach(function (r) { m[r.id] = r; }); return m; }).catch(function () { return {}; }); }

  var bindProfileForm = null;
  var S = {
    overview: function () {
      return Promise.all([LLApi.provider.requests(), LLApi.provider.myQuotes(), LLApi.provider.bookings(), LLApi.provider.reviews(), LLApi.wallet.me().catch(function () { return null; }), LLApi.names().catch(function () { return {}; })]).then(function (r) {
        var open = r[0].filter(function (x) { return x.status === 'open' || x.status === 'quoted'; }).length;
        var vb = '';
        if (prov.verification_status !== 'verified') vb = '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 flex flex-wrap justify-between gap-2"><span>Verification status: <strong>' + LL.esc(prov.verification_status) + '</strong>. You can send quotes once verified.</span><a href="provider-verification.html" class="font-extrabold underline">Open verification</a></div>';
        var desk = '<div class="hidden md:block space-y-6">' + vb;
        desk += '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">' + stat('Open requests', open, 'provider-request.html') + stat('Pending quotes', r[1].filter(function (q) { return q.status === 'pending'; }).length, '?section=quotes') + stat('Active bookings', r[2].filter(function (b) { return ['pending_payment', 'paid', 'in_progress'].indexOf(b.status) >= 0; }).length, '?section=bookings') + stat('Jobs done', prov.jobs_done || 0, '?section=bookings') + '</div>';
        desk += '<div class="mt-6">' + card('<div class="flex justify-between items-center"><h2 class="font-extrabold">Your rating</h2><span>' + (prov.rating_avg != null ? LL.stars(prov.rating_avg) : '<span class="text-sm text-slate-400 font-semibold">No reviews yet</span>') + '</span></div><p class="text-sm text-slate-500">' + r[3].length + ' review' + (r[3].length === 1 ? '' : 's') + ' · availability: <strong>' + (prov.available ? 'accepting work' : 'not accepting work') + '</strong></p>') + '</div></div>';

        /* ---- mobile Home (matches the provider mock-up) ---- */
        var ic = function (p, c) { return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="' + (c || 'currentColor') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
        var I = {
          star: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="#FBBF24" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
          cal: ic('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>', '#6EE7B7'),
          cash: ic('<rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 12h.01M17.5 12h.01"/>', '#7DD3FC'),
          up: ic('<path d="M4 16l6-6 4 4 6-7"/><path d="M15 7h5v5"/>', '#fff'),
          search: ic('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
          jobs: ic('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M8 12h8M8 16h5"/>'),
          tools: ic('<path d="M14.7 6.3a4 4 0 005 5L21 12.6 12.6 21a2.1 2.1 0 01-3-3L18 9.6"/><path d="M14.7 6.3l-3-3M3.5 13.5l4 4"/>'),
          wallet: ic('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/>'),
          chev: ic('<path d="M9 6l6 6-6 6"/>'),
          case: '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><defs><linearGradient id="pvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ADE80"/><stop offset="1" stop-color="#15803D"/></linearGradient></defs><path d="M22 18v-4a4 4 0 014-4h12a4 4 0 014 4v4" fill="none" stroke="#22C55E" stroke-width="4" stroke-linecap="round"/><rect x="6" y="18" width="52" height="38" rx="9" fill="url(#pvg)"/><path d="M6 32h52" stroke="#065F46" stroke-opacity=".45" stroke-width="3"/><rect x="27" y="29" width="10" height="8" rx="3" fill="#BBF7D0"/></svg>'
        };
        var bal = r[4] && r[4].available_kobo != null ? LL.naira(r[4].available_kobo) : LL.naira(0);
        var tile = function (href, label, icon, tone) { return '<a href="' + href + '" class="pv-tile pv-' + tone + '">' + icon + '<span>' + label + '</span></a>'; };
        var recent = r[2].slice(0, 3);
        var statusLbl = function (s) { return ({ pending_payment: 'New booking received', paid: 'New booking received', confirmed: 'Booking confirmed', provider_on_the_way: 'You are on the way', arrived: 'You have arrived', in_progress: 'Job in progress', completed: 'Job completed', cancelled: 'Booking cancelled', disputed: 'Booking disputed' })[s] || 'Booking update'; };
        var pcLoad = Promise.all([LLApi.provider.services().catch(function () { return null; }), LLApi.provider.catalog().catch(function () { return null; })]);
        return Promise.all([reqMap(recent.map(function (b) { return b.request_id; })), pcLoad]).then(function (zz) {
          var rm = zz[0], pcx = zz[1];
          var pcard = LLApi.checklist.html(LLApi.checklist.providerItems({ me: me, prov: prov, services: pcx[0], catalog: pcx[1], wallet: r[4] }), { key: 'prov:' + (me && me.id), note: prov.verification_status !== 'verified' ? 'Complete your profile to get verified faster.' : '', noteHref: 'provider-verification.html' });
          var act = recent.length ? recent.map(function (b) {
            var x = rm[b.request_id] || {}, c = (r[5][b.customer_id] || {}).display_name || 'Customer';
            return '<a href="?section=bookings" class="pv-act"><span class="pv-act-i">' + I.jobs + '</span><span class="pv-act-t"><b>' + LL.esc(statusLbl(b.status)) + '</b><em>' + LL.esc(x.category_text || 'Job') + ' · ' + LL.esc(c) + '</em><small>' + LL.esc(LL.ago(b.created_at)) + '</small></span><span class="pv-act-p">' + LL.naira(b.price_kobo) + '</span></a>';
          }).join('') : '<p class="pv-none">No activity yet. New bookings will show up here.</p>';
          var mob = '<div class="md:hidden pv-m">' +
            '<section class="pv-hero"' + (me && me.banner_url ? ' style="background-image:linear-gradient(135deg,rgba(4,40,31,.72),rgba(14,86,163,.55)),url(\'' + LL.esc(me.banner_url) + '\');background-size:cover;background-position:center"' : '') + '><p class="pv-wel">Welcome</p><h2>' + LL.esc(prov.business_name || 'Your business') + '</h2><p class="pv-tag">More bookings. More income.<br>A better you.</p></section>' +
            '<div class="pv-stats"><a href="?section=reviews">' + I.star + '<b>' + (prov.rating_avg != null ? Number(prov.rating_avg).toFixed(1) : '–') + '</b><span>Your rating</span></a>' +
            '<a href="?section=bookings">' + I.cal + '<b>' + (prov.jobs_done || 0) + '</b><span>Jobs done</span></a>' +
            '<a href="?section=wallet">' + I.cash + '<b>' + bal + '</b><span>Wallet</span></a></div>' +
            '<div class="pv-body">' + vb + pcard +
            '<a href="?section=profile" class="pv-strip"><span class="pv-strip-i">' + I.up + '</span><span class="pv-strip-t"><b>Keep your profile active</b><em>' + (prov.available ? 'More bookings, more income.' : 'You are hidden right now. Turn availability on.') + '</em></span>' + I.chev + '</a>' +
            '<h3 class="pv-h">Quick Actions</h3><div class="pv-tiles">' + tile('provider-request.html', 'Requests', I.search, 'b') + tile('?section=bookings', 'Bookings', I.jobs, 'g') + tile('?section=services', 'My services', I.tools, 'b') + tile('?section=wallet', 'Wallet', I.wallet, 'g') + '</div>' +
            '<div class="pv-pro" data-pv-pro role="button" tabindex="0"><span class="pv-pro-i">' + I.case + '</span><span class="pv-pro-t"><small>Grow Your Business</small><b>Upgrade to Pro</b><em>Get more visibility, priority support and higher earning opportunities.</em></span>' + I.chev + '</div>' +
            '<div class="pv-row"><h3 class="pv-h">Recent Activity</h3><a href="?section=bookings">View all</a></div>' + act +
            '</div></div>';
          return '<div>' + desk + mob + '</div>';
        });
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
          var list = bkAsc ? bs.slice().reverse() : bs;
          var pairs = list.map(function (b) {
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
            var dk = card('<div class="flex justify-between items-center"><p class="font-extrabold">' + LL.esc(x.category_text || 'Job') + ' · ' + LL.esc(c) + '</p>' + LL.badge(b.status) + '</div><p class="text-sm text-slate-600">' + LL.esc(x.location_area || '') + '</p><p class="text-sm">' + LL.naira(b.price_kobo) + (b.scheduled_for ? ' · ' + LL.esc(LL.dateTime(b.scheduled_for)) : ' · no time set') + '</p><div class="flex flex-wrap items-center gap-3">' + act + '</div>');
            return { d: dk, m: pvBkCard(b, x, c, act) };
          });
          return bkWrap(pairs);
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
          if (window.matchMedia && window.matchMedia('(max-width: 767.98px)').matches) return pmMobile(convs, nm, sum);
          return '<div class="grid lg:grid-cols-3 gap-4"><div class="space-y-2">' + convs.map(function (c) { var s = sum[c.id] || {}; return '<a href="?section=messages&c=' + LL.esc(c.id) + '" class="flex items-center gap-3 p-3 rounded-2xl border ' + (c.id === cur.id ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 bg-white') + '">' + LL.avatar(nameOf(c), null, 'w-10 h-10') + '<div class="min-w-0 flex-1"><p class="font-extrabold text-sm truncate">' + LL.esc(nameOf(c)) + '</p><p class="text-xs text-slate-500 truncate">' + LL.esc(s.last ? s.last.body : 'No messages yet') + '</p></div>' + (s.unread ? '<span class="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">' + s.unread + '</span>' : '') + '</a>'; }).join('') + '</div><div class="lg:col-span-2">' + card('<div class="flex justify-between"><h2 class="font-extrabold">' + LL.esc(nameOf(cur)) + '</h2>' + (cur.request_id ? '<a class="text-xs font-extrabold text-emerald-700" href="provider-request.html?id=' + LL.esc(cur.request_id) + '">View request</a>' : '') + '</div><div id="chatMount"></div>') + '</div></div>';
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
      return Promise.all([S.profileForm(), LLApi.provider.services().catch(function () { return []; }), LLApi.provider.reviews().catch(function () { return []; }), LLApi.provider.catalog().catch(function () { return []; })]).then(function (r) {
        return pvProfile(r[1], r[2], r[3]) + '<div id="ppForm" class="pp-form">' + r[0] + '</div>';
      });
    },
    profileForm: function () {
      /* The Save / type / photo handlers are attached by bindProfileForm() once the form is on screen (see bindAll). */
      bindProfileForm = function () {
        if (!document.getElementById('pf')) return;
        document.getElementById('pf').onsubmit = function (e) {
          e.preventDefault();
          var y = document.getElementById('py').value;
          var pt = document.getElementById('ptype').value, su = (document.getElementById('pstore').value || '').trim();
          if (su && !/^https?:\/\//i.test(su)) su = 'https://' + su;
          if (su && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(su)) { LL.toast('Enter a valid store link.', true); return; }
          LL.busy(document.getElementById('ps'), 'Saving…', function () {
            return LLApi.provider.update({ provider_type: pt, store_url: pt === 'service_business' ? (su || null) : null, business_name: document.getElementById('pn').value.trim(), bio: document.getElementById('pb').value.trim() || null, service_area: document.getElementById('pa').value.trim() || null, years_experience: y === '' ? null : Number(y), available: document.getElementById('pv').checked, skills: document.getElementById('pk').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) });
          }).then(function () { prov.provider_type = pt; prov.store_url = pt === 'service_business' ? (su || null) : null; LL.toast('Profile saved.'); render(true); }, function (er) { LL.toast(/provider_type|store_url|schema cache/.test(er.message || '') ? 'Account types are not set up yet. Run migration 011 in Supabase.' : er.message, true); });
        };
        var pty = document.getElementById('ptype'); if (pty) pty.onchange = function () { document.getElementById('pstoreW').classList.toggle('hidden', pty.value !== 'service_business'); };
        var av = document.getElementById('pav'); if (av) av.onchange = function () { if (av.files[0]) LLApi.uploadAvatar(av.files[0]).then(function () { LL.toast('Photo updated.'); setTimeout(function () { location.reload(); }, 600); }, function (er) { LL.toast(er.message, true); }); };
      };
      return Promise.resolve(card('<h2 class="font-extrabold">Profile</h2><form id="pf" class="space-y-3" novalidate><div><label class="lbl">Photo (JPG or PNG, up to 2 MB)</label><input id="pav" type="file" accept="image/jpeg,image/png,image/webp" class="text-sm"></div><div><label class="lbl" for="pn">Business name</label><input id="pn" class="field" maxlength="120" value="' + LL.esc(prov.business_name) + '"></div><div><label class="lbl" for="pb">About you</label><textarea id="pb" rows="4" maxlength="1000" class="field resize-none">' + LL.esc(prov.bio || '') + '</textarea></div><div class="grid sm:grid-cols-2 gap-3"><div><label class="lbl" for="pa">Service area</label><input id="pa" class="field" maxlength="160" value="' + LL.esc(prov.service_area || '') + '"></div><div><label class="lbl" for="py">Years of experience</label><input id="py" type="number" min="0" max="80" class="field" value="' + (prov.years_experience == null ? '' : prov.years_experience) + '"></div></div><div><label class="lbl" for="pk">Skills (comma separated)</label><input id="pk" class="field" value="' + LL.esc((prov.skills || []).join(', ')) + '"></div><div><label class="lbl" for="ptype">Account type</label><select id="ptype" class="field"><option value="service_only"' + (prov.provider_type !== 'service_business' ? ' selected' : '') + '>Service Provider only</option><option value="service_business"' + (prov.provider_type === 'service_business' ? ' selected' : '') + '>Service Provider / Business Owner</option></select><p class="text-xs text-slate-500 mt-1">Business Owners can also list products with prices. Switching back to Service Provider hides your products and prices (they return if you switch again) and removes your store link.</p></div><div id="pstoreW"' + (prov.provider_type === 'service_business' ? '' : ' class="hidden"') + '><label class="lbl" for="pstore">Link to your online store (optional)</label><input id="pstore" class="field" inputmode="url" maxlength="300" placeholder="https://" value="' + LL.esc(prov.store_url || '') + '"></div><label class="flex items-center gap-2 text-sm font-bold"><input id="pv" type="checkbox"' + (prov.available ? ' checked' : '') + '> I am currently accepting work</label><button id="ps" class="w-full bg-emerald-600 text-white font-extrabold py-3 rounded-2xl">Save profile</button></form>'));
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

  /* ---- Bookings (mobile) ---- */
  var bkFilter = 'all', bkAsc = false, bkQ = '';
  function bkIc(p) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var BK = {
    wrench: bkIc('<path d="M14.7 6.3a4 4 0 005 5L21 12.6 12.6 21a2.1 2.1 0 01-3-3L18 9.6"/><path d="M14.7 6.3l-3-3M3.5 13.5l4 4"/>'),
    car: bkIc('<path d="M5 16V12l2-5h10l2 5v4M3 16h18v3H3zM7 13h.01M17 13h.01"/>'),
    bolt: bkIc('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
    box: bkIc('<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>'),
    pin: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
    search: bkIc('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    sort: bkIc('<path d="M4 6h16M7 12h10M10 18h4"/>')
  };
  var BK_LBL = { completed: ['Completed', 'ok'], cancelled: ['Cancelled', 'bad'], pending_payment: ['Pending', 'wait'], disputed: ['Disputed', 'bad'], confirmed: ['Confirmed', 'act'], paid: ['Paid', 'act'], provider_on_the_way: ['On the way', 'act'], arrived: ['Arrived', 'act'], in_progress: ['In progress', 'act'] };
  function pvBkCard(b, x, c, act) {
    var g = b.status === 'completed' ? 'completed' : b.status === 'cancelled' ? 'cancelled' : 'active';
    var l = BK_LBL[b.status] || [String(b.status || '').replace(/_/g, ' '), 'wait'];
    var cat = String(x.category_text || 'Job'), ico = /auto|car|mechanic|vehicle/i.test(cat) ? BK.car : /electric|solar|wiring/i.test(cat) ? BK.bolt : /deliver|dispatch|courier/i.test(cat) ? BK.box : BK.wrench;
    var q = (cat + ' ' + c + ' ' + (x.location_area || '')).toLowerCase();
    return '<article class="pv-bk-card" data-g="' + g + '" data-q="' + LL.esc(q) + '"><span class="pv-bk-i">' + ico + '</span><div class="pv-bk-m"><div class="pv-bk-top"><div class="pv-bk-tt"><b>' + LL.esc(cat) + '</b><em>' + LL.esc(c) + '</em></div><span class="pv-pill pv-' + l[1] + '">' + LL.esc(l[0]) + '</span></div>' +
      (x.location_area ? '<p class="pv-bk-r">' + BK.pin + '<span>' + LL.esc(x.location_area) + '</span></p>' : '') +
      '<div class="pv-bk-bot"><p class="pv-bk-r">' + BK.cal + '<span>' + (b.scheduled_for ? LL.esc(LL.dateTime(b.scheduled_for)) : 'No time set') + '</span></p><strong>' + LL.naira(b.price_kobo) + '</strong></div>' +
      (act ? '<div class="pv-bk-act">' + act + '</div>' : '') + '</div></article>';
  }
  function bkWrap(pairs) {
    var chips = [['all', 'All'], ['completed', 'Completed'], ['active', 'Active'], ['cancelled', 'Cancelled']];
    return '<div class="hidden md:block space-y-3">' + pairs.map(function (p) { return p.d; }).join('') + '</div>' +
      '<div class="md:hidden pv-bk"><div class="pv-bk-head"><div><h2>Bookings</h2><p>Manage your confirmed and completed jobs</p></div><div class="pv-bk-tools"><button type="button" data-bk-search aria-label="Search bookings">' + BK.search + '</button><button type="button" data-bk-sort aria-label="Sort bookings">' + BK.sort + '</button></div></div>' +
      '<input type="search" class="pv-bk-q" data-bk-q placeholder="Search bookings" hidden>' +
      '<div class="pv-bk-chips">' + chips.map(function (c) { return '<button type="button" data-bk-f="' + c[0] + '" aria-pressed="' + (bkFilter === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="pv-bk-list">' + pairs.map(function (p) { return p.m; }).join('') + '</div><p class="pv-none" data-bk-empty hidden>No bookings in this view.</p></div>';
  }
  function bindBkFilter() {
    var cards = app.querySelectorAll('.pv-bk-card'); if (!app.querySelector('.pv-bk')) return;
    var inp = app.querySelector('[data-bk-q]'), empty = app.querySelector('[data-bk-empty]');
    function apply() {
      var n = 0, q = bkQ.trim().toLowerCase();
      cards.forEach(function (c) { var ok = (bkFilter === 'all' || c.getAttribute('data-g') === bkFilter) && (!q || c.getAttribute('data-q').indexOf(q) >= 0); c.hidden = !ok; if (ok) n++; });
      if (empty) empty.hidden = n > 0;
      app.querySelectorAll('[data-bk-f]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-bk-f') === bkFilter)); });
    }
    app.querySelectorAll('[data-bk-f]').forEach(function (b) { b.onclick = function () { bkFilter = b.getAttribute('data-bk-f'); apply(); }; });
    if (inp) { inp.value = bkQ; inp.hidden = !bkQ; inp.oninput = function () { bkQ = inp.value; apply(); }; }
    var sb = app.querySelector('[data-bk-search]'); if (sb && inp) sb.onclick = function () { inp.hidden = !inp.hidden; if (!inp.hidden) inp.focus(); else { bkQ = ''; inp.value = ''; apply(); } };
    var so = app.querySelector('[data-bk-sort]'); if (so) so.onclick = function () { bkAsc = !bkAsc; LL.toast(bkAsc ? 'Oldest first' : 'Newest first'); render(true); };
    apply();
  }
  /* ---- Messages (mobile) ---- */
  function pmIc(p, n) { n = n || 22; return '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var PM = {
    search: pmIc('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    edit: pmIc('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    back: pmIc('<path d="M15 6l-6 6 6 6"/>'),
    pin: pmIc('<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', 15),
    ticks: pmIc('<path d="M2 12.5l4 4L14 8M10 15.5l1.5 1.5L21 8"/>', 20)
  };
  function pmTime(ts) {
    if (!ts) return '';
    var d = new Date(ts), n = new Date(), day = 86400000, t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    if (d.getTime() >= t0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.getTime() >= t0 - day) return 'Yesterday';
    if (d.getTime() >= t0 - 6 * day) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function pmAvatar(name, url, id) {
    var k = 0, str = String(id || name || ''); for (var i = 0; i < str.length; i++) k += str.charCodeAt(i);
    return '<span class="pm-av pm-c' + (k % 3) + '">' + (url ? '<img src="' + LL.esc(url) + '" alt="">' : LL.esc(LL.initials(name))) + '</span>';
  }
  function pmMobile(convs, nm, sum) {
    var sel = LL.q('c'), cuId = LL.q('cu');
    var nameOf = function (c) { return (nm[c.customer_id] || {}).display_name || 'Customer'; };
    var avOf = function (c) { return pmAvatar(nameOf(c), (nm[c.customer_id] || {}).avatar_url, c.customer_id); };
    return reqMap(convs.map(function (c) { return c.request_id; })).then(function (rm) {
      var ctx = function (c) { if (!c.request_id) return c.item_title ? 'About: ' + c.item_title : ''; var x = rm[c.request_id] || {}; return [x.category_text, x.location_area].filter(Boolean).join(' · '); };
      var tOf = function (c) { var s = sum[c.id] || {}; return new Date(s.last ? s.last.created_at : c.created_at).getTime() || 0; };
      var lastTxt = function (c) { var l = (sum[c.id] || {}).last; return l ? (l.sender_id === me.id ? 'You: ' : '') + l.body : 'No messages yet'; };
      var cur = sel ? convs.filter(function (c) { return c.id === sel; })[0] : null;
      /* 3) one open conversation: read it and reply */
      if (cur) {
        setTimeout(function () { var el = document.getElementById('chatMount'); if (el) LLChat.mount(el, cur.id); }, 0);
        return '<div class="pm-chat"><div class="pm-chat-h"><a href="?section=messages&cu=' + LL.esc(cur.customer_id) + '" class="pm-back" aria-label="Back to this customer\'s chats">' + PM.back + '</a>' + avOf(cur) +
          '<div class="pm-chat-t"><b>' + LL.esc(nameOf(cur)) + '</b><em>' + LL.esc(ctx(cur) || 'Customer') + '</em></div>' + (cur.request_id ? '<a class="pm-view" href="provider-request.html?id=' + LL.esc(cur.request_id) + '">View request</a>' : '') + '</div><div class="pm-chat-b"><div id="chatMount"></div></div></div>';
      }
      /* group every conversation under its customer */
      var g = {}, order = [];
      convs.forEach(function (c) {
        var o = g[c.customer_id]; if (!o) { o = g[c.customer_id] = { id: c.customer_id, convs: [], unread: 0, t: -1, top: c }; order.push(o); }
        o.convs.push(c); o.unread += (sum[c.id] || {}).unread || 0;
        if (tOf(c) > o.t) { o.t = tOf(c); o.top = c; }
      });
      order.sort(function (x, y) { return y.t - x.t; });
      /* 2) one customer: all of their chat sessions */
      var grp = cuId ? g[cuId] : null;
      if (grp) {
        grp.convs.sort(function (x, y) { return tOf(y) - tOf(x); });
        return '<div class="pm"><div class="pm-chat pm-cu"><div class="pm-chat-h"><a href="?section=messages" class="pm-back" aria-label="Back to messages">' + PM.back + '</a>' + avOf(grp.top) +
          '<div class="pm-chat-t"><b>' + LL.esc(nameOf(grp.top)) + '</b><em>' + grp.convs.length + ' chat' + (grp.convs.length === 1 ? '' : 's') + (grp.unread ? ' · ' + grp.unread + ' unread' : '') + '</em></div></div></div>' +
          '<div class="pm-list">' + grp.convs.map(function (c) {
            var s = sum[c.id] || {}, l = s.last, mine = l && l.sender_id === me.id;
            var right = s.unread ? '<span class="pm-badge">' + s.unread + '</span>' : (mine ? '<span class="pm-tick' + (l.read_at ? ' read' : '') + '">' + PM.ticks + '</span>' : '');
            return '<a href="?section=messages&c=' + LL.esc(c.id) + '" class="pm-card' + (s.unread ? ' un' : '') + '"><div class="pm-m"><div class="pm-top"><b>' + LL.esc(ctx(c) || 'Chat') + '</b><time>' + LL.esc(pmTime(l ? l.created_at : c.created_at)) + '</time></div>' +
              '<div class="pm-mid"><span class="pm-last">' + LL.esc(lastTxt(c)) + '</span>' + right + '</div></div></a>';
          }).join('') + '</div></div>';
      }
      /* 1) one row per customer */
      return '<div class="pm"><div class="pm-head"><div><h2>Messages</h2><p>Recent Chats</p></div><div class="pm-tools"><button type="button" data-pm-search aria-label="Search chats">' + PM.search + '</button><a href="provider-request.html" class="pm-new" aria-label="Start a chat from a request">' + PM.edit + '</a></div></div>' +
        '<input type="search" class="pm-q" data-pm-q placeholder="Search chats" hidden>' +
        '<div class="pm-list">' + order.map(function (o) {
          var c = o.top, nmv = nameOf(c), n = o.convs.length;
          var right = o.unread ? '<span class="pm-badge">' + o.unread + '</span>' : '';
          var all = o.convs.map(function (x) { return ctx(x) + ' ' + ((sum[x.id] || {}).last ? sum[x.id].last.body : ''); }).join(' ');
          return '<a href="?section=messages&cu=' + LL.esc(o.id) + '" class="pm-card' + (o.unread ? ' un' : '') + '" data-q="' + LL.esc((nmv + ' ' + all).toLowerCase()) + '">' + avOf(c) +
            '<div class="pm-m"><div class="pm-top"><b>' + LL.esc(nmv) + '</b><time>' + LL.esc(pmTime(o.t ? new Date(o.t).toISOString() : c.created_at)) + '</time></div><div class="pm-mid"><span class="pm-last">' + LL.esc(lastTxt(c)) + '</span>' + right + '</div>' +
            '<p class="pm-ctx">' + PM.pin + '<span>' + n + ' chat' + (n === 1 ? '' : 's') + '</span></p></div></a>';
        }).join('') + '</div><p class="pv-none" data-pm-empty hidden>No chats match your search.</p></div>';
    });
  }
  function bindMsgSearch() {
    var inp = app.querySelector('[data-pm-q]'), btn = app.querySelector('[data-pm-search]'); if (!inp || !btn) return;
    var cards = app.querySelectorAll('.pm-card'), empty = app.querySelector('[data-pm-empty]');
    function apply() { var n = 0, q = inp.value.trim().toLowerCase(); cards.forEach(function (c) { var ok = !q || c.getAttribute('data-q').indexOf(q) >= 0; c.hidden = !ok; if (ok) n++; }); if (empty) empty.hidden = n > 0; }
    inp.oninput = apply;
    btn.onclick = function () { inp.hidden = !inp.hidden; if (!inp.hidden) inp.focus(); else { inp.value = ''; apply(); } };
  }
  /* ---- mobile Profile (matches the provider Profile mock-up). The original form is kept below and opened by "Edit Profile". ---- */
  function ppIcon(t) {
    var k = String(t || '').toLowerCase(), p;
    if (/data entry|typing|document|admin/.test(k)) p = '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h4M10 13h5M10 17h5"/>';
    else if (/web dev|develop|code|software|app/.test(k)) p = '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10 9l-3 3 3 3M14 9l3 3-3 3"/>';
    else if (/design|graphic|logo|art/.test(k)) p = '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>';
    else if (/video|film|edit|photo|camera/.test(k)) p = '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>';
    else if (/bot|ai |^ai|chat/.test(k)) p = '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9.5 13h.01M14.5 13h.01M9.5 16h5"/>';
    else if (/data|annot|database|analy/.test(k)) p = '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>';
    else if (/clean|laundry|wash/.test(k)) p = '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>';
    else if (/repair|fix|plumb|electric|mechanic|tool/.test(k)) p = '<path d="M14.7 6.3a4 4 0 005 5L21 12.6 12.6 21a2.1 2.1 0 01-3-3L18 9.6"/><path d="M14.7 6.3l-3-3"/>';
    else p = '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.4 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>';
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  function pvProfile(svcs, revs, cat) {
    var sv = function (d, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 20) + '" height="' + (w || 20) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
    var GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>';
    var chev = sv('<path d="M9 6l6 6-6 6"/>', 16), pen = sv('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', 18);

    var items = [
      ['Wallet', '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/>', 'provider-dashboard.html?section=wallet'],
      ['Quotes', '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h4M10 13h5M10 17h5"/>', 'provider-dashboard.html?section=quotes'],
      ['My services', '<path d="M14.7 6.3a4 4 0 005 5L21 12.6 12.6 21a2.1 2.1 0 01-3-3L18 9.6"/><path d="M14.7 6.3l-3-3"/>', 'provider-dashboard.html?section=services'],
      ['Reviews', '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.4 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>', 'provider-dashboard.html?section=reviews'],
      ['Verification', '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M6.5 16c.5-1.5 4.5-1.5 5 0M14 10h4M14 14h4"/>', 'provider-verification.html'],
      ['Settings', GEAR, 'settings.html'],
      ['Trust & safety', '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>', 'trust-safety.html']
    ];
    var th = (window.LLApp && LLApp.getTheme && LLApp.getTheme()) || 'system';
    var menu = '<div class="pp-menu">' + items.map(function (x) { return '<a href="' + x[2] + '"><span>' + sv(x[1], 20) + '</span><b>' + x[0] + '</b>' + chev + '</a>'; }).join('') + '</div>' +
      '<h3 class="pp-ap">Appearance</h3><div class="ll-seg" role="group" aria-label="Theme">' + ['light', 'dark', 'system'].map(function (k) { return '<button type="button" data-pp-th="' + k + '" aria-pressed="' + (th === k) + '">' + k.charAt(0).toUpperCase() + k.slice(1) + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="pp-out" data-pp-out>' + sv('<path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9"/>', 20) + '<b>Sign out</b></button>';
    var st = prov.verification_status || 'pending', ok = st === 'verified';
    var stLabel = ok ? 'Verified' : (st.charAt(0).toUpperCase() + st.slice(1).replace(/_/g, ' '));
    var tick = ok ? '<svg class="pp-tick" viewBox="0 0 24 24" width="20" height="20" aria-label="Verified"><circle cx="12" cy="12" r="11" fill="#7C3AED"/><path d="M7.3 12.4l3.3 3.3 6.1-6.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
    var rating = prov.rating_avg != null ? Number(prov.rating_avg).toFixed(1) : '–';
    var banner = me && me.banner_url ? '<img src="' + LL.esc(me.banner_url) + '" alt="">' : '';
    var avatar = me && me.avatar_url ? '<img src="' + LL.esc(me.avatar_url) + '" alt="">' : '<span>' + LL.esc(LL.initials((me && me.full_name) || prov.business_name)) + '</span>';
    ppSvcs = (svcs || []).slice().sort(function (a, b) { return (b.active !== false) - (a.active !== false); });
    var list = ppSvcs.slice(0, 6);
    var tiles = list.length ? list.map(function (x) { return '<button type="button" class="pp-svc' + (x.active === false ? ' pp-svc-off' : '') + '" data-svc="' + LL.esc(x.id) + '"><span class="pp-svc-i">' + ppIcon(x.title) + '</span><span class="pp-svc-t">' + LL.esc(x.title) + (x.active === false ? '<small>Hidden</small>' : '') + '</span>' + chev + '</button>'; }).join('')
      : '<button type="button" class="pp-svc pp-svc-add" data-svc=""><span class="pp-svc-i">' + sv('<path d="M12 5v14M5 12h14"/>') + '</span><span class="pp-svc-t">Add a service</span>' + chev + '</button>';
    return '<div class="pp-m md:hidden">' +
      '<div class="pp-bar"><a href="?section=overview" class="pp-bk" aria-label="Back">' + sv('<path d="M15 5l-7 7 7 7"/>', 24) + '</a><h1>Profile</h1><a href="settings.html" class="pp-bk" aria-label="Settings">' + sv(GEAR, 24) + '</a></div>' +
      '<div class="pp-cover">' + banner + '<button type="button" class="pp-chg" id="ppCoverBtn">' + sv('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 16) + '<span>Change Cover</span></button></div>' +
      '<div class="pp-id"><div class="pp-av"><div class="pp-av-i">' + avatar + '</div><button type="button" class="pp-pen" id="ppAvBtn" aria-label="Change photo">' + sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 14) + '</button></div>' +
      '<div class="pp-nm"><h2><span>' + LL.esc(prov.business_name) + '</span>' + tick + '</h2><p>Provider Account</p><span class="pp-pill' + (ok ? '' : ' pp-pill-w') + '">' + (ok ? sv('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>', 14) : '') + LL.esc(stLabel) + '</span></div></div>' +
      '<div class="pp-stats"><div><b><span class="pp-star">★</span> ' + rating + '</b><em>(' + (revs || []).length + ' review' + ((revs || []).length === 1 ? '' : 's') + ')</em></div><i></i><div><b>' + sv('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>', 18) + ' ' + (prov.jobs_done || 0) + '</b><em>Jobs done</em></div></div>' +
      '<div class="pp-sec"><h3>About me</h3><button type="button" class="pp-ed" data-pp-edit="pb" aria-label="Edit about">' + pen + '</button></div>' +
      (prov.bio ? '<div class="pp-about">' + LL.esc(prov.bio) + '</div>' : '<button type="button" class="pp-about pp-about-e" data-pp-edit="pb">Tell customers about yourself and your work. Tap to add.</button>') +
      storeLink(prov.store_url) +
      catSection(cat) +
      '<div class="pp-sec"><h3>Services</h3><span class="pp-sec-r"><button type="button" class="pp-va" data-svc="">+ Add</button><a href="?section=services" class="pp-va">View all</a></span></div><div class="pp-grid">' + tiles + '</div>' +
      '<button type="button" class="pp-edit" data-pp-edit="pn"><span>' + pen + '</span><b>Edit Profile</b>' + chev + '</button>' +
      menu +
      '<input type="file" id="ppCoverIn" accept="image/jpeg,image/png,image/webp" hidden><input type="file" id="ppAvIn" accept="image/jpeg,image/png,image/webp" hidden></div>';
  }
  /* ---------- Catalogue (work photos for everyone; products + prices for Business Owners) ---------- */
  var catItems = [], CAT_MAX = 10;
  function isBiz() { return prov && prov.provider_type === 'service_business'; }
  function catSection(items) {
    catItems = items || [];
    var biz = isBiz();
    var sv = function (d, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 20) + '" height="' + (w || 20) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
    var chev = sv('<path d="M9 6l6 6-6 6"/>', 16);
    var tiles = catItems.map(function (x) {
      var hiddenProd = x.kind === 'product' && !biz;
      return '<button type="button" class="pp-ci' + (x.active === false || hiddenProd ? ' pp-ci-off' : '') + '" data-cat="' + LL.esc(x.id) + '"><span class="pp-ci-img"><img src="' + LL.esc(x.image_url) + '" alt="" loading="lazy"></span>' +
        '<b>' + LL.esc(x.title) + '</b><small>' + (hiddenProd ? 'Hidden (Business account only)' : x.active === false ? 'Hidden' : (x.kind === 'product' && x.price_kobo != null ? LL.naira(x.price_kobo) : (x.description ? LL.esc(x.description) : 'Work'))) + '</small></button>';
    }).join('');
    var empty = '<button type="button" class="pp-ci-empty" data-cat="">' + sv('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>', 22) + '<span>' + (biz ? 'Show customers your work and the products you sell.' : 'Show customers photos of the work you have done.') + ' Tap to add.</span></button>';
    return '<div class="pp-sec"><h3>' + sv('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>', 18) + ' Catalogue</h3><span class="pp-sec-r"><span class="pp-cnt">' + catItems.length + '/' + CAT_MAX + '</span><button type="button" class="pp-va" data-cat="">+ Add</button></span></div>' +
      (catItems.length ? '<div class="pp-cat">' + tiles + '</div>' : empty) +
      '';
  }
  function catShrink(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var r = Math.min(1, 1100 / Math.max(img.width, img.height)), W = Math.round(img.width * r), H = Math.round(img.height * r), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          cv.getContext('2d').drawImage(img, 0, 0, W, H);
          cv.toBlob(function (b) { URL.revokeObjectURL(url); resolve(b ? new File([b], 'catalogue.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.82);
        } catch (e) { URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function storeLink(u) {
    if (!u) return '';
    var shown = String(u).replace(/^https?:\/\//i, '').replace(/\/$/, ''); if (shown.length > 38) shown = shown.slice(0, 37) + '…';
    return '<a class="ll-slink" href="' + LL.esc(u) + '" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1"/></svg><span>' + LL.esc(shown) + '</span></a>';
  }
  function catSheet(id) {
    var it = id ? catItems.filter(function (x) { return x.id === id; })[0] : null;
    if (!it && catItems.length >= CAT_MAX) { LL.toast('You can add up to ' + CAT_MAX + ' photos. Delete one to add another.', true); return; }
    var biz = isBiz(), kind = it ? it.kind : 'work', file = null;
    var old = document.getElementById('ppSheet'); if (old) old.remove();
    var el = document.createElement('div'); el.id = 'ppSheet'; el.className = 'pp-ov';
    function close() { el.remove(); document.body.classList.remove('pp-lock'); }
    function done(msg) { close(); LL.toast(msg); render(true); }
    function fail(er) { LL.toast(/provider_catalog|schema cache/.test((er && er.message) || '') ? 'Catalogue is not set up yet. Run migration 011 in Supabase.' : ((er && er.message) || 'Something went wrong.'), true); }
    el.innerHTML = '<div class="pp-sh" role="dialog" aria-modal="true"><div class="pp-sh-h"><b>' + (it ? 'Edit catalogue item' : 'Add to catalogue') + '</b><button type="button" id="ppX" aria-label="Close">✕</button></div><form id="ctF" novalidate>' +
      (biz ? '<div class="ll-seg" role="group" aria-label="Type"><button type="button" data-ck="work" aria-pressed="' + (kind === 'work') + '">Work I\'ve done</button><button type="button" data-ck="product" aria-pressed="' + (kind === 'product') + '">Product I sell</button></div>' : '') +
      '<label class="lbl" for="ctP">Photo' + (it ? ' (leave empty to keep the current one)' : '') + '</label>' + (it ? '<img class="pp-ct-prev" src="' + LL.esc(it.image_url) + '" alt="">' : '') + '<input id="ctP" type="file" accept="image/jpeg,image/png,image/webp" class="text-sm">' +
      '<label class="lbl" for="ctT">Title</label><input id="ctT" class="field" maxlength="80" value="' + LL.esc(it ? it.title : '') + '">' +
      '<label class="lbl" for="ctD">Description (optional)</label><textarea id="ctD" class="field resize-none" rows="3" maxlength="500">' + LL.esc(it && it.description || '') + '</textarea>' +
      '<div id="ctPW"' + (kind === 'product' ? '' : ' class="hidden"') + '><label class="lbl" for="ctPr">Price (₦)</label><input id="ctPr" class="field" inputmode="decimal" value="' + (it && it.price_kobo != null ? it.price_kobo / 100 : '') + '"></div>' +
      '<button id="ctS" class="pp-save">' + (it ? 'Save changes' : 'Add to catalogue') + '</button></form>' +
      (it ? '<div class="pp-sh-f"><button type="button" id="ctTog">' + (it.active === false ? 'Show' : 'Hide') + '</button><button type="button" id="ctDel" class="pp-del">Delete</button></div>' : '') + '</div>';
    el.onclick = function (e) { if (e.target === el) close(); };
    document.body.appendChild(el); document.body.classList.add('pp-lock');
    document.getElementById('ppX').onclick = close;
    Array.prototype.forEach.call(el.querySelectorAll('[data-ck]'), function (b) {
      b.onclick = function () { kind = b.getAttribute('data-ck'); Array.prototype.forEach.call(el.querySelectorAll('[data-ck]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); document.getElementById('ctPW').classList.toggle('hidden', kind !== 'product'); };
    });
    document.getElementById('ctP').onchange = function () { file = this.files[0] || null; };
    document.getElementById('ctF').onsubmit = function (e) {
      e.preventDefault();
      var t = document.getElementById('ctT').value.trim(), d = document.getElementById('ctD').value.trim(), k = null;
      if (!it && !file) { LL.toast('Choose a photo.', true); return; }
      if (t.length < 1) { LL.toast('Enter a title.', true); return; }
      if (kind === 'product') { k = LL.toKobo(document.getElementById('ctPr').value); if (!isFinite(k) || k < 0) { LL.toast('Enter a valid price.', true); return; } }
      LL.busy(document.getElementById('ctS'), 'Saving…', function () {
        var up = file ? catShrink(file).then(function (f) { return LLApi.provider.uploadCatalogImage(f); }) : Promise.resolve(null);
        return up.then(function (url) { return LLApi.provider.saveCatalogItem({ id: it && it.id, kind: kind, title: t, description: d, priceKobo: k, imageUrl: url, active: it ? it.active !== false : true }); });
      }).then(function () { done(it ? 'Catalogue updated.' : 'Added to your catalogue.'); }, fail);
    };
    if (it) {
      document.getElementById('ctTog').onclick = function () {
        LLApi.provider.saveCatalogItem({ id: it.id, kind: it.kind, title: it.title, description: it.description, priceKobo: it.price_kobo, active: it.active === false }).then(function () { done(it.active === false ? 'Item is now visible.' : 'Item hidden.'); }, fail);
      };
      document.getElementById('ctDel').onclick = function () {
        LL.confirm({ title: 'Delete this item?', confirmText: 'Delete', danger: true }).then(function (ok) { if (ok) LLApi.provider.deleteCatalogItem(it.id).then(function () { done('Item deleted.'); }, fail); });
      };
    }
  }
  /* One-time question for providers who have not chosen their account type yet. */
  function typePicker() {
    if (document.getElementById('ppType')) return;
    var el = document.createElement('div'); el.id = 'ppType'; el.className = 'pp-ov';
    el.innerHTML = '<div class="pp-sh" role="dialog" aria-modal="true"><div class="pp-sh-h"><b>How do you work?</b></div><p class="pp-ty-p">This decides what your Catalogue can show. You can change it later in Edit Profile.</p>' +
      '<button type="button" class="pp-ty" data-ty="service_only"><b>Service Provider only</b><span>Your catalogue shows photos of work you have done, with an optional description. No prices.</span></button>' +
      '<button type="button" class="pp-ty" data-ty="service_business"><b>Service Provider / Business Owner</b><span>Show your work and/or products you sell, with descriptions and prices. You can also link your online store.</span></button></div>';
    document.body.appendChild(el); document.body.classList.add('pp-lock');
    Array.prototype.forEach.call(el.querySelectorAll('[data-ty]'), function (b) {
      b.onclick = function () {
        var ty = b.getAttribute('data-ty'); b.disabled = true;
        LLApi.provider.setType(ty).then(function () { prov.provider_type = ty; el.remove(); document.body.classList.remove('pp-lock'); LL.toast('Saved. You can change this in Edit Profile.'); render(true); }, function (er) {
          b.disabled = false; LL.toast(/provider_type|schema cache/.test((er && er.message) || '') ? 'Account types are not set up yet. Run migration 011 in Supabase.' : ((er && er.message) || 'Could not save.'), true);
        });
      };
    });
  }
  var ppSvcs = [], ppCats = null;
  function ppSheet(id) {
    var sv0 = id ? ppSvcs.filter(function (x) { return x.id === id; })[0] : null;
    var old = document.getElementById('ppSheet'); if (old) old.remove();
    var el = document.createElement('div'); el.id = 'ppSheet'; el.className = 'pp-ov';
    function close() { el.remove(); document.body.classList.remove('pp-lock'); }
    function build(cats) {
      el.innerHTML = '<div class="pp-sh" role="dialog" aria-modal="true"><div class="pp-sh-h"><b>' + (sv0 ? 'Edit service' : 'Add a service') + '</b><button type="button" id="ppX" aria-label="Close">✕</button></div>' +
        '<form id="ppSf" novalidate><label class="lbl" for="ppT">Service title</label><input id="ppT" class="field" maxlength="120" value="' + LL.esc(sv0 ? sv0.title : '') + '">' +
        '<label class="lbl" for="ppP">Starting price (₦)</label><input id="ppP" class="field" inputmode="decimal" value="' + (sv0 ? (sv0.base_price_kobo / 100) : '') + '">' +
        '<label class="lbl" for="ppC">Category (optional)</label><select id="ppC" class="field"><option value="">None</option>' + cats.map(function (c) { return '<option value="' + LL.esc(c.id) + '"' + (sv0 && sv0.category_id === c.id ? ' selected' : '') + '>' + LL.esc(c.name) + '</option>'; }).join('') + '</select>' +
        '<label class="lbl" for="ppD">Short description (optional)</label><input id="ppD" class="field" maxlength="500" value="' + LL.esc(sv0 && sv0.description || '') + '">' +
        '<button id="ppSave" class="pp-save">' + (sv0 ? 'Save changes' : 'Add service') + '</button></form>' +
        (sv0 ? '<div class="pp-sh-f"><button type="button" id="ppTog">' + (sv0.active === false ? 'Show' : 'Hide') + '</button><button type="button" id="ppDel" class="pp-del">Delete</button></div>' : '') + '</div>';
      document.getElementById('ppX').onclick = close;
      function done(msg) { close(); LL.toast(msg); render(true); }
      function fail(er) { LL.toast((er && er.message) || 'Something went wrong.', true); }
      document.getElementById('ppSf').onsubmit = function (e) {
        e.preventDefault();
        var t = document.getElementById('ppT').value.trim(), k = LL.toKobo(document.getElementById('ppP').value);
        if (t.length < 2) { LL.toast('Enter a service title.', true); return; }
        if (!isFinite(k) || k < 0) { LL.toast('Enter a valid price.', true); return; }
        var o = { title: t, priceKobo: k, categoryId: document.getElementById('ppC').value || null, description: document.getElementById('ppD').value.trim() };
        if (sv0) { o.id = sv0.id; o.active = sv0.active !== false; }
        LL.busy(document.getElementById('ppSave'), 'Saving…', function () { return LLApi.provider.saveService(o); }).then(function () { done(sv0 ? 'Service updated.' : 'Service added.'); }, fail);
      };
      if (sv0) {
        document.getElementById('ppTog').onclick = function () {
          LLApi.provider.saveService({ id: sv0.id, title: sv0.title, description: sv0.description, priceKobo: sv0.base_price_kobo, categoryId: sv0.category_id, active: sv0.active === false }).then(function () { done(sv0.active === false ? 'Service is now visible.' : 'Service hidden.'); }, fail);
        };
        document.getElementById('ppDel').onclick = function () {
          LL.confirm({ title: 'Delete this service?', confirmText: 'Delete', danger: true }).then(function (ok) { if (ok) LLApi.provider.deleteService(sv0.id).then(function () { done('Service deleted.'); }, fail); });
        };
      }
    }
    el.onclick = function (e) { if (e.target === el) close(); };
    document.body.appendChild(el); document.body.classList.add('pp-lock');
    if (ppCats) build(ppCats); else { build([]); LLApi.catalog.categories().then(function (c) { ppCats = c || []; if (document.getElementById('ppSheet') === el) build(ppCats); }, function () {}); }
  }
  function ppShrink(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var W = Math.min(1280, img.width), H = Math.round(W * 0.5), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          var r = Math.max(W / img.width, H / img.height), sw = W / r, sh = H / r;
          cv.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
          cv.toBlob(function (b) { URL.revokeObjectURL(url); resolve(b ? new File([b], 'banner.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.84);
        } catch (e) { URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function bindProfile() {
    var cb = document.getElementById('ppCoverBtn'); if (!cb) return;
    var ci = document.getElementById('ppCoverIn'), ab = document.getElementById('ppAvBtn'), ai = document.getElementById('ppAvIn');
    cb.onclick = function () { ci.click(); };
    ab.onclick = function () { ai.click(); };
    ci.onchange = function () {
      var f = ci.files[0]; if (!f) return;
      LL.toast('Uploading cover…');
      ppShrink(f).then(function (small) { return LLApi.uploadBanner(small); }).then(function (url) { me.banner_url = url; LL.toast('Cover updated.'); render(true); }).catch(function (e) {
        var m = (e && e.message) || '';
        LL.toast(/banner_url/.test(m) ? 'Banner is not set up yet. Run migration 009 in Supabase.' : (m || 'Could not upload the cover.'), true);
      });
    };
    ai.onchange = function () {
      var f = ai.files[0]; if (!f) return;
      LL.toast('Uploading photo…');
      LLApi.uploadAvatar(f).then(function (url) { me.avatar_url = url; LL.toast('Photo updated.'); render(true); }, function (e) { LL.toast(e.message || 'Could not upload the photo.', true); });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-pp-th]'), function (b) { b.onclick = function () { if (window.LLApp) LLApp.setTheme(b.getAttribute('data-pp-th')); }; });
    var so = document.querySelector('[data-pp-out]'); if (so) so.onclick = function () { if (LL.signOut) LL.signOut(); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-svc]'), function (b) { b.onclick = function () { ppSheet(b.getAttribute('data-svc')); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cat]'), function (b) { b.onclick = function () { catSheet(b.getAttribute('data-cat')); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pp-edit]'), function (b) {
      b.onclick = function () {
        var f = document.getElementById('ppForm'); if (!f) return;
        f.classList.add('open');
        var t = document.getElementById(b.getAttribute('data-pp-edit'));
        f.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (t) setTimeout(function () { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }, 350);
      };
    });
  }
  function pvHeader(p, profile) {
    var hd = document.querySelector('header'); if (!hd || hd.querySelector('.pv-brand')) return;
    var left = hd.children[0], right = hd.children[1];
    var b = document.createElement('span'); b.className = 'pv-brand'; b.innerHTML = '<b>LifeLink</b><i>Provider</i>';
    if (left && left.children[0]) left.insertBefore(b, left.children[1] || null);
    var m = document.createElement('a'); m.className = 'pv-me'; m.href = '?section=profile'; m.setAttribute('aria-label', 'Profile');
    m.innerHTML = profile && profile.avatar_url ? '<img src="' + LL.esc(profile.avatar_url) + '" alt="">' : '<span>' + LL.esc(LL.initials(profile && profile.full_name)) + '</span>';
    if (right) right.appendChild(m);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-pv-pro]');
    if (t && typeof LL.toast === 'function') LL.toast('Pro plans are coming soon.');
  });
  /* Instant paint: the last-built HTML of list-style sections is shown at once (stale-while-revalidate), then replaced
     by the fresh build only if it differs. Cleared on sign-out by LL.cache.clear(). Forms, wallet and open chats are always built fresh. */
  var shown = null, mobileNow = function () { return window.matchMedia && window.matchMedia('(max-width: 767.98px)').matches; };
  function ckey(s2) {
    if (!me) return null;
    var ok = s2 === 'overview' || s2 === 'bookings' || s2 === 'quotes' || s2 === 'reviews' || (s2 === 'messages' && !LL.q('c') && mobileNow());
    return ok ? 'prov:' + me.id + ':' + s2 + ':' + (s2 === 'messages' ? (LL.q('cu') || '') : '') + (mobileNow() ? ':m' : ':d') : null;
  }
  function bindAll() { bindBookingActions(); bindBkFilter(); bindMsgSearch(); bindProfile(); if (bindProfileForm) bindProfileForm(); }
  function render(quiet) {
    document.body.classList.toggle('pv-home', section === 'overview');
    document.body.classList.toggle('pv-bk', section === 'bookings');
    document.body.classList.toggle('pv-msg', section === 'messages');
    document.body.classList.toggle('pv-msg-list', section === 'messages' && !LL.q('c'));
    document.body.classList.toggle('pv-pf', section === 'profile');
    var ck = ckey(section), cached = (!quiet && ck) ? LL.cache.get(ck) : null;
    if (!quiet) { app.innerHTML = cached != null ? cached : LL.loading(TITLES[section].toLowerCase()); shown = cached; if (cached != null) bindAll(); }
    return S[section]().then(function (h) {
      if (ck) LL.cache.set(ck, h);
      if (h !== shown) { app.innerHTML = h; shown = h; }
      bindAll(); syncSharing();
    }).catch(function (e) { if (!quiet && cached == null) app.innerHTML = LL.error(e.message); });
  }
  /* Quietly build the other main sections once this one has settled, so tapping them opens instantly. */
  function warmSections() {
    if (document.hidden || navigator.onLine === false || !me) return;
    var last = +(LL.cache.get('warm:' + me.id) || 0);
    if (Date.now() - last < 60000) return;
    LL.cache.set('warm:' + me.id, String(Date.now()));
    var todo = ['overview', 'bookings', 'quotes', 'reviews'].filter(function (x) { return x !== section; });
    (function next() {
      var x = todo.shift();
      if (!x) {
        Promise.all([LLApi.provider.requests(), LLApi.provider.myQuotes(), LLApi.names().catch(function () { return {}; })]).then(function (r) { LL.cache.set('prov:req:' + me.id, JSON.stringify(r)); }, function () {});
        return;
      }
      var k = ckey(x);
      S[x]().then(function (h) { if (k) LL.cache.set(k, h); }, function () {}).then(function () { setTimeout(next, 250); });
    })();
  }
  LL.ready(function (profile) {
    me = profile;
    if (!S[section]) section = 'overview';
    LL.initSidebar(profile, section);
    LLApi.provider.me().then(function (p) {
      if (!p) { LL.go('provider-onboarding.html'); return; }
      prov = p;
      if (p.provider_type === null) setTimeout(typePicker, 400);
      LL.setHeader(TITLES[section], p.business_name);
      pvHeader(p, profile);
      LLApi.messages.unreadTotal(profile.id).then(function (n) { LL.setBadge('navMsgBadge', n); }, function () {});
      render();
      (window.requestIdleCallback ? requestIdleCallback : function (f) { setTimeout(f, 1200); })(function () { setTimeout(warmSections, 800); });
      if (section !== 'messages' && section !== 'profile' && section !== 'services' && section !== 'wallet') LL.onLive(function () { LL.quiet(app, function () { return render(true); }); });
      setInterval(syncSharing, 30000);
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  });
})();
