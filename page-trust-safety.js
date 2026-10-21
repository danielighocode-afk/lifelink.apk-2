/* trust-safety.html — safety guidance + report forms stored in Supabase `reports` (admins review them). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KINDS = {
    provider: { cats: ['Unprofessional behaviour', 'Asked to pay outside LifeLink', 'Fake or misleading profile', 'Poor or unsafe work', 'Other'], ref: 'Provider name or profile link' },
    suspicious: { cats: ['Phishing or scam message', 'Suspicious payment request', 'Account compromise', 'Harassment', 'Other'], ref: 'Where did you see it? (optional)' },
    support: { cats: ['Account help', 'Booking question', 'Provider application', 'Bug or error', 'Other'], ref: 'Booking or request reference (optional)' }
  };
  function load(me) {
    document.querySelectorAll('[data-form]').forEach(function (f) {
      var kind = f.getAttribute('data-form'), k = KINDS[kind];
      if (!me) { f.innerHTML = '<p class="text-sm text-slate-600">Please <a class="font-extrabold text-emerald-700 underline" href="signin.html?next=trust-safety.html">sign in</a> to send this. It lets us follow up with you.</p>'; return; }
      f.innerHTML = '<div><label class="lbl">Category</label><select class="field" data-cat><option value="" disabled selected>Select</option>' + k.cats.map(function (c) { return '<option>' + LL.esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="lbl">' + LL.esc(k.ref) + '</label><input class="field" data-ref maxlength="200"></div>' +
        '<div><label class="lbl">Details</label><textarea class="field resize-none" rows="4" maxlength="2000" data-desc placeholder="What happened?"></textarea></div>' +
        '<button class="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm px-6 py-3 rounded-2xl">Send</button>';
      f.onsubmit = function (e) {
        e.preventDefault();
        var cat = f.querySelector('[data-cat]').value, d = f.querySelector('[data-desc]').value.trim();
        if (!cat) { LL.toast('Choose a category.', true); return; }
        if (d.length < 5) { LL.toast('Add a few details (at least 5 characters).', true); return; }
        LL.busy(f.querySelector('button'), 'Sending…', function () { return LLApi.reports.submit({ kind: kind, category: cat, reference: f.querySelector('[data-ref]').value.trim(), description: d }); })
          .then(function () { LL.toast('Thank you. Your message was sent to the LifeLink team.'); f.querySelector('[data-desc]').value = ''; f.querySelector('[data-ref]').value = ''; mine(); }, function (er) { LL.toast(er.message, true); });
      };
    });
    mine();
  }
  function mine() {
    var box = $('mine'); if (!LL.me) { box.classList.add('hidden'); return; }
    LLApi.reports.mine().then(function (rows) {
      if (!rows.length) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      $('mineList').innerHTML = rows.map(function (r) { return '<div class="flex justify-between items-center bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm"><span class="font-bold">' + LL.esc(LL.cap(r.kind)) + ' · ' + LL.esc(r.category) + '</span><span class="flex items-center gap-3"><span class="text-xs text-slate-400 font-semibold">' + LL.esc(LL.ago(r.created_at)) + '</span>' + LL.badge(r.status === 'open' ? 'pending' : r.status) + '</span></div>'; }).join('');
    }, function () {});
  }
  LL.whenAuth(load);
})();
