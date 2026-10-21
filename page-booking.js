/* booking.html (?id=) — customer booking detail: status, provider, schedule, price, cancel / pay / review / dispute. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var id = LL.q('id');

  function steps(b) {
    var order = ['confirmed', 'provider_on_the_way', 'arrived', 'in_progress', 'completed'];
    var labels = ['Confirmed', 'On the way', 'Arrived', 'In progress', 'Completed'];
    var cur = b.status === 'disputed' ? order.indexOf(b.prev_status || 'confirmed') : order.indexOf(b.status);
    if (b.status === 'cancelled') return '<p class="text-sm font-bold text-slate-500">This booking was cancelled.</p>';
    return '<ol class="grid grid-cols-5 gap-2">' + labels.map(function (l, i) {
      var done = i <= cur;
      return '<li class="text-center"><div class="h-1.5 rounded-full ' + (done ? 'bg-emerald-500' : 'bg-slate-200') + '"></div><p class="mt-1.5 text-[11px] font-extrabold ' + (done ? 'text-emerald-700' : 'text-slate-400') + '">' + l + '</p></li>';
    }).join('') + '</ol>' + (b.status === 'disputed' ? '<p class="mt-2 text-xs font-bold text-rose-700">A dispute is open on this booking.</p>' : '');
  }

  var FEE = { held: 'Reserved from your wallet. It is charged when your provider arrives (verified by GPS, or confirmed by you if GPS is unavailable) and returned if the booking is cancelled first.', charged: 'Charged. Your provider\'s arrival was confirmed.', released: 'Returned to your wallet.', none: '' };

  function render(b, prov, disputes, review) {
    var feeEach = (b.service_fee_kobo || 0) / 2;
    var canSchedule = b.status === 'confirmed' || b.status === 'provider_on_the_way';
    var h = '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">' +
      '<div class="flex items-center justify-between gap-3"><h1 class="text-xl font-extrabold text-slate-900">Booking</h1>' + LL.badge(b.status) + '</div>' + steps(b) + '</section>';
    h += '<section class="bg-white border border-slate-200 rounded-3xl p-6 flex items-center gap-4">' + LL.avatar(prov && prov.business_name, prov && prov.avatar_url, 'w-14 h-14') +
      '<div class="min-w-0 flex-1"><p class="font-extrabold text-slate-900 truncate">' + LL.esc(prov ? prov.business_name : 'Your provider') + '</p>' +
      '<p class="text-xs font-semibold text-slate-500">' + (prov && prov.rating_avg != null ? LL.stars(prov.rating_avg) + ' · ' : '') + LL.esc(prov ? (prov.category || '') : '') + '</p></div>' +
      '<a href="compare-quotes.html?request=' + LL.esc(b.request_id) + '" class="text-xs font-extrabold text-emerald-700">View request</a></section>';
    h += '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-3"><h2 class="font-extrabold text-slate-900">Schedule</h2>' +
      '<p class="text-sm text-slate-700">' + (b.scheduled_for ? 'Scheduled for <strong>' + LL.esc(LL.dateTime(b.scheduled_for)) + '</strong>' : 'No time set yet.') + '</p>' +
      (canSchedule ? '<div class="flex flex-wrap gap-2"><input id="whenInput" type="datetime-local" class="field !w-auto"><button id="whenBtn" class="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm px-5 py-2.5 rounded-xl">Save time</button></div><p class="text-xs text-slate-400 font-semibold">The provider is notified when you set or change the time.</p>' : '') + '</section>';
    h += '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-2"><h2 class="font-extrabold text-slate-900">Price and fee</h2>' +
      '<div class="flex justify-between text-sm"><span class="text-slate-500 font-semibold">Agreed price</span><span class="font-extrabold">' + LL.naira(b.price_kobo) + '</span></div>' +
      '<p class="text-xs text-slate-500 font-semibold">You pay your provider this amount directly, in the app chat arrangement or outside it. LifeLink does not hold or handle it.</p>' +
      '<div class="flex justify-between text-sm border-t border-slate-100 pt-2"><span class="text-slate-500 font-semibold">LifeLink fee (your side)</span><span class="font-extrabold">' + LL.naira(feeEach) + '</span></div>' +
      (FEE[b.fee_status] ? '<p class="text-xs text-slate-500 font-semibold">' + FEE[b.fee_status] + '</p>' : '') + '</section>';
    var actions = [];
    if (b.status === 'arrived' && b.fee_status === 'held') {
      actions.push('<button id="arriveBtn" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-5 py-3 rounded-xl">Confirm my provider has arrived</button>');
    }
    if (['provider_on_the_way', 'arrived'].indexOf(b.status) >= 0) {
      actions.push('<a href="tracking.html?id=' + LL.esc(b.id) + '" class="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm px-5 py-3 rounded-xl">' + (b.status === 'arrived' ? 'View map' : 'Track my provider') + '</a>');
    }
    if (['confirmed', 'provider_on_the_way', 'arrived'].indexOf(b.status) >= 0 && b.fee_status !== 'charged') {
      actions.push('<button id="cancelBtn" class="border border-rose-200 text-rose-700 hover:bg-rose-50 font-extrabold text-sm px-5 py-3 rounded-xl">Cancel booking</button>');
    }
    if (b.status === 'completed' && !b.reviewed) actions.push('<a href="review.html?booking=' + LL.esc(b.id) + '" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-5 py-3 rounded-xl">Leave a review</a>');
    if (['confirmed', 'provider_on_the_way', 'arrived', 'in_progress', 'completed', 'disputed'].indexOf(b.status) >= 0) actions.push('<a href="dispute.html?booking=' + LL.esc(b.id) + '" class="border border-slate-200 hover:bg-slate-50 text-slate-700 font-extrabold text-sm px-5 py-3 rounded-xl">' + (disputes.length ? 'View disputes' : 'Report a problem') + '</a>');
    h += (actions.length ? '<div class="flex flex-wrap gap-3">' + actions.join('') + '</div>' : '');
    if (review) h += '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-1"><h2 class="font-extrabold text-slate-900">Your review</h2><p class="text-amber-500 font-extrabold">' + '★'.repeat(review.rating) + '</p>' + (review.comment ? '<p class="text-sm text-slate-700">' + LL.esc(review.comment) + '</p>' : '') + '</section>';
    h += '<p class="text-[11px] font-semibold text-slate-400 text-center">Booked ' + LL.esc(LL.dateTime(b.created_at)) + '</p>';
    app.innerHTML = h;

    var wb = document.getElementById('whenBtn');
    if (wb) wb.onclick = function () {
      var v = document.getElementById('whenInput').value;
      if (!v) { LL.toast('Pick a date and time first.', true); return; }
      LL.busy(wb, 'Saving…', function () { return LLApi.customer.setSchedule(b.id, new Date(v).toISOString()); }).then(function () { LL.toast('Time saved.'); load(true); }, function (e) { LL.toast(e.message, true); });
    };
    var ab = document.getElementById('arriveBtn');
    if (ab) ab.onclick = function () {
      LL.confirm({ title: 'Has your provider arrived?', body: 'Only confirm if they are with you. This confirms the arrival and charges the flat LifeLink fee from both wallets.', confirmText: 'Yes, they arrived' }).then(function (ok) {
        if (!ok) return;
        LL.busy(ab, 'Confirming…', function () { return LLApi.customer.confirmArrival(b.id); }).then(function () { LL.toast('Arrival confirmed.'); load(true); }, function (e) { LL.toast(e.message, true); });
      });
    };
    var cb = document.getElementById('cancelBtn');
    if (cb) cb.onclick = function () {
      LL.confirm({ title: 'Cancel this booking?', body: 'Nothing is charged. The fee reserved from both wallets is returned and the provider will be told.', confirmText: 'Cancel booking', danger: true }).then(function (ok) {
        if (!ok) return;
        LL.busy(cb, 'Cancelling…', function () { return LLApi.customer.cancelBooking(b.id); }).then(function () { LL.goWithToast('dashboard.html?section=bookings', 'Booking cancelled. Your reserved fee was returned.'); }, function (e) { LL.toast(e.message, true); });
      });
    };
  }

  function load(quiet) {
    if (!id) { LLApi.customer.bookings().then(function (rows) {
      if (!rows.length) { app.innerHTML = LL.empty('No bookings yet', 'Accept a quote to create a booking.', 'compare-quotes.html', 'See your requests'); return; }
      app.innerHTML = '<h1 class="text-xl font-extrabold text-slate-900">Your bookings</h1><div class="space-y-3">' + rows.map(function (b) {
        return '<a href="booking.html?id=' + LL.esc(b.id) + '" class="block bg-white border border-slate-200 rounded-2xl p-5 hover:border-emerald-300"><div class="flex justify-between items-center"><span class="font-extrabold">' + LL.naira(b.price_kobo) + '</span>' + LL.badge(b.status) + '</div><p class="text-xs font-semibold text-slate-400 mt-1">' + LL.esc(LL.date(b.created_at)) + '</p></a>';
      }).join('') + '</div>';
    }).catch(function (e) { app.innerHTML = LL.error(e.message); }); return; }
    if (!quiet) app.innerHTML = LL.loading('booking');
    return LLApi.customer.booking(id).then(function (b) {
      if (!b) { app.innerHTML = LL.empty('Booking not found', 'It may belong to another account.', 'dashboard.html', 'Go to dashboard'); return; }
      return Promise.all([LLApi.catalog.provider(b.provider_id).catch(function () { return null; }), LLApi.customer.disputes(b.id).catch(function () { return []; }),
        b.reviewed ? LLApi.customer.reviewForBooking(b.id).catch(function () { return null; }) : Promise.resolve(null)])
        .then(function (r) { render(b, r[0], r[1], r[2]); });
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  }
  LL.ready(function () { if (id) LL.onLive(function () { LL.quiet(app, function () { return load(true); }); }); load(); });
})();
