/* profile.html — customer profile: overview, edit profile, change photo, account settings, privacy & security, appearance.
   Uses LLAuth.getProfile/updateProfile, LLApi.uploadAvatar (public "avatars" bucket) and read-only wallet/bookings counts. */
(function () {
  'use strict';
  var app = document.getElementById('app'), P = null, user = null, view = 'overview', focusField = '';
  var NATIVE = !!(window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  function sv(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var I = {
    back: sv('<path d="M15 5l-7 7 7 7"/>'), gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    cam: sv('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'), pin: sv('<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>'),
    edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'), next: sv('<path d="M9 5l7 7-7 7"/>'), plus: sv('<path d="M12 5v14M5 12h14"/>'),
    book: sv('<path d="M12 5v14M5 12h14"/>'), search: sv('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'), jobs: sv('<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/>'),
    wallet: sv('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 13h2M3 10h18"/>'), star: sv('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.200 9.500l6.100-.9z"/>'),
    user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'), lock: sv('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
    shield: sv('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'), db: sv('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.700 3.100 3 7 3s7-1.300 7-3V6M5 12v6c0 1.700 3.100 3 7 3s7-1.300 7-3v-6"/>'),
    palette: sv('<path d="M12 3a9 9 0 100 18c1.500 0 2-1 1.500-2s0-2 1.500-2h2a3 3 0 003-3c0-5-4-11-8-11z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.500" r="1"/><circle cx="16" cy="10" r="1"/>'),
    out: sv('<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>'), img: sv('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.600"/><path d="M21 16l-5-5-8 8"/>'), trash: sv('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500L19 19M5 19l1.500-1.500M17.500 6.500L19 5"/>'), moon: sv('<path d="M20 14A8 8 0 019.500 4 8 8 0 1020 14z"/>'), phone: sv('<rect x="7" y="2.500" width="10" height="19" rx="2.500"/><path d="M11 18h2"/>'),
    cal: sv('<rect x="4" y="5" width="16" height="15" rx="2.500"/><path d="M4 10h16M9 3v4M15 3v4"/>'), mail: sv('<rect x="3" y="5" width="18" height="14" rx="2.500"/><path d="M3 7l9 6 9-6"/>'), phn: sv('<path d="M5 4h4l2 5-2.500 1.500a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>'), gen: sv('<circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/>')
  };
  function esc(s) { return LL.esc(s == null ? '' : s); }
  function initials() { return LL.initials(P.full_name || P.email || 'U'); }
  function avatar(cls) { return '<div class="' + cls + '">' + (P.avatar_url ? '<img src="' + esc(P.avatar_url) + '" alt="" decoding="async">' : esc(initials())) + '</div>'; }
  function go(v, f) { focusField = f || ''; if (v === view) { render(); return; } try { history.pushState({ pf: v }, ''); } catch (e) {} show(v); }
  function back() { if (view !== 'overview') { try { history.back(); } catch (e) { show('overview'); } } else if (history.length > 1) history.back(); else location.href = NATIVE ? 'home.html' : 'dashboard.html'; }
  function show(v) { view = v; render(); window.scrollTo(0, 0); }
  function bar(title, right) { return '<div class="pf-bar"><button type="button" class="pf-back" id="pfBack" aria-label="Back">' + I.back + '</button><h1>' + esc(title) + '</h1>' + (right || '') + '</div>'; }
  function row(icon, title, sub, id, extra) { return '<button type="button" class="pf-li' + (extra || '') + '" id="' + id + '"><span class="pf-ic">' + icon + '</span><div><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' + I.next + '</button>'; }

  /* ---------- 1. overview ---------- */
  function vOverview() {
    var qa = [['Book a Service', I.book, 'request.html'], ['Find Providers', I.search, 'discovery.html'], ['My Bookings', I.jobs, 'dashboard.html?section=bookings'], ['Wallet', I.wallet, 'dashboard.html?section=wallet'], ['Reviews', I.star, 'dashboard.html?section=reviews'], ['Settings', I.gear, '#account']];
    app.innerHTML = '<div class="pf-v"><section class="pf-top"><div class="pf-row1"><img src="images/lifelink-logo.png" alt="LifeLink"><button type="button" class="pf-gear" id="pfGear" aria-label="Account settings">' + I.gear + '</button></div>' +
      '<div class="pf-who"><div class="pf-av">' + avatar('ph') + '<button type="button" class="pf-cam" id="pfCam" aria-label="Change photo">' + I.cam + '</button></div><div style="min-width:0"><h2 class="pf-name">' + esc(P.full_name || 'Your name') + '</h2><p class="pf-tag">Customer</p>' +
      (P.home_area ? '<p class="pf-loc">' + I.pin + '<span>' + esc(P.home_area) + '</span></p>' : '') + '<button type="button" class="pf-edit" id="pfEdit">' + I.edit + 'Edit Profile</button></div></div></section>' +
      '<div class="pf-body"><section class="pf-card pf-wal"><div><small>Wallet Balance</small><b id="pfBal">—</b><button type="button" class="pf-add" id="pfAdd">+ Add Money</button></div>' +
      '<button type="button" class="pf-bk" id="pfBk"><div><small>Total Bookings</small><b id="pfCnt">—</b></div>' + I.next + '</button></section>' +
      '<h3 class="pf-h">Quick Actions</h3><div class="pf-qa">' + qa.map(function (q, i) { return '<button type="button" data-go="' + esc(q[2]) + '" style="animation-delay:' + i * 45 + 'ms"><span class="pf-ic">' + q[1] + '</span>' + esc(q[0]) + '</button>'; }).join('') + '</div>' +
      '<h3 class="pf-h">Account</h3><div class="pf-list">' + row(I.user, 'Account Settings', 'Name, phone, date of birth and more', 'rAcc') + row(I.lock, 'Privacy & Security', 'Password and your data', 'rPriv') + row(I.palette, 'Appearance', 'Theme and text size', 'rApp') +
      '<a class="pf-li" href="trust-safety.html"><span class="pf-ic">' + I.shield + '</span><div><b>Trust & Safety</b><small>How LifeLink keeps you safe</small></div>' + I.next + '</a>' +
      '<button type="button" class="pf-li danger" id="rOut"><span class="pf-ic">' + I.out + '</span><div><b>Sign out</b></div></button></div></div></div>';
    document.getElementById('pfGear').onclick = function () { go('account'); };
    document.getElementById('pfCam').onclick = function () { go('photo'); };
    document.getElementById('pfEdit').onclick = function () { go('edit'); };
    document.getElementById('pfAdd').onclick = function () { location.href = 'dashboard.html?section=wallet'; };
    document.getElementById('pfBk').onclick = function () { location.href = 'dashboard.html?section=bookings'; };
    app.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { var t = b.getAttribute('data-go'); if (t === '#account') go('account'); else location.href = t; }; });
    document.getElementById('rAcc').onclick = function () { go('account'); };
    document.getElementById('rPriv').onclick = function () { go('privacy'); };
    document.getElementById('rApp').onclick = function () { go('appearance'); };
    document.getElementById('rOut').onclick = function () { window.LLAuth.signOut().then(function () { location.href = 'index.html'; }); };
    try {
      LLApi.wallet.me().then(function (w) { var e = document.getElementById('pfBal'); if (e) e.textContent = LL.naira(w.available_kobo); }, function () {});
      LLApi.customer.bookings().then(function (b) { var e = document.getElementById('pfCnt'); if (e) e.textContent = b.length; }, function () {});
    } catch (e) {}
  }

  /* ---------- 2/3. edit profile ---------- */
  var GENDERS = [['', 'Select'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other'], ['prefer_not_to_say', 'Prefer not to say']];
  function vEdit() {
    var today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    app.innerHTML = '<div class="pf-v pf-sub">' + bar('Edit Profile', '<button type="button" class="pf-save" id="pfSave">Save</button>') + '<div class="pf-pad">' +
      '<div class="pf-big">' + avatar('ph') + '<button type="button" class="pf-cam" id="pfCam" aria-label="Change photo">' + I.cam + '</button></div><p class="pf-cap" id="pfChg" style="cursor:pointer">Change Profile Photo</p><p class="pf-cap2">JPG, PNG or WebP · Max 2 MB</p>' +
      '<label class="pf-l" for="fName">Full Name</label><input id="fName" class="pf-in" maxlength="120" value="' + esc(P.full_name) + '" autocomplete="name">' +
      '<label class="pf-l" for="fPhone">Phone Number</label><input id="fPhone" class="pf-in" inputmode="tel" value="' + esc(P.phone) + '" autocomplete="tel">' +
      '<label class="pf-l" for="fEmail">Email Address</label><input id="fEmail" class="pf-in" value="' + esc(P.email || (user && user.email)) + '" readonly><p class="pf-hint">Your sign-in email cannot be changed here. Contact support from the Trust &amp; Safety page.</p>' +
      '<label class="pf-l" for="fArea">Location</label><input id="fArea" class="pf-in" maxlength="120" value="' + esc(P.home_area) + '" placeholder="e.g. Lekki, Lagos">' +
      '<label class="pf-l" for="fDob">Date of Birth <small>(optional)</small></label><input id="fDob" type="date" class="pf-in" max="' + today.toISOString().slice(0, 10) + '" min="1900-01-01" value="' + esc(P.date_of_birth) + '">' +
      '<label class="pf-l" for="fGen">Gender <small>(optional)</small></label><select id="fGen" class="pf-in">' + GENDERS.map(function (g) { return '<option value="' + g[0] + '"' + ((P.gender || '') === g[0] ? ' selected' : '') + '>' + g[1] + '</option>'; }).join('') + '</select>' +
      '<label class="pf-l" for="fAbout">About Me <small>(optional)</small></label><textarea id="fAbout" class="pf-in" maxlength="200" placeholder="Tell providers a little about yourself">' + esc(P.about) + '</textarea><p class="pf-hint" id="fCnt" style="text-align:right">0/200</p></div>' +
      '<div class="pf-foot"><button type="button" class="pf-go" id="pfSave2">Save Changes</button></div></div>';
    var a = document.getElementById('fAbout'), c = document.getElementById('fCnt');
    function cnt() { c.textContent = a.value.length + '/200'; } a.addEventListener('input', cnt); cnt();
    document.getElementById('pfBack').onclick = back;
    document.getElementById('pfCam').onclick = function () { go('photo'); }; document.getElementById('pfChg').onclick = function () { go('photo'); };
    function save() {
      var patch = {}, v = function (id) { return document.getElementById(id).value.trim(); };
      if (v('fName') !== (P.full_name || '')) patch.full_name = v('fName');
      if (v('fPhone') && v('fPhone') !== (P.phone || '')) patch.phone = v('fPhone');
      if (v('fArea') !== (P.home_area || '')) patch.home_area = v('fArea') || null;
      if (v('fDob') !== (P.date_of_birth || '')) patch.date_of_birth = v('fDob') || null;
      if (v('fGen') !== (P.gender || '')) patch.gender = v('fGen') || null;
      if (v('fAbout') !== (P.about || '')) patch.about = v('fAbout') || null;
      if (!Object.keys(patch).length) { LL.toast('No changes to save.'); return; }
      var b1 = document.getElementById('pfSave'), b2 = document.getElementById('pfSave2'); b1.disabled = b2.disabled = true;
      window.LLAuth.updateProfile(patch).then(function (r) {
        b1.disabled = b2.disabled = false;
        if (r.error) { LL.toast(r.error.message, true); return; }
        P = Object.assign({}, P, r.data); LL.toast('Profile saved.'); back();
      });
    }
    document.getElementById('pfSave').onclick = save; document.getElementById('pfSave2').onclick = save;
    if (focusField) { var f = document.getElementById(focusField); if (f && !f.readOnly) setTimeout(function () { f.focus(); try { f.scrollIntoView({ block: 'center' }); } catch (e) {} }, 350); }
  }

  /* ---------- 4. change photo ---------- */
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
  function pickFile(f) {
    if (!f) return;
    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(f.type) < 0 && !/^image\//.test(f.type)) { LL.toast('Choose a JPG, PNG or WebP image.', true); return; }
    LL.toast('Uploading photo…');
    shrink(f).then(function (small) { return LLApi.uploadAvatar(small); }).then(function (url) {
      P.avatar_url = url; LL.toast('Profile photo updated.'); render();
    }).catch(function (e) { LL.toast((e && e.message) || 'Could not upload the photo.', true); });
  }
  function vPhoto() {
    app.innerHTML = '<div class="pf-v pf-sub">' + bar('Change Profile Photo') + '<div class="pf-pad"><div class="pf-big" style="width:150px;height:150px;margin-top:14px">' + avatar('ph') + '</div>' +
      '<div class="pf-list" style="margin-top:22px">' + row(I.cam, 'Take Photo', 'Use your camera', 'pfTake') + row(I.img, 'Choose from Gallery', 'Select from your photos', 'pfGal') + (P.avatar_url ? row(I.trash, 'Remove Photo', 'Delete current photo', 'pfDel') : '') + '</div>' +
      '<div class="pf-tip"><b>Tips</b>• Use a clear, well-lit photo<br>• Make sure your face is visible<br>• Images should be less than 2 MB (larger photos are shrunk for you)</div></div>' +
      '<input type="file" id="inCam" accept="image/*" capture="user" style="display:none"><input type="file" id="inGal" accept="image/jpeg,image/png,image/webp" style="display:none"></div>';
    document.getElementById('pfBack').onclick = back;
    document.getElementById('pfTake').onclick = function () { document.getElementById('inCam').click(); };
    document.getElementById('pfGal').onclick = function () { document.getElementById('inGal').click(); };
    document.getElementById('inCam').onchange = function () { pickFile(this.files[0]); this.value = ''; };
    document.getElementById('inGal').onchange = function () { pickFile(this.files[0]); this.value = ''; };
    var d = document.getElementById('pfDel');
    if (d) d.onclick = function () {
      LL.confirm({ title: 'Remove your photo?', body: 'Your initials will be shown instead.', confirmText: 'Remove', danger: true }).then(function (ok) {
        if (!ok) return;
        window.LLAuth.updateProfile({ avatar_url: null }).then(function (r) { if (r.error) { LL.toast(r.error.message, true); return; } P.avatar_url = null; LL.toast('Photo removed.'); render(); });
      });
    };
  }

  /* ---------- 5. account settings ---------- */
  var GL = { male: 'Male', female: 'Female', other: 'Other', prefer_not_to_say: 'Prefer not to say' };
  function vAccount() {
    app.innerHTML = '<div class="pf-v pf-sub">' + bar('Account Settings') + '<div class="pf-pad"><div class="pf-list"><div class="pf-li" style="cursor:default"><span class="pf-ic">' + I.user + '</span><div><b>Account Type</b><small>Customer</small></div></div></div>' +
      '<div class="pf-list" style="margin-top:14px">' + row(I.edit, 'Change Name', P.full_name || 'Add your name', 'aName') + row(I.phn, 'Phone Number', P.phone || 'Add your phone number', 'aPhone') + row(I.mail, 'Email Address', P.email || (user && user.email) || '', 'aMail') +
      row(I.cal, 'Date of Birth', P.date_of_birth ? LL.date(P.date_of_birth) : 'Not set', 'aDob') + row(I.gen, 'Gender', GL[P.gender] || 'Not set', 'aGen') + '</div>' +
      '<div class="pf-list" style="margin-top:14px">' + row(I.lock, 'Privacy & Security', 'Password and your data', 'aPriv') + row(I.palette, 'Appearance', 'Theme and text size', 'aApp') + '</div></div></div>';
    document.getElementById('pfBack').onclick = back;
    var m = { aName: 'fName', aPhone: 'fPhone', aDob: 'fDob', aGen: 'fGen' };
    Object.keys(m).forEach(function (k) { document.getElementById(k).onclick = function () { go('edit', m[k]); }; });
    document.getElementById('aMail').onclick = function () { LL.toast('Your sign-in email cannot be changed here. Contact support from Trust & Safety.'); };
    document.getElementById('aPriv').onclick = function () { go('privacy'); }; document.getElementById('aApp').onclick = function () { go('appearance'); };
  }

  /* ---------- 7. privacy & security ---------- */
  function openPw() {
    var w = document.createElement('div'); w.className = 'pf-sheet dc-sheet open'; w.setAttribute('role', 'dialog');
    w.innerHTML = '<div class="pf-scrim"></div><div class="pf-panel"><div style="width:42px;height:4px;border-radius:4px;background:var(--ll-border,#cbd5e1);margin:0 auto 10px"></div><h3>Change Password</h3><label class="pf-l" for="pwN" style="margin-top:0">New password</label><input id="pwN" type="password" class="pf-in" autocomplete="new-password" placeholder="At least 8 characters"><button type="button" class="pf-go" id="pwGo" style="margin-top:16px">Update Password</button></div>';
    document.body.appendChild(w); document.body.style.overflow = 'hidden';
    function close() { document.body.style.overflow = ''; if (w.parentNode) w.parentNode.removeChild(w); }
    w.querySelector('.pf-scrim').onclick = close;
    w.querySelector('#pwGo').onclick = function () {
      var v = w.querySelector('#pwN').value;
      if (v.length < 8) { LL.toast('New password must be at least 8 characters.', true); return; }
      window.LLSB.getClient().then(function (sb) { return sb.auth.updateUser({ password: v }); }).then(function (r) {
        if (r && r.error) { LL.toast(r.error.message, true); return; }
        LL.toast('Password updated.'); close();
      }).catch(function (e) { LL.toast((e && e.message) || 'Password update failed.', true); });
    };
    setTimeout(function () { var i = w.querySelector('#pwN'); if (i) i.focus(); }, 300);
  }
  function vPrivacy() {
    app.innerHTML = '<div class="pf-v pf-sub">' + bar('Privacy & Security') + '<div class="pf-pad"><div class="pf-list">' + row(I.lock, 'Change Password', 'Keep your account safe', 'pPw') + '</div>' +
      '<h3 class="pf-h">Data & Privacy</h3><div class="pf-list">' + row(I.db, 'Delete My Account', 'Permanently remove your account and data', 'pDel') +
      '<a class="pf-li" href="trust-safety.html"><span class="pf-ic">' + I.shield + '</span><div><b>Trust & Safety</b><small>How we protect your data</small></div>' + I.next + '</a></div>' +
      '<p class="pf-hint" style="margin-top:12px">Your date of birth, gender and about-me details are private to you. Providers only see your name and the details you put in a request.</p></div></div>';
    document.getElementById('pfBack').onclick = back;
    document.getElementById('pPw').onclick = openPw;
    document.getElementById('pDel').onclick = function () {
      LL.confirm({ title: 'Delete your account?', body: 'This permanently removes your account and data. Accounts that have bookings cannot be deleted automatically because booking history must be kept.', confirmText: 'Delete account', danger: true }).then(function (ok) {
        if (!ok) return;
        LLApi.deleteAccount().then(function () { return window.LLAuth.signOut().catch(function () {}); }).then(function () { location.href = 'index.html'; }, function (e) { LL.toast(LLApi.friendly(e), true); });
      });
    };
  }

  /* ---------- 8. appearance ---------- */
  function applyFont(f) {
    try { localStorage.setItem('ll-font', f); } catch (e) {}
    document.documentElement.style.fontSize = f === 'small' ? '93.75%' : f === 'large' ? '112.5%' : '';
  }
  function vAppearance() {
    var th = (window.LLApp && LLApp.getTheme()) || 'system', fs = 'medium';
    try { fs = localStorage.getItem('ll-font') || 'medium'; } catch (e) {}
    app.innerHTML = '<div class="pf-v pf-sub">' + bar('Appearance') + '<div class="pf-pad"><h3 class="pf-h" style="margin-top:6px">Theme</h3><div class="pf-th" id="thG">' +
      [['light', 'Light', I.sun], ['dark', 'Dark', I.moon], ['system', 'System', I.phone]].map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + (th === t[0] ? 'on' : '') + '">' + t[2] + t[1] + '</button>'; }).join('') + '</div>' +
      '<h3 class="pf-h">Text Size</h3><div class="pf-th pf-fs" id="fsG">' + [['small', 'Small', '14px'], ['medium', 'Medium', '17px'], ['large', 'Large', '21px']].map(function (t) { return '<button type="button" data-f="' + t[0] + '" class="' + (fs === t[0] ? 'on' : '') + '"><span style="font-size:' + t[2] + '">Aa</span>' + t[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="pf-foot"><button type="button" class="pf-go" id="apSave">Save Preferences</button></div></div>';
    document.getElementById('pfBack').onclick = back;
    document.getElementById('thG').onclick = function (e) { var b = e.target.closest('[data-t]'); if (!b) return; if (window.LLApp) LLApp.setTheme(b.getAttribute('data-t')); this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); };
    document.getElementById('fsG').onclick = function (e) { var b = e.target.closest('[data-f]'); if (!b) return; applyFont(b.getAttribute('data-f')); this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); };
    document.getElementById('apSave').onclick = function () { LL.toast('Preferences saved.'); back(); };
  }

  function render() {
    ({ overview: vOverview, edit: vEdit, photo: vPhoto, account: vAccount, privacy: vPrivacy, appearance: vAppearance }[view] || vOverview)();
    var b = document.getElementById('pfBack'); if (b && !b.onclick) b.onclick = back;
  }

  LL.whenAuth(function (profile) {
    if (!profile) { location.href = 'signin.html?next=profile.html'; return; }
    if (profile.role !== 'customer') { location.href = LL.home(profile.role); return; }
    P = Object.assign({}, profile);
    window.LLAuth.getProfile().then(function (r) { user = r.user; if (r.profile) P = Object.assign({}, P, r.profile); render(); });
    window.addEventListener('popstate', function (e) { show((e.state && e.state.pf) || 'overview'); });
    try { history.replaceState({ pf: 'overview' }, ''); } catch (e) {}
    render();
  });
})();
