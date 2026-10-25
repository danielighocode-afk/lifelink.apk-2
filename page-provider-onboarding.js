/* provider-onboarding.html — 4-step provider application: details, professional info, bio/skills, document. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var step = 1, avatarFile = null, docFile = null;
  function show(n) {
    step = n;
    for (var i = 1; i <= 4; i++) { $('step' + i).classList.toggle('hidden', i !== n); var d = $('dot' + i); d.className = 'h-1.5 flex-1 rounded-full ' + (i <= n ? 'bg-emerald-500' : 'bg-slate-200'); }
    $('stepLabel').textContent = 'Step ' + n + ' of 4';
    $('backBtn').classList.toggle('invisible', n === 1);
    $('nextBtn').textContent = n === 4 ? 'Submit application' : 'Continue';
  }
  function validate(n) {
    var bad = function (el, m) { LL.toast(m, true); $(el).focus(); return false; };
    if (n === 1) { if ($('fullName').value.trim().length < 2) return bad('fullName', 'Enter your full name.'); if ($('phone').value.trim().length < 7) return bad('phone', 'Enter a phone number.'); }
    if (n === 2) {
      if ($('business').value.trim().length < 2) return bad('business', 'Enter your business or trading name.');
      if (!$('category').value) return bad('category', 'Choose your main category.');
      if ($('area').value.trim().length < 2) return bad('area', 'Enter the area you serve.');
      var y = $('years').value; if (y !== '' && (Number(y) < 0 || Number(y) > 80)) return bad('years', 'Years of experience must be between 0 and 80.');
    }
    if (n === 3 && $('bio').value.trim().length < 20) return bad('bio', 'Write a short description of at least 20 characters.');
    if (n === 4 && !docFile) { LL.toast('Choose an ID or certificate file to upload.', true); return false; }
    return true;
  }
  function submit() {
    var skills = $('skills').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    LL.busy($('nextBtn'), 'Submitting…', function () {
      var prof = window.LLAuth.updateProfile({ full_name: $('fullName').value.trim(), phone: $('phone').value.trim() }).then(function (r) { if (r && r.error) throw r.error; });
      return prof.then(function () { return avatarFile ? LLApi.uploadAvatar(avatarFile) : null; })
        .then(function () { return LLApi.provider.apply({ business: $('business').value.trim(), category: $('category').selectedOptions[0].text, bio: $('bio').value.trim(), area: $('area').value.trim(), years: $('years').value === '' ? null : Number($('years').value), skills: skills }); })
        .then(function () { return LLApi.provider.addDocument($('docType').value, docFile); });
    }).then(function () { LL.toast('Application submitted.'); setTimeout(function () { LL.go('provider-verification.html'); }, 700); }, function (e) { LL.toast(LLApi.friendly(e), true); });
  }
  LL.ready(function (profile) {
    if (profile.role === 'admin') { LL.go('admin.html'); return; }
    LLApi.provider.me().then(function (p) { if (p) LL.go('provider-verification.html'); }, function () {});
    $('fullName').value = profile.full_name || ''; $('phone').value = profile.phone || '';
    LLApi.catalog.categories().then(function (cs) {
      $('category').innerHTML = cs.length ? '<option value="" disabled selected>Select your main category</option>' + cs.map(function (c) { return '<option value="' + LL.esc(c.id) + '">' + LL.esc(c.name) + '</option>'; }).join('') : '<option value="">No categories available yet</option>';
      if (!cs.length) { $('category').disabled = true; $('catNote').classList.remove('hidden'); }
      $('category').addEventListener('change', function () { var c = cs.filter(function (x) { return x.id === $('category').value; })[0], im = $('catPrev'); if (!c) { im.classList.add('hidden'); return; } im.onerror = function () { im.onerror = null; im.src = LLApi.categoryPlaceholder; }; im.src = LLApi.categoryImage(c) || LLApi.categoryPlaceholder; im.alt = c.name; im.classList.remove('hidden'); });
    }, function (e) { LL.toast(e.message, true); });
    $('photo').onchange = function () { var f = this.files[0]; if (!f) return; if (['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) < 0 || f.size > 2097152) { LL.toast('Photo must be a JPG, PNG or WebP under 2 MB.', true); this.value = ''; return; } avatarFile = f; $('photoName').textContent = f.name; };
    $('doc').onchange = function () { var f = this.files[0]; if (!f) return; if (['application/pdf', 'image/jpeg', 'image/png'].indexOf(f.type) < 0 || f.size > 10485760) { LL.toast('Document must be a PDF, JPG or PNG under 10 MB.', true); this.value = ''; docFile = null; return; } docFile = f; $('docName').textContent = f.name; };
    $('backBtn').onclick = function () { if (step > 1) show(step - 1); };
    $('nextBtn').onclick = function () { if (!validate(step)) return; if (step < 4) show(step + 1); else submit(); };
    show(1);
  });
})();
