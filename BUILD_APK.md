# Build the LifeLink Android app (APK)

The APK is your existing web app wrapped with **Capacitor**. Supabase, wallet, Paystack (test mode), bookings and the MapTiler map all work exactly as they do now. Nothing in the backend changed.

> Status: the web side was tested in a headless mobile browser. **The APK itself has not been built or run on a phone yet** (the build tools are not available where this was prepared). Expect to report any build error text so it can be fixed quickly.

## Before you build (2 minutes, one time)

The app runs from the address `https://localhost` inside the phone. Add it in two places or maps/sign-in links may be refused:

1. **MapTiler** dashboard, your key, allowed origins: add `https://localhost`.
2. **Supabase** dashboard, Authentication, URL configuration: add `https://localhost` to the redirect URLs.

Optional: the app id is `com.lifelink.app` (in `capacitor.config.json`). Change it **before the first build** if you want a different one. It cannot change after you publish.

## Option A: free cloud build with GitHub (no installs)

1. Put this folder in your GitHub repository so that `package.json` and the `.github` folder sit at the **top level** of the repo.
2. On GitHub open **Actions, Build LifeLink APK, Run workflow**. (It also runs on every push to `main`.)
3. When it finishes (about 5 to 10 minutes), open the run and download the **lifelink-debug-apk** artifact. Unzip it to get `app-debug.apk`.
4. Copy the APK to your phone and open it. Android will ask you to allow installs from this source. Accept.

If the run fails, open the failed step and send me the red error lines.

## Option B: build on your Windows computer

Install once: **Node.js 20+**, **Android Studio** (it includes Java and the Android tools), then in a terminal inside this folder:

```
npm install
npm run prepare:www
npm run android:add
npm run android:sync
npm run android:open
```

Android Studio opens the project. Wait for it to finish syncing, then **Build, Build Bundle(s)/APK(s), Build APK(s)**. It tells you where `app-debug.apk` is. Plug in a phone (USB debugging on) and press Run to install directly.

After later web changes, run `npm run android:sync` again and rebuild.

## What is in the app

- First launch shows the welcome screens once, then the normal app. A signed-in user goes straight to their dashboard.
- Bottom tabs: Home, Bookings, Wallet, Messages, Profile (customers); Home, Requests, Jobs, Messages, Profile (providers).
- Android back button goes back, closes the Profile sheet, or exits at the top level.
- Launcher icon and splash use your original LifeLink logo (made from `images/lifelink-logo.png`).
- Light, dark or system theme.

## Known limits (be aware)

- **Internet is required** (Supabase, MapTiler, Paystack). The pages also load Tailwind, the Supabase SDK, Leaflet and MapLibre from CDNs, so the first screen can take a moment on slow data. Bundling these locally is a good next step.
- **Background location:** when the screen is off or the app is in the background, Android pauses web location sharing. For a provider's "on the way" tracking to keep working with the screen off, the app needs a native background-location plugin. Not included yet.
- **Push notifications and Play Store release** (signed release build, store listing) are separate steps, not done here.
- **Paystack stays in test mode.** Nothing here changes keys or modes.
- The APK produced is a **debug APK** for testing, not a store release.
