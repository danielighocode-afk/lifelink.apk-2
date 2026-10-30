/* add-phone.html: shown once to anyone who signed up with Google (no phone number on the account yet). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function err(m) { var b = $('err'); if (!m) { b.classList.add('hidden'); b.textContent = ''; return; } b.textContent = m; b.classList.remove('hidden'); }
  LL.ready(function (profile) {
    var next = '';
    try { next = LLOAuth.safeNext(new URLSearchParams(location.search).get('next')); } catch (e) {}
    // Already has a number (opened by mistake or number added elsewhere): carry on.
    if (profile.role === 'admin' || (profile.phone && String(profile.phone).trim())) { LLOAuth.afterSignIn(next); return; }
    var needName = !profile.full_name || String(profile.full_name).trim().length < 2;
    if (needName) $('nameWrap').classList.remove('hidden');
    $('skipOut').onclick = function () { LL.signOut(); };
    var busy = false;
    function submit() {
      if (busy) return; err('');
      var patch = { phone: $('phone').value };
      if (needName) patch.full_name = $('fullName').value;
      var pe = LLAuth.validatePhone(patch.phone); if (pe) { err(pe); return; }
      if (needName) { var ne = LLAuth.validateFullName(patch.full_name); if (ne) { err(ne); return; } }
      busy = true; $('save').disabled = true; $('save').textContent = 'Saving…';
      LLAuth.updateProfile(patch).then(function (r) {
        if (r.error) {
          busy = false; $('save').disabled = false; $('save').textContent = 'Continue';
          err(/already exists|duplicate|unique/i.test(r.error.message) ? 'That phone number is already used by another LifeLink account.' : r.error.message);
          return;
        }
        LLOAuth.afterSignIn(next);
      });
    }
    $('save').onclick = submit;
    $('phone').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  });
})();
