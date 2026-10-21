/* dispute.html (?booking=) — either party reports a problem on a paid booking; lists existing disputes. */
(function () {
  'use strict';
  var app = document.getElementById('app'), id = LL.q('booking'), files = [];
  var CATS = ['Work not completed', 'Poor quality of work', 'Provider did not show up', 'Customer did not show up', 'Price disagreement', 'Safety concern', 'Other'];
  function list(ds) {
    if (!ds.length) return '';
    return '<section class="space-y-3"><h2 class="font-extrabold text-slate-900">Disputes on this booking</h2>' + ds.map(function (d) {
      return '<article class="bg-white border border-slate-200 rounded-2xl p-5 space-y-2"><div class="flex justify-between items-center"><p class="font-extrabold">' + LL.esc(d.category) + '</p>' + LL.badge(d.status) + '</div>' +
        '<p class="text-sm text-slate-700 whitespace-pre-wrap">' + LL.esc(d.description) + '</p>' +
        (d.resolution_note ? '<p class="text-sm bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-900"><strong>Admin decision:</strong> ' + LL.esc(d.resolution_note) + '</p>' : '') +
        '<div data-ev="' + LL.esc((d.evidence_paths || []).join(',')) + '" class="flex flex-wrap gap-2"></div><p class="text-[11px] font-semibold text-slate-400">' + LL.esc(LL.dateTime(d.created_at)) + '</p></article>';
    }).join('') + '</section>';
  }
  LL.ready(function (me) {
    if (!id) { app.innerHTML = LL.empty('No booking selected', 'Open a booking and choose "Report a problem".', LL.home(me.role), 'Go to dashboard'); return; }
    var back = me.role === 'provider' ? 'provider-dashboard.html?section=bookings' : 'booking.html?id=' + id;
    document.getElementById('backLink').href = back;
    Promise.all([LLApi.customer.disputes(id), me.role === 'provider' ? Promise.resolve({ status: 'confirmed' }) : LLApi.customer.booking(id)]).then(function (r) {
      var ds = r[0], b = r[1];
      if (!b) { app.innerHTML = LL.empty('Booking not found', '', LL.home(me.role), 'Go to dashboard'); return; }
      var mineOpen = ds.some(function (d) { return d.reporter_id === me.id && (d.status === 'open' || d.status === 'under_review'); });
      var can = ['confirmed', 'provider_on_the_way', 'arrived', 'in_progress', 'completed', 'disputed'].indexOf(b.status) >= 0 && !mineOpen;
      var html = '<h1 class="text-xl font-extrabold text-slate-900">Report a problem</h1>';
      if (can) {
        html += '<form id="df" class="bg-white border border-slate-200 rounded-3xl p-6 space-y-5" novalidate><div><label class="lbl" for="dc">What went wrong?</label><select id="dc" class="field"><option value="" disabled selected>Select a category</option>' + CATS.map(function (c) { return '<option>' + LL.esc(c) + '</option>'; }).join('') + '</select></div>' +
          '<div><label class="lbl" for="dd">Describe the problem</label><textarea id="dd" rows="5" maxlength="2000" class="field resize-none" placeholder="What happened? Be specific."></textarea></div>' +
          '<div><span class="lbl">Evidence (optional, up to 5 files, 10 MB each)</span><input id="df-files" type="file" multiple accept="image/jpeg,image/png,application/pdf" class="text-sm"><div id="fl" class="text-xs font-semibold text-slate-500 mt-1"></div></div>' +
          '<button id="ds" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-3.5 rounded-2xl">Submit dispute</button></form>';
      } else if (mineOpen) html += '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">You already have an open dispute on this booking. An administrator will review it.</div>';
      else html += '<div class="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600">A dispute can only be opened on a paid booking. If you have not paid, you can cancel the booking instead.</div>';
      app.innerHTML = html + list(ds);
      app.querySelectorAll('[data-ev]').forEach(function (el) { var p = el.getAttribute('data-ev'); if (p) LL.signedGallery(el, 'dispute-evidence', p.split(',')); });
      var inp = document.getElementById('df-files');
      if (inp) inp.onchange = function () { files = Array.prototype.slice.call(inp.files, 0, 5); document.getElementById('fl').textContent = files.map(function (f) { return f.name; }).join(', '); };
      var f = document.getElementById('df');
      if (f) f.onsubmit = function (e) {
        e.preventDefault();
        var cat = document.getElementById('dc').value, desc = document.getElementById('dd').value.trim();
        if (!cat) { LL.toast('Choose a category.', true); return; }
        if (desc.length < 5) { LL.toast('Describe the problem (at least 5 characters).', true); return; }
        LL.busy(document.getElementById('ds'), 'Submitting…', function () { return LLApi.customer.openDispute({ bookingId: id, category: cat, description: desc, files: files }); })
          .then(function () { LL.toast('Dispute submitted. An administrator will review it.'); setTimeout(function () { location.reload(); }, 800); }, function (er) { LL.toast(er.message, true); });
      };
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  });
})();
