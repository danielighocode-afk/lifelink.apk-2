/* request.html — customer submits a service request (Supabase: service_requests + request-media storage). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var urgency = 'soon';
  var files = [];
  var categories = [];
  var direct = null; // public provider record when ?provider=<id>
  var pin = null;

  function renderFiles() {
    var box = $('fileList');
    box.innerHTML = files.map(function (f, i) {
      return '<span class="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700">' + LL.esc(f.name) +
        '<button type="button" data-rm="' + i + '" class="text-slate-400 hover:text-rose-600" aria-label="Remove">&times;</button></span>';
    }).join('');
    box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { files.splice(Number(b.getAttribute('data-rm')), 1); renderFiles(); }; });
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
    document.querySelectorAll('[data-urgency]').forEach(function (b) {
      var on = b.getAttribute('data-urgency') === v;
      b.className = 'p-3.5 rounded-2xl border text-center cursor-pointer transition ' + (on ? 'border-2 border-emerald-600 bg-emerald-50/80' : 'border-slate-200 bg-slate-50/50 hover:border-slate-300');
    });
  }


  var pinOpen = false, autoFilled = '';
  function showPinSummary() {
    var st = $('pinStat');
    if (!pin) { st.textContent = ''; $('pinClear').classList.add('hidden'); return; }
    st.textContent = 'Pin set: ' + (pin.line || (pin.lat.toFixed(5) + ', ' + pin.lng.toFixed(5)));
    $('pinClear').classList.remove('hidden');
  }
  // Full-screen map with a search panel at the bottom (same on phone and desktop for now).
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

  function init() {
    var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    $('prefDate').min = today.toISOString().slice(0, 10);
    $('issueInput').addEventListener('input', function () { $('charCounter').textContent = this.value.length + ' / 2000 characters'; });
    document.querySelectorAll('[data-urgency]').forEach(function (b) { b.onclick = function () { setUrgency(b.getAttribute('data-urgency')); }; });
    setUrgency('soon');
    $('addPhotos').onclick = function () { $('hiddenFileInput').click(); };
    $('hiddenFileInput').onchange = function () { addFiles(this.files); this.value = ''; };
    var dz = $('dropZone');
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('border-emerald-500'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('border-emerald-500'); });
    dz.addEventListener('drop', function (e) { e.preventDefault(); dz.classList.remove('border-emerald-500'); addFiles(e.dataTransfer.files); });
    var q = LL.q('q'); if (q) { $('issueInput').value = q.slice(0, 2000); $('issueInput').dispatchEvent(new Event('input')); }

    var directId = LL.q('provider');
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
    }).catch(function (e) { $('catNote').textContent = e.message; $('catNote').classList.remove('hidden'); });

    var pDirect = directId ? LLApi.catalog.provider(directId).then(function (p) {
      var b = $('directBanner');
      if (!p) { b.innerHTML = 'That provider is not available. Your request will go to all matching providers instead.'; b.classList.remove('hidden'); return; }
      direct = p;
      b.innerHTML = 'Sending this request directly to <strong>' + LL.esc(p.business_name) + '</strong>. Only they will see it and can quote.';
      b.classList.remove('hidden');
    }).catch(function () {}) : Promise.resolve();

    Promise.all([pCat, pDirect]);
    bindPin();
    $('requestForm').addEventListener('submit', submit);
  }

  function submit(e) {
    e.preventDefault();
    var description = $('issueInput').value.trim();
    var location = $('locationInput').value.trim();
    var catId = $('categorySelect').value;
    if (description.length < 5) { LL.toast('Describe the service you need (at least 5 characters).', true); $('issueInput').focus(); return; }
    if (categories.length && !catId) { LL.toast('Please choose a service category.', true); $('categorySelect').focus(); return; }
    if (location.length < 2) { LL.toast('Enter where the service is needed.', true); $('locationInput').focus(); return; }
    var cat = categories.filter(function (c) { return c.id === catId; })[0];
    var btn = $('submitBtn');
    LL.busy(btn, 'Submitting…', function () {
      return LLApi.customer.createRequest({
        categoryId: cat ? cat.id : null,
        categoryText: cat ? cat.name : null,
        description: description,
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
