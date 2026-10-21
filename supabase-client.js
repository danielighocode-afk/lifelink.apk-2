/* LIFELINK — Shared Supabase singleton client (Phase 1: Auth + reads).
   ---------------------------------------------------------------------------
   Single owner of the Supabase JS SDK + client instance for the whole site.

   - Reads config from window.LL_SUPABASE_CONFIG (see supabase-config.js).
     URL and publishable key are unchanged; only browser-safe values used.
     NEVER put a service-role / secret key here.
   - SDK pinned consistently: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3
     (verified: 2.x supports sb_publishable_ keys; latest stable at time of writing).
     All pages must load this file (not load the SDK themselves).
   - Auth persistence ON: persistSession:true, autoRefreshToken:true,
     detectSessionInUrl:true, storageKey:'ll-supabase-auth'.
     Public reads (LLDB) reuse the SAME client — RLS still enforces anon vs
     authenticated access server-side.

   Exposes window.LLSB with:
     LLSB.SDK_URL, LLSB.isConfigured(), LLSB.getConfigError(),
     LLSB.loadSdk(), LLSB.getClient(), LLSB.getSession(), LLSB.getUser(),
     LLSB.onAuthChange(cb)

   Load order: supabase-config.js -> supabase-client.js -> supabase-db.js /
   supabase-auth.js -> lifelink.js -> page script.
*/
(function () {
  'use strict';

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
  var PLACEHOLDER = /YOUR[-_]/i;
  var sdkPromise = null;
  var clientPromise = null;

  function cfg() { return window.LL_SUPABASE_CONFIG || {}; }

  function isConfigured() {
    var c = cfg();
    var url = (c.url || '').trim();
    var key = (c.anonKey || '').trim();
    if (!url || !key) return false;
    if (PLACEHOLDER.test(url) || PLACEHOLDER.test(key)) return false;
    if (!/^https?:\/\//i.test(url)) return false;
    return true;
  }

  function getConfigError() {
    if (typeof window.LL_SUPABASE_CONFIG === 'undefined') {
      return 'Supabase config not found. Add supabase-config.js before supabase-client.js.';
    }
    var c = cfg();
    var url = (c.url || '').trim();
    var key = (c.anonKey || '').trim();
    if (!url || !key) return 'Supabase URL or key is empty in supabase-config.js.';
    if (PLACEHOLDER.test(url) || PLACEHOLDER.test(key)) {
      return 'Supabase is not configured yet. Replace the placeholder URL and publishable key in supabase-config.js.';
    }
    if (!/^https?:\/\//i.test(url)) {
      return 'Supabase URL must start with http:// or https:// in supabase-config.js.';
    }
    return null;
  }

  function loadSdk() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return Promise.resolve(window.supabase);
    }
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
          resolve(window.supabase);
        } else {
          sdkPromise = null;
          reject(new Error('Supabase SDK loaded but createClient is unavailable.'));
        }
      };
      s.onerror = function () { sdkPromise = null; reject(new Error('Could not load the Supabase SDK from the CDN.')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function getClient() {
    if (!isConfigured()) return Promise.reject(new Error(getConfigError()));
    if (clientPromise) return clientPromise;
    clientPromise = loadSdk().then(function (supabase) {
      var c = cfg();
      return supabase.createClient(c.url.trim(), c.anonKey.trim(), {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'll-supabase-auth'
        }
      });
    }).catch(function (err) { clientPromise = null; throw err; });
    return clientPromise;
  }

  function getSession() {
    return getClient().then(function (sb) { return sb.auth.getSession(); })
      .then(function (res) {
        if (res && res.error) return { session: null, error: res.error };
        return { session: (res && res.data && res.data.session) || null, error: null };
      })
      .catch(function (err) { return { session: null, error: err }; });
  }

  function getUser() {
    return getClient().then(function (sb) { return sb.auth.getUser(); })
      .then(function (res) {
        if (res && res.error) return { user: null, error: res.error };
        return { user: (res && res.data && res.data.user) || null, error: null };
      })
      .catch(function (err) { return { user: null, error: err }; });
  }

  function onAuthChange(cb) {
    getClient().then(function (sb) {
      sb.auth.onAuthStateChange(function (event, session) {
        try { cb(event, session); } catch (e) { /* listener must not break auth */ }
      });
    }).catch(function () { /* config error: no listener */ });
  }

  // Signal readiness for lifelink.js guards once session is known.
  // LL_AUTH_READY=true + LL_AUTH_SESSION set (may be null when signed out).
  getSession().then(function (r) {
    window.LL_AUTH_SESSION = r.session || null;
    window.LL_AUTH_READY = true;
    try { document.dispatchEvent(new CustomEvent('ll-auth-ready')); } catch (e) {}
  }).catch(function () {
    window.LL_AUTH_SESSION = null;
    window.LL_AUTH_READY = true;
    try { document.dispatchEvent(new CustomEvent('ll-auth-ready')); } catch (e) {}
  });
  onAuthChange(function (event, session) {
    window.LL_AUTH_SESSION = session || null;
    window.LL_AUTH_READY = true;
    try { document.dispatchEvent(new CustomEvent('ll-auth-change', { detail: { event: event } })); } catch (e) {}
  });

  window.LLSB = {
    SDK_URL: SDK_URL,
    isConfigured: isConfigured,
    getConfigError: getConfigError,
    loadSdk: loadSdk,
    getClient: getClient,
    getSession: getSession,
    getUser: getUser,
    onAuthChange: onAuthChange
  };
})();
