/* tracking.html (?id=<booking>) — live map for the two people on a booking.
   Reads the job pin and the latest shared points (RLS: only the two parties and admins). Updates via Supabase Realtime,
   with a 10 s polling fallback. Sharing a location never charges or penalises anyone by itself. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var id = LL.q('id');
  var me = null, ctx = null, shareHandle = null, unsub = null, poll = null;
  var mapObj = null, markers = {}, circles = [], routeLine = null, addrDone = false, myDot = null, accRings = {};

  function dist(a, b, c, d) {
    var R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLng = (d - b) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function fmt(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km'; }
  function age(iso) { return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); }
  var ACTIVE = ['provider_on_the_way', 'arrived'];

  var I_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  var I_TOOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 00-5 5L3 18l3 3 6.7-6.7a4 4 0 005-5l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>';
  var I_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';
  var I_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/></svg>';
  var I_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>';
  var I_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
  var I_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-2px;display:inline-block"><path d="M5 12l5 5 9-10"/></svg>';
  var info = { prov: null, req: null }, chatH = null, sheetEl = null;

  function shell(b) {
    var isProv = me.id === b.provider_id;
    var title = isProv ? 'Route to the customer' : 'Tracking Your Provider';
    app.innerHTML =
      '<div class="tk-bar"><button type="button" class="tk-back" id="tkBack" aria-label="Back">' + I_BACK + '</button><h1>' + title + '</h1></div>' +
      '<div class="tk-map">' +
        '<div id="trkMap"></div>' +
        '<div class="tk-bub" id="tkBub">' + I_TOOL + '<div style="min-width:0"><b id="tkBubN">' + (isProv ? 'Customer' : 'Your provider') + '</b><small id="tkBubS">Loading…</small></div></div>' +
        '<button id="trkMe" type="button" class="llm-fab" style="left:14px;bottom:60px" aria-label="Show my location" title="My location"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg></button>' +
        '<button id="trkFit" type="button" class="llm-fab" style="right:14px;bottom:60px" aria-label="Show both locations" title="Show both"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' +
      '</div>' +
      '<section class="tk-card">' +
        '<div class="tk-pv"><div class="av" id="tkAv">' + (isProv ? 'C' : '·') + '</div><div style="min-width:0;flex:1"><h2 id="tkName">' + (isProv ? 'Your customer' : 'Your provider') + '</h2><p class="st" id="trkMsg"></p><p class="rt" id="tkRate"></p></div></div>' +
        '<p class="tk-sub" id="trkSub"></p>' +
        '<p class="tk-addr hidden" id="trkAddr" style="display:none"></p>' +
        (isProv ? '' : '<div class="tk-act" id="tkAct"><button type="button" class="tk-msgb" id="tkMsgBtn">' + I_CHAT + 'Message</button><button type="button" class="tk-canb" id="tkCanBtn" style="display:none">' + I_X + 'Cancel</button></div>') +
      '</section>' +
      '<a class="tk-sum" id="tkSum" href="' + (isProv ? 'provider-dashboard.html?section=bookings' : 'booking.html?id=' + LL.esc(b.id)) + '"><div><b>Booking #' + LL.esc(String(b.id).slice(0, 8).toUpperCase()) + '</b><small id="tkSumS">' + LL.naira(b.price_kobo) + '</small></div>' + I_NEXT + '</a>' +
      '<section id="trkShare" class="tk-card tk-more" style="margin-top:14px;box-shadow:none;animation:none"></section>' +
      '<p class="tk-sub" style="text-align:center;margin:14px 20px 0">Only you and the other person on this booking can see locations. Shared points are deleted when the job starts or the booking ends.</p>';
    return LLMap.create(document.getElementById('trkMap'), { zoom: 15 });
  }

  function setMsg(t, sub) {
    document.getElementById('trkMsg').textContent = t; document.getElementById('trkSub').textContent = sub || '';
    var bs = document.getElementById('tkBubS'); if (bs) bs.textContent = t;
  }

  /* provider / request details for the card (display only) */
  function fillInfo(b) {
    var isProv = me.id === b.provider_id;
    function stat() { var el = document.getElementById('tkSumS'); if (el) el.textContent = (info.req && info.req.category_text ? info.req.category_text + ' · ' : '') + LL.naira(b.price_kobo); }
    if (info.req) {
      stat();
      var ad = document.getElementById('trkAddr');
      if (ad && !ad.getAttribute('data-set') && info.req.location_area) { ad.innerHTML = I_PIN + '<span>' + LL.esc(info.req.location_area) + '</span>'; ad.style.display = 'flex'; ad.classList.remove('hidden'); }
    }
    if (isProv || !info.prov) return;
    var p = info.prov;
    document.getElementById('tkName').innerHTML = LL.esc(p.business_name) + ' ' + '<span style="color:var(--ll-primary)">' + I_OK + '</span>';
    document.getElementById('tkAv').innerHTML = p.avatar_url ? '<img src="' + LL.esc(p.avatar_url) + '" alt="">' : LL.esc(LL.initials(p.business_name));
    document.getElementById('tkRate').innerHTML = p.rating_avg != null ? '<span style="color:#f5a30a">★</span> ' + Number(p.rating_avg).toFixed(1) + ' (' + (p.review_count || 0) + ')' : (p.category ? LL.esc(p.category) : '');
    var bn = document.getElementById('tkBubN'); if (bn) bn.textContent = p.business_name;
  }
  function loadInfo(b) {
    var isProv = me.id === b.provider_id;
    return Promise.all([
      isProv ? Promise.resolve(null) : LLApi.catalog.provider(b.provider_id).catch(function () { return null; }),
      LLApi.customer && LLApi.customer.request ? LLApi.customer.request(b.request_id).catch(function () { return null; }) : Promise.resolve(null)
    ]).then(function (r) { info.prov = r[0]; info.req = r[1]; fillInfo(b); });
  }
  function openChat(b) {
    LLApi.messages.open(b.request_id, b.provider_id).then(function (conv) {
      var cid = conv && conv.id ? conv.id : conv;
      if (!sheetEl) { sheetEl = document.createElement('div'); sheetEl.className = 'tk-sheet dc-sheet'; sheetEl.setAttribute('role', 'dialog'); document.body.appendChild(sheetEl); }
      sheetEl.innerHTML = '<div class="tk-scrim"></div><div class="tk-panel"><div class="tk-grab"></div><h3>Chat with ' + LL.esc(info.prov ? info.prov.business_name : 'your provider') + '</h3><div id="tkChat"></div></div>';
      sheetEl.querySelector('.tk-scrim').onclick = closeChat;
      sheetEl.classList.add('open'); document.body.style.overflow = 'hidden';
      if (chatH) chatH.destroy();
      chatH = LLChat.mount(document.getElementById('tkChat'), cid);
    }, function (e) { LL.toast(e.message, true); });
  }
  function closeChat() { if (chatH) { chatH.destroy(); chatH = null; } if (sheetEl) sheetEl.classList.remove('open'); document.body.style.overflow = ''; }
  function wireActions(b) {
    var back = document.getElementById('tkBack'); if (back) back.onclick = function () { if (history.length > 1) history.back(); else location.href = me.id === b.provider_id ? 'provider-dashboard.html?section=bookings' : 'booking.html?id=' + encodeURIComponent(b.id); };
    var m = document.getElementById('tkMsgBtn'); if (m) m.onclick = function () { openChat(b); };
    var c = document.getElementById('tkCanBtn');
    if (c) c.onclick = function () {
      LL.confirm({ title: 'Cancel this booking?', body: 'Nothing is charged. The fee reserved from both wallets is returned and the provider will be told.', confirmText: 'Cancel booking', danger: true }).then(function (ok) {
        if (!ok) return;
        LL.busy(c, 'Cancelling…', function () { return LLApi.customer.cancelBooking(b.id); }).then(function () { LL.goWithToast('dashboard.html?section=bookings', 'Booking cancelled. Your reserved fee was returned.'); }, function (e) { LL.toast(e.message, true); });
      });
    };
  }
  function cancelVisible(b) {
    var c = document.getElementById('tkCanBtn'); if (!c) return;
    var ok = ['confirmed', 'provider_on_the_way', 'arrived'].indexOf(b.status) >= 0 && b.fee_status !== 'charged';
    c.style.display = ok ? 'flex' : 'none';
    document.getElementById('tkAct').style.gridTemplateColumns = ok ? '1fr 1fr' : '1fr';
  }

  function sharePanel(b) {
    var el = document.getElementById('trkShare');
    var isProv = me.id === b.provider_id;
    var canShare = isProv ? b.status === 'provider_on_the_way' : ACTIVE.indexOf(b.status) >= 0;
    if (!canShare) {
      if (shareHandle) { shareHandle.stop(); shareHandle = null; }
      el.classList.add('hidden'); return;
    }
    el.classList.remove('hidden');
    if (isProv) {
      el.innerHTML = '<h2 class="font-extrabold text-slate-900">Your location</h2><p id="shareStat" class="text-sm font-semibold text-slate-600">Starting…</p><p class="text-xs font-semibold text-slate-400">Keep this page open and your screen on. Phones pause location sharing when the screen locks or the page goes to the background.</p>';
      if (!shareHandle) shareHandle = LLMap.share(b.id, function (k, m) { var s = document.getElementById('shareStat'); if (s) { s.textContent = m; s.className = 'text-sm font-semibold ' + (k === 'ok' ? 'text-emerald-700' : 'text-amber-700'); } });
    } else {
      el.innerHTML = '<h2 class="font-extrabold text-slate-900">Share my location (optional)</h2><p class="text-xs font-semibold text-slate-500">Helps your provider find you. Only your provider can see it.</p><p id="shareStat" class="text-sm font-semibold text-slate-600"></p><button id="shareBtn" class="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm px-5 py-2.5 rounded-xl">' + (shareHandle ? 'Stop sharing' : 'Share my location') + '</button>';
      document.getElementById('shareBtn').onclick = function () {
        if (shareHandle) { shareHandle.stop(); shareHandle = null; sharePanel(b); return; }
        shareHandle = LLMap.share(b.id, function (k, m) { var s = document.getElementById('shareStat'); if (s) { s.textContent = m; s.className = 'text-sm font-semibold ' + (k === 'ok' ? 'text-emerald-700' : 'text-amber-700'); } });
        sharePanel(b);
      };
    }
  }

  function draw(snap) {
    var L = window.L, map = mapObj, b = snap.booking, isProv = me.id === b.provider_id;
    var pts = {}; snap.points.forEach(function (p) { pts[p.user_id] = p; });
    var provPt = pts[b.provider_id], custPt = pts[b.customer_id], pin = snap.pin;
    var bounds = [];
    function put(key, latlng, color, letter, title) {
      if (markers[key]) LLMap.moveTo(markers[key], latlng, 1500); else markers[key] = LLMap.marker(L, latlng, color, letter, title).addTo(map);
      bounds.push(latlng);
    }
    function drop(key) { if (markers[key]) { map.removeLayer(markers[key]); delete markers[key]; } }
    if (pin) {
      put('job', [pin.lat, pin.lng], '#e11d48', 'J', 'Job location');
      if (!circles.length) { circles.push(L.circle([pin.lat, pin.lng], { radius: 100, color: '#059669', weight: 1.5, dashArray: '4 4', fillOpacity: 0.06 }).addTo(map)); circles.push(L.circle([pin.lat, pin.lng], { radius: 200, color: '#94a3b8', weight: 1, dashArray: '2 6', fillOpacity: 0 }).addTo(map)); }
    }
    function ring(key, pt, color) {
      if (pt && pt.accuracy_m && pt.accuracy_m > 8 && ACTIVE.indexOf(b.status) >= 0) {
        if (accRings[key]) { accRings[key].setLatLng([pt.lat, pt.lng]); accRings[key].setRadius(pt.accuracy_m); }
        else accRings[key] = L.circle([pt.lat, pt.lng], { radius: pt.accuracy_m, color: color, weight: 1, opacity: .45, fillColor: color, fillOpacity: .12, interactive: false }).addTo(map);
      } else if (accRings[key]) { map.removeLayer(accRings[key]); delete accRings[key]; }
    }
    ring('prov', provPt, '#059669'); ring('cust', custPt, '#1a73e8');
    if (provPt && ACTIVE.indexOf(b.status) >= 0) put('prov', [provPt.lat, provPt.lng], '#059669', 'P', 'Provider'); else drop('prov');
    if (custPt && ACTIVE.indexOf(b.status) >= 0 && (isProv || me.id === b.customer_id)) put('cust', [custPt.lat, custPt.lng], '#2563eb', 'C', 'Customer'); else drop('cust');
    // Dashed guide line from the provider to the job (straight line, not a driving route).
    var active = ACTIVE.indexOf(b.status) >= 0;
    if (active && provPt && pin) {
      var seg = [[provPt.lat, provPt.lng], [pin.lat, pin.lng]];
      if (routeLine) routeLine.setLatLngs(seg); else routeLine = L.polyline(seg, { color: '#059669', weight: 4, opacity: .75, dashArray: '2 9', lineCap: 'round' }).addTo(map);
    } else if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (pin && !addrDone) {
      addrDone = true;
      LLMap.reverse(pin.lat, pin.lng).then(function (a) { var el = document.getElementById('trkAddr'); if (el && a && a.line) { el.innerHTML = I_PIN + '<span>' + LL.esc(a.line) + '</span>'; el.setAttribute('data-set', '1'); el.style.display = 'flex'; el.classList.remove('hidden'); } });
    }
    if (bounds.length && !draw.fitted) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 }); draw.fitted = true; }
    else if (bounds.length > 1 && markers.prov) { /* keep the user's own zoom; only recentre if provider left the view */ if (!map.getBounds().contains(markers.prov.getLatLng())) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 }); }

    // Messages
    if (b.status === 'cancelled') { setMsg('This booking was cancelled.', 'Tracking has ended.'); return; }
    if (['in_progress', 'completed'].indexOf(b.status) >= 0) { setMsg('Tracking has ended.', 'The job ' + (b.status === 'completed' ? 'is complete.' : 'has started.')); return; }
    if (b.status === 'disputed') { setMsg('A dispute is open on this booking.', 'Location reminders are paused.'); return; }
    if (b.status === 'confirmed') { setMsg(isProv ? 'Tap "I am on the way" on your booking when you set off.' : 'Tracking starts when your provider sets off.', pin ? '' : 'No job location pin was set, so arrival is confirmed by the customer.'); return; }
    if (b.status === 'arrived') { setMsg(isProv ? 'You have arrived.' : 'Your provider has arrived.', b.arrival_method === 'gps' ? 'Arrival verified by GPS.' : 'Arrival confirmation comes from the customer.'); return; }
    // provider_on_the_way
    if (!provPt) { setMsg(isProv ? 'Waiting for your location…' : 'Waiting for your provider\'s location…', 'Location is shared once the provider\'s phone reports a position.'); return; }
    var a = age(provPt.updated_at), stale = a > 60;
    var d = pin ? dist(provPt.lat, provPt.lng, pin.lat, pin.lng) : null;
    if (isProv) setMsg(d != null ? 'You are about ' + fmt(d) + ' from the job location.' : 'Your location is being shared.', stale ? 'Your last location update was ' + a + ' s ago. Check your signal.' : 'Within ' + 100 + ' m you can tap "I have arrived".');
    else setMsg(d != null ? 'On the way · about ' + fmt(d) + ' away' : 'On the way', stale ? 'Location not updating (last update ' + a + ' s ago).' : 'Updated ' + a + ' s ago.');
  }

  function refresh() {
    return LLApi.tracking.snapshot(id).then(function (snap) {
      if (!snap) return;
      ctx = snap; sharePanel(snap.booking); cancelVisible(snap.booking); draw(snap);
    }).catch(function () {});
  }

  function start() {
    if (!id) { app.innerHTML = LL.empty('No booking selected', 'Open tracking from one of your bookings.', 'dashboard.html', 'Go to dashboard'); return; }
    LLApi.tracking.snapshot(id).then(function (snap) {
      if (!snap) { app.innerHTML = LL.empty('Booking not found', 'It may belong to another account.', 'dashboard.html', 'Go to dashboard'); return; }
      ctx = snap;
      return shell(snap.booking).then(function (m) {
        mapObj = m.map;
        var meBtn = document.getElementById('trkMe');
        if (meBtn) meBtn.onclick = function () {
          if (!myDot) myDot = LLMap.me(window.L, mapObj);
          meBtn.classList.add('on');
          myDot.start(function (p, first) { if (first) mapObj.flyTo([p.coords.latitude, p.coords.longitude], Math.max(mapObj.getZoom(), 16.5), { duration: 0.8 }); },
            function () { meBtn.classList.remove('on'); LL.toast('Could not get your location. Allow location for this site.', true); });
        };
        var fit = document.getElementById('trkFit');
        if (fit) fit.onclick = function () { var pts = Object.keys(markers).map(function (k) { return markers[k].getLatLng(); }); if (pts.length > 1) mapObj.flyToBounds(pts, { padding: [50, 50], maxZoom: 17, duration: 0.8 }); else if (pts.length) mapObj.flyTo(pts[0], 17, { duration: 0.8 }); };
        wireActions(snap.booking); loadInfo(snap.booking); sharePanel(snap.booking); cancelVisible(snap.booking); draw(snap);
        unsub = LLApi.tracking.subscribe(id, refresh);
        LL.onLive(refresh);
        poll = setInterval(refresh, 10000);
        window.addEventListener('pagehide', function () { if (myDot) myDot.stop(); if (shareHandle) shareHandle.stop(); closeChat(); if (unsub) unsub(); clearInterval(poll); });
      }, function (e) { app.innerHTML = LL.error(e.message); });
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  }

  LL.ready(function (profile) { me = profile; start(); });
})();
