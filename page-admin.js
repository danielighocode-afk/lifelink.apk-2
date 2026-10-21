/* admin.html — administrator console. All data from Supabase; admin-only RPCs enforce permissions server-side. */
(function () {
  'use strict';
  var app = document.getElementById('app'), section = LL.q('section') || 'overview';
  var TITLES = { overview: 'Overview', verification: 'Verification queue', providers: 'Providers', users: 'Users', requests: 'Requests', bookings: 'Bookings', disputes: 'Disputes', reviews: 'Reviews', categories: 'Categories', payments: 'Payments', penalties: 'Arrival penalties (log only)', reports: 'Reports & support' };
  function card(i) { return '<section class="bg-white border border-slate-200 rounded-3xl p-5 space-y-3">' + i + '</section>'; }
  function stat(l, n) { return '<div class="bg-white border border-slate-200 rounded-2xl p-5"><p class="text-3xl font-extrabold">' + n + '</p><p class="text-xs font-extrabold uppercase tracking-wider text-slate-400 mt-1">' + l + '</p></div>'; }
  function table(head, rows) {
    if (!rows.length) return LL.empty('Nothing here yet');
    return '<div class="bg-white border border-slate-200 rounded-2xl overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-[11px] uppercase tracking-wider text-slate-400">' + head.map(function (h) { return '<th class="px-4 py-3">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr class="border-t border-slate-100">' + r.map(function (c) { return '<td class="px-4 py-3 align-top">' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function sum(o) { return Object.keys(o || {}).map(function (k) { return LL.esc(k.replace(/_/g, ' ')) + ': <strong>' + o[k] + '</strong>'; }).join(' · ') || 'none'; }
  function askNote(title) { return LL.notePrompt({ title: title }); }
  function act(fn, okMsg) { return fn.then(function () { LL.toast(okMsg); render(); }, function (e) { LL.toast(e.message, true); }); }

  var S = {
    overview: function () {
      return LLApi.admin.overview().then(function (o) {
        return '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">' + stat('Customers', o.customers) + stat('Providers', o.providers) + stat('Pending applications', o.pending_applications) + stat('Open disputes', o.open_disputes) + stat('Reviews', o.reviews) + stat('Average rating', o.avg_rating == null ? 'n/a' : o.avg_rating) + stat('Completed job value', LL.naira(o.completed_value_kobo)) + '</div>' +
          card('<p class="text-sm"><strong>Requests</strong> — ' + sum(o.requests) + '</p><p class="text-sm"><strong>Bookings</strong> — ' + sum(o.bookings) + '</p>');
      });
    },
    verification: function () {
      return LLApi.admin.applications().then(function (apps) {
        var list = apps.filter(function (a) { return a.provider.verification_status === 'pending'; });
        setTimeout(function () {
          app.querySelectorAll('[data-docs]').forEach(function (el) { var paths = el.getAttribute('data-docs').split('|').filter(Boolean); LL.signedGallery(el, 'verification-docs', paths); });
          app.querySelectorAll('[data-ver]').forEach(function (b) { b.onclick = function () {
            var st = b.getAttribute('data-ver'), id = b.getAttribute('data-id');
            askNote((st === 'verified' ? 'Approve' : 'Reject') + ' this provider?').then(function (r) { if (r) act(LLApi.admin.setVerification(id, st, r.note), st === 'verified' ? 'Provider verified.' : 'Provider rejected.'); });
          }; });
        }, 0);
        if (!list.length) return LL.empty('No pending applications', 'New provider applications will appear here.');
        return '<div class="space-y-4">' + list.map(function (a) {
          var p = a.provider, u = a.profile;
          return card('<div class="flex justify-between gap-3"><div><p class="font-extrabold text-lg">' + LL.esc(p.business_name) + '</p><p class="text-sm text-slate-500">' + LL.esc(u.full_name || '') + ' · ' + LL.esc(u.email || '') + (u.phone ? ' · ' + LL.esc(u.phone) : '') + '</p></div>' + LL.badge(p.verification_status) + '</div>' +
            '<p class="text-sm">Category: <strong>' + LL.esc(p.category || '—') + '</strong> · Area: <strong>' + LL.esc(p.service_area || '—') + '</strong> · Experience: <strong>' + (p.years_experience == null ? '—' : p.years_experience + ' yrs') + '</strong></p>' +
            (p.bio ? '<p class="text-sm text-slate-700">' + LL.esc(p.bio) + '</p>' : '') + ((p.skills || []).length ? '<p class="text-xs text-slate-500">Skills: ' + LL.esc(p.skills.join(', ')) + '</p>' : '') +
            '<div><p class="lbl">Documents (' + a.documents.length + ')</p>' + (a.documents.length ? '<p class="text-xs text-slate-500 mb-2">' + a.documents.map(function (d) { return LL.esc(d.doc_type); }).join(', ') + '</p><div class="flex flex-wrap gap-2" data-docs="' + a.documents.map(function (d) { return LL.esc(d.file_path || ''); }).join('|') + '"></div>' : '<p class="text-sm text-amber-700 font-semibold">No documents uploaded.</p>') + '</div>' +
            '<div class="flex gap-3"><button data-ver="verified" data-id="' + LL.esc(p.profile_id) + '" class="bg-emerald-600 text-white font-extrabold text-sm px-5 py-2.5 rounded-xl">Approve</button><button data-ver="rejected" data-id="' + LL.esc(p.profile_id) + '" class="border border-rose-200 text-rose-700 font-extrabold text-sm px-5 py-2.5 rounded-xl">Reject</button></div>');
        }).join('') + '</div>';
      });
    },
    providers: function () {
      return LLApi.admin.applications().then(function (apps) {
        setTimeout(function () { app.querySelectorAll('[data-ver]').forEach(function (b) { b.onclick = function () { var st = b.getAttribute('data-ver'); askNote('Change status to ' + st + '?').then(function (r) { if (r) act(LLApi.admin.setVerification(b.getAttribute('data-id'), st, r.note), 'Status updated.'); }); }; }); }, 0);
        return table(['Provider', 'Contact', 'Category', 'Status', 'Jobs', 'Rating', 'Actions'], apps.map(function (a) {
          var p = a.provider, id = LL.esc(p.profile_id);
          return ['<strong>' + LL.esc(p.business_name) + '</strong>', LL.esc(a.profile.email || ''), LL.esc(p.category || '—'), LL.badge(p.verification_status), p.jobs_done || 0, p.rating_avg == null ? '—' : p.rating_avg,
            (p.verification_status !== 'verified' ? '<button data-ver="verified" data-id="' + id + '" class="text-xs font-extrabold text-emerald-700 mr-3">Verify</button>' : '') + (p.verification_status !== 'rejected' ? '<button data-ver="rejected" data-id="' + id + '" class="text-xs font-extrabold text-rose-600">Reject</button>' : '')];
        }));
      });
    },
    users: function () { return LLApi.admin.users().then(function (us) { return table(['Name', 'Email', 'Phone', 'Role', 'Joined'], us.map(function (u) { return [LL.esc(u.full_name || '—'), LL.esc(u.email || ''), LL.esc(u.phone || '—'), LL.esc(u.role), LL.esc(LL.date(u.created_at))]; })); }); },
    requests: function () { return LLApi.admin.requests().then(function (rs) { return table(['Category', 'Description', 'Area', 'Urgency', 'Status', 'Created'], rs.map(function (r) { return [LL.esc(r.category_text || '—'), LL.esc(String(r.description).slice(0, 90)), LL.esc(r.location_area), LL.badge(r.urgency), LL.badge(r.status), LL.esc(LL.date(r.created_at))]; })); }); },
    bookings: function () {
      return LLApi.admin.bookings().then(function (bs) {
        setTimeout(function () { app.querySelectorAll('[data-cb]').forEach(function (b) { b.onclick = function () { askNote('Cancel this booking and return reserved fees?').then(function (r) { if (r) act(LLApi.admin.cancelBooking(b.getAttribute('data-cb'), r.note), 'Booking cancelled.'); }); }; }); }, 0);
        return table(['Booking', 'Price', 'LifeLink fee', 'Fee status', 'Status', 'Scheduled', 'Created', ''], bs.map(function (b) {
          var open = ['completed', 'cancelled'].indexOf(b.status) < 0;
          return [LL.esc(String(b.id).slice(0, 8)), LL.naira(b.price_kobo), LL.naira(b.service_fee_kobo), LL.esc(b.fee_status || ''), LL.badge(b.status), LL.esc(LL.dateTime(b.scheduled_for) || '—'), LL.esc(LL.date(b.created_at)),
            open ? '<button data-cb="' + LL.esc(b.id) + '" class="text-xs font-extrabold text-rose-600">Cancel</button>' : ''];
        }));
      });
    },
    disputes: function () {
      return LLApi.admin.disputes().then(function (ds) {
        setTimeout(function () {
          app.querySelectorAll('[data-ev]').forEach(function (el) { var p = el.getAttribute('data-ev'); if (p) LL.signedGallery(el, 'dispute-evidence', p.split(',')); });
          app.querySelectorAll('[data-dis]').forEach(function (b) { b.onclick = function () { var st = b.getAttribute('data-dis'); askNote('Mark dispute as ' + st.replace('_', ' ') + '?').then(function (r) { if (r) act(LLApi.admin.resolveDispute(b.getAttribute('data-id'), st, r.note), 'Dispute updated.'); }); }; });
        }, 0);
        if (!ds.length) return LL.empty('No disputes');
        return '<div class="space-y-3">' + ds.map(function (d) {
          var open = d.status === 'open' || d.status === 'under_review';
          return card('<div class="flex justify-between"><p class="font-extrabold">' + LL.esc(d.category) + '</p>' + LL.badge(d.status) + '</div><p class="text-sm whitespace-pre-wrap">' + LL.esc(d.description) + '</p><div data-ev="' + LL.esc((d.evidence_paths || []).join(',')) + '" class="flex flex-wrap gap-2"></div>' + (d.resolution_note ? '<p class="text-sm bg-slate-50 rounded-xl p-3"><strong>Note:</strong> ' + LL.esc(d.resolution_note) + '</p>' : '') + '<p class="text-xs text-slate-400 font-semibold">Booking ' + LL.esc(String(d.booking_id).slice(0, 8)) + ' · ' + LL.esc(LL.dateTime(d.created_at)) + '</p>' +
            (open ? '<div class="flex gap-3 text-xs font-extrabold"><button data-dis="under_review" data-id="' + LL.esc(d.id) + '" class="border border-slate-200 px-4 py-2 rounded-xl">Mark under review</button><button data-dis="resolved" data-id="' + LL.esc(d.id) + '" class="bg-emerald-600 text-white px-4 py-2 rounded-xl">Resolve</button><button data-dis="closed" data-id="' + LL.esc(d.id) + '" class="border border-slate-200 px-4 py-2 rounded-xl">Close</button></div><p class="text-[11px] text-slate-400">Refunds are not processed here; payments are not integrated yet.</p>' : ''));
        }).join('') + '</div>';
      });
    },
    reviews: function () { return LLApi.admin.reviews().then(function (rs) { return table(['Rating', 'Comment', 'Recommend', 'Date'], rs.map(function (r) { return ['<span class="text-amber-500 font-extrabold">' + '★'.repeat(r.rating) + '</span>', LL.esc(r.comment || '—'), r.recommend ? 'Yes' : 'No', LL.esc(LL.date(r.created_at))]; })); }); },
    categories: function () {
      return LLApi.admin.categories().then(function (cs) {
        setTimeout(function () {
          document.getElementById('cf').onsubmit = function (e) { e.preventDefault(); var n = document.getElementById('cn').value.trim(); var slug = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (n.length < 2) { LL.toast('Enter a category name.', true); return; } act(LLApi.admin.setCategory({ slug: slug, name: n }), 'Category saved.'); };
          app.querySelectorAll('[data-cat]').forEach(function (b) { b.onclick = function () { var c = cs.filter(function (x) { return x.id === b.getAttribute('data-cat'); })[0]; act(LLApi.admin.setCategory({ id: c.id, slug: c.slug, name: c.name, active: !c.active }), 'Category updated.'); }; });
        }, 0);
        return card('<form id="cf" class="flex gap-3"><input id="cn" class="field" maxlength="60" placeholder="New category name (e.g. Plumbing)"><button class="bg-emerald-600 text-white font-extrabold px-6 rounded-2xl">Add</button></form>') +
          table(['Name', 'Slug', 'Status', ''], cs.map(function (c) { return [LL.esc(c.name), LL.esc(c.slug), c.active ? LL.badge('verified').replace('Verified', 'Active') : LL.badge('withdrawn').replace('Withdrawn', 'Hidden'), '<button data-cat="' + LL.esc(c.id) + '" class="text-xs font-extrabold text-slate-600">' + (c.active ? 'Hide' : 'Show') + '</button>']; }));
      });
    },
    payments: function () { return LLApi.admin.deposits().then(function (ps) { return '<div class="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">Wallet deposits made through Paystack. Read-only: balances only change on the server after Paystack confirms a payment.</div>' + table(['Reference', 'Amount', 'Status', 'Credited', 'Date'], ps.map(function (p) { return [LL.esc(p.reference), LL.naira(p.amount_kobo), LL.badge(p.status), LL.esc(p.credited_at ? LL.dateTime(p.credited_at) : '—'), LL.esc(LL.date(p.created_at))]; })); }); },
    penalties: function () {
      return Promise.all([LLApi.admin.penalties(), LLApi.names().catch(function () { return {}; })]).then(function (r) {
        var nm = r[1];
        return '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Log only. These are penalties that WOULD apply under the arrival rules. No money has moved and nobody has been charged. Use them to judge whether the rules behave fairly before any real penalty is switched on.</div>' +
          table(['When', 'Who', 'Role', 'Reason', 'Would apply', 'Booking'], r[0].map(function (p) { return [LL.esc(LL.dateTime(p.created_at)), LL.esc((nm[p.user_id] || {}).display_name || 'User'), LL.esc(LL.cap(p.party)), LL.esc(p.reason), LL.naira(p.amount_kobo), '<span class="text-xs text-slate-400">' + LL.esc(String(p.booking_id).slice(0, 8)) + '</span>']; }));
      });
    },
    reports: function () {
      return LLApi.admin.reports().then(function (rs) {
        setTimeout(function () { app.querySelectorAll('[data-rep]').forEach(function (b) { b.onclick = function () { var st = b.getAttribute('data-rep'); askNote('Mark report as ' + st + '?').then(function (r) { if (r) act(LLApi.admin.setReportStatus(b.getAttribute('data-id'), st, r.note), 'Report updated.'); }); }; }); }, 0);
        if (!rs.length) return LL.empty('No reports', 'Reports and support requests from the Trust & Safety page appear here.');
        return '<div class="space-y-3">' + rs.map(function (r) {
          return card('<div class="flex justify-between"><p class="font-extrabold">' + LL.esc(LL.cap(r.kind)) + ' · ' + LL.esc(r.category) + '</p>' + LL.badge(r.status === 'open' ? 'pending' : r.status) + '</div><p class="text-sm whitespace-pre-wrap">' + LL.esc(r.description) + '</p><p class="text-xs text-slate-500 font-semibold">' + (r.reference ? 'Reference: ' + LL.esc(r.reference) + ' · ' : '') + 'From ' + LL.esc(r.reporter_name || 'a user') + ' · ' + LL.esc(LL.ago(r.created_at)) + '</p>' + (r.admin_note ? '<p class="text-sm bg-slate-50 rounded-xl p-3">' + LL.esc(r.admin_note) + '</p>' : '') +
            '<div class="flex gap-3 text-xs font-extrabold"><button data-rep="reviewing" data-id="' + LL.esc(r.id) + '" class="border border-slate-200 px-4 py-2 rounded-xl">Reviewing</button><button data-rep="actioned" data-id="' + LL.esc(r.id) + '" class="bg-emerald-600 text-white px-4 py-2 rounded-xl">Actioned</button><button data-rep="dismissed" data-id="' + LL.esc(r.id) + '" class="border border-slate-200 px-4 py-2 rounded-xl">Dismiss</button></div>');
        }).join('') + '</div>';
      });
    }
  };
  function render() { app.innerHTML = LL.loading(TITLES[section].toLowerCase()); S[section]().then(function (h) { app.innerHTML = h; }).catch(function (e) { app.innerHTML = LL.error(e.message); }); }
  LL.ready(function (profile) {
    if (profile.role !== 'admin') { LL.go(LL.home(profile.role)); return; }
    if (!S[section]) section = 'overview';
    LL.initSidebar(profile, section); LL.setHeader(TITLES[section], 'Administrator'); render();
  });
})();
