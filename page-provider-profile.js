/* provider-profile.html (?id=) — public provider detail: info, services, reviews. */
(function () {
  'use strict';
  var app = document.getElementById('app'), id = LL.q('id');
  LL.whenAuth(function (me) {
    if (!id) { app.innerHTML = LL.empty('No provider selected', '', 'discovery.html', 'Find providers'); return; }
    app.innerHTML = LL.loading('provider');
    Promise.all([LLApi.catalog.provider(id), LLApi.catalog.services(id), LLApi.catalog.reviews(id)]).then(function (r) {
      var p = r[0]; if (!p) { app.innerHTML = LL.empty('Provider not found', 'They may not be verified yet.', 'discovery.html', 'Find providers'); return; }
      var canReq = !me || me.role === 'customer';
      var cta = canReq ? '<a href="' + (me ? 'request.html?provider=' + LL.esc(id) : 'signin.html?next=' + encodeURIComponent('request.html?provider=' + id)) + '" class="inline-flex bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-6 py-3 rounded-2xl">Request a quote</a>' : '';
      document.title = p.business_name + ' - LIFELINK';
      app.innerHTML = '<section class="bg-white border border-slate-200 rounded-3xl p-6 space-y-4"><div class="flex gap-4 items-start">' + LL.avatar(p.business_name, p.avatar_url, 'w-20 h-20') +
        '<div class="min-w-0 flex-1"><h1 class="text-2xl font-extrabold text-slate-900">' + LL.esc(p.business_name) + '</h1><p class="text-sm font-semibold text-slate-500">' + LL.esc(p.category || '') + (p.service_area ? ' · ' + LL.esc(p.service_area) : '') + '</p>' +
        '<p class="text-sm font-semibold mt-1">' + (p.rating_avg != null ? LL.stars(p.rating_avg) + ' <span class="text-slate-400">(' + (p.review_count || 0) + ' reviews)</span>' : '<span class="text-slate-400">No reviews yet</span>') + '</p></div>' +
        '<span class="text-[11px] font-extrabold px-3 py-1 rounded-full ' + (p.available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500') + '">' + (p.available ? 'Available' : 'Not taking work') + '</span></div>' +
        (p.bio ? '<p class="text-sm text-slate-700 whitespace-pre-wrap">' + LL.esc(p.bio) + '</p>' : '') +
        '<div class="flex flex-wrap gap-4 text-xs font-bold text-slate-500"><span>' + (p.jobs_done || 0) + ' jobs completed</span>' + (p.years_experience != null ? '<span>' + p.years_experience + ' years experience</span>' : '') + '<span class="text-emerald-700">Verified by LifeLink</span></div>' +
        ((p.skills || []).length ? '<div class="flex flex-wrap gap-2">' + p.skills.map(function (s) { return '<span class="text-xs font-bold bg-slate-100 text-slate-600 px-3 py-1 rounded-full">' + LL.esc(s) + '</span>'; }).join('') + '</div>' : '') + cta + '</section>' +
        '<section class="space-y-3"><h2 class="font-extrabold">Services</h2>' + (r[1].length ? r[1].map(function (s) { return '<div class="bg-white border border-slate-200 rounded-2xl p-4 flex justify-between gap-3"><div><p class="font-extrabold text-sm">' + LL.esc(s.title) + '</p>' + (s.description ? '<p class="text-xs text-slate-500">' + LL.esc(s.description) + '</p>' : '') + '</div><p class="font-extrabold text-sm shrink-0">From ' + LL.naira(s.base_price_kobo) + '</p></div>'; }).join('') : '<p class="text-sm text-slate-500">This provider has not listed services yet. Request a quote to discuss your job.</p>') + '</section>' +
        '<section class="space-y-3"><h2 class="font-extrabold">Reviews</h2>' + (r[2].length ? r[2].map(function (v) { return '<div class="bg-white border border-slate-200 rounded-2xl p-4"><div class="flex justify-between"><span class="text-amber-500 font-extrabold">' + '★'.repeat(v.rating) + '</span><span class="text-xs text-slate-400 font-semibold">' + LL.esc(LL.date(v.created_on)) + '</span></div>' + (v.comment ? '<p class="text-sm text-slate-700 mt-1">' + LL.esc(v.comment) + '</p>' : '') + '</div>'; }).join('') : '<p class="text-sm text-slate-500">No reviews yet.</p>') + '</section>';
    }).catch(function (e) { app.innerHTML = LL.error(e.message); });
  });
})();
