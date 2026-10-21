/* review.html (?booking=) — customer rates a completed booking. */
(function () {
  'use strict';
  var app = document.getElementById('app'), id = LL.q('booking'), rating = 0, rec = null;
  function paint() {
    document.querySelectorAll('[data-star]').forEach(function (s) { s.className = 'text-4xl ' + (Number(s.getAttribute('data-star')) <= rating ? 'text-amber-500' : 'text-slate-300'); });
    document.querySelectorAll('[data-rec]').forEach(function (b) {
      var on = (b.getAttribute('data-rec') === 'yes') === rec && rec !== null;
      b.className = 'px-5 py-2.5 rounded-xl border font-extrabold text-sm ' + (on ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600');
    });
  }
  LL.ready(function () {
    if (!id) { app.innerHTML = LL.empty('No booking selected', '', 'booking.html', 'Your bookings'); return; }
    LLApi.customer.booking(id).then(function (b) {
      if (!b) { app.innerHTML = LL.empty('Booking not found', '', 'dashboard.html', 'Go to dashboard'); return; }
      if (b.reviewed) { app.innerHTML = LL.empty('Already reviewed', 'Thank you. You have already reviewed this booking.', 'booking.html?id=' + b.id, 'Back to booking'); return; }
      if (b.status !== 'completed') { app.innerHTML = LL.empty('Not ready for a review', 'You can review a booking once the provider has marked it completed.', 'booking.html?id=' + b.id, 'Back to booking'); return; }
      return LLApi.catalog.provider(b.provider_id).catch(function () { return null; }).then(function (p) {
        app.innerHTML = '<form id="rf" class="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6" novalidate><div><h1 class="text-xl font-extrabold">Rate ' + LL.esc(p ? p.business_name : 'your provider') + '</h1><p class="text-sm text-slate-500 font-semibold">Your review is public and helps others choose.</p></div>' +
          '<div class="flex gap-1" role="group" aria-label="Rating">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-star="' + n + '" aria-label="' + n + ' star">★</button>'; }).join('') + '</div>' +
          '<div><span class="lbl">Would you recommend them?</span><div class="flex gap-2"><button type="button" data-rec="yes">Yes</button><button type="button" data-rec="no">No</button></div></div>' +
          '<div><label class="lbl" for="cm">Comment (optional)</label><textarea id="cm" rows="4" maxlength="1000" class="field resize-none" placeholder="How did it go?"></textarea></div>' +
          '<button id="sb" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-2xl">Submit review</button></form>';
        document.querySelectorAll('[data-star]').forEach(function (s) { s.onclick = function () { rating = Number(s.getAttribute('data-star')); paint(); }; });
        document.querySelectorAll('[data-rec]').forEach(function (s) { s.onclick = function () { rec = s.getAttribute('data-rec') === 'yes'; paint(); }; });
        paint();
        document.getElementById('rf').onsubmit = function (e) {
          e.preventDefault();
          if (!rating) { LL.toast('Choose a star rating.', true); return; }
          if (rec === null) { LL.toast('Tell us whether you would recommend them.', true); return; }
          LL.busy(document.getElementById('sb'), 'Submitting…', function () { return LLApi.customer.submitReview(b.id, rating, document.getElementById('cm').value.trim(), rec); })
            .then(function () { LL.toast('Thanks for your review.'); setTimeout(function () { LL.go('booking.html?id=' + b.id); }, 700); }, function (er) { LL.toast(er.message, true); });
        };
      });
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  });
})();
