/* LIFELINK — Supabase Auth + profiles (Phase 1). Part 1: validators + signUp/signIn.
   Uses the shared singleton from supabase-client.js (window.LLSB). No second
   createClient here. New users always get role='customer' (trigger-forced).
   Part 2 (appended below) adds signOut/reset/getProfile/update/requireAuth. */
(function () {
  'use strict';
  var PHONE_RE = /^[0-9+() \-]{7,32}$/;
  function mustHaveLLSB() {
    if (!window.LLSB) throw new Error('supabase-client.js did not load (window.LLSB missing).');
  }
  function trim(v) { return String(v == null ? '' : v).trim(); }
  function validateFullName(v) {
    var n = trim(v);
    if (!n) return 'Enter your full name.';
    if (n.length < 2 || n.length > 120) return 'Full name must be 2-120 characters.';
    return null;
  }
  function validatePhone(v) {
    var p = trim(v);
    if (!p) return 'Enter your phone number.';
    if (!PHONE_RE.test(p)) return 'Phone may use digits, +, spaces, () and - only (7-32 characters).';
    return null;
  }
  function validateEmail(v) {
    var e = trim(v).toLowerCase();
    if (!e) return 'Enter your email address.';
    if (e.length > 320) return 'Email address is too long.';
    var at = e.indexOf('@');
    if (at < 1) return 'Enter a valid email address.';
    if (e.slice(at + 1).indexOf('.') < 1) return 'Enter a valid email address.';
    return null;
  }
  function validatePassword(v) {
    if (!v || v.length < 8) return 'Password must be at least 8 characters.';
    return null;
  }
  function friendly(err) {
    var m = (err && (err.message || err.msg)) || String(err || 'Request failed.');
    if (/invalid full_name/i.test(m)) return 'Full name must be 2-120 characters.';
    if (/invalid phone/i.test(m)) return 'Phone number format is invalid.';
    if (/invalid signup email/i.test(m)) return 'Email address is invalid.';
    if (/user already registered|already exists|duplicate key|unique constraint/i.test(m)) {
      return 'An account with these details already exists. Try signing in instead.';
    }
    if (/invalid login credentials|invalid email or password/i.test(m)) return 'Incorrect email or password.';
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first, then sign in.';
    return m;
  }
  function signUp(input) {
    mustHaveLLSB();
    var ne = validateFullName(input.fullName);
    if (ne) return Promise.resolve({ data: null, error: new Error(ne) });
    var pe = validatePhone(input.phone);
    if (pe) return Promise.resolve({ data: null, error: new Error(pe) });
    var ee = validateEmail(input.email);
    if (ee) return Promise.resolve({ data: null, error: new Error(ee) });
    var we = validatePassword(input.password);
    if (we) return Promise.resolve({ data: null, error: new Error(we) });
    return window.LLSB.getClient().then(function (sb) {
      return sb.auth.signUp({
        email: trim(input.email).toLowerCase(),
        password: input.password,
        options: { data: { full_name: trim(input.fullName), phone: trim(input.phone) } }
      });
    }).then(function (res) {
      if (res && res.error) return { data: null, error: new Error(friendly(res.error)) };
      return { data: res.data, error: null };
    }).catch(function (err) { return { data: null, error: new Error(friendly(err)) }; });
  }
  function signIn(input) {
    mustHaveLLSB();
    var ee = validateEmail(input.email);
    if (ee) return Promise.resolve({ data: null, error: new Error(ee) });
    if (!input.password) return Promise.resolve({ data: null, error: new Error('Enter your password.') });
    return window.LLSB.getClient().then(function (sb) {
      return sb.auth.signInWithPassword({ email: trim(input.email).toLowerCase(), password: input.password });
    }).then(function (res) {
      if (res && res.error) return { data: null, error: new Error(friendly(res.error)) };
      return { data: res.data, error: null };
    }).catch(function (err) { return { data: null, error: new Error(friendly(err)) }; });
  }
  window.LLAuth = window.LLAuth || {};
  window.LLAuth.validateFullName = validateFullName;
  window.LLAuth.validatePhone = validatePhone;
  window.LLAuth.validateEmail = validateEmail;
  window.LLAuth.validatePassword = validatePassword;
  window.LLAuth.friendly = friendly;
  window.LLAuth.trim = trim;
  window.LLAuth.signUp = signUp;
  window.LLAuth.signIn = signIn;
})();
/* Phase 1 Part 2: signOut / reset / getProfile / updateProfile / requireAuth. */
(function () {
  'use strict';
  var EDITABLE = ['full_name', 'phone', 'avatar_url', 'onboarded', 'interests', 'home_area', 'date_of_birth', 'gender', 'about'];
  function A() { return window.LLAuth; }
  function signOut() {
    if (!window.LLSB) return Promise.resolve({ error: new Error('supabase-client.js did not load.') });
    try { localStorage.removeItem('ll_session'); } catch (e) {}
    try { localStorage.removeItem('ll_users'); } catch (e) {}
    return window.LLSB.getClient().then(function (sb) { return sb.auth.signOut(); }).then(function (res) {
      window.LL_AUTH_SESSION = null;
      if (res && res.error) return { error: new Error(A().friendly(res.error)) };
      return { error: null };
    }).catch(function (err) { return { error: new Error(A().friendly(err)) }; });
  }
  function resetPassword(email) {
    if (!window.LLSB) return Promise.resolve({ data: null, error: new Error('supabase-client.js did not load.') });
    var ee = A().validateEmail(email);
    if (ee) return Promise.resolve({ data: null, error: new Error(ee) });
    return window.LLSB.getClient().then(function (sb) {
      return sb.auth.resetPasswordForEmail(A().trim(email).toLowerCase(), { redirectTo: location.origin + '/settings.html?type=recovery' });
    }).then(function (res) {
      if (res && res.error) return { data: null, error: new Error(A().friendly(res.error)) };
      return { data: (res && res.data) || null, error: null };
    }).catch(function (err) { return { data: null, error: new Error(A().friendly(err)) }; });
  }
  function getProfile() {
    if (!window.LLSB) return Promise.resolve({ user: null, profile: null, error: new Error('supabase-client.js did not load.') });
    return window.LLSB.getClient().then(function (sb) {
      return sb.auth.getUser().then(function (u) {
        var user = u && u.data && u.data.user;
        if ((u && u.error) || !user) return { user: null, profile: null, error: new Error('You are not signed in.') };
        var base = 'id, role, full_name, email, phone, avatar_url, onboarded, interests, home_area';
        // Optional profile details (migration 008). If those columns are not there yet, fall back to the base fields so sign-in never breaks.
        return sb.from('profiles').select(base + ', date_of_birth, gender, about').eq('id', user.id).single().then(function (p) {
          if (p && p.error) {
            return sb.from('profiles').select(base).eq('id', user.id).single().then(function (q) {
              if (q && q.error) return { user: user, profile: null, error: q.error };
              return { user: user, profile: q.data, error: null };
            });
          }
          return { user: user, profile: p.data, error: null };
        });
      });
    }).catch(function (err) { return { user: null, profile: null, error: err }; });
  }
  function updateProfile(patch) {
    if (!window.LLSB) return Promise.resolve({ data: null, error: new Error('supabase-client.js did not load.') });
    var clean = {};
    EDITABLE.forEach(function (k) { if (patch && Object.prototype.hasOwnProperty.call(patch, k)) clean[k] = patch[k]; });
    if (Object.prototype.hasOwnProperty.call(clean, 'full_name')) {
      var e = A().validateFullName(clean.full_name);
      if (e) return Promise.resolve({ data: null, error: new Error(e) });
      clean.full_name = A().trim(clean.full_name);
    }
    if (Object.prototype.hasOwnProperty.call(clean, 'phone')) {
      var pe = A().validatePhone(clean.phone);
      if (pe) return Promise.resolve({ data: null, error: new Error(pe) });
      clean.phone = A().trim(clean.phone);
    }
    if (Object.prototype.hasOwnProperty.call(clean, 'about') && clean.about != null) {
      clean.about = String(clean.about).trim();
      if (clean.about.length > 200) return Promise.resolve({ data: null, error: new Error('About me can be at most 200 characters.') });
      if (!clean.about) clean.about = null;
    }
    if (Object.prototype.hasOwnProperty.call(clean, 'gender') && clean.gender && ['male', 'female', 'other', 'prefer_not_to_say'].indexOf(clean.gender) < 0) return Promise.resolve({ data: null, error: new Error('Choose a valid gender option.') });
    if (Object.prototype.hasOwnProperty.call(clean, 'date_of_birth') && clean.date_of_birth) {
      var dob = new Date(clean.date_of_birth + 'T00:00:00');
      if (isNaN(dob.getTime()) || dob > new Date() || dob.getFullYear() < 1900) return Promise.resolve({ data: null, error: new Error('Enter a valid date of birth.') });
    }
    if (Object.keys(clean).length === 0) return Promise.resolve({ data: null, error: new Error('Nothing to update.') });
    return window.LLSB.getClient().then(function (sb) {
      return sb.auth.getUser().then(function (u) {
        var user = u && u.data && u.data.user;
        if ((u && u.error) || !user) return { data: null, error: new Error('You are not signed in.') };
        return sb.from('profiles').update(clean).eq('id', user.id).select().single().then(function (r) {
          if (r && r.error) return { data: null, error: new Error(A().friendly(r.error)) };
          return { data: r.data, error: null };
        });
      });
    }).catch(function (err) { return { data: null, error: new Error(A().friendly(err)) }; });
  }
  function requireAuth(roles) {
    var want = roles || [];
    return getProfile().then(function (r) {
      if (r.error || !r.user || !r.profile) {
        var file = location.pathname.split('/').pop() || 'index.html';
        location.href = 'signin.html?next=' + encodeURIComponent(file);
        return { user: null, profile: null, error: r.error || new Error('Not signed in.') };
      }
      var role = r.profile.role;
      if (want.length === 0 || want.indexOf('any') >= 0) return { user: r.user, profile: r.profile, error: null };
      if (want.indexOf(role) >= 0 || role === 'admin') return { user: r.user, profile: r.profile, error: null };
      var dest = role === 'provider' ? 'provider-dashboard.html' : 'dashboard.html';
      if (role === 'admin') dest = 'admin.html';
      location.href = dest;
      return { user: r.user, profile: r.profile, error: new Error('Not authorized for this page.') };
    });
  }
  window.LLAuth.signOut = signOut;
  window.LLAuth.resetPassword = resetPassword;
  window.LLAuth.getProfile = getProfile;
  window.LLAuth.updateProfile = updateProfile;
  window.LLAuth.requireAuth = requireAuth;
})();
