/* LifeLink push notifications (native Android app only). Loaded by ll-app.js once a person is signed in.
   1) asks for notification permission  2) registers the phone with Firebase  3) saves the device token in public.device_tokens
   4) opens the right page when a notification is tapped  5) removes the token on sign-out.
   Does nothing in a normal browser. Never touches bookings, wallet or maps. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())) return;
  var PN = cap.Plugins && cap.Plugins.PushNotifications;
  if (!PN || window.__llPush) return;
  window.__llPush = true;

  var K_TOKEN = 'll_push_token', K_SAVED = 'll_push_saved', K_ASKED = 'll_push_asked';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function client() { return window.LLSB ? window.LLSB.getClient() : Promise.reject(new Error('supabase-client.js did not load.')); }
  function meId() { var L = window.LL; return L && L.me && L.me.id ? L.me.id : null; }

  /* ---- 3) save this phone's token for the signed-in person (the database function also moves a token that
         used to belong to someone else who signed out on this phone) ---- */
  function getBuild() {                                         // the app's version code (set from version.json at build time)
    try {
      var A = cap.Plugins && cap.Plugins.App;
      if (A && A.getInfo) return A.getInfo().then(function (i) { var n = parseInt(i && i.build, 10); return isFinite(n) ? n : null; }, function () { return null; });
    } catch (e) {}
    return Promise.resolve(null);
  }
  function zone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; } }
  function saveToken(token) {
    var uid = meId();
    if (!uid || !token) return;
    set(K_TOKEN, token);
    getBuild().then(function (build) {
      var stamp = uid + ':' + token + ':' + (build || '');
      if (get(K_SAVED) === stamp) return;                       // already saved for this person, phone and app version
      return client().then(function (sb) {
        return sb.rpc('register_device_token', { p_token: token, p_platform: 'android', p_app_version: build, p_tz: zone() }).then(function (r) {
          // If the database has not been updated yet, fall back to the original two-argument call so notifications keep working.
          if (r && r.error && /function|schema cache|could not find/i.test(r.error.message || '')) return sb.rpc('register_device_token', { p_token: token, p_platform: 'android' });
          return r;
        });
      }).then(function (r) { if (r && r.error) throw r.error; set(K_SAVED, stamp); });
    }).catch(function (e) { console.warn('[push] could not save the device token:', e && e.message); });
  }

  /* ---- 4) where does a tapped notification go? (same rule as the in-app pop-up: "on the way" opens live tracking) ---- */
  var SAFE_LINK = /^[a-z0-9_-]+\.html(?:\?[a-z0-9_=&%.\-]*)?$/i;
  function targetFor(data) {
    var link = String((data && data.link) || '').replace(/^\//, '');
    if (!SAFE_LINK.test(link)) return '';
    var m = /^booking\.html\?id=([^&#]+)/.exec(link);
    if (m && /provider is on the way/i.test((data && data.title) || '')) return 'tracking.html?id=' + m[1];
    return link;
  }
  function openTarget(t) {
    if (!t) return;
    var cur = (location.pathname.split('/').pop() || 'index.html') + location.search;
    if (cur === t) return;
    if (window.LL && window.LL.go) window.LL.go(t); else location.href = t;
  }

  PN.addListener('registration', function (t) { if (t && t.value) saveToken(t.value); });
  PN.addListener('registrationError', function (e) { console.warn('[push] registration error:', e && (e.error || e.message)); });
  PN.addListener('pushNotificationActionPerformed', function (a) {
    var n = (a && a.notification) || {}, data = n.data || {};
    if (!data.title && n.title) data.title = n.title;
    openTarget(targetFor(data));
  });
  // A push that arrives while the app is open is NOT shown again: the in-app pop-up and bell already handle it.

  /* ---- 1) + 2) permission, notification channel, register ---- */
  function start() {
    try {
      if (PN.createChannel) {
        PN.createChannel({ id: 'lifelink_default', name: 'LifeLink notifications', description: 'Bookings, quotes, payments and messages', importance: 4, visibility: 1, vibration: true });
        // Separate channels let a person mute greetings in Android settings without muting booking and payment alerts.
        PN.createChannel({ id: 'daily_greeting', name: 'Daily greeting', description: 'A friendly good morning from LifeLink', importance: 3, visibility: 1, vibration: false });
        PN.createChannel({ id: 'app_updates', name: 'App updates', description: 'When a new version of LifeLink is available', importance: 4, visibility: 1, vibration: true });
      }
    } catch (e) {}
    PN.checkPermissions().then(function (p) {
      var s = p && p.receive;
      if (s === 'granted' || s === 'denied') return s;
      if (get(K_ASKED)) return s;                              // ask once only; the person can switch it on later in Android settings
      set(K_ASKED, '1');
      return PN.requestPermissions().then(function (r) { return r && r.receive; });
    }).then(function (s) {
      if (s === 'granted') return PN.register();
    }).catch(function (e) { console.warn('[push] setup failed:', e && e.message); });
  }

  /* ---- 5) sign-out: delete this phone's token first (never blocks sign-out for more than 3 s) ---- */
  function removeToken() {
    var token = get(K_TOKEN);
    del(K_SAVED); del(K_TOKEN);
    var work = token
      ? client().then(function (sb) { return sb.from('device_tokens').delete().eq('token', token); }).catch(function () {})
      : Promise.resolve();
    work = work.then(function () { return PN.unregister && PN.unregister(); }).catch(function () {});
    return Promise.race([work, new Promise(function (resolve) { setTimeout(resolve, 3000); })]);
  }
  function hookSignOut(tries) {
    var A = window.LLAuth;
    if (!A || typeof A.signOut !== 'function') { if (tries > 0) setTimeout(function () { hookSignOut(tries - 1); }, 300); return; }
    if (A.signOut.__llPush) return;
    var orig = A.signOut;
    var wrapped = function () {
      var self = this, args = arguments;
      return removeToken().then(function () { return orig.apply(self, args); });
    };
    wrapped.__llPush = true;
    A.signOut = wrapped;
  }

  hookSignOut(20);
  setTimeout(start, 1500);                                     // let the first screen paint before the permission dialog
})();
