/* provider-verification.html — provider sees verification status and uploads documents. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var MSG = {
    pending: ['Under review', 'An administrator will review your documents. You will be notified of the outcome.'],
    verified: ['Verified', 'You are verified and can send quotes on requests.'],
    rejected: ['Rejected', 'Your application was not approved. Read the note below, upload corrected documents, and you will be reviewed again.']
  };
  function load() {
    app.innerHTML = LL.loading('verification');
    Promise.all([LLApi.provider.me(), LLApi.provider.documents()]).then(function (r) {
      var p = r[0], docs = r[1];
      if (!p) { LL.go('provider-onboarding.html'); return; }
      var m = MSG[p.verification_status] || [p.verification_status, ''];
      var h = '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-2"><div class="flex justify-between items-center"><h1 class="text-xl font-extrabold">Verification</h1>' + LL.badge(p.verification_status) + '</div><p class="font-extrabold text-slate-900">' + LL.esc(m[0]) + '</p><p class="text-sm text-slate-600">' + LL.esc(m[1]) + '</p></section>';
      h += '<section class="space-y-3"><h2 class="font-extrabold">Your documents</h2>' + (docs.length ? docs.map(function (d) {
        return '<div class="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3"><div><p class="font-extrabold text-sm">' + LL.esc(({ nin: 'Government ID', cert: 'Trade certificate', other: 'Other document' }[d.doc_type] || d.doc_type)) + '</p><p class="text-[11px] font-semibold text-slate-400">' + LL.esc(LL.dateTime(d.created_at)) + '</p>' + (d.reviewer_note ? '<p class="text-xs text-rose-700 font-semibold mt-1">Note: ' + LL.esc(d.reviewer_note) + '</p>' : '') + '</div>' + LL.badge(d.status) + '</div>';
      }).join('') : LL.empty('No documents uploaded yet', 'Upload an ID and any trade certificate so an administrator can verify you.')) + '</section>';
      h += '<form id="uf" class="bg-white border border-slate-200 rounded-3xl p-6 space-y-4" novalidate><h2 class="font-extrabold">Upload a document</h2><div><label class="lbl" for="dt">Document type</label><select id="dt" class="field"><option value="nin">Government ID (e.g. NIN slip)</option><option value="cert">Trade certificate</option><option value="other">Other</option></select></div>' +
        '<div><label class="lbl" for="dfile">File (PDF, JPG or PNG, up to 10 MB)</label><input id="dfile" type="file" accept="application/pdf,image/jpeg,image/png" class="text-sm"></div><button id="us" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 rounded-2xl">Upload</button></form>';
      app.innerHTML = h;
      document.getElementById('uf').onsubmit = function (e) {
        e.preventDefault();
        var f = document.getElementById('dfile').files[0];
        if (!f) { LL.toast('Choose a file first.', true); return; }
        LL.busy(document.getElementById('us'), 'Uploading…', function () { return LLApi.provider.addDocument(document.getElementById('dt').value, f); })
          .then(function () { LL.toast('Document uploaded.'); load(); }, function (er) { LL.toast(er.message, true); });
      };
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  }
  LL.ready(load);
})();
