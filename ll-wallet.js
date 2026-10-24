/* LIFELINK wallet UI (window.LLWallet) — shared by the customer and provider dashboards.
   The wallet is prepaid PLATFORM CREDIT for LifeLink's flat fee. It is not escrow and is not withdrawable.
   All numbers come from Supabase (my_wallet / wallet_ledger / wallet_deposits). Deposits run through the
   paystack-init and paystack-verify Edge Functions; the balance only ever changes on the server. */
(function () {
  'use strict';
  var PS_SRC = 'https://js.paystack.co/v2/inline.js';
  var KIND = {
    deposit: ['Deposit (Paystack)', 'text-emerald-700'],
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

  var CSS = '' +
    '.wl-hero{position:relative;overflow:hidden;border-radius:24px;padding:20px;color:#fff;background:linear-gradient(135deg,#0b7a58 0%,#13a174 55%,#18b785 100%);box-shadow:0 14px 30px rgba(7,134,95,.28);animation:wlIn .5s cubic-bezier(.2,.8,.2,1) both}' +
    '.wl-hero::before,.wl-hero::after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.08);pointer-events:none}' +
    '.wl-hero::before{width:190px;height:190px;right:-50px;top:-80px}.wl-hero::after{width:130px;height:130px;right:70px;bottom:-70px}' +
    '.wl-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px}' +
    '.wl-hero small{display:block;font-size:14px;font-weight:600;opacity:.9}.wl-amt{display:block;margin-top:4px;font-size:34px;font-weight:800;letter-spacing:-.5px;line-height:1.1}' +
    '.wl-add{display:flex;align-items:center;gap:8px;border:0;background:rgba(255,255,255,.95);color:#0b7a58;font:inherit;font-size:14.5px;font-weight:800;padding:13px 16px;border-radius:14px;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.14);transition:transform .15s;white-space:nowrap}.wl-add:active{transform:scale(.96)}' +
    '.wl-add svg{width:16px;height:16px}' +
    '.wl-held{position:relative;margin:14px 0 0;padding-top:12px;border-top:1px solid rgba(255,255,255,.22);display:flex;justify-content:space-between;gap:10px;font-size:12.5px;font-weight:600}.wl-held span{opacity:.88}.wl-held b{font-weight:800}' +
    '.wl-note{position:relative;margin:8px 0 0;font-size:12px;font-weight:600;opacity:.85}' +
    '.wl-tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
    '.wl-tile{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;border-radius:20px;border:1px solid var(--ll-border,#dfe7e3);background:var(--ll-surface,#fff);color:var(--ll-text);font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:transform .15s}.wl-tile:active{transform:scale(.97)}' +
    '.wl-ic{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(7,134,95,.12);color:var(--ll-primary,#07865f)}.wl-ic svg{width:21px;height:21px}' +
    '.wl-card{background:var(--ll-surface,#fff);border:1px solid var(--ll-border,#dfe7e3);border-radius:22px;padding:6px 16px}' +
    '.wl-card.pad{padding:16px}' +
    '.wl-hd{display:flex;align-items:center;justify-content:space-between;margin:0}.wl-hd h2{margin:0;font-size:18px;font-weight:800;color:var(--ll-text)}.wl-hd button{border:0;background:none;color:var(--ll-primary,#07865f);font:inherit;font-size:14px;font-weight:800;cursor:pointer}' +
    '.wl-tx{display:flex;align-items:center;gap:12px;padding:14px 0;animation:wlIn .4s cubic-bezier(.2,.8,.2,1) both}.wl-tx+.wl-tx{border-top:1px solid var(--ll-border,#e5ece8)}' +
    '.wl-ti{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;flex:none}.wl-ti svg{width:19px;height:19px}' +
    '.wl-tx div.m{flex:1;min-width:0}.wl-tx b{display:block;font-size:15px;font-weight:700;color:var(--ll-text)}.wl-tx small{display:block;margin-top:2px;font-size:12.5px;color:var(--ll-text-2,#64748b);font-weight:600}.wl-tx em{font-style:normal;font-size:15px;font-weight:800;white-space:nowrap}' +
    '.wl-warn{border-radius:16px;border:1px solid #fcd34d;background:#fffbeb;color:#78350f;padding:14px;font-size:13.5px;font-weight:600;line-height:1.5}' +
    '.wl-sheet{position:fixed;inset:0;z-index:95;display:none}.wl-sheet.open{display:block}.wl-scrim{position:absolute;inset:0;background:rgba(8,20,16,.5);animation:llFade .2s ease}' +
    '.wl-panel{position:absolute;left:0;right:0;bottom:0;max-height:88vh;overflow-y:auto;max-width:560px;margin:0 auto;background:var(--ll-surface,#fff);color:var(--ll-text);border-radius:26px 26px 0 0;padding:10px 18px calc(22px + env(safe-area-inset-bottom,0px));animation:llSheetUp .3s cubic-bezier(.2,.8,.2,1)}' +
    '.wl-grab{width:42px;height:4px;border-radius:4px;background:var(--ll-border,#cbd5e1);margin:0 auto 12px}' +
    '.wl-panel h3{margin:4px 0 6px;font-size:19px;font-weight:800}.wl-panel p{font-size:13.5px;line-height:1.5;color:var(--ll-text-2,#64748b);font-weight:500;margin:0 0 12px}' +
    '.wl-chips{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.wl-chips button{border:1.5px solid var(--ll-border,#dfe7e3);background:var(--ll-surface,#fff);color:var(--ll-text);font:inherit;font-size:13px;font-weight:800;padding:11px 2px;border-radius:12px;cursor:pointer}.wl-chips button.on{border-color:var(--ll-primary,#07865f);background:rgba(7,134,95,.1)}' +
    '.wl-panel label{display:block;font-size:13px;font-weight:800;margin-bottom:6px}.wl-panel input{width:100%;box-sizing:border-box;background:var(--ll-surface,#fff);color:var(--ll-text);border:1px solid var(--ll-border,#dfe7e3);border-radius:14px;padding:14px 16px;font:inherit;font-size:16px;font-weight:700;outline:none}.wl-panel input:focus{border-color:var(--ll-primary,#07865f);box-shadow:0 0 0 3px rgba(7,134,95,.15)}' +
    '.wl-pay{display:block;width:100%;margin-top:14px;border:0;background:var(--ll-primary,#07865f);color:#fff;font:inherit;font-size:16px;font-weight:800;padding:16px;border-radius:16px;cursor:pointer;box-shadow:0 8px 20px rgba(7,134,95,.3)}' +
    '.wl-small{margin-top:12px!important;font-size:12px!important}' +
    '@keyframes wlIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
    '@media (prefers-reduced-motion:reduce){.wl-hero,.wl-tx{animation:none!important}}';
  function addCss() { if (document.getElementById('wl-css')) return; var st = document.createElement('style'); st.id = 'wl-css'; st.textContent = CSS; document.head.appendChild(st); }
  function sv(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
  var ICO = {
    deposit: [sv('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'), 'background:rgba(7,134,95,.14);color:#07865f'],
    hold: [sv('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'), 'background:rgba(245,163,10,.18);color:#b45309'],
    release: [sv('<path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 010 10h-3"/>'), 'background:rgba(7,134,95,.14);color:#07865f'],
    fee_charge: [sv('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 12h6"/>'), 'background:rgba(225,29,72,.12);color:#e11d48'],
    adjustment: [sv('<path d="M4 7h16M4 12h16M4 17h10"/>'), 'background:rgba(100,116,139,.15);color:#475569']
  };
  var I_ARROW = sv('<path d="M5 12h14M13 6l6 6-6 6"/>'), I_DEP = sv('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'), I_HIST = sv('<path d="M3 12a9 9 0 109-9 9 9 0 00-6.400 2.600L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>');

  function card(inner) { return '<section class="wl-card pad" style="display:grid;gap:12px">' + inner + '</section>'; }
  var sheetEl = null;
  function closeSheet() { if (sheetEl) sheetEl.classList.remove('open'); document.body.style.overflow = ''; }
  function removeSheet() { if (sheetEl && sheetEl.parentNode) sheetEl.parentNode.removeChild(sheetEl); sheetEl = null; document.body.style.overflow = ''; }

  function mount(el, opts) {
    opts = opts || {};
    var role = opts.role || 'customer';
    var showAll = false;
    addCss();
    el.innerHTML = LL.loading('wallet');
    var firstLoad = true;
    function load() {
      var ck = 'wallet:' + role + ':' + (window.LL && LL.me ? LL.me.id : '');
      if (firstLoad) { // show the last known wallet at once; the fresh numbers replace it a moment later
        firstLoad = false;
        try { var c0 = LL.cache.get(ck); if (c0) { var d0 = JSON.parse(c0); draw(d0[0], d0[1], d0[2]); } } catch (e) {}
      }
      return Promise.all([LLApi.wallet.me(), LLApi.wallet.ledger(50), LLApi.wallet.deposits(10)]).then(function (r) { try { LL.cache.set(ck, JSON.stringify(r)); } catch (e) {} draw(r[0], r[1], r[2]); })
        .catch(function (e) { removeSheet(); el.innerHTML = LL.error(e.message); });
    }
    function txRow(l, i) {
      var k = KIND[l.kind] || [l.kind, 'text-slate-700'];
      if (l.kind === 'fee_charge' && /^Product chat/.test(l.note || '')) k = ['Product chat fee', 'text-slate-700'];
      else if (l.kind === 'adjustment' && /^Product chat/.test(l.note || '')) k = ['Chat fee returned', 'text-emerald-700'];
      var ic = ICO[l.kind] || ICO.adjustment;
      var amt, col;
      if (l.kind === 'hold') { amt = '−' + LL.naira(-l.available_delta) + ' reserved'; col = '#b45309'; }
      else if (l.kind === 'release') { amt = '+' + LL.naira(l.available_delta); col = 'var(--ll-primary,#07865f)'; }
      else if (l.kind === 'fee_charge') { amt = '−' + LL.naira(l.held_delta < 0 ? -l.held_delta : -l.available_delta); col = '#e11d48'; }
      else { amt = (l.available_delta >= 0 ? '+' : '−') + LL.naira(Math.abs(l.available_delta)); col = l.available_delta >= 0 ? 'var(--ll-primary,#07865f)' : '#e11d48'; }
      return '<div class="wl-tx" style="animation-delay:' + Math.min(i, 8) * 40 + 'ms"><span class="wl-ti" style="' + ic[1] + '">' + ic[0] + '</span><div class="m"><b>' + LL.esc(k[0]) + '</b><small>' + LL.esc(LL.dateTime(l.created_at)) + '</small></div><em style="color:' + col + '">' + LL.esc(amt) + '</em></div>';
    }
    function draw(w, ledger, deps) {
      removeSheet();
      var fee = w.fee_kobo, min = w.min_deposit_kobo;
      var low = w.available_kobo < fee;
      var h = '<section class="wl-hero"><div class="wl-row"><div><small>Wallet Balance</small><span class="wl-amt">' + LL.naira(w.available_kobo) + '</span></div>' +
        '<button type="button" class="wl-add" id="wAddTop">Add Funds ' + I_ARROW + '</button></div>' +
        '<div class="wl-held"><span>Reserved for bookings</span><b>' + LL.naira(w.held_kobo) + '</b></div>' +
        '<p class="wl-note">Platform credit. It cannot be withdrawn.</p></section>' +
        '<div class="wl-tiles"><button type="button" class="wl-tile" id="wDepTile"><span class="wl-ic">' + I_DEP + '</span>Deposit</button><button type="button" class="wl-tile" id="wHistTile"><span class="wl-ic">' + I_HIST + '</span>History</button></div>';
      if (low) h += '<div class="wl-warn">' +
        (role === 'provider' ? 'You need at least ' + LL.naira(fee) + ' available for a customer to be able to accept your quote.' : 'You need at least ' + LL.naira(fee) + ' available to confirm a booking.') + ' Tap Add Funds to top up.</div>';
      var pend = deps.filter(function (d) { return d.status === 'pending'; });
      if (pend.length) h += card('<h2 style="margin:0;font-size:17px;font-weight:800">Payments awaiting confirmation</h2>' + pend.map(function (d) {
        return '<div class="flex items-center justify-between gap-3 text-sm border-b border-slate-100 py-2"><span>' + LL.esc(LL.dateTime(d.created_at)) + ' · <strong>' + LL.naira(d.amount_kobo) + '</strong></span><button data-check="' + LL.esc(d.reference) + '" class="text-xs font-extrabold text-emerald-700 underline">Check payment</button></div>'; }).join('') +
        '<p class="text-xs text-slate-400 font-semibold" style="margin:0">If you paid but your balance has not updated, press Check payment. We confirm with Paystack before adding anything.</p>');
      var shown = showAll ? ledger : ledger.slice(0, 5);
      h += '<section id="wTx"><div class="wl-hd" style="margin:6px 2px 10px"><h2>Recent Transactions</h2>' + (ledger.length > 5 ? '<button type="button" id="wSeeAll">' + (showAll ? 'Show less' : 'See all') + '</button>' : '') + '</div>' +
        '<div class="wl-card">' + (ledger.length ? shown.map(txRow).join('') : '<p class="text-sm text-slate-500" style="padding:16px 0;margin:0">No activity yet. Tap Add Funds to get started.</p>') + '</div></section>';
      var failed = deps.filter(function (d) { return d.status !== 'pending' && d.status !== 'success'; });
      if (failed.length) h += card('<h2 style="margin:0;font-size:17px;font-weight:800">Other attempts</h2>' + failed.map(function (d) { var b = DEP[d.status] || [d.status, 'bg-slate-100 text-slate-600 border-slate-200']; return '<div class="flex items-center justify-between text-sm py-1.5"><span>' + LL.esc(LL.date(d.created_at)) + ' · ' + LL.naira(d.amount_kobo) + '</span><span class="text-xs font-extrabold px-2.5 py-1 rounded-full border ' + b[1] + '">' + b[0] + '</span></div>'; }).join(''));
      el.innerHTML = '<div style="display:grid;gap:16px;max-width:640px;margin:0 auto">' + h + '</div>';

      // Add-funds sheet (same chips, form and Paystack flow as before)
      sheetEl = document.createElement('div'); sheetEl.className = 'wl-sheet dc-sheet'; sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-label', 'Add funds');
      sheetEl.innerHTML = '<div class="wl-scrim"></div><div class="wl-panel"><div class="wl-grab"></div><h3>Add funds</h3>' +
        '<p>Pay securely with Paystack (card, bank transfer or USSD). Minimum ' + LL.naira(min) + '.</p>' +
        '<div class="wl-chips" id="wChips">' + [50000, 100000, 200000, 500000].map(function (k) { return '<button type="button" data-amt="' + k + '">' + LL.naira(k) + '</button>'; }).join('') + '</div>' +
        '<form id="wForm" novalidate><label for="wAmt">Amount (₦)</label><input id="wAmt" inputmode="numeric" placeholder="' + (min / 100) + '" value="' + (min / 100) + '">' +
        '<button id="wBtn" class="wl-pay">Pay with Paystack</button></form>' +
        '<p class="wl-small">LifeLink charges a flat ' + LL.naira(fee) + ' per booking to each side, only when the provider has arrived and the customer confirms it. The job price is agreed and paid directly between you and the other person; it never passes through this wallet.</p></div>';
      document.body.appendChild(sheetEl);
      bind(w);
    }
    function openSheet() { if (sheetEl) { sheetEl.classList.add('open'); document.body.style.overflow = 'hidden'; } }
    function bind(w) {
      var sh = sheetEl;
      var amt = sh.querySelector('#wAmt');
      el.querySelector('#wAddTop').onclick = openSheet; el.querySelector('#wDepTile').onclick = openSheet;
      sh.querySelector('.wl-scrim').onclick = closeSheet;
      el.querySelector('#wHistTile').onclick = function () { if (!showAll) { showAll = true; load().then(function () { var t = el.querySelector('#wTx'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); } else { var t = el.querySelector('#wTx'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
      var sa = el.querySelector('#wSeeAll'); if (sa) sa.onclick = function () { showAll = !showAll; load(); };
      function mark() { sh.querySelectorAll('[data-amt]').forEach(function (b) { b.classList.toggle('on', Number(b.getAttribute('data-amt')) / 100 === Number(amt.value)); }); }
      sh.querySelectorAll('[data-amt]').forEach(function (b) { b.onclick = function () { amt.value = Number(b.getAttribute('data-amt')) / 100; mark(); }; });
      amt.addEventListener('input', mark); mark();
      el.querySelectorAll('[data-check]').forEach(function (b) {
        b.onclick = function () {
          LL.busy(b, 'Checking…', function () { return confirm(b.getAttribute('data-check'), 2); }).then(function (r) {
            if (r && r.credited) LL.toast('Payment confirmed. Wallet updated.'); else LL.toast((r && r.message) || 'Paystack has not confirmed this payment.', true);
            load();
          }, function (e) { LL.toast(e.message, true); });
        };
      });
      var form = sh.querySelector('#wForm'), btn = sh.querySelector('#wBtn');
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
          removeSheet();
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
