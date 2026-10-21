/* dashboard.html — customer dashboard. Sections via ?section=. All data from Supabase through LLApi. */
(function () {
  'use strict';
  var app = document.getElementById('app'), me = null, section = LL.q('section') || 'overview', chat = null;
  var TITLES = { overview: 'Overview', requests: 'My requests', bookings: 'My bookings', messages: 'Messages', wallet: 'Wallet', reviews: 'My reviews', notifications: 'Notifications' };

  function card(inner) { return '<section class="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-3">' + inner + '</section>'; }
  function stat(label, n, href) { return '<a href="' + href + '" class="bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 transition block"><p class="text-3xl font-extrabold text-slate-900">' + n + '</p><p class="text-xs font-extrabold uppercase tracking-wider text-slate-400 mt-1">' + label + '</p></a>'; }
  function reqRow(r) {
    return '<a href="compare-quotes.html?request=' + LL.esc(r.id) + '" class="block bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-300 transition"><div class="flex justify-between items-center gap-3"><p class="font-extrabold text-slate-900 truncate">' + LL.esc(r.category_text || 'Service request') + '</p>' + LL.badge(r.status) + '</div><p class="text-sm text-slate-600 line-clamp-1 mt-0.5">' + LL.esc(r.description) + '</p><p class="text-xs font-semibold text-slate-400 mt-1">' + LL.esc(r.location_area) + ' · ' + LL.esc(LL.ago(r.created_at)) + '</p></a>';
  }
  function bookRow(b, provs) {
    var p = provs[b.provider_id] || {};
    return '<a href="booking.html?id=' + LL.esc(b.id) + '" class="block bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-300 transition"><div class="flex justify-between items-center gap-3"><div class="flex items-center gap-3 min-w-0">' + LL.avatar(p.business_name, p.avatar_url, 'w-10 h-10') + '<p class="font-extrabold text-slate-900 truncate">' + LL.esc(p.business_name || 'Provider') + '</p></div>' + LL.badge(b.status) + '</div>' +
      '<p class="text-sm text-slate-600 mt-2">' + LL.naira(b.price_kobo) + (b.scheduled_for ? ' · ' + LL.esc(LL.dateTime(b.scheduled_for)) : ' · no time set') + '</p></a>';
  }
  function provMap() { return LLApi.catalog.providers().then(function (rows) { var m = {}; rows.forEach(function (p) { m[p.provider_id] = p; }); return m; }).catch(function () { return {}; }); }

  var S = {
    overview: function () {
      return Promise.all([LLApi.customer.requests(), LLApi.customer.bookings(), LLApi.messages.unreadTotal(me.id).catch(function () { return 0; }), provMap()]).then(function (r) {
        var reqs = r[0], bks = r[1];
        var openReq = reqs.filter(function (x) { return x.status === 'open' || x.status === 'quoted'; }).length;
        var active = bks.filter(function (b) { return ['confirmed', 'provider_on_the_way', 'arrived', 'in_progress'].indexOf(b.status) >= 0; }).length;
        var h = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">' + stat('Open requests', openReq, '?section=requests') + stat('Active bookings', active, '?section=bookings') + stat('Unread messages', r[2], '?section=messages') + stat('Completed jobs', bks.filter(function (b) { return b.status === 'completed'; }).length, '?section=bookings') + '</div>';
        var toReview = bks.filter(function (b) { return b.status === 'completed' && !b.reviewed; });
        if (toReview.length) h += '<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 flex justify-between items-center gap-3"><span>' + toReview.length + ' completed job' + (toReview.length > 1 ? 's' : '') + ' waiting for your review.</span><a class="font-extrabold underline" href="review.html?booking=' + LL.esc(toReview[0].id) + '">Review now</a></div>';
        h += card('<div class="flex justify-between items-center"><h2 class="font-extrabold">Recent requests</h2><a href="request.html" class="text-xs font-extrabold bg-emerald-600 text-white px-4 py-2 rounded-xl">New request</a></div>' + (reqs.length ? '<div class="space-y-2">' + reqs.slice(0, 4).map(reqRow).join('') + '</div>' : LL.empty('No requests yet', 'Describe a job and get quotes from verified providers.', 'request.html', 'Request a service')));
        if (bks.length) h += card('<h2 class="font-extrabold">Recent bookings</h2><div class="space-y-2">' + bks.slice(0, 3).map(function (b) { return bookRow(b, r[3]); }).join('') + '</div>');
        return h;
      });
    },
    requests: function () {
      return LLApi.customer.requests().then(function (rows) {
        return '<div class="flex justify-end"><a href="request.html" class="text-sm font-extrabold bg-emerald-600 text-white px-5 py-2.5 rounded-xl">New request</a></div>' +
          (rows.length ? '<div class="space-y-3">' + rows.map(reqRow).join('') + '</div>' : LL.empty('No requests yet', 'Describe a job and get quotes from verified providers.', 'request.html', 'Request a service'));
      });
    },
    bookings: function () {
      return Promise.all([LLApi.customer.bookings(), provMap()]).then(function (r) {
        return r[0].length ? '<div class="space-y-3">' + r[0].map(function (b) { return bookRow(b, r[1]); }).join('') + '</div>' : LL.empty('No bookings yet', 'Accept a provider\'s quote to create a booking.', 'request.html', 'Request a service');
      });
    },
    messages: function () {
      return Promise.all([LLApi.messages.conversations(), provMap()]).then(function (r) {
        var convs = r[0], provs = r[1];
        if (!convs.length) return LL.empty('No conversations yet', 'Message a provider from the quotes on your request.');
        return LLApi.messages.summaries(convs, me.id).then(function (sum) {
          var sel = LL.q('c') || convs[0].id;
          var list = convs.map(function (c) {
            var p = provs[c.provider_id] || {}, s = sum[c.id] || {};
            return '<a href="?section=messages&c=' + LL.esc(c.id) + '" class="flex items-center gap-3 p-3 rounded-2xl border ' + (c.id === sel ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 bg-white') + '">' + LL.avatar(p.business_name, p.avatar_url, 'w-10 h-10') +
              '<div class="min-w-0 flex-1"><p class="font-extrabold text-sm truncate">' + LL.esc(p.business_name || 'Provider') + '</p><p class="text-xs text-slate-500 truncate">' + LL.esc(s.last ? s.last.body : 'No messages yet') + '</p></div>' + (s.unread ? '<span class="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">' + s.unread + '</span>' : '') + '</a>';
          }).join('');
          var cur = convs.filter(function (c) { return c.id === sel; })[0] || convs[0];
          setTimeout(function () { var el = document.getElementById('chatMount'); if (el) chat = LLChat.mount(el, cur.id); }, 0);
          return '<div class="grid lg:grid-cols-3 gap-4"><div class="space-y-2">' + list + '</div><div class="lg:col-span-2">' + card('<div class="flex justify-between"><h2 class="font-extrabold">' + LL.esc((provs[cur.provider_id] || {}).business_name || 'Provider') + '</h2><a class="text-xs font-extrabold text-emerald-700" href="compare-quotes.html?request=' + LL.esc(cur.request_id) + '">View request</a></div><div id="chatMount"></div>') + '</div></div>';
        });
      });
    },
    wallet: function () { setTimeout(function () { LLWallet.mount(document.getElementById('walletMount'), { role: 'customer' }); }, 0); return Promise.resolve('<div id="walletMount"></div>'); },
    reviews: function () {
      return Promise.all([LLApi.customer.myReviews(), provMap()]).then(function (r) {
        return r[0].length ? '<div class="space-y-3">' + r[0].map(function (v) { var p = r[1][v.provider_id] || {}; return card('<div class="flex justify-between"><p class="font-extrabold">' + LL.esc(p.business_name || 'Provider') + '</p><span class="text-amber-500 font-extrabold">' + '★'.repeat(v.rating) + '</span></div>' + (v.comment ? '<p class="text-sm text-slate-700">' + LL.esc(v.comment) + '</p>' : '') + '<p class="text-xs text-slate-400 font-semibold">' + LL.esc(LL.date(v.created_at)) + '</p>'); }).join('') + '</div>' : LL.empty('No reviews yet', 'After a job is completed you can rate your provider.');
      });
    },
    notifications: function () {
      return LLApi.notifications.list(50).then(function (rows) {
        return (rows.length ? '<div class="flex justify-end"><button id="markAll" class="text-xs font-extrabold text-emerald-700">Mark all read</button></div><div class="space-y-2">' + rows.map(function (n) {
          return '<a href="' + LL.esc(n.link || '#') + '" class="block bg-white border ' + (n.read_at ? 'border-slate-200' : 'border-emerald-300') + ' rounded-2xl p-4"><p class="font-extrabold text-sm">' + LL.esc(n.title) + '</p>' + (n.body ? '<p class="text-xs text-slate-500">' + LL.esc(n.body) + '</p>' : '') + '<p class="text-[10px] font-bold text-slate-400 mt-1">' + LL.esc(LL.ago(n.created_at)) + '</p></a>';
        }).join('') + '</div>' : LL.empty('No notifications yet'));
      });
    }
  };

  LL.ready(function (profile) {
    me = profile;
    if (!S[section]) section = 'overview';
    LL.initSidebar(profile, section);
    LL.setHeader(TITLES[section], 'Hi ' + (String(profile.full_name || '').split(' ')[0] || 'there'));
    document.getElementById('headerActions').innerHTML = '<a href="request.html" class="hidden sm:inline-flex text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl">New request</a>';
    LLApi.messages.unreadTotal(profile.id).then(function (n) { LL.setBadge('navMsgBadge', n); }, function () {});
    function paint(quiet) {
      if (!quiet) app.innerHTML = LL.loading(TITLES[section].toLowerCase());
      return S[section]().then(function (h) {
        app.innerHTML = h;
        var m = document.getElementById('markAll'); if (m) m.onclick = function () { LLApi.notifications.markAllRead().then(function () { location.reload(); }); };
      }).catch(function (e) { if (!quiet) app.innerHTML = LL.error(e.message); });
    }
    paint(false);
    if (section !== 'messages' && section !== 'wallet') LL.onLive(function () { LL.quiet(app, function () { return paint(true); }); });
  });
})();
