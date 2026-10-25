# LifeLink PWA setup (iPhone + browser)

## What was added
- `manifest.webmanifest`, `sw.js` (offline page + web push), `offline.html`, `ll-pwa.js`, `pwa-config.js`
- `images/pwa/` icons (192, 512, maskable 512, 180 apple-touch-icon)
- `scripts/prepare-www.js` now adds the manifest, iPhone tags and PWA scripts to the pages in `www/` (source pages are untouched)
- `supabase/functions/send-push/index.ts` now sends Web Push to iPhone/browser devices as well as Firebase push to Android
- `vercel.json` (build + headers). No new database migration is needed: `device_tokens` already allows platform `web`.

## Steps
1. **Make the VAPID keys** (once, on your computer): `npx web-push generate-vapid-keys`
2. **Public key** -> paste into `pwa-config.js` (`vapidPublicKey`). **Private key** -> never in the app; Supabase only.
3. **Supabase secrets** (Edge Functions -> Secrets): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@yourdomain.com`). Keep your existing `PUSH_WEBHOOK_SECRET` and `FIREBASE_SERVICE_ACCOUNT`.
4. **Redeploy the function:** `supabase functions deploy send-push --no-verify-jwt`
5. **Deploy the site (HTTPS is required):** push the project to GitHub and import it in Vercel. `vercel.json` handles the rest (it runs `npm run prepare:www` and serves `www/`).
6. **Allow the new site address in:**
   - Supabase -> Authentication -> URL Configuration (Site URL / Redirect URLs, needed for password reset)
   - your MapTiler key's allowed origins
   - any Paystack callback/redirect settings you use
7. **Put the live address in the download page** (`WEB_URL`), so the iPhone button goes live.

## How to test on an iPhone (iOS 16.4 or later)
1. Open the site in **Safari** -> Share -> Add to Home Screen.
2. Open LifeLink **from the home-screen icon**, sign in, tap **Turn on** when the banner appears, and allow notifications.
3. Create a notification for that user (e.g. send a quote) and lock the phone.

## Known limits
- iPhone shows push only for the home-screen app, never for plain Safari.
- Live location (arrival detection) works only while the app is open on screen; iOS does not allow background tracking in a PWA.
- No App Store listing. Notification permission must be asked from a tap, which is why the banner has a button.
- Android keeps using the existing APK + Firebase path; the PWA code skips itself inside that app.
- Not yet tested on a real iPhone or against Apple's push servers: test step 3 above before announcing.
