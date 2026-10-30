/* complete-profile.html: full-screen "Complete your profile" for customers. Shown once to brand-new sign-ups (see ll-oauth.js
   needsIntro) and reachable any time from the reminder card. Always skippable.
   Step 1 = basic details. Step 2 = optional extras (banner photo, services you like, add funds), each card skippable. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var P = null, busy = false, step = 1, W = null, next = '', loaded2 = false, funding = false, funded = false;
  var picked = [], startPicked = [], skipped = {};
  var PS_SRC = 'https://js.paystack.co/v2/inline.js';
  function err(m) { var b = $('cpErr'); if (!m) { b.style.display = 'none'; b.textContent = ''; return; } b.textContent = m; b.style.display = 'block'; }
  function err2(m) { var b = $('cpErr2'); if (!m) { b.style.display = 'none'; b.textContent = ''; return; } b.textContent = m; b.style.display = 'block'; }
  function esc(s) { return LL.esc(s); }
  function msg(e) { try { return (window.LLApi && LLApi.friendly) ? LLApi.friendly(e) : ((e && e.message) || 'Something went wrong.'); } catch (x) { return 'Something went wrong.'; } }

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
  // Wide 2:1 crop, same as the banner on the profile page.
  function shrinkBanner(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var Wd = Math.min(1280, img.width), H = Math.round(Wd * 0.5), cv = document.createElement('canvas'); cv.width = Wd; cv.height = H;
          var r = Math.max(Wd / img.width, H / img.height), sw = Wd / r, sh = H / r;
          cv.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, Wd, H);
          cv.toBlob(function (b) { URL.revokeObjectURL(url); resolve(b ? new File([b], 'banner.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.84);
        } catch (e) { URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function leave() {
    LLOAuth.markIntroDone();
    LLOAuth.goHome(P, next);
  }

  /* ---------- step switching ---------- */
  function showStep(n) {
    var from = n === 2 ? $('cpS1') : $('cpS2'), to = n === 2 ? $('cpS2') : $('cpS1');
    step = n; from.hidden = true; to.hidden = false;
    to.classList.remove('in-r', 'in-l'); void to.offsetWidth; to.classList.add(n === 2 ? 'in-r' : 'in-l');
    $('cpStepT').textContent = 'Step ' + n + ' of 2';
    $('cpSeg2').classList.toggle('on', n === 2);
    $('cpBack').hidden = n === 1;
    try { window.scrollTo(0, 0); } catch (e) {}
    if (n === 2 && !loaded2) { loaded2 = true; loadStep2(); }
  }

  /* ---------- step 2: banner ---------- */
  function paintBanner() {
    var b = $('cpBan');
    if (P.banner_url) { b.style.backgroundImage = 'url("' + String(P.banner_url).replace(/"/g, '%22') + '")'; b.classList.add('has'); $('cpBanChg').hidden = false; }
    else { b.style.backgroundImage = ''; b.classList.remove('has'); $('cpBanChg').hidden = true; }
  }
  function pickBanner(f) {
    if (!f) return;
    if (!/^image\//.test(f.type)) { err2('Choose a JPG, PNG or WebP image.'); return; }
    err2(''); $('cpBan').classList.add('up');
    shrinkBanner(f).then(function (small) { return LLApi.uploadBanner(small); }).then(function (url) {
      P.banner_url = url; $('cpBan').classList.remove('up'); paintBanner(); LL.toast('Banner added.');
    }).catch(function (e) {
      $('cpBan').classList.remove('up');
      var m = (e && e.message) || '';
      err2(/banner_url/.test(m) ? 'Banner is not set up yet. Run migration 009 in Supabase.' : (m || 'Could not upload the banner. Please try again.'));
    });
  }

  /* ---------- step 2: services ---------- */
  function updateSel() {
    var s = $('cpSel'); s.textContent = picked.length + ' selected';
    s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump');
  }
  function sameSet(a, b) { if (a.length !== b.length) return false; return a.every(function (x) { return b.indexOf(x) >= 0; }); }
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
  function drawCats(cs) {
    var box = $('cpCats');
    if (!cs.length) { box.innerHTML = '<span class="cp-empty">No service categories have been added yet.</span>'; return; }
    box.innerHTML = cs.map(function (c, i) {
      var img = LLApi.categoryImage(c) || LLApi.categoryPlaceholder;
      return '<button type="button" class="cp-chip" data-c="' + esc(c.name) + '" aria-pressed="' + (picked.indexOf(c.name) >= 0 ? 'true' : 'false') + '" style="--d:' + (i * 40) + 'ms">' +
        '<img src="' + esc(img) + '" alt="" onerror="this.onerror=null;this.src=LLApi.categoryPlaceholder"><span>' + esc(c.name) + '</span><i class="ck">' + CHECK + '</i></button>';
    }).join('');
    box.querySelectorAll('[data-c]').forEach(function (b) {
      b.onclick = function () {
        var n = b.getAttribute('data-c'), i = picked.indexOf(n);
        if (i >= 0) picked.splice(i, 1); else picked.push(n);
        b.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
        updateSel();
      };
    });
  }

  /* ---------- step 2: wallet ---------- */
  function loadPaystack() {
    if (window.PaystackPop) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PS_SRC; s.onload = res;
      s.onerror = function () { rej(new Error('Could not load Paystack. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function confirmDeposit(reference, tries) {
    return LLApi.wallet.verifyDeposit(reference).then(function (r) {
      if (r && r.credited) return r;
      if (r && (r.status === 'failed' || r.status === 'abandoned')) return r;
      if (tries <= 1) return r;
      return sleep(2500).then(function () { return confirmDeposit(reference, tries - 1); });
    });
  }
  function markAmt() {
    var v = Number(String($('cpAmt').value).replace(/[^0-9.]/g, ''));
    $('cpAmts').querySelectorAll('[data-k]').forEach(function (b) { b.classList.toggle('on', Number(b.getAttribute('data-k')) / 100 === v); });
  }
  function setupWallet() {
    var amts = [100000, 200000, 500000, 1000000];
    $('cpAmts').innerHTML = amts.map(function (k) { return '<button type="button" data-k="' + k + '">' + esc(LL.naira(k)) + '</button>'; }).join('');
    $('cpAmts').querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { $('cpAmt').value = Number(b.getAttribute('data-k')) / 100; markAmt(); }; });
    $('cpAmt').addEventListener('input', markAmt);
    LLApi.wallet.me().then(function (w) {
      W = w || null;
      if (W && W.first_deposit_bonus) { var bn = $('cpBonus'); bn.textContent = '🎁 First top-up bonus: we double it! Add ₦500 and get ₦1,000.'; bn.hidden = false; }
    }, function () { W = null; });
    $('cpAdd').onclick = function () {
      if (funding || funded) return; err2('');
      var n = Number(String($('cpAmt').value).replace(/[^0-9.]/g, '')), kobo = Math.round(n * 100), min = (W && W.min_deposit_kobo) || 0;
      if (!n || kobo < min || kobo <= 0) { err2('The minimum top-up is ' + LL.naira(min || 10000) + '.'); return; }
      funding = true;
      LL.busy($('cpAdd'), 'Opening Paystack…', function () {
        return Promise.all([LLApi.wallet.startDeposit(kobo), loadPaystack()]).then(function (r) {
          var init = r[0];
          return new Promise(function (resolve) {
            new window.PaystackPop().resumeTransaction(init.access_code, {
              onSuccess: function () { resolve({ ref: init.reference, paid: true }); },
              onCancel: function () { resolve({ ref: init.reference, paid: false }); }
            });
          });
        });
      }).then(function (o) {
        if (!o.paid) { funding = false; LL.toast('Payment cancelled. Nothing was charged.'); return; }
        $('cpAdd').disabled = true; $('cpAdd').textContent = 'Confirming payment…';
        return confirmDeposit(o.ref, 5).then(function (r) {
          funding = false;
          if (r && r.credited) {
            funded = true; $('cpOkAmt').textContent = LL.naira(kobo) + ' added to your wallet.';
            $('cdWal').classList.add('funded');
          } else {
            $('cpAdd').disabled = false; $('cpAdd').textContent = 'Add Funds';
            err2((r && r.message) || 'Still waiting for Paystack to confirm. You can check your wallet from the dashboard in a moment.');
          }
        });
      }, function (e) { funding = false; err2(msg(e)); });
    };
  }

  function dismiss(id) {
    var el = $(id); if (!el || skipped[id]) return;
    skipped[id] = true;
    el.style.maxHeight = el.offsetHeight + 'px'; void el.offsetHeight;
    el.classList.add('gone'); el.style.maxHeight = '0px';
    setTimeout(function () { el.hidden = true; }, 480);
  }

  function loadStep2() {
    picked = (P.interests || []).slice(); startPicked = picked.slice();
    paintBanner(); updateSel(); setupWallet();
    LLApi.catalog.categories().then(drawCats, function (e) { $('cpCats').innerHTML = '<span class="cp-empty">' + esc(msg(e)) + '</span>'; });
    $('cpBan').onclick = function () { $('cpBanFile').click(); };
    $('cpBanFile').onchange = function () { var f = this.files && this.files[0]; this.value = ''; pickBanner(f); };
    document.querySelectorAll('[data-skip]').forEach(function (b) { b.onclick = function () { dismiss(b.getAttribute('data-skip')); }; });
    $('cpFinish').onclick = function () {
      if (busy) return; err2('');
      var patch = {};
      if (!skipped.cdCats && picked.length && !sameSet(picked, startPicked)) { patch.interests = picked.slice(); patch.onboarded = true; }
      if (!Object.keys(patch).length) { leave(); return; }
      busy = true; $('cpFinish').disabled = true; $('cpFinishLbl').textContent = 'Saving…';
      LLAuth.updateProfile(patch).then(function (r) {
        if (r.error) { busy = false; $('cpFinish').disabled = false; $('cpFinishLbl').textContent = 'Finish'; err2(r.error.message); return; }
        leave();
      });
    };
  }

  LL.ready(function (profile) {
    P = profile;
    try { next = LLOAuth.safeNext(new URLSearchParams(location.search).get('next')); } catch (e) {}
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

    // X and both "Skip for now" links leave the whole flow; Back on step 2 returns to the details.
    $('cpX').onclick = $('cpSkip').onclick = $('cpSkip2').onclick = function () { leave(); };
    $('cpBack').onclick = function () { showStep(1); };

    // Step 1 saves the details (if any changed), then slides to step 2.
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
      if (!Object.keys(patch).length) { showStep(2); return; }
      busy = true; $('cpSave').disabled = true; $('cpSaveLbl').textContent = 'Saving…';
      LLAuth.updateProfile(patch).then(function (r) {
        busy = false; $('cpSave').disabled = false; $('cpSaveLbl').textContent = 'Continue';
        if (r.error) { err(r.error.message); return; }
        Object.keys(patch).forEach(function (k) { P[k] = patch[k]; });
        showStep(2);
      });
    };
  });
})();
