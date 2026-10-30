/* LifeLink: "Continue with Google" (sign in and sign up are the same thing: a new Google account becomes a new customer).
   Web / PWA : full-page redirect to Google and back to signin.html?oauth=1 (supabase-js reads the session from the URL).
   Android   : Google opens in the phone's secure in-app browser; Google/Supabase send the user back to the app through
               the link com.lifelink.app://auth, which this file catches and turns into a signed-in session.
   After either route, afterSignIn() sends people to the right place; anyone without a phone number goes to add-phone.html first. */
(function () {
  'use strict';
  if (window.LLOAuth) return;
  var cap = window.Capacitor, NATIVE = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  var SCHEME_URL = 'com.lifelink.app://auth';
  var handling = false;
  function plug(n) { return cap && cap.Plugins && cap.Plugins[n] ? cap.Plugins[n] : null; }
  function client() { return window.LLSB.getClient(); }
  function toast(m, bad) { try { if (window.LL && LL.toast) { LL.toast(m, bad); return; } } catch (e) {} }

  function needsPhone(p) { return !!p && p.role !== 'admin' && !(p.phone && String(p.phone).trim()); }
  function safeNext(n) {
    try { var s = decodeURIComponent(n || '').trim(); if (/^[a-zA-Z0-9_-]+\.html(?:\?[a-zA-Z0-9_=&%-]*)?$/.test(s) && !/^(signin|signout|signup|add-phone)\.html/i.test(s)) return s; } catch (e) {}
    return '';
  }
  function go(url) { location.replace(url); }

  // Where a signed-in person lands (same destinations as the email sign-in in signin.html).
  function afterSignIn(next) {
    return window.LLAuth.getProfile().then(function (r) {
      if (r.error || !r.profile) { toast('Signed in, but your profile could not be loaded. Please try again.', true); return false; }
      var p = r.profile, n = safeNext(next);
      if (needsPhone(p)) { go('add-phone.html' + (n ? '?next=' + encodeURIComponent(n) : '')); return true; }
      if (n) { go(n); return true; }
      if (p.role === 'provider') go('provider-dashboard.html');
      else if (p.role === 'admin') go('admin.html');
      else go(NATIVE ? 'home.html' : 'dashboard.html');
      return true;
    });
  }

  function start(next) {
    return client().then(function (sb) {
      var q = { prompt: 'select_account' };
      if (NATIVE) {
        return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: SCHEME_URL, skipBrowserRedirect: true, queryParams: q } }).then(function (res) {
          if (res.error || !res.data || !res.data.url) throw (res.error || new Error('Could not start Google sign-in.'));
          var B = plug('Browser');
          if (B && B.open) return B.open({ url: res.data.url });
          window.open(res.data.url, '_system');
        });
      }
      var back = location.origin + location.pathname.replace(/[^/]*$/, '') + 'signin.html?oauth=1' + (safeNext(next) ? '&next=' + encodeURIComponent(safeNext(next)) : '');
      return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back, queryParams: q } }).then(function (res) {
        if (res.error) throw res.error;   // on success the browser is already navigating to Google
      });
    });
  }

  function parts(url) {
    var out = {}, i = url.indexOf('#'), j = url.indexOf('?');
    function add(s) { s.split('&').forEach(function (kv) { if (!kv) return; var e = kv.indexOf('='); var k = decodeURIComponent(e < 0 ? kv : kv.slice(0, e)); out[k] = e < 0 ? '' : decodeURIComponent(kv.slice(e + 1).replace(/\+/g, ' ')); }); }
    if (j >= 0) add(url.slice(j + 1, i >= 0 && i > j ? i : undefined));
    if (i >= 0) add(url.slice(i + 1));
    return out;
  }

  // Native: the app was opened by com.lifelink.app://auth#access_token=...  (or ?code=... )
  function handleUrl(url) {
    if (!url || url.indexOf(SCHEME_URL) !== 0 || handling) return;
    handling = true;
    var B = plug('Browser'); try { if (B && B.close) B.close(); } catch (e) {}
    var p = parts(url);
    if (p.error || p.error_description) { handling = false; toast(p.error_description || 'Google sign-in was cancelled.', true); return; }
    client().then(function (sb) {
      if (p.code) return sb.auth.exchangeCodeForSession(p.code);
      if (p.access_token && p.refresh_token) return sb.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
      throw new Error('Google sign-in did not finish. Please try again.');
    }).then(function (res) {
      if (res && res.error) throw res.error;
      var n = null; try { n = new URLSearchParams(location.search).get('next'); } catch (e) {}
      return afterSignIn(n);
    }).catch(function (e) { toast((e && e.message) || 'Google sign-in failed. Please try again.', true); }).then(function () { handling = false; });
  }

  if (NATIVE) {
    var A = plug('App');
    if (A && A.addListener) {
      A.addListener('appUrlOpen', function (ev) { handleUrl(ev && ev.url); });
      // The app may have been started cold by the link.
      if (A.getLaunchUrl) A.getLaunchUrl().then(function (r) { if (r && r.url) handleUrl(r.url); }, function () {});
    }
  }

  window.LLOAuth = { start: start, afterSignIn: afterSignIn, needsPhone: needsPhone, safeNext: safeNext, native: NATIVE };
})();
