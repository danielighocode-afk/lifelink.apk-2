/* LIFELINK — Supabase public client configuration (Phase 1, read-only).
   ---------------------------------------------------------------------------
   ONLY public, browser-safe values belong in this file:
     - the project URL, and
     - the publishable / anon key.

   NEVER put the service-role key (or any secret) in frontend code — it bypasses
   Row Level Security and must only ever be used on a trusted server.

   CONFIGURED. The public Project URL and publishable/anon key below are set.
   discovery.html?src=supabase will now attempt a read-only connection (RLS still
   applies). Keep this file free of any secret/service-role key or DB password.

   The publishable/anon key is safe to expose in the browser; Row Level Security
   (see supabase/migrations/003_rls.sql) is what actually protects the data.
*/
window.LL_SUPABASE_CONFIG = {
  // Public Project URL (Supabase dashboard -> Project Settings -> API).
  url: 'https://nbveptszvpvkajrsduej.supabase.co',
  // Publishable key (a.k.a. anon key). Safe for the browser; RLS still applies.
  anonKey: 'sb_publishable_g2jNHO833fRZWjFyGhm7Zg_fgE6Y0cP',
  // Paystack PUBLIC live key (pk_live_...). Safe in the browser. The SECRET key (sk_...) must never go here:
  // it lives only in Supabase Edge Function secrets (PAYSTACK_SECRET_KEY).
  paystackPublicKey: 'pk_live_e3c71ece358f6c6086b3d9eee17e36f16a0558ad',
  // MapTiler PUBLIC map-tiles key. Browser-safe, but restrict it in the MapTiler dashboard (Allowed HTTP origins)
  // to http://localhost:8000 and your real site address so others cannot use your quota.
  maptilerKey: 'mBs7KYTvxc3377tUw2Em'
};
