LIFELINK UPDATE - app shell (customer + provider)
For your project APP_LIFELINK_ZIP (3), the update to lifelink.apk-2.

1. Copy every file in this folder into your project root (next to package.json). Say yes to replace.
2. This folder has NO .github folder on purpose: keep the build workflow that is already in your repo.
3. In version.json set a new versionCode and versionName, or the app will not offer the update.
4. Push, then tag to build the signed APK (see the steps in the chat).

NEW: app.html, provider-app.html, ll-shell.js
CHANGED: lifelink.js, ll-app.js, page-home.js, page-profile.js, page-provider-profile.js,
         page-provider-dashboard.js, settings.html
NOT TOUCHED: ll-api.js, supabase-*.js, payments, push.
NOT TESTED: real phones, the Android app, iPhone, Paystack, live location, the GitHub build.
NOTE: the APK still opens its normal first page until the shell is made the default.
