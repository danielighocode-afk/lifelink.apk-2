/* LifeLink PWA settings. Public values only (the VAPID PUBLIC key is safe in the browser).
   Generate the key pair with:  npx web-push generate-vapid-keys
   Put the PUBLIC key here, and the PRIVATE key only in Supabase secrets (VAPID_PRIVATE_KEY). See PWA_SETUP.md.
   While vapidPublicKey is empty, the app installs normally but the "Turn on notifications" prompt is hidden. */
window.LL_PWA_CONFIG = {
  vapidPublicKey: ''
};
