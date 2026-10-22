# Build status — Stage 2.7 (speed pass + customer banner)
- Customer profile banner photo (migration 009_profile_banner.sql).
- APK build now compiles Tailwind locally (ll-tailwind.css), bundles the Supabase SDK (www/vendor) and the Plus Jakarta Sans font (www/fonts). Source .html files are unchanged, so the plain website still works from the CDNs. Needs `npm install` (tailwindcss 3.4.17, @supabase/supabase-js 2.117.3, @fontsource-variable/plus-jakarta-sans).
- Instant paint: last verified profile is cached on the device (cleared on sign-out); dashboard sections, wallet, home categories and profile numbers show the last result at once and refresh behind it; other dashboard sections are preloaded quietly.
- Direction-aware slide between pages (view transitions, Chrome/WebView 126+; skipped when reduced motion is on).
- NOT verified: the real Tailwind build (no internet where this was prepared; tested with stand-in packages), an APK build, or a phone. Provider dashboard is not cached yet.

# Build status — Stage 2.6 (new app home screen: home.html)
- New first screen of the app: home.html + page-home.js (banner carousel, search, real categories from Supabase, Become a Provider). In the APK, index.html now forwards to welcome (first launch) then home.html. Customers and visitors stay on home.html; providers/admins are sent to their own dashboard. Customers signing in inside the app land on home.html.
- Verified in headless Chromium with stubbed Supabase: signed-out, signed-in (name + unread count), dark mode, offline categories message, search -> discovery.html?q=, banner slides, native routing. NOT verified on a phone or with real Supabase data.

# Build status — Stage 2.5 (Android app wrapper + app-style UI)
- Verified in headless Chromium (390px, stubbed login, Capacitor simulated): welcome screens, first-launch routing, signed-in redirect, tab bars (customer/provider), Profile sheet, Android back-button handling, light/dark. No JS errors.
- Verified: prepare-www and android-setup scripts (run against a fake Android tree, twice); package.json, capacitor.config.json and the workflow parse.
- NOT verified: an actual APK build, install or run on a phone; Capacitor/Gradle versions; location permission prompt on a device; Paystack popup and maps inside the Android WebView; real Supabase data screens in dark mode.
- Backend, wallet, Paystack (test mode), booking and map logic unchanged. See BUILD_APK.md.

# Build status — Stage 2.3 (map: reliable street names + full OSM landmark overlay)
- Base map is back to MapTiler raster streets (street names baked in, sharper on retina). The vector style is opt-in with ?vector=1 on the page URL.
- New landmark overlay: every NAMED hospital, hotel, church/mosque, school, restaurant, bank, fuel station, shop, stadium etc. from OpenStreetMap (Overpass API) in the visible area, shown by zoom, cached, de-cluttered. Tap one in the pin picker to jump to it.
- Uses PUBLIC Overpass servers (fair use). Before launch, cache/self-host, or switch to a paid places source.
- Verified with stubs only (query building, tiering, overlap thinning). Not verified on real Overpass responses or real tiles.

# Build status — Stage 2.2 (richer map)
- Landmark icons by type (hotels, food, health, worship, schools, shops, banks, fuel, transport, civic, landmarks) that appear as you zoom in; clearer street, junction and neighbourhood labels; blue current-location dot with accuracy circle.
- Pin picker is now a full-screen map with a bottom search panel (floating card on desktop). Tracking page uses the same layout.
- Verified headless with stubs: layer set-up, picker search / reverse geocode / confirm, notifications. NOT verified: how it looks on real MapTiler tiles, and how many Benin landmarks OpenStreetMap actually has.

# Build status — Stage 2.1 (map upgrade, live pop-ups, smoother flow)
- Verified in headless Chromium with stubs: pop-up shows for 3.5 s, carries across a redirect, auto-redirect rules (same booking only, never out of forms), soft refresh, picker search / reverse-geocode / confirm.
- NOT verified: real MapTiler vector tiles, real geocoding results for Nigerian addresses, Supabase realtime (needs 007), GPS on a phone. The vector bridge library version is fetched from jsDelivr and falls back to raster tiles if it fails.

# Build status — Stage 2 (maps, live location, GPS arrival, log-only penalties)

## Written, NOT yet run against anything
- `supabase/migrations/006_maps.sql` — was NOT executed (no Postgres in the build environment). Read it carefully and run it in the SQL editor; report any error text.
- Frontend: all JS passes a syntax check. No browser test was run, and nothing was tested against live Supabase or MapTiler.

## What it does
- Request form: optional map pin (stored in `request_locations`, visible only to the customer, the booked provider and admins — not on the request row providers browse).
- `update_my_location` stores the latest point per person; deleted when the job starts, completes or is cancelled.
- 200 m "approaching" notification (once, accurate point only). Provider "I have arrived": server checks a point <= 60 s old and <= 50 m accuracy is within 100 m, then charges both fees. Otherwise the provider sees the distance, or can choose the manual route if GPS is unavailable. Requests without a pin use the old manual route.
- `process_arrival_reminders()` (pg_cron, every minute): provider reminders at 3/8/13 min within 100 m, log at 18 min; customer reminders at 0/5/10 min on the manual route, log at 15 min only if GPS also shows the provider within 100 m. Disputes reset and pause timers. A GPS gap never penalises.
- `tracking.html` (Leaflet + MapTiler, realtime + 10 s polling), provider dashboard shares location while "on the way", admin "Arrival penalties (log)".

## Known limits
- Browsers stop sharing location when the screen locks or the page is backgrounded. Reminders and the 200 m notice will often be silent until a PWA/native app exists.
- The GPS point comes from the provider's own device, so it can be faked. Fine for log-only; revisit before real penalties.
- MapTiler free tier may be non-commercial only. Restrict the key by allowed origins.

# Build status — Stage 1 (wallet + Paystack test-mode deposits + fee holds)

## Verified
- Migration `005_wallet.sql` applied on top of 001–004 on a real local Postgres 16 (Supabase-style roles): **66 checks pass** — deposit idempotency and amount-mismatch handling, no fake deduction when a wallet is short (customer or provider), ₦100 per side held / released / charged exactly once, append-only ledger (UPDATE/DELETE/TRUNCATE blocked), ledger reconciles to balances, clients cannot write wallet tables or call the crediting functions, dispute and admin-cancel paths release fees, RLS shows each user only their own wallet.
- Frontend: 29 headless-Chromium checks against a **stubbed** Supabase client — wallet page, Paystack popup flow (init → popup → verify), minimum-amount check, server-error display, booking arrival confirmation, provider on-the-way / arrived / start / cancel buttons, admin views. No JS errors.
- All JS and the three Edge Function files pass a syntax check.
- 001–004 were verified in the previous round (142 checks); they were not re-run in full this round, only applied cleanly beneath 005.

## NOT verified (needs you)
- **Nothing was run against your live Supabase project or Paystack.** The Edge Functions (`supabase/functions/*`) have never executed against Paystack's real API; first real test is a ₦500 top-up with a Paystack test card. Report any error text and it will be quick to fix.
- Webhook signature check follows Paystack's documented HMAC-SHA512 scheme but is untested against a real webhook delivery. Top-ups still complete without it via the verify step.

## Not built yet
Maps and live tracking, 200 m / 100 m GPS arrival logic, warnings and ₦200 penalties (planned log-only first), AI matching, PWA / push notifications, Paystack live mode.

## Behaviour changes from the previous version
- Fee is a flat ₦100 per side (was 5%). Old test bookings were moved to `confirmed` with no fee reserved.
- `pending_payment` / `paid` / `refunded` booking states are gone; `supabase/test_mark_paid.sql` was removed (no longer needed).
- Stage-1 "verified arrival" = provider taps arrived + customer confirms. Customers who never confirm cannot be charged, and providers cannot start the job, so GPS in the maps stage replaces this.

## Stage 2.7 - Services screen (discovery.html + page-discovery.js)
App bar, search pill, real category chips, sort + filters bottom sheet, new provider cards. Data, filter and sort logic unchanged. Shows Verified (listing is admin-verified only), service area instead of distance, 'From N' min price, 'Request quote' button. Not yet tested on a real phone or real data.

## Stage 2.8 - Provider profile (provider-profile.html + page-provider-profile.js)
Full-width photo with back/share, Verified Provider tag, rating, area, availability, tags, About, stats (experience, reviews, jobs done), Services & Pricing, fixed Book Now (-> request.html?provider=, or sign-in first when signed out; hidden for providers/admins). Reviews open in a bottom sheet from the rating or the Reviews number. Services-screen card button now opens this profile. Also: dashboard quick-action row now only shows on the dashboards. Response rate and favourites hearts intentionally left out for now. Not yet tested on a phone or with real data.

## Stage 2.9 - Booking & quotation flow (request.html, page-request.js, compare-quotes.html, page-compare-quotes.js)
request.html is now a 4-step wizard (Details, Location, Request/photos, Review & Confirm) with progress bar, slide animations, per-step validation, Android back = previous step, Edit links on the summary. Same data call (LLApi.customer.createRequest) and same map picker (LLMap.pickerModal). Voice notes and videos intentionally not included (no storage/DB support yet). Quote screen restyled: Provider Quotation box and "Accept Quotation & Confirm"; it calls the same LLApi.customer.acceptQuote. Fee wording now reads the real wallet fee (LLApi.wallet.me().fee_kobo) instead of a hard-coded 100. Wallet/fee/RLS logic untouched. Not yet tested on a phone or with real Supabase data.

## Stage 2.10 - Live tracking (tracking.html + page-tracking.js)
App bar, map with floating provider bubble, provider card (photo, name, status, rating, job address) with Message (chat sheet) and Cancel (same cancel flow as booking.html), booking summary row (links to booking.html), existing "Share my location" panel kept. Bottom tab bar now shows on tracking (Bookings active); request/compare-quotes count as Home, booking/tracking as Bookings. Live data logic (LLApi.tracking.snapshot, realtime + 10 s poll, LLMap.share) unchanged. Not shown: ETA minutes (no routing service), Call button (no phone numbers exposed), top-right share icon. Map itself only checked with a stub; test on the phone.

## Stage 2.10 - Live tracking (tracking.html + page-tracking.js)
App bar "Tracking Your Provider", map with floating provider bubble (name + status/distance), my-location and fit buttons, provider card (photo, verified tick, rating, status, job address, Message, Cancel), booking summary row, share-location panel, bottom tab bar (Bookings active). Chat opens in a bottom sheet. Live data, realtime + 10 s polling, GPS arrival and cancel logic untouched. Left out on purpose: Call (no provider phone number is exposed), minutes-away estimate (no routing service; distance shown instead), curved driving route (dashed straight guide line), share icon (locations are private to the two parties). Not tested with the real map tiles or a phone.

## Stage 2.11 - Wallet (ll-wallet.js, shared by customer and provider dashboards)
Green balance card with Add Funds, Deposit and History tiles (no Send, as requested), Recent Transactions list with icons and colours (See all / Show less), pending-payment and failed-attempt cards kept, add-funds in a bottom sheet (same chips, amount field, Paystack inline flow, verifyDeposit retries). Only markup/CSS changed; LLApi.wallet calls, Paystack test mode and fee rules untouched. Not yet tested with real Paystack or on a phone.

## Stage 2.12 - Customer profile (profile.html, page-profile.js; supabase/migrations/008_profile_extras.sql)
Full Profile screen for customers (Profile tab now opens profile.html): overview (photo, name, location, wallet balance, total bookings, quick actions, account list), Edit Profile (name, phone, location, date of birth, gender, about me; email read-only), Change Profile Photo (camera/gallery/remove, auto-shrunk to a square JPEG under 2 MB, uploaded to the public avatars bucket through LLApi.uploadAvatar), Account Settings, Privacy & Security (change password, delete account), Appearance (theme + text size). Android back moves between these views. Needs migration 008 (date_of_birth, gender, about) - user has run it. supabase-auth.js falls back safely if those columns are missing. Left out: notification toggles, 2FA, blocked users, accent colour, exclusive-offers banner. Providers keep the existing More sheet. Not yet tested against real Supabase/storage or on a phone.
