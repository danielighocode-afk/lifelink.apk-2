/* payment.html (?booking=) — how paying works for a booking. The job price is paid directly to the provider;
   LifeLink only charges its flat fee from the wallets. Everything shown comes from the booking row. */
(function () {
  'use strict';
  var app = document.getElementById('app'), id = LL.q('booking');
  var FEE = { held: 'Reserved (not yet charged)', charged: 'Charged', released: 'Returned', none: 'Not applicable' };
  LL.ready(function () {
    if (!id) { app.innerHTML = LL.empty('No booking selected', 'Open a booking to see its payment details.', 'booking.html', 'Your bookings'); return; }
    app.innerHTML = LL.loading('payment details');
    LLApi.customer.booking(id).then(function (b) {
      if (!b) { app.innerHTML = LL.empty('Booking not found', '', 'dashboard.html', 'Go to dashboard'); return; }
      return LLApi.catalog.provider(b.provider_id).catch(function () { return null; }).then(function (p) {
        var each = (b.service_fee_kobo || 0) / 2;
        app.innerHTML = '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-3"><div class="flex justify-between items-center"><h1 class="text-xl font-extrabold">Payment details</h1>' + LL.badge(b.status) + '</div>' +
          '<p class="text-sm text-slate-600">' + LL.esc(p ? p.business_name : 'Provider') + '</p>' +
          '<div class="flex justify-between text-sm"><span class="text-slate-500 font-semibold">Agreed price (you pay your provider directly)</span><span class="font-extrabold">' + LL.naira(b.price_kobo) + '</span></div>' +
          '<div class="flex justify-between text-sm"><span class="text-slate-500 font-semibold">LifeLink fee (your side)</span><span class="font-extrabold">' + LL.naira(each) + '</span></div>' +
          '<div class="flex justify-between text-sm"><span class="text-slate-500 font-semibold">Fee status</span><span class="font-extrabold">' + LL.esc(FEE[b.fee_status] || '') + '</span></div></section>' +
          '<section class="rounded-3xl border border-slate-200 bg-white p-6 space-y-2 text-sm text-slate-700"><p class="font-extrabold text-slate-900">How it works</p>' +
          '<p>LifeLink does not take or hold the job payment. Agree how and when to pay with your provider, in or outside the app.</p>' +
          '<p>The flat ' + LL.naira(each) + ' fee is paid from your LifeLink wallet, only once your provider has arrived and you have confirmed it. Your wallet is topped up through Paystack.</p></section>' +
          '<div class="flex gap-3"><a href="dashboard.html?section=wallet" class="flex-1 text-center bg-emerald-600 text-white font-extrabold py-3 rounded-2xl">Open wallet</a><a href="booking.html?id=' + LL.esc(b.id) + '" class="flex-1 text-center border border-slate-200 font-extrabold py-3 rounded-2xl">Back to booking</a></div>';
      });
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  });
})();
