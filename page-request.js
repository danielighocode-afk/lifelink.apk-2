/* request.html — customer submits a service request in four steps (Details, Location, Request, Confirm).
   Same data call as before: LLApi.customer.createRequest (Supabase service_requests + request-media storage). Only the screens changed. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var urgency = 'soon';
  var files = [], urls = [];
  var categories = [];
  var direct = null; // public provider record when ?provider=<id>
  var pin = null;
  var step = 1, TOTAL = 4, feeKobo = null, prefTime = '';
  var RANGE = { morning: [6, 11.5], afternoon: [12, 16.5], evening: [17, 21] };
  function fmt(h) { var m = h % 1 ? '30' : '00', hh = Math.floor(h), ap = hh >= 12 ? 'PM' : 'AM', h12 = hh % 12 || 12; return h12 + ':' + m + ' ' + ap; }
  function drawTimes() {
    var w = $('prefWindow').value, box = $('timeBox'), g = $('timeGrid');
    prefTime = ''; g.innerHTML = '';
    if (!w) { box.style.display = 'none'; return; }
    for (var h = RANGE[w][0]; h <= RANGE[w][1]; h += 0.5) g.insertAdjacentHTML('beforeend', '<button type="button" data-t="' + fmt(h) + '">' + fmt(h) + '</button>');
    g.querySelectorAll('button').forEach(function (b) { b.onclick = function () { var on = b.classList.contains('on'); g.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); prefTime = on ? '' : b.getAttribute('data-t'); if (!on) b.classList.add('on'); }; });
    box.style.display = 'block';
  }
  var TITLES = ['Request Booking', 'Request Booking', 'Request Booking', 'Review & Confirm'];
  var NEXT = ['Next: Location', 'Next: Request & Photos', 'Next: Review', ''];
  var I_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  var UR = { scheduled: 'Normal (on a scheduled day)', soon: 'Soon (in a day or so)', emergency: 'Emergency (as soon as possible)' };
  var WIN = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

  /* ---------------- photos ---------------- */
  function renderFiles() {
    urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    urls = files.map(function (f) { return URL.createObjectURL(f); });
    $('phGrid').innerHTML = files.map(function (f, i) {
      return '<div><img src="' + urls[i] + '" alt=""><button type="button" class="x" data-rm="' + i + '" aria-label="Remove photo">&times;</button></div>';
    }).join('') + (files.length < 5 ? '<button type="button" class="add" id="phAdd"><span><b>+</b>Add Photo</span></button>' : '');
    $('phGrid').querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { files.splice(Number(b.getAttribute('data-rm')), 1); renderFiles(); }; });
    var a = $('phAdd'); if (a) a.onclick = function () { $('hiddenFileInput').click(); };
  }
  function addFiles(list) {
    Array.prototype.forEach.call(list, function (f) {
      if (files.length >= 5) { LL.toast('You can attach up to 5 photos.', true); return; }
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) < 0) { LL.toast(f.name + ' is not a JPG, PNG or WebP image.', true); return; }
      if (f.size > 10485760) { LL.toast(f.name + ' is larger than 10 MB.', true); return; }
      files.push(f);
    });
    renderFiles();
  }
  function setUrgency(v) {
    urgency = v;
    document.querySelectorAll('[data-urgency]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-urgency') === v); });
  }

  /* ---------------- location / pin ---------------- */
  var pinOpen = false, autoFilled = '';
  function showPinSummary() {
    var c = $('pinCard');
    if (!pin) { c.style.display = 'none'; $('pinStat').textContent = ''; return; }
    $('pinStat').textContent = pin.line || (pin.lat.toFixed(5) + ', ' + pin.lng.toFixed(5));
    c.style.display = 'flex';
  }
  // Full-screen map with a search panel at the bottom (unchanged).
  function openPinMap(locate) {
    if (pinOpen) return; pinOpen = true;
    LLMap.pickerModal({
      initial: pin ? { lat: pin.lat, lng: pin.lng } : null,
      autoLocate: !!locate,
      title: 'Where is the job?',
      confirmText: 'Confirm location',
      onConfirm: function (p) {
        pin = { lat: p.lat, lng: p.lng, line: p.line };
        var li = $('locationInput');
        // Fill the written location from the pin unless the customer typed their own text.
        if (!li.value.trim() || li.value === autoFilled) { autoFilled = (p.line || '').slice(0, 160); if (autoFilled) li.value = autoFilled; }
        showPinSummary(); LL.toast('Location pinned.');
      },
      onClose: function () { pinOpen = false; }
    }).catch(function (e) { pinOpen = false; LL.toast(e.message, true); });
  }
  function bindPin() {
    $('pinOpen').onclick = function () { openPinMap(false); };
    $('pinClear').onclick = function () { pin = null; showPinSummary(); };
    $('pinMe').onclick = function () {
      if (!navigator.geolocation) { LL.toast('This device cannot share its location.', true); return; }
      openPinMap(true);
    };
  }

  /* ---------------- steps ---------------- */
  function catName() { var c = categories.filter(function (x) { return x.id === $('categorySelect').value; })[0]; return c ? c.name : ''; }
  function validate(n) {
    if (n === 1) {
      if (categories.length && !$('categorySelect').value) { LL.toast('Please choose a service type.', true); $('categorySelect').focus(); return false; }
      if ($('issueInput').value.trim().length < 5) { LL.toast('Describe the service you need (at least 5 characters).', true); $('issueInput').focus(); return false; }
    }
    if (n === 2 && $('locationInput').value.trim().length < 2) { LL.toast('Enter where the service is needed.', true); $('locationInput').focus(); return false; }
    return true;
  }
  function row(label, html, to) { return '<div class="rq-r"><div><small>' + label + '</small>' + html + '</div>' + (to ? '<button type="button" data-edit="' + to + '">Edit</button>' : '') + '</div>'; }
  function summary() {
    var d = $('prefDate').value, w = $('prefWindow').value;
    var when = (d ? LL.date(d) : 'Flexible') + (w ? ' · ' + WIN[w] : '') + (prefTime ? ' · ' + prefTime : '');
    var prov = direct
      ? '<div class="rq-pv" style="margin-top:6px"><div class="av" style="width:40px;height:40px;font-size:14px">' + (direct.avatar_url ? '<img src="' + LL.esc(direct.avatar_url) + '" alt="">' : LL.esc(LL.initials(direct.business_name))) + '</div><b>' + LL.esc(direct.business_name) + I_OK + '</b></div>'
      : '<b>Open to all matching verified providers</b>';
    $('rqSum').innerHTML =
      row('Service', '<b>' + LL.esc(catName() || 'General request') + '</b>', 1) +
      row('Provider', prov) +
      row('Location', '<b>' + LL.esc($('locationInput').value.trim()) + '</b>' + (pin ? '<small style="margin-top:3px">Map pin set</small>' : ''), 2) +
      row('Date & time', '<b>' + LL.esc(when) + '</b>', 1) +
      row('Urgency', '<b>' + LL.esc(UR[urgency]) + '</b>', 1) +
      row('Description', '<b>' + LL.esc($('issueInput').value.trim()) + '</b>', 1) +
      row('Photos', files.length ? '<div class="rq-th">' + urls.map(function (u) { return '<img src="' + u + '" alt="">'; }).join('') + '</div>' : '<b>None added</b>', 3);
    $('rqSum').querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { go(Number(b.getAttribute('data-edit'))); }; });
  }
  function go(n, back, fromPop) {
    if (n < 1 || n > TOTAL) return;
    var prev = step; step = n;
    document.querySelectorAll('.rq-p').forEach(function (p) {
      var on = Number(p.getAttribute('data-p')) === n;
      p.classList.toggle('on', on); p.classList.toggle('back', !!(back || n < prev));
    });
    document.querySelectorAll('.rq-st').forEach(function (s, i) { s.classList.toggle('on', i + 1 === n); s.classList.toggle('done', i + 1 < n); });
    $('rqLine').style.width = ((n - 1) / (TOTAL - 1)) * 75 + '%';
    $('rqTitle').textContent = TITLES[n - 1];
    var last = n === TOTAL;
    $('rqNext').style.display = last ? 'none' : 'flex'; $('submitBtn').style.display = last ? 'flex' : 'none';
    $('rqNextT').textContent = NEXT[n - 1];
    if (last) summary();
    if (!fromPop) { try { history.pushState({ rqStep: n }, ''); } catch (e) {} }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function back() { if (step > 1) { try { history.back(); } catch (e) { go(step - 1, true, true); } } else if (history.length > 1) history.back(); else location.href = 'home.html'; }

  function init() {
    var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    $('prefDate').min = today.toISOString().slice(0, 10);
    $('issueInput').addEventListener('input', function () { $('charCounter').textContent = this.value.length + ' / 2000'; });
    $('prefWindow').addEventListener('change', drawTimes);
    document.querySelectorAll('[data-urgency]').forEach(function (b) { b.onclick = function () { setUrgency(b.getAttribute('data-urgency')); }; });
    setUrgency('soon');
    $('addGallery').onclick = function () { $('hiddenFileInput').click(); };
    $('addCamera').onclick = function () { $('cameraInput').click(); };
    $('hiddenFileInput').onchange = function () { addFiles(this.files); this.value = ''; };
    $('cameraInput').onchange = function () { addFiles(this.files); this.value = ''; };
    renderFiles();
    var q = LL.q('q'); if (q) { $('issueInput').value = q.slice(0, 2000); $('issueInput').dispatchEvent(new Event('input')); }

    var directId = LL.q('provider');
    var pDirect = directId ? LLApi.catalog.provider(directId).then(function (p) {
      if (!p) { LL.toast('That provider is not available. Your request will go to all matching providers instead.', true); return; }
      direct = p;
      $('provBox').innerHTML = '';
    }).catch(function () {}) : Promise.resolve();
    var pCat = LLApi.catalog.categories().then(function (cats) {
      categories = cats;
      var sel = $('categorySelect');
      if (!cats.length) {
        sel.innerHTML = '<option value="">No categories have been set up yet</option>';
        sel.disabled = true;
        $('catNote').textContent = 'An administrator has not added any service categories yet. You can still describe what you need.';
        $('catNote').classList.remove('hidden');
        return;
      }
      sel.innerHTML = '<option value="" selected disabled>Select the service needed</option>' +
        cats.map(function (c) { return '<option value="' + LL.esc(c.id) + '">' + LL.esc(c.name) + '</option>'; }).join('');
      var want = LL.q('category');
      if (want) { var m = cats.filter(function (c) { return c.slug === want || c.name.toLowerCase() === want.toLowerCase(); })[0]; if (m) sel.value = m.id; }
      function prev() { var c = cats.filter(function (x) { return x.id === sel.value; })[0], im = $('catPrev'); if (!im) return; if (!c) { im.classList.add('hidden'); return; } im.onerror = function () { im.onerror = null; im.src = LLApi.categoryPlaceholder; }; im.src = LLApi.categoryImage(c) || LLApi.categoryPlaceholder; im.alt = c.name; im.classList.remove('hidden'); }
      sel.addEventListener('change', prev); prev();
    }).catch(function (e) { $('catNote').textContent = e.message; $('catNote').classList.remove('hidden'); });

    Promise.all([pCat, pDirect]).then(function () {
      // provider card (real data only) and, when the customer came from a profile, pre-select the provider's category
      if (direct) {
        var m = categories.filter(function (c) { return c.name === direct.category; })[0];
        if (m && !$('categorySelect').value) $('categorySelect').value = m.id;
        $('provBox').innerHTML = '<span class="rq-l" style="margin-top:0">Selected provider</span><div class="rq-card"><div class="rq-pv"><div class="av">' +
          (direct.avatar_url ? '<img src="' + LL.esc(direct.avatar_url) + '" alt="">' : LL.esc(LL.initials(direct.business_name))) + '</div><div><b>' + LL.esc(direct.business_name) + I_OK + '</b><small>' +
          (direct.rating_avg != null ? '<span class="st">★</span> ' + Number(direct.rating_avg).toFixed(1) + ' (' + (direct.jobs_done || 0) + ' jobs)' : (direct.jobs_done || 0) + ' jobs done') + (direct.service_area ? ' • ' + LL.esc(direct.service_area) : '') + '</small></div></div></div><p class="rq-sub" style="margin:8px 2px 0;font-size:12.5px">Only they will see this request and can quote.</p>';
      }
    });
    // flat fee wording uses the real wallet setting when it can be read
    try { LLApi.wallet.me().then(function (w) { if (w && w.fee_kobo != null) { feeKobo = w.fee_kobo; $('feeNote').textContent = 'Requests and quotes are free. To confirm a booking, you and the provider each need at least ' + LL.naira(feeKobo) + ' in your LifeLink wallet; it is only charged once the provider arrives and you confirm it. You pay the provider directly for the job.'; } }, function () {}); } catch (e) {}

    bindPin(); showPinSummary();
    $('rqNext').onclick = function () { if (validate(step)) go(step + 1); };
    $('rqBack').onclick = back;
    $('backLink').onclick = function (e) { if (step > 1) { e.preventDefault(); back(); } };
    window.addEventListener('popstate', function (e) { var n = (e.state && e.state.rqStep) || 1; if (n !== step) go(n, n < step, true); });
    try { history.replaceState({ rqStep: 1 }, ''); } catch (e) {}
    $('requestForm').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); if (step < TOTAL && validate(step)) go(step + 1); } });
    $('requestForm').addEventListener('submit', submit);
    go(1, false, true);
  }

  function submit(e) {
    e.preventDefault();
    if (step < TOTAL) return;
    var description = $('issueInput').value.trim();
    var location = $('locationInput').value.trim();
    var catId = $('categorySelect').value;
    if (description.length < 5) { go(1); LL.toast('Describe the service you need (at least 5 characters).', true); return; }
    if (categories.length && !catId) { go(1); LL.toast('Please choose a service type.', true); return; }
    if (location.length < 2) { go(2); LL.toast('Enter where the service is needed.', true); return; }
    var cat = categories.filter(function (c) { return c.id === catId; })[0];
    var btn = $('submitBtn');
    LL.busy(btn, 'Sending…', function () {
      return LLApi.customer.createRequest({
        categoryId: cat ? cat.id : null,
        categoryText: cat ? cat.name : null,
        description: prefTime ? (description + '\n\nPreferred time: ' + prefTime).slice(0, 2000) : description,
        location: location,
        urgency: urgency,
        preferredDate: $('prefDate').value || null,
        preferredWindow: $('prefWindow').value || null,
        directProviderId: direct ? direct.provider_id : null,
        files: files,
        pin: pin
      });
    }).then(function (row) {
      LL.toast(row && row.pinFailed ? 'Request sent, but the map pin could not be saved. Arrival will be confirmed manually.' : 'Request sent. Providers can now respond with quotes.', !!(row && row.pinFailed));
      setTimeout(function () { LL.go('compare-quotes.html?request=' + encodeURIComponent(row.id)); }, 700);
    }).catch(function (err) { LL.toast(err.message || 'Your request could not be saved.', true); });
  }

  LL.ready(init);
})();
