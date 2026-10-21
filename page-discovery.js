/* discovery.html — public provider directory from public_providers (verified providers only). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var all = [];
  function card(p) {
    return '<article class="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 hover:border-emerald-300 transition">' +
      '<div class="flex gap-3">' + LL.avatar(p.business_name, p.avatar_url, 'w-14 h-14') +
      '<div class="min-w-0 flex-1"><a href="provider-profile.html?id=' + LL.esc(p.provider_id) + '" class="font-extrabold text-slate-900 hover:text-emerald-700 block truncate">' + LL.esc(p.business_name) + '</a>' +
      '<p class="text-xs font-semibold text-slate-500 truncate">' + LL.esc(p.category || '') + (p.service_area ? ' · ' + LL.esc(p.service_area) : '') + '</p>' +
      '<p class="text-xs font-semibold mt-0.5">' + (p.rating_avg != null ? LL.stars(p.rating_avg) + ' <span class="text-slate-400">(' + (p.review_count || 0) + ')</span>' : '<span class="text-slate-400">No reviews yet</span>') + '</p></div>' +
      '<span class="self-start text-[10px] font-extrabold px-2 py-1 rounded-full ' + (p.available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500') + '">' + (p.available ? 'Available' : 'Busy') + '</span></div>' +
      (p.bio ? '<p class="text-sm text-slate-600 line-clamp-2">' + LL.esc(p.bio) + '</p>' : '') +
      '<div class="flex items-center justify-between text-xs font-semibold text-slate-500"><span>' + (p.jobs_done || 0) + ' jobs done' + (p.years_experience != null ? ' · ' + p.years_experience + ' yrs' : '') + '</span><span>' + (p.min_price_kobo != null ? 'From ' + LL.naira(p.min_price_kobo) : '') + '</span></div>' +
      '<div class="flex gap-2"><a href="provider-profile.html?id=' + LL.esc(p.provider_id) + '" class="flex-1 text-center border border-slate-200 hover:bg-slate-50 font-extrabold text-sm py-2.5 rounded-xl">View profile</a>' +
      '<a href="request.html?provider=' + LL.esc(p.provider_id) + '" class="flex-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm py-2.5 rounded-xl">Request quote</a></div></article>';
  }
  function draw() {
    var t = $('search').value.trim().toLowerCase(), c = $('cat').value, a = $('area').value, av = $('avail').checked, s = $('sort').value;
    var rows = all.filter(function (p) {
      if (c && p.category !== c) return false;
      if (a && String(p.service_area || '').toLowerCase().indexOf(a.toLowerCase()) < 0) return false;
      if (av && !p.available) return false;
      if (t && (p.business_name + ' ' + (p.category || '') + ' ' + (p.bio || '') + ' ' + (p.skills || []).join(' ') + ' ' + (p.service_area || '')).toLowerCase().indexOf(t) < 0) return false;
      return true;
    });
    rows.sort(function (x, y) {
      if (s === 'price') return (x.min_price_kobo == null ? 1e15 : x.min_price_kobo) - (y.min_price_kobo == null ? 1e15 : y.min_price_kobo);
      if (s === 'jobs') return (y.jobs_done || 0) - (x.jobs_done || 0);
      return (y.rating_avg == null ? -1 : y.rating_avg) - (x.rating_avg == null ? -1 : x.rating_avg);
    });
    $('count').textContent = rows.length + ' provider' + (rows.length === 1 ? '' : 's');
    $('results').innerHTML = rows.length ? rows.map(card).join('') : '<div class="md:col-span-2 xl:col-span-3">' + (all.length ? LL.empty('No providers match', 'Try removing a filter.') : LL.empty('No verified providers yet', 'Providers appear here once an administrator has verified them.', 'request.html', 'Post a request anyway')) + '</div>';
  }
  function init() {
    $('results').innerHTML = LL.loading('providers');
    Promise.all([LLApi.catalog.providers(), LLApi.catalog.categories()]).then(function (r) {
      all = r[0];
      var cats = LLApi.uniq(all.map(function (p) { return p.category; })).sort();
      $('cat').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return '<option>' + LL.esc(c) + '</option>'; }).join('');
      var areas = LLApi.uniq(all.map(function (p) { return p.service_area; })).sort();
      $('area').innerHTML = '<option value="">Any area</option>' + areas.map(function (c) { return '<option>' + LL.esc(c) + '</option>'; }).join('');
      var qc = LL.q('category'); if (qc) { var m = r[1].filter(function (c) { return c.slug === qc || c.name.toLowerCase() === qc.toLowerCase(); })[0]; if (m && cats.indexOf(m.name) >= 0) $('cat').value = m.name; }
      var qs = LL.q('q'); if (qs) $('search').value = qs;
      var qa = (LL.q('area') || '').toLowerCase(); if (qa) { areas.forEach(function (x) { if (String(x).toLowerCase().indexOf(qa) >= 0 && !$('area').value) $('area').value = x; }); }
      draw();
    }).catch(function (e) { $('results').innerHTML = '<div class="md:col-span-2 xl:col-span-3">' + LL.error(e.message) + '</div>'; });
    ['search', 'cat', 'area', 'avail', 'sort'].forEach(function (id) { $(id).addEventListener(id === 'search' ? 'input' : 'change', draw); });
  }
  LL.whenAuth(init);
})();
