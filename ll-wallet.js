/* LIFELINK wallet UI (window.LLWallet) — shared by the customer and provider dashboards.
   The wallet is prepaid PLATFORM CREDIT for LifeLink's flat fee. It is not escrow and is not withdrawable.
   All numbers come from Supabase (my_wallet / wallet_ledger / wallet_deposits). Deposits run through the
   paystack-init and paystack-verify Edge Functions; the balance only ever changes on the server. */
(function () {
  'use strict';
  var PS_SRC = 'https://js.paystack.co/v2/inline.js';
  var KIND = {
    deposit: ['Wallet top-up', 'text-emerald-700'],
    hold: ['Fee reserved for a booking', 'text-amber-700'],
    release: ['Reserved fee returned', 'text-emerald-700'],
    fee_charge: ['LifeLink platform fee', 'text-slate-700'],
    adjustment: ['Adjustment', 'text-slate-700']
  };
  var DEP = { pending: ['Waiting for payment', 'bg-amber-50 text-amber-800 border-amber-200'], success: ['Added', 'bg-emerald-50 text-emerald-700 border-emerald-200'], failed: ['Failed', 'bg-rose-50 text-rose-700 border-rose-200'], abandoned: ['Not completed', 'bg-slate-100 text-slate-600 border-slate-200'] };

  function loadPaystack() {
    if (window.PaystackPop) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PS_SRC; s.onload = res;
      s.onerror = function () { rej(new Error('Could not load Paystack. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Ask the server to confirm with Paystack; retry a few times because the webhook may land first or second.
  function confirm(reference, tries) {
    return LLApi.wallet.verifyDeposit(reference).then(function (r) {
      if (r && r.credited) return r;
      if (r && (r.status === 'failed' || r.status === 'abandoned')) return r;
      if (tries <= 1) return r;
      return sleep(2500).then(function () { return confirm(reference, tries - 1); });
    });
  }

  function card(inner) { return '<section class="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-3">' + inner + '</section>'; }

  function mount(el, opts) {
    opts = opts || {};
    var role = opts.role || 'customer';
    el.innerHTML = LL.loading('wallet');
    function load() {
      return Promise.all([LLApi.wallet.me(), LLApi.wallet.ledger(50), LLApi.wallet.deposits(10)]).then(function (r) { draw(r[0], r[1], r[2]); })
        .catch(function (e) { el.innerHTML = LL.error(e.message); });
    }
    function draw(w, ledger, deps) {
      var fee = w.fee_kobo, min = w.min_deposit_kobo;
      var low = w.available_kobo < fee;
      var h = '<div class="grid sm:grid-cols-2 gap-4">' +
        '<div class="rounded-3xl bg-emerald-600 text-white p-6"><p class="text-xs font-extrabold uppercase tracking-wide opacity-80">Available balance</p><p class="text-4xl font-extrabold mt-1">' + LL.naira(w.available_kobo) + '</p>' +
        '<p class="text-xs font-semibold opacity-90 mt-2">Platform credit. It cannot be withdrawn.</p></div>' +
        '<div class="rounded-3xl bg-white border border-slate-200 p-6"><p class="text-xs font-extrabold uppercase tracking-wide text-slate-400">Reserved for bookings</p><p class="text-4xl font-extrabold mt-1 text-slate-900">' + LL.naira(w.held_kobo) + '</p>' +
        '<p class="text-xs font-semibold text-slate-500 mt-2">Held until the provider arrives. Returned if the booking is cancelled first.</p></div></div>';
      if (low) h += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">' +
        (role === 'provider' ? 'You need at least ' + LL.naira(fee) + ' available for a customer to be able to accept your quote.' : 'You need at least ' + LL.naira(fee) + ' available to confirm a booking.') + ' Add funds below.</div>';
      h += card('<h2 class="font-extrabold text-slate-900">Add funds</h2>' +
        '<p class="text-sm text-slate-600">Pay securely with Paystack (card, bank transfer or USSD). Minimum ' + LL.naira(min) + '.</p>' +
        '<div class="flex flex-wrap gap-2" id="wChips">' + [50000, 100000, 200000, 500000].map(function (k) { return '<button type="button" data-amt="' + k + '" class="border border-slate-200 hover:border-emerald-400 text-sm font-extrabold px-4 py-2 rounded-xl">' + LL.naira(k) + '</button>'; }).join('') + '</div>' +
        '<form id="wForm" class="flex flex-wrap gap-3" novalidate><div class="flex-1 min-w-[10rem]"><label class="lbl" for="wAmt">Amount (₦)</label><input id="wAmt" class="field" inputmode="numeric" placeholder="' + (min / 100) + '" value="' + (min / 100) + '"></div>' +
        '<button id="wBtn" class="self-end bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-6 py-3 rounded-2xl">Pay with Paystack</button></form>' +
        '<p class="text-xs text-slate-400 font-semibold">LifeLink charges a flat ' + LL.naira(fee) + ' per booking to each side, only when the provider has arrived and the customer confirms it. The job price is agreed and paid directly between you and the other person; it never passes through this wallet.</p>');
      var pend = deps.filter(function (d) { return d.status === 'pending'; });
      if (pend.length) h += card('<h2 class="font-extrabold text-slate-900">Payments awaiting confirmation</h2>' + pend.map(function (d) {
        return '<div class="flex items-center justify-between gap-3 text-sm border-b border-slate-100 py-2"><span>' + LL.esc(LL.dateTime(d.created_at)) + ' · <strong>' + LL.naira(d.amount_kobo) + '</strong></span><button data-check="' + LL.esc(d.reference) + '" class="text-xs font-extrabold text-emerald-700 underline">Check payment</button></div>'; }).join('') +
        '<p class="text-xs text-slate-400 font-semibold">If you paid but your balance has not updated, press Check payment. We confirm with Paystack before adding anything.</p>');
      h += card('<h2 class="font-extrabold text-slate-900">Wallet activity</h2>' + (ledger.length ? ledger.map(function (l) {
        var k = KIND[l.kind] || [l.kind, 'text-slate-700'];
        var amt = l.kind === 'hold' ? '−' + LL.naira(-l.available_delta) + ' reserved' : l.kind === 'release' ? '+' + LL.naira(l.available_delta) : l.kind === 'fee_charge' ? '−' + LL.naira(-l.held_delta) : (l.available_delta >= 0 ? '+' : '−') + LL.naira(Math.abs(l.available_delta));
        return '<div class="flex items-center justify-between gap-3 text-sm border-b border-slate-100 py-2"><div class="min-w-0"><p class="font-bold ' + k[1] + '">' + LL.esc(k[0]) + '</p><p class="text-xs text-slate-400 font-semibold">' + LL.esc(LL.dateTime(l.created_at)) + '</p></div><div class="text-right"><p class="font-extrabold">' + LL.esc(amt) + '</p><p class="text-xs text-slate-400 font-semibold">Balance ' + LL.naira(l.available_after) + '</p></div></div>';
      }).join('') : '<p class="text-sm text-slate-500">No activity yet. Add funds to get started.</p>'));
      var failed = deps.filter(function (d) { return d.status !== 'pending' && d.status !== 'success'; });
      if (failed.length) h += card('<h2 class="font-extrabold text-slate-900">Other attempts</h2>' + failed.map(function (d) { var b = DEP[d.status] || [d.status, 'bg-slate-100 text-slate-600 border-slate-200']; return '<div class="flex items-center justify-between text-sm py-1.5"><span>' + LL.esc(LL.date(d.created_at)) + ' · ' + LL.naira(d.amount_kobo) + '</span><span class="text-xs font-extrabold px-2.5 py-1 rounded-full border ' + b[1] + '">' + b[0] + '</span></div>'; }).join(''));
      el.innerHTML = '<div class="space-y-4">' + h + '</div>';
      bind(w);
    }
    function bind(w) {
      var amt = el.querySelector('#wAmt');
      el.querySelectorAll('[data-amt]').forEach(function (b) { b.onclick = function () { amt.value = Number(b.getAttribute('data-amt')) / 100; }; });
      el.querySelectorAll('[data-check]').forEach(function (b) {
        b.onclick = function () {
          LL.busy(b, 'Checking…', function () { return confirm(b.getAttribute('data-check'), 2); }).then(function (r) {
            if (r && r.credited) LL.toast('Payment confirmed. Wallet updated.'); else LL.toast((r && r.message) || 'Paystack has not confirmed this payment.', true);
            load();
          }, function (e) { LL.toast(e.message, true); });
        };
      });
      var form = el.querySelector('#wForm'), btn = el.querySelector('#wBtn');
      form.onsubmit = function (ev) {
        ev.preventDefault();
        var n = Number(String(amt.value).replace(/[^0-9.]/g, ''));
        var kobo = Math.round(n * 100);
        if (!n || kobo < w.min_deposit_kobo) { LL.toast('The minimum top-up is ' + LL.naira(w.min_deposit_kobo) + '.', true); return; }
        LL.busy(btn, 'Opening Paystack…', function () {
          return Promise.all([LLApi.wallet.startDeposit(kobo), loadPaystack()]).then(function (r) {
            var init = r[0];
            return new Promise(function (resolve) {
              new window.PaystackPop().resumeTransaction(init.access_code, {
                onSuccess: function () { resolve({ ref: init.reference, paid: true }); },
                onCancel: function () { resolve({ ref: init.reference, paid: false }); }
              });
            });
          });
        }).then(function (o) {
          if (!o.paid) { LL.toast('Payment cancelled. Nothing was charged.'); load(); return; }
          el.innerHTML = LL.loading('payment confirmation');
          return confirm(o.ref, 5).then(function (r) {
            if (r && r.credited) LL.toast('Wallet funded.'); else LL.toast((r && r.message) || 'Still waiting for Paystack to confirm. Check again in a moment.', !(r && r.credited));
            load();
          });
        }, function (e) { LL.toast(e.message, true); });
      };
    }
    return load();
  }

  window.LLWallet = { mount: mount };
})();
