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

  function shell(b) {
    var isProv = me.id === b.provider_id;
    app.innerHTML =
      '<div class="relative rounded-3xl overflow-hidden border border-slate-200 bg-slate-100" style="height:min(80dvh,780px);min-height:460px">' +
        '<div id="trkMap" class="absolute inset-0"></div>' +
        '<button id="trkFit" type="button" class="llm-fab" style="left:14px;top:14px" aria-label="Show both locations" title="Show both"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' +
        '<button id="trkMe" type="button" class="llm-fab" style="right:14px;top:78px" aria-label="Show my location" title="My location"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg></button>' +
        '<div class="llm-sheet"><div class="llm-grab"></div>' +
          '<div class="flex items-center justify-between gap-3"><h1 class="text-base font-extrabold text-slate-900">' + (isProv ? 'Route to the customer' : 'Where is my provider?') + '</h1>' + LL.badge(b.status) + '</div>' +
          '<p id="trkMsg" class="text-sm font-bold text-slate-700 mt-2"></p>' +
          '<p id="trkSub" class="text-xs font-semibold text-slate-400 mt-0.5"></p>' +
          '<p id="trkAddr" class="hidden text-sm font-extrabold text-slate-800 mt-2"></p>' +
        '</div>' +
      '</div>' +
      '<section id="trkShare" class="bg-white border border-slate-200 rounded-3xl p-5 space-y-2"></section>' +
      '<div class="flex flex-wrap gap-3"><a href="' + (isProv ? 'provider-dashboard.html?section=bookings' : 'booking.html?id=' + LL.esc(b.id)) + '" class="border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-sm px-5 py-3 rounded-xl">Back to booking</a></div>' +
      '<p class="text-[11px] font-semibold text-slate-400 text-center">Only you and the other person on this booking can see locations. Shared points are deleted when the job starts or the booking ends.</p>';
    return LLMap.create(document.getElementById('trkMap'), { zoom: 15 });
  }

  function setMsg(t, sub) { document.getElementById('trkMsg').textContent = t; document.getElementById('trkSub').textContent = sub || ''; }

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
      LLMap.reverse(pin.lat, pin.lng).then(function (a) { var el = document.getElementById('trkAddr'); if (el && a && a.line) { el.textContent = 'Job location: ' + a.line; el.classList.remove('hidden'); } });
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
    else setMsg(d != null ? 'Your provider is about ' + fmt(d) + ' away.' : 'Your provider is on the way.', stale ? 'Location not updating (last update ' + a + ' s ago).' : 'Updated ' + a + ' s ago.');
  }

  function refresh() {
    return LLApi.tracking.snapshot(id).then(function (snap) {
      if (!snap) return;
      ctx = snap; sharePanel(snap.booking); draw(snap);
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
        sharePanel(snap.booking); draw(snap);
        unsub = LLApi.tracking.subscribe(id, refresh);
        LL.onLive(refresh);
        poll = setInterval(refresh, 10000);
        window.addEventListener('pagehide', function () { if (myDot) myDot.stop(); if (shareHandle) shareHandle.stop(); if (unsub) unsub(); clearInterval(poll); });
      }, function (e) { app.innerHTML = LL.error(e.message); });
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  }

  LL.ready(function (profile) { me = profile; start(); });
})();
