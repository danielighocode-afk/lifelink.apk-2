/* LIFELINK shared runtime.
   ---------------------------------------------------------------------------
   Small, backend-driven helpers used by every page. NO local/demo data lives here:
   identity, roles and all records come from Supabase (see supabase-auth.js / ll-api.js).

   Page contract:  <body data-ll-page="..." data-ll-role="public|any|customer|provider|admin">
     public    -> no sign-in needed (page may still call LL.whenAuth to adapt its header)
     any       -> any signed-in user
     customer  -> customers (admins may also view)
     provider  -> verified providers (admins may also view)
     admin     -> admins only
   Protected pages stay hidden until the live profile (profiles.role) has been checked.

   Load order on every page:
     supabase-config.js -> supabase-client.js -> supabase-auth.js -> ll-api.js -> lifelink.js -> page script
*/
(function () {
  'use strict';

  var STATUS = {
    open: ['Open', 'bg-blue-50 text-blue-700 border-blue-200'],
    quoted: ['Quotes received', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    accepted: ['Quote accepted', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    confirmed: ['Confirmed', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    provider_on_the_way: ['Provider on the way', 'bg-blue-50 text-blue-700 border-blue-200'],
    arrived: ['Provider arrived', 'bg-blue-50 text-blue-700 border-blue-200'],
    in_progress: ['In progress', 'bg-blue-50 text-blue-700 border-blue-200'],
    completed: ['Completed', 'bg-emerald-50 text-emerald-800 border-emerald-200'],
    cancelled: ['Cancelled', 'bg-slate-100 text-slate-600 border-slate-200'],
    disputed: ['Disputed', 'bg-rose-50 text-rose-700 border-rose-200'],
    pending: ['Pending', 'bg-amber-50 text-amber-800 border-amber-200'],
    verified: ['Verified', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    approved: ['Approved', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    rejected: ['Rejected', 'bg-rose-50 text-rose-700 border-rose-200'],
    declined: ['Declined', 'bg-slate-100 text-slate-600 border-slate-200'],
    withdrawn: ['Withdrawn', 'bg-slate-100 text-slate-600 border-slate-200'],
    under_review: ['Under review', 'bg-blue-50 text-blue-700 border-blue-200'],
    resolved: ['Resolved', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    closed: ['Closed', 'bg-slate-100 text-slate-600 border-slate-200'],
    scheduled: ['Scheduled', 'bg-slate-100 text-slate-700 border-slate-200'],
    soon: ['Soon', 'bg-amber-50 text-amber-800 border-amber-200'],
    emergency: ['Emergency', 'bg-rose-50 text-rose-700 border-rose-200']
  };

  var LL = (window.LL = {
    q: function (k) { return new URLSearchParams(location.search).get(k); },
    go: function (url) { try { document.body.classList.add('ll-leaving'); } catch (e) {} setTimeout(function () { location.href = url; }, 120); },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    // Money is stored in kobo (integer). Display in naira.
    naira: function (kobo) {
      if (kobo == null || isNaN(kobo)) return '';
      return '₦' + (Number(kobo) / 100).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    },
    toKobo: function (naira) {
      var n = Number(String(naira).replace(/[^0-9.]/g, ''));
      return isFinite(n) ? Math.round(n * 100) : NaN;
    },
    date: function (ts) { return ts ? new Date(ts).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; },
    dateTime: function (ts) {
      return ts ? new Date(ts).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    },
    ago: function (ts) {
      if (!ts) return '';
      var s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + ' h ago';
      if (s < 604800) return Math.floor(s / 86400) + ' d ago';
      return LL.date(ts);
    },
    cap: function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); },
    initials: function (name) {
      var p = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!p.length) return '?';
      return (p[0].charAt(0) + (p.length > 1 ? p[1].charAt(0) : '')).toUpperCase();
    },
    badge: function (status) {
      var s = STATUS[status] || [String(status || '').replace(/_/g, ' '), 'bg-slate-100 text-slate-600 border-slate-200'];
      return '<span class="inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-extrabold ' + s[1] + '">' + LL.esc(s[0]) + '</span>';
    },
    stars: function (n) {
      if (n == null) return '';
      return '<span class="text-amber-500 font-extrabold">★ ' + Number(n).toFixed(1) + '</span>';
    },
    avatar: function (name, url, size) {
      size = size || 'w-10 h-10';
      if (url) return '<img src="' + LL.esc(url) + '" alt="" class="' + size + ' rounded-2xl object-cover border border-slate-200">';
      return '<div class="' + size + ' rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-extrabold">' + LL.esc(LL.initials(name)) + '</div>';
    },
    empty: function (title, body, ctaHref, ctaText) {
      return '<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-2"><p class="font-extrabold text-slate-900">' + LL.esc(title) + '</p>' +
        (body ? '<p class="text-sm text-slate-500 max-w-md mx-auto">' + LL.esc(body) + '</p>' : '') +
        (ctaHref ? '<a href="' + LL.esc(ctaHref) + '" class="inline-flex mt-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-5 py-2.5">' + LL.esc(ctaText || 'Continue') + '</a>' : '') +
        '</div>';
    },
    error: function (msg) {
      return '<div class="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p class="font-extrabold">Something went wrong</p><p class="mt-1">' + LL.esc(msg || 'The request could not be completed.') + '</p></div>';
    },
    loading: function (what) {
      return '<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">Loading ' + LL.esc(what || '') + '…</div>';
    },
    toast: function (msg, bad) {
      var t = document.getElementById('ll-toast');
      if (!t) {
        t = document.createElement('div'); t.id = 'll-toast'; t.setAttribute('role', 'status');
        t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);color:#fff;font:700 13px "Plus Jakarta Sans",sans-serif;padding:12px 18px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:.25s;z-index:99999;max-width:90vw;text-align:center;pointer-events:none';
        document.body.appendChild(t);
      }
      t.style.background = bad ? '#BE123C' : '#0F172A';
      t.textContent = msg; t.style.opacity = 1; t.style.transform = 'translateX(-50%) translateY(0)';
      clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = 0; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 3500);
    },
    // Accessible confirm dialog. Resolves true/false. opts: { title, body, confirmText, danger }
    confirm: function (opts) {
      return new Promise(function (resolve) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);backdrop-filter:blur(4px);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px';
        wrap.innerHTML = '<div role="dialog" aria-modal="true" class="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4" style="font-family:\'Plus Jakarta Sans\',sans-serif">' +
          '<h2 class="text-lg font-extrabold text-slate-900">' + LL.esc(opts.title || 'Are you sure?') + '</h2>' +
          (opts.body ? '<div class="text-sm text-slate-600 leading-relaxed">' + (opts.bodyHtml ? opts.body : LL.esc(opts.body)) + '</div>' : '') +
          '<div class="flex justify-end gap-3 pt-2"><button data-no class="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-extrabold text-slate-700 hover:bg-slate-50">Cancel</button>' +
          '<button data-yes class="px-5 py-2.5 rounded-xl text-sm font-extrabold text-white ' + (opts.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700') + '">' + LL.esc(opts.confirmText || 'Confirm') + '</button></div></div>';
        function close(v) { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(v); }
        function onKey(e) { if (e.key === 'Escape') close(false); }
        wrap.querySelector('[data-no]').onclick = function () { close(false); };
        wrap.querySelector('[data-yes]').onclick = function () { close(true); };
        wrap.addEventListener('click', function (e) { if (e.target === wrap) close(false); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        wrap.querySelector('[data-yes]').focus();
      });
    },
    // Confirm dialog with an optional note box. Resolves { note } or null.
    notePrompt: function (opts) {
      return new Promise(function (resolve) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px';
        wrap.innerHTML = '<div role="dialog" aria-modal="true" class="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4" style="font-family:\'Plus Jakarta Sans\',sans-serif"><h2 class="text-lg font-extrabold text-slate-900">' + LL.esc(opts.title) + '</h2>' +
          '<div><label class="block text-xs font-extrabold text-slate-600 uppercase mb-1">Note (optional)</label><textarea data-note rows="3" maxlength="1000" class="w-full border border-slate-300 rounded-2xl p-3 text-sm"></textarea></div>' +
          '<div class="flex justify-end gap-3"><button data-no class="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-extrabold">Cancel</button><button data-yes class="px-5 py-2.5 rounded-xl text-sm font-extrabold text-white bg-emerald-600">' + LL.esc(opts.confirmText || 'Continue') + '</button></div></div>';
        function close(v) { wrap.remove(); resolve(v); }
        wrap.querySelector('[data-no]').onclick = function () { close(null); };
        wrap.querySelector('[data-yes]').onclick = function () { close({ note: wrap.querySelector('[data-note]').value.trim() }); };
        document.body.appendChild(wrap); wrap.querySelector('[data-note]').focus();
      });
    },
    // Sidebar layouts (dashboard / provider / admin): profile pill, active nav item, mobile nav, sign-out.
    initSidebar: function (profile, activeKey) {
      var pill = document.getElementById('sideProfile');
      if (pill) pill.innerHTML = LL.avatar(profile.full_name, profile.avatar_url, 'w-10 h-10') +
        '<div class="min-w-0"><h4 class="text-sm font-extrabold text-slate-900 leading-tight truncate">' + LL.esc(profile.full_name || 'Your account') + '</h4>' +
        '<span class="text-xs font-semibold text-slate-400 capitalize">' + LL.esc(profile.role) + '</span></div>';
      var so = document.getElementById('sideSignOut'); if (so) so.onclick = LL.signOut;
      var mob = document.getElementById('mobileNav');
      document.querySelectorAll('#sideNav [data-nav]').forEach(function (a) {
        var on = a.getAttribute('data-nav') === activeKey;
        if (on) a.classList.add('nav-item-active');
        if (mob) {
          var c = document.createElement('a'); c.href = a.getAttribute('href');
          c.className = 'shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold border ' + (on ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200');
          c.textContent = a.textContent.trim().replace(/\d+$/, ''); mob.appendChild(c);
        }
      });
    },
    setHeader: function (title, sub) {
      var t = document.getElementById('pageTitle'), s2 = document.getElementById('pageSub');
      if (t && title != null) t.textContent = title; if (s2) s2.textContent = sub || '';
    },
    // Set an element's badge (e.g. unread count); hides it when zero.
    setBadge: function (id, n) {
      var el = document.getElementById(id); if (!el) return;
      el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', !n);
    },
    // Photo/file thumbnails via signed URLs (private buckets). Fills <div data-signed-gallery="bucket" data-paths="a,b">.
    signedGallery: function (el, bucket, paths) {
      if (!el || !paths || !paths.length) return;
      el.innerHTML = '';
      paths.forEach(function (p) {
        LLApi.signedUrl(bucket, p, 600).then(function (url) {
          var isPdf = /\.pdf$/i.test(p);
          var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
          a.className = 'block rounded-xl border border-slate-200 overflow-hidden bg-slate-50 text-xs font-bold text-slate-600';
          a.innerHTML = isPdf ? '<div class="w-24 h-24 flex items-center justify-center">PDF</div>' : '<img src="' + LL.esc(url) + '" alt="Attachment" class="w-24 h-24 object-cover">';
          el.appendChild(a);
        }, function () {});
      });
    },
    // Disable a button while an async action runs; restores its label afterwards.
    busy: function (btn, label, fn) {
      if (!btn) return fn();
      var old = btn.innerHTML; btn.disabled = true; btn.style.opacity = '.6'; if (label) btn.textContent = label;
      var done = function () { btn.disabled = false; btn.style.opacity = ''; btn.innerHTML = old; };
      return Promise.resolve().then(fn).then(function (r) { done(); return r; }, function (e) { done(); throw e; });
    },
    home: function (role) {
      if (role === 'admin') return 'admin.html';
      if (role === 'provider') return 'provider-dashboard.html';
      return 'dashboard.html';
    },
    me: null,        // { id, role, name, email, profile } once known
    _waiters: [],
    // Run cb(profileOrNull) once auth state is known (works on public pages too).
    whenAuth: function (cb) {
      if (LL._authKnown) return cb(LL.me ? LL.me.profile : null);
      LL._waiters.push(cb);
    },
    // Run cb(profile) once the guard has accepted the signed-in user (protected pages).
    ready: function (cb) {
      LL.whenAuth(function (p) { if (p) cb(p); });
    },
    signOut: function () {
      var done = function () { location.href = 'index.html'; };
      if (window.LLAuth && window.LLAuth.signOut) window.LLAuth.signOut().then(done, done); else done();
    },
    _resolveAuth: function (profile, user) {
      LL.me = profile ? { id: profile.id, role: profile.role, name: profile.full_name || '', email: profile.email || (user && user.email) || '', profile: profile } : null;
      LL._authKnown = true;
      var w = LL._waiters.splice(0);
      w.forEach(function (cb) { try { cb(profile || null); } catch (e) { console.error(e); } });
    },
    showFatal: function (msg) {
      try { document.documentElement.style.visibility = ''; } catch (e) {}
      var box = document.createElement('div');
      box.style.cssText = 'max-width:520px;margin:15vh auto;padding:24px;font-family:"Plus Jakarta Sans",sans-serif;border:1px solid #fecdd3;background:#fff1f2;border-radius:20px;color:#9f1239';
      box.innerHTML = '<p style="font-weight:800;margin:0 0 6px">LifeLink could not connect</p><p style="margin:0;font-size:14px">' + LL.esc(msg) + '</p>';
      document.body.innerHTML = ''; document.body.appendChild(box);
    }
  });


  /* ---- live notifications: pop-up (3.5 s), instant page refresh, and automatic redirect to the right page ---- */
  var POP_MS = 3500;
  var liveHandlers = [];
  LL.onLive = function (fn) { liveHandlers.push(fn); };
  // Run a re-render without the loading placeholder or the entrance animation (used for live refreshes).
  LL.quiet = function (el, fn) { if (el) el.setAttribute('data-quiet', '1'); var done = function () { setTimeout(function () { if (el) el.removeAttribute('data-quiet'); }, 700); }; var r; try { r = fn(); } catch (e) { done(); throw e; } Promise.resolve(r).then(done, done); };          // pages register a soft-refresh function
  LL.goWithToast = function (url, msg, bad) {                      // navigate now; the message keeps showing on the next page
    try { sessionStorage.setItem('ll_pop', JSON.stringify({ title: msg, bad: !!bad, t0: Date.now(), link: '' })); } catch (e) {}
    LL.go(url);
  };

  var popCss = false;
  function popStyles() {
    if (popCss) return; popCss = true;
    var s = document.createElement('style');
    s.textContent =
      '#ll-pops{position:fixed;z-index:100000;top:14px;left:50%;transform:translateX(-50%);width:min(420px,calc(100vw - 24px));display:flex;flex-direction:column;gap:10px;pointer-events:none}' +
      '.ll-pop{pointer-events:auto;cursor:pointer;background:#0f172a;color:#fff;border-radius:18px;padding:13px 16px 15px;box-shadow:0 14px 40px rgba(15,23,42,.35);font-family:"Plus Jakarta Sans",system-ui,sans-serif;position:relative;overflow:hidden;display:flex;gap:12px;align-items:flex-start;opacity:0;transform:translateY(-18px) scale(.97);transition:opacity .28s ease,transform .32s cubic-bezier(.2,.9,.3,1.2)}' +
      '.ll-pop.in{opacity:1;transform:none}.ll-pop.out{opacity:0;transform:translateY(-14px) scale(.97);transition:opacity .25s ease,transform .25s ease}' +
      '.ll-pop .ic{flex:none;width:34px;height:34px;border-radius:12px;background:#059669;display:flex;align-items:center;justify-content:center;margin-top:1px}.ll-pop.bad .ic{background:#e11d48}' +
      '.ll-pop b{display:block;font-size:14px;font-weight:800;line-height:1.25}.ll-pop span{display:block;font-size:12.5px;font-weight:600;color:#cbd5e1;margin-top:3px;line-height:1.35}' +
      '.ll-pop i{position:absolute;left:0;bottom:0;height:3px;width:100%;background:#34d399;transform-origin:left;animation:llBar ' + POP_MS + 'ms linear forwards}.ll-pop.bad i{background:#fb7185}' +
      '@keyframes llBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}' +
      '@view-transition{navigation:auto}' +
      '@keyframes llIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
      '#app:not([data-quiet])>*{animation:llIn .34s ease both}#app:not([data-quiet])>*:nth-child(2){animation-delay:.04s}#app:not([data-quiet])>*:nth-child(3){animation-delay:.08s}#app:not([data-quiet])>*:nth-child(n+4){animation-delay:.12s}' +
      'body.ll-leaving{opacity:0;transition:opacity .14s ease}' +
      '@media (prefers-reduced-motion:reduce){#app>*,.ll-pop{animation:none!important;transition:none!important}}';
    document.head.appendChild(s);
  }
  // Shows a pop-up card for 3.5 s. opts: { title, body, link, bad, t0 } (t0 = when it first appeared, so it carries across a page change).
  LL.popup = function (o) {
    popStyles();
    var box = document.getElementById('ll-pops');
    if (!box) { box = document.createElement('div'); box.id = 'll-pops'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var left = POP_MS - (Date.now() - (o.t0 || Date.now())); if (left < 600) return;
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    var el = document.createElement('div'); el.className = 'll-pop' + (o.bad ? ' bad' : '');
    el.innerHTML = '<div class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + (o.bad ? '<path d="M12 8v5M12 17h.01"/>' : '<path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"/>') + '</svg></div>' +
      '<div style="min-width:0"><b>' + LL.esc(o.title || '') + '</b>' + (o.body ? '<span>' + LL.esc(o.body) + '</span>' : '') + '</div><i style="animation-duration:' + left + 'ms"></i>';
    box.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('in'); }); });
    var gone = false;
    function close() { if (gone) return; gone = true; el.classList.remove('in'); el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300); }
    setTimeout(close, left);
    el.onclick = function () { close(); if (o.link) LL.go(o.link); };
  };

  function here() { return (location.pathname.split('/').pop() || 'index.html') + location.search; }
  function pathOf(u) { return String(u || '').replace(/^\//, '').split('?')[0]; }
  function qOf(u, k) { var m = new RegExp('[?&]' + k + '=([^&#]+)').exec(String(u || '')); return m ? decodeURIComponent(m[1]) : ''; }

  // Where should this notification take the person? (client-side routing on top of the notification's own link)
  function routeFor(n) {
    var link = String(n.link || '').replace(/^\//, '');
    if (/provider is on the way/i.test(n.title || '') && /^booking\.html\?id=/.test(link)) return 'tracking.html?id=' + qOf(link, 'id');
    return link;
  }
  var FLOW_PAGES = ['booking.html', 'tracking.html', 'dashboard.html', 'provider-dashboard.html', 'compare-quotes.html', 'provider-request.html'];
  function shouldRedirect(n, target) {
    if (n.type !== 'booking' || !target) return false;
    if (/schedule updated/i.test(n.title || '')) return false;        // refresh in place only
    var cur = pathOf(here());
    if (FLOW_PAGES.indexOf(cur) < 0) return false;                      // never yank someone out of a form, chat or payment page
    var tp = pathOf(target);
    if ((cur === 'booking.html' || cur === 'tracking.html') && (tp === 'booking.html' || tp === 'tracking.html')) {
      var a = LL.q('id'), b = qOf(target, 'id'); if (a && b && a !== b) return false;   // a different booking: pop-up only
    }
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.value && ae.type !== 'search') return false;   // mid-typing
    return true;
  }

  var seen = {}, started = false, liveRefreshT = null;
  function refreshPage() {
    clearTimeout(liveRefreshT);
    liveRefreshT = setTimeout(function () { liveHandlers.forEach(function (fn) { try { fn(); } catch (e) {} }); }, 250);
  }
  function handleNew(n) {
    if (!n || seen[n.id]) return; seen[n.id] = 1;
    LL.popup({ title: n.title, body: n.body, link: routeFor(n) });
    var target = routeFor(n);
    if (shouldRedirect(n, target)) {
      var same = pathOf(target) === pathOf(here()) && (qOf(target, 'id') === LL.q('id'));
      if (same) refreshPage();
      else {
        // Let the card be seen for a moment, then carry it (with its remaining time) to the next page.
        try { sessionStorage.setItem('ll_pop', JSON.stringify({ title: n.title, body: n.body, link: target, t0: Date.now() })); } catch (e) {}
        setTimeout(function () { LL.go(target); }, 1100);
      }
    } else refreshPage();
  }
  function startLive(profile) {
    if (started || !profile || !window.LLApi) return; started = true;
    popStyles();
    // Show a message carried over from the previous page (own action or redirect).
    try {
      var raw = sessionStorage.getItem('ll_pop');
      if (raw) { sessionStorage.removeItem('ll_pop'); var c = JSON.parse(raw); if (c && Date.now() - c.t0 < POP_MS) LL.popup(c); }
    } catch (e) {}
    var key = 'll_seen_' + profile.id, last = null;
    try { last = localStorage.getItem(key); } catch (e) {}
    var cursor = Number(last) || Date.now();
    function stamp(ts) { var t = Date.parse(ts); if (t > cursor) { cursor = t; try { localStorage.setItem(key, String(cursor)); } catch (e) {} } }
    var busy = false;
    function poll() {
      if (busy || document.hidden) return; busy = true;
      LLApi.notifications.list(8).then(function (rows) {
        rows.slice().reverse().forEach(function (n) {
          if (Date.parse(n.created_at) > cursor && !n.read_at) {
            // Older than a minute (arrived while away): don't pop or redirect, just keep the bell up to date.
            if (Date.now() - new Date(n.created_at).getTime() < 60000) handleNew(n); else seen[n.id] = 1;
          }
          stamp(n.created_at);
        });
      }).catch(function () {}).then(function () { busy = false; });
    }
    LLApi.notifications.subscribe(function (n) { if (n.created_at) stamp(n.created_at); handleNew(n); });
    setInterval(poll, 4000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
    poll();
  }

  /* ---- account chip + notification bell (any element carrying the data attributes) ---- */
  function mountChrome(profile) {
    document.querySelectorAll('[data-ll-account]').forEach(function (el) {
      if (!profile) {
        el.innerHTML = '<a href="signin.html" class="text-xs font-extrabold text-slate-700 hover:text-emerald-700 px-3 py-2">Log in</a>' +
          '<a href="signin.html?mode=signup" class="text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl">Get started</a>';
        return;
      }
      var first = String(profile.full_name || '').split(' ')[0] || 'Account';
      el.innerHTML = '<a href="' + LL.home(profile.role) + '" class="flex items-center gap-2 group" title="Open your dashboard">' +
        LL.avatar(profile.full_name, profile.avatar_url, 'w-9 h-9') +
        '<span class="hidden sm:inline-block text-xs font-extrabold text-slate-800 group-hover:text-emerald-700">' + LL.esc(first) + '</span></a>' +
        '<button type="button" data-ll-signout class="text-xs font-bold text-slate-400 hover:text-rose-600 px-2 py-2" title="Sign out">Sign out</button>';
      var so = el.querySelector('[data-ll-signout]'); if (so) so.onclick = LL.signOut;
    });
    if (profile) document.querySelectorAll('[data-ll-bell]').forEach(function (el) { mountBell(el); });
    if (profile) startLive(profile);
  }

  function mountBell(el) {
    if (!window.LLApi || el._llBell) return; el._llBell = true;
    el.style.position = 'relative';
    el.innerHTML = '<button type="button" aria-label="Notifications" class="relative p-2.5 text-slate-500 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 rounded-2xl border border-slate-200 transition">' +
      '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>' +
      '<span data-dot class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold items-center justify-center"></span></button>' +
      '<div data-panel class="hidden absolute right-0 mt-2 w-80 max-h-96 overflow-auto bg-white border border-slate-200 rounded-2xl shadow-xl z-50 text-left"></div>';
    var btn = el.querySelector('button'), dot = el.querySelector('[data-dot]'), panel = el.querySelector('[data-panel]');
    function setCount(n) { dot.textContent = n > 9 ? '9+' : n; dot.classList.toggle('hidden', !n); dot.classList.toggle('flex', !!n); }
    function refreshCount() { LLApi.notifications.unreadCount().then(setCount, function () {}); }
    function renderPanel() {
      panel.innerHTML = '<p class="p-4 text-xs font-bold text-slate-400">Loading…</p>';
      LLApi.notifications.list(15).then(function (rows) {
        if (!rows.length) { panel.innerHTML = '<p class="p-4 text-sm text-slate-500">No notifications yet.</p>'; return; }
        panel.innerHTML = '<div class="flex items-center justify-between px-4 py-3 border-b border-slate-100"><span class="text-xs font-extrabold uppercase tracking-wider text-slate-400">Notifications</span><button data-all class="text-[11px] font-extrabold text-emerald-700">Mark all read</button></div>' +
          rows.map(function (n) {
            return '<a href="' + LL.esc(n.link || '#') + '" data-id="' + LL.esc(n.id) + '" class="block px-4 py-3 border-b border-slate-50 hover:bg-slate-50 ' + (n.read_at ? '' : 'bg-emerald-50/40') + '">' +
              '<p class="text-sm font-extrabold text-slate-900">' + LL.esc(n.title) + '</p>' +
              (n.body ? '<p class="text-xs text-slate-500 mt-0.5">' + LL.esc(n.body) + '</p>' : '') +
              '<p class="text-[10px] font-bold text-slate-400 mt-1">' + LL.esc(LL.ago(n.created_at)) + '</p></a>';
          }).join('');
        var all = panel.querySelector('[data-all]');
        if (all) all.onclick = function (e) { e.stopPropagation(); LLApi.notifications.markAllRead().then(function () { setCount(0); renderPanel(); }); };
        panel.querySelectorAll('a[data-id]').forEach(function (a) { a.addEventListener('click', function () { LLApi.notifications.markRead(a.getAttribute('data-id')); }); });
      }, function (e) { panel.innerHTML = '<p class="p-4 text-sm text-rose-700">' + LL.esc(e.message) + '</p>'; });
    }
    btn.onclick = function (e) { e.stopPropagation(); var open = panel.classList.toggle('hidden') === false; if (open) renderPanel(); };
    document.addEventListener('click', function (e) { if (!el.contains(e.target)) panel.classList.add('hidden'); });
    refreshCount(); setInterval(refreshCount, 45000);
  }

  /* ---- guard / auth bootstrap ---- */
  var body = document.body;
  var need = (body && body.getAttribute('data-ll-role')) || 'public';
  var file = (location.pathname.split('/').pop() || 'index.html') + location.search;

  function bootstrap(retries) {
    if (!window.LLAuth || typeof window.LLAuth.getProfile !== 'function') {
      if (retries > 0) return setTimeout(function () { bootstrap(retries - 1); }, 150);
      if (need === 'public') { LL._resolveAuth(null); mountChrome(null); return; }
      return LL.showFatal('The sign-in scripts did not load. Check your internet connection and reload the page.');
    }
    window.LLAuth.getProfile().then(function (r) {
      var profile = (!r.error && r.user && r.profile) ? r.profile : null;
      if (need === 'public') { LL._resolveAuth(profile, r.user); mountChrome(profile); return; }
      if (!profile) {
        // Distinguish "not signed in" from "backend unreachable".
        if (r.error && !/not signed in/i.test(r.error.message || '')) {
          if (r.user) return LL.showFatal('Your account is signed in, but your profile could not be loaded: ' + (r.error.message || 'unknown error') + '. Make sure the database migrations have been run.');
        }
        return LL.go('signin.html?next=' + encodeURIComponent(file));
      }
      var role = profile.role;
      var allowed = need === 'any' || role === need || role === 'admin';
      if (!allowed) return LL.go(LL.home(role));
      LL._resolveAuth(profile, r.user);
      try { document.documentElement.style.visibility = ''; } catch (e) {}
      mountChrome(profile);
    }).catch(function (err) {
      if (need === 'public') { LL._resolveAuth(null); mountChrome(null); return; }
      LL.showFatal((err && err.message) || 'Could not reach the backend.');
    });
  }

  if (need !== 'public') { try { document.documentElement.style.visibility = 'hidden'; } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { bootstrap(40); });
  else bootstrap(40);
})();
