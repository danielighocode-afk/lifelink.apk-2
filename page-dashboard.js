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


  /* ---- Messages (mobile): same layout as the provider side. One row per provider -> that provider's chats -> one open chat. ---- */
  function cmIc(p, n) { n = n || 22; return '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var CM = {
    search: cmIc('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    edit: cmIc('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    back: cmIc('<path d="M15 6l-6 6 6 6"/>'),
    pin: cmIc('<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', 15),
    ticks: cmIc('<path d="M2 12.5l4 4L14 8M10 15.5l1.5 1.5L21 8"/>', 20)
  };
  function cmTime(ts) {
    if (!ts) return '';
    var d = new Date(ts), n = new Date(), day = 86400000, t0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    if (d.getTime() >= t0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.getTime() >= t0 - day) return 'Yesterday';
    if (d.getTime() >= t0 - 6 * day) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function cmAvatar(name, url, id) {
    var k = 0, str = String(id || name || ''); for (var i = 0; i < str.length; i++) k += str.charCodeAt(i);
    return '<span class="pm-av pm-c' + (k % 3) + '">' + (url ? '<img src="' + LL.esc(url) + '" alt="">' : LL.esc(LL.initials(name))) + '</span>';
  }
  function cmMobile(convs, provs, sum) {
    var sel = LL.q('c'), pvId = LL.q('pv');
    return LLApi.customer.requests().catch(function () { return []; }).then(function (reqs) {
      var rm = {}; (reqs || []).forEach(function (x) { rm[x.id] = x; });
      var nameOf = function (c) { return (provs[c.provider_id] || {}).business_name || 'Provider'; };
      var avOf = function (c) { var p = provs[c.provider_id] || {}; return cmAvatar(nameOf(c), p.avatar_url, c.provider_id); };
      var ctx = function (c) { if (!c.request_id) return c.item_title ? 'About: ' + c.item_title : ''; var x = rm[c.request_id] || {}; return [x.category_text, x.location_area].filter(Boolean).join(' · '); };
      var tOf = function (c) { var s = sum[c.id] || {}; return new Date(s.last ? s.last.created_at : c.created_at).getTime() || 0; };
      var lastTxt = function (c) { var l = (sum[c.id] || {}).last; return l ? (l.sender_id === me.id ? 'You: ' : '') + l.body : 'No messages yet'; };
      var cur = sel ? convs.filter(function (c) { return c.id === sel; })[0] : null;
      /* 3) one open conversation: read it and reply */
      if (cur) {
        setTimeout(function () { var el = document.getElementById('chatMount'); if (el) chat = LLChat.mount(el, cur.id); }, 0);
        return '<div class="pm-chat"><div class="pm-chat-h"><a href="?section=messages&pv=' + LL.esc(cur.provider_id) + '" class="pm-back" aria-label="Back to this provider\'s chats">' + CM.back + '</a>' + avOf(cur) +
          '<div class="pm-chat-t"><b>' + LL.esc(nameOf(cur)) + '</b><em>' + LL.esc(ctx(cur) || 'Provider') + '</em></div>' + (cur.request_id ? '<a class="pm-view" href="compare-quotes.html?request=' + LL.esc(cur.request_id) + '">View request</a>' : '') + '</div><div class="pm-chat-b"><div id="chatMount"></div></div></div>';
      }
      /* group every conversation under its provider */
      var g = {}, order = [];
      convs.forEach(function (c) {
        var o = g[c.provider_id]; if (!o) { o = g[c.provider_id] = { id: c.provider_id, convs: [], unread: 0, t: -1, top: c }; order.push(o); }
        o.convs.push(c); o.unread += (sum[c.id] || {}).unread || 0;
        if (tOf(c) > o.t) { o.t = tOf(c); o.top = c; }
      });
      order.sort(function (x, y) { return y.t - x.t; });
      /* 2) one provider: all of your chats with them */
      var grp = pvId ? g[pvId] : null;
      if (grp) {
        grp.convs.sort(function (x, y) { return tOf(y) - tOf(x); });
        return '<div class="pm"><div class="pm-chat pm-cu"><div class="pm-chat-h"><a href="?section=messages" class="pm-back" aria-label="Back to messages">' + CM.back + '</a>' + avOf(grp.top) +
          '<div class="pm-chat-t"><b>' + LL.esc(nameOf(grp.top)) + '</b><em>' + grp.convs.length + ' chat' + (grp.convs.length === 1 ? '' : 's') + (grp.unread ? ' · ' + grp.unread + ' unread' : '') + '</em></div></div></div>' +
          '<div class="pm-list">' + grp.convs.map(function (c) {
            var s = sum[c.id] || {}, l = s.last, mine = l && l.sender_id === me.id;
            var right = s.unread ? '<span class="pm-badge">' + s.unread + '</span>' : (mine ? '<span class="pm-tick' + (l.read_at ? ' read' : '') + '">' + CM.ticks + '</span>' : '');
            return '<a href="?section=messages&c=' + LL.esc(c.id) + '" class="pm-card' + (s.unread ? ' un' : '') + '"><div class="pm-m"><div class="pm-top"><b>' + LL.esc(ctx(c) || 'Chat') + '</b><time>' + LL.esc(cmTime(l ? l.created_at : c.created_at)) + '</time></div>' +
              '<div class="pm-mid"><span class="pm-last">' + LL.esc(lastTxt(c)) + '</span>' + right + '</div></div></a>';
          }).join('') + '</div></div>';
      }
      /* 1) one row per provider */
      return '<div class="pm"><div class="pm-head"><div><h2>Messages</h2><p>Recent Chats</p></div><div class="pm-tools"><button type="button" data-pm-search aria-label="Search chats">' + CM.search + '</button><a href="request.html" class="pm-new" aria-label="Start a new request">' + CM.edit + '</a></div></div>' +
        '<input type="search" class="pm-q" data-pm-q placeholder="Search chats" hidden>' +
        '<div class="pm-list">' + order.map(function (o) {
          var c = o.top, nmv = nameOf(c), n = o.convs.length;
          var right = o.unread ? '<span class="pm-badge">' + o.unread + '</span>' : '';
          var all = o.convs.map(function (x) { return ctx(x) + ' ' + ((sum[x.id] || {}).last ? sum[x.id].last.body : ''); }).join(' ');
          return '<a href="?section=messages&pv=' + LL.esc(o.id) + '" class="pm-card' + (o.unread ? ' un' : '') + '" data-q="' + LL.esc((nmv + ' ' + all).toLowerCase()) + '">' + avOf(c) +
            '<div class="pm-m"><div class="pm-top"><b>' + LL.esc(nmv) + '</b><time>' + LL.esc(cmTime(o.t ? new Date(o.t).toISOString() : c.created_at)) + '</time></div><div class="pm-mid"><span class="pm-last">' + LL.esc(lastTxt(c)) + '</span>' + right + '</div>' +
            '<p class="pm-ctx">' + CM.pin + '<span>' + n + ' chat' + (n === 1 ? '' : 's') + '</span></p></div></a>';
        }).join('') + '</div><p class="pv-none" data-pm-empty hidden>No chats match your search.</p></div>';
    });
  }
  function bindMsgSearch() {
    var inp = app.querySelector('[data-pm-q]'), btn = app.querySelector('[data-pm-search]'); if (!inp || !btn) return;
    var cards = app.querySelectorAll('.pm-card'), empty = app.querySelector('[data-pm-empty]');
    function apply() { var n = 0, q = inp.value.trim().toLowerCase(); cards.forEach(function (c) { var ok = !q || (c.getAttribute('data-q') || '').indexOf(q) >= 0; c.hidden = !ok; if (ok) n++; }); if (empty) empty.hidden = n > 0; }
    inp.oninput = apply;
    btn.onclick = function () { inp.hidden = !inp.hidden; if (!inp.hidden) inp.focus(); else { inp.value = ''; apply(); } };
  }

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
        return '<div class="flex items-center justify-between gap-3"><a href="?section=bookings" class="ll-backlnk">&larr; Bookings</a><a href="request.html" class="text-sm font-extrabold bg-emerald-600 text-white px-5 py-2.5 rounded-xl">New request</a></div>' +
          (rows.length ? '<div class="space-y-3">' + rows.map(reqRow).join('') + '</div>' : LL.empty('No requests yet', 'Describe a job and get quotes from verified providers.', 'request.html', 'Request a service'));
      });
    },
    bookings: function () {
      return Promise.all([LLApi.customer.bookings(), provMap(), LLApi.customer.requests().catch(function () { return []; })]).then(function (r) {
        var nOpen = r[2].filter(function (x) { return x.status === 'open' || x.status === 'quoted'; }).length;
        var bar = '<a href="?section=requests" class="ll-reqbar"><span class="ll-reqbar-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg></span><span class="ll-reqbar-t"><b>My requests</b><em>' + (nOpen ? nOpen + ' open · view quotes' : 'View your requests and quotes') + '</em></span><svg class="ll-reqbar-a" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></a>';
        return bar + (r[0].length ? '<div class="space-y-3">' + r[0].map(function (b) { return bookRow(b, r[1]); }).join('') + '</div>' : LL.empty('No bookings yet', 'Accept a provider\'s quote to create a booking.', 'request.html', 'Request a service'));
      });
    },
    messages: function () {
      return Promise.all([LLApi.messages.conversations(), provMap()]).then(function (r) {
        var convs = r[0], provs = r[1];
        if (!convs.length) return LL.empty('No conversations yet', 'Message a provider from the quotes on your request.');
        var mobile = window.matchMedia && window.matchMedia('(max-width: 767.98px)').matches;
        return LLApi.messages.summaries(convs, me.id).then(function (sum) {
          if (mobile) return cmMobile(convs, provs, sum);
          var sel = LL.q('c') || convs[0].id;
          var list = convs.map(function (c) {
            var p = provs[c.provider_id] || {}, s = sum[c.id] || {};
            return '<a href="?section=messages&c=' + LL.esc(c.id) + '" class="flex items-center gap-3 p-3 rounded-2xl border ' + (c.id === sel ? 'border-emerald-400 bg-emerald-50/50' : 'border-slate-200 bg-white') + '">' + LL.avatar(p.business_name, p.avatar_url, 'w-10 h-10') +
              '<div class="min-w-0 flex-1"><p class="font-extrabold text-sm truncate">' + LL.esc(p.business_name || 'Provider') + '</p><p class="text-xs text-slate-500 truncate">' + LL.esc(s.last ? s.last.body : 'No messages yet') + '</p></div>' + (s.unread ? '<span class="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">' + s.unread + '</span>' : '') + '</a>';
          }).join('');
          var cur = convs.filter(function (c) { return c.id === sel; })[0] || convs[0];
          setTimeout(function () { var el = document.getElementById('chatMount'); if (el) chat = LLChat.mount(el, cur.id); }, 0);
          return '<div class="grid lg:grid-cols-3 gap-4"><div class="space-y-2">' + list + '</div><div class="lg:col-span-2">' + card('<div class="flex justify-between"><h2 class="font-extrabold">' + LL.esc((provs[cur.provider_id] || {}).business_name || 'Provider') + '</h2>' + (cur.request_id ? '<a class="text-xs font-extrabold text-emerald-700" href="compare-quotes.html?request=' + LL.esc(cur.request_id) + '">View request</a>' : (cur.item_title ? '<span class="text-xs font-semibold text-slate-500 truncate">About: ' + LL.esc(cur.item_title) + '</span>' : '')) + '</div><div id="chatMount"></div>') + '</div></div>';
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
    if (profile && profile.role === 'customer' && LLApi.messages && LLApi.messages.sweepRefunds) LLApi.messages.sweepRefunds();   // returns ₦50 for product chats left unanswered 24h
    if (!S[section]) section = 'overview';
    LL.initSidebar(profile, section);
    LL.setHeader(TITLES[section], 'Hi ' + (String(profile.full_name || '').split(' ')[0] || 'there'));
    document.getElementById('headerActions').innerHTML = '<a href="request.html" class="hidden sm:inline-flex text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl">New request</a>';
    LLApi.messages.unreadTotal(profile.id).then(function (n) { LL.setBadge('navMsgBadge', n); }, function () {});
    // Sections whose HTML is plain links can be shown instantly from the last visit, then refreshed behind it.
    // (messages and wallet mount live widgets, so they are always built fresh.)
    function cacheable(s) { return s !== 'messages' && s !== 'wallet'; }
    function ckey(s) { return 'cust:' + profile.id + ':' + s; }
    var shown = null;
    function paint(quiet) {
      document.body.classList.toggle('pv-msg', section === 'messages');
      document.body.classList.toggle('pv-msg-list', section === 'messages' && !LL.q('c'));
      var cached = (!quiet && cacheable(section)) ? LL.cache.get(ckey(section)) : null;
      if (!quiet) { app.innerHTML = cached != null ? cached : LL.loading(TITLES[section].toLowerCase()); shown = cached; }
      return S[section]().then(function (h) {
        if (cacheable(section)) LL.cache.set(ckey(section), h);
        if (h !== shown) { app.innerHTML = h; shown = h; }
        bindMsgSearch();
        var m = document.getElementById('markAll'); if (m) m.onclick = function () { LLApi.notifications.markAllRead().then(function () { location.reload(); }); };
      }).catch(function (e) { if (!quiet && cached == null) app.innerHTML = LL.error(e.message); });
    }
    paint(false);
    // Preload the other sections quietly once this one has settled, so tapping them opens instantly.
    function warm() {
      if (document.hidden || (navigator.onLine === false)) return;
      var last = +(LL.cache.get('warm:' + profile.id) || 0);
      if (Date.now() - last < 60000) return;
      LL.cache.set('warm:' + profile.id, String(Date.now()));
      var todo = ['overview', 'bookings', 'requests', 'reviews', 'notifications'].filter(function (s) { return s !== section && S[s]; });
      (function next() {
        var s = todo.shift(); if (!s) return;
        S[s]().then(function (h) { LL.cache.set(ckey(s), h); }, function () {}).then(function () { setTimeout(next, 250); });
      })();
    }
    (window.requestIdleCallback ? requestIdleCallback : function (f) { setTimeout(f, 1200); })(function () { setTimeout(warm, 800); });
    if (section !== 'messages' && section !== 'wallet') LL.onLive(function () { LL.quiet(app, function () { return paint(true); }); });
  });
})();
