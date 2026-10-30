/* complete-profile.html: full-screen "Complete your profile" for customers. Shown once to brand-new sign-ups (see ll-oauth.js
   needsIntro) and reachable any time from the reminder card. Always skippable. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var P = null, busy = false;
  function err(m) { var b = $('cpErr'); if (!m) { b.style.display = 'none'; b.textContent = ''; return; } b.textContent = m; b.style.display = 'block'; }
  function esc(s) { return LL.esc(s); }

  function pct() {
    var vals = [P.avatar_url, $('cpName').value.trim().length >= 2, $('cpDob').value, $('cpGender').value, $('cpAbout').value.trim(), $('cpArea').value.trim()];
    var n = vals.filter(Boolean).length, p = Math.round(n * 100 / vals.length);
    $('cpPct').textContent = p + '%'; $('cpFill').style.width = p + '%'; $('cpBar').setAttribute('aria-valuenow', String(p));
  }
  function paintAvatar() {
    $('cpAvIn').innerHTML = P.avatar_url ? '<img src="' + esc(P.avatar_url) + '" alt="">' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  }
  function shrink(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var s = Math.min(img.width, img.height), out = Math.min(800, s), cv = document.createElement('canvas'); cv.width = cv.height = out;
          cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, out, out);
          cv.toBlob(function (b) { URL.revokeObjectURL(url); resolve(b ? new File([b], 'avatar.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.86);
        } catch (e) { URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function leave(next) {
    LLOAuth.markIntroDone();
    LLOAuth.goHome(P, next);
  }

  LL.ready(function (profile) {
    P = profile;
    var next = ''; try { next = LLOAuth.safeNext(new URLSearchParams(location.search).get('next')); } catch (e) {}
    $('cpName').value = profile.full_name || ''; $('cpDob').value = profile.date_of_birth || ''; $('cpGender').value = profile.gender || '';
    $('cpAbout').value = profile.about || ''; $('cpArea').value = profile.home_area || '';
    $('cpDob').max = new Date().toISOString().slice(0, 10);
    $('cpCnt').textContent = String($('cpAbout').value.length);
    paintAvatar(); pct();
    ['cpName', 'cpDob', 'cpGender', 'cpAbout', 'cpArea'].forEach(function (id) { $(id).addEventListener('input', function () { pct(); if (id === 'cpAbout') $('cpCnt').textContent = String($('cpAbout').value.length); }); $(id).addEventListener('change', pct); });

    $('cpAv').onclick = function () { $('cpFile').click(); };
    $('cpFile').onchange = function () {
      var f = this.files && this.files[0]; this.value = ''; if (!f) return;
      if (!/^image\//.test(f.type)) { err('Choose a JPG, PNG or WebP image.'); return; }
      err(''); LL.toast('Uploading photo…');
      shrink(f).then(function (small) { return LLApi.uploadAvatar(small); }).then(function (url) {
        P.avatar_url = url; paintAvatar(); pct(); LL.toast('Photo added.');
      }).catch(function (e) { err((e && e.message) || 'Could not upload the photo. Please try again.'); });
    };

    $('cpX').onclick = $('cpSkip').onclick = function () { leave(next); };

    $('cpSave').onclick = function () {
      if (busy) return; err('');
      var patch = {}, nm = $('cpName').value.trim();
      if (nm !== String(P.full_name || '')) {
        var ne = LLAuth.validateFullName(nm); if (nm && ne) { err(ne); return; } if (nm) patch.full_name = nm;
      }
      if ($('cpDob').value && $('cpDob').value !== (P.date_of_birth || '')) patch.date_of_birth = $('cpDob').value;
      if ($('cpGender').value && $('cpGender').value !== (P.gender || '')) patch.gender = $('cpGender').value;
      var ab = $('cpAbout').value.trim(); if (ab && ab !== (P.about || '')) patch.about = ab;
      var ar = $('cpArea').value.trim(); if (ar && ar !== (P.home_area || '')) patch.home_area = ar;
      if (!Object.keys(patch).length) { leave(next); return; }
      busy = true; $('cpSave').disabled = true; $('cpSaveLbl').textContent = 'Saving…';
      LLAuth.updateProfile(patch).then(function (r) {
        if (r.error) { busy = false; $('cpSave').disabled = false; $('cpSaveLbl').textContent = 'Complete Profile'; err(r.error.message); return; }
        leave(next);
      });
    };
  });
})();
