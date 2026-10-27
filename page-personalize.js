/* personalize.html — customer picks service interests and home area; saved on profiles. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, picked = [];
  LL.ready(function (profile) {
    picked = (profile.interests || []).slice();
    $('area').value = profile.home_area || '';
    LLApi.catalog.categories().then(function (cs) {
      $('cats').innerHTML = cs.length ? cs.map(function (c) { return '<button type="button" data-c="' + LL.esc(c.name) + '" data-img="' + LL.esc(LLApi.categoryImage(c) || LLApi.categoryPlaceholder) + '" class="px-4 py-2.5 rounded-2xl border text-sm font-extrabold"></button>'; }).join('') : '<p class="text-sm text-slate-500">No service categories have been added yet.</p>';
      function paint() { $('cats').querySelectorAll('[data-c]').forEach(function (b) { var on = picked.indexOf(b.getAttribute('data-c')) >= 0; b.innerHTML = '<span class="inline-flex items-center gap-2"><img src="' + b.getAttribute('data-img') + '" alt="" class="w-7 h-7 rounded-lg object-cover" onerror="this.onerror=null;this.src=LLApi.categoryPlaceholder">' + LL.esc(b.getAttribute('data-c')) + '</span>'; b.className = 'px-4 py-2.5 rounded-2xl border text-sm font-extrabold ' + (on ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'); }); }
      $('cats').querySelectorAll('[data-c]').forEach(function (b) { b.onclick = function () { var n = b.getAttribute('data-c'), i = picked.indexOf(n); if (i >= 0) picked.splice(i, 1); else picked.push(n); paint(); }; });
      paint();
    }, function (e) { $('cats').innerHTML = LL.error(e.message); });
    $('save').onclick = function () {
      LL.busy($('save'), 'Saving…', function () { return window.LLAuth.updateProfile({ interests: picked, home_area: $('area').value.trim() || null, onboarded: true }).then(function (r) { if (r && r.error) throw r.error; }); })
        .then(function () { LL.toast('Saved.'); setTimeout(function () { LL.go(LL.home('customer')); }, 600); }, function (e) { LL.toast(LLApi.friendly(e), true); });
    };
  });
})();
