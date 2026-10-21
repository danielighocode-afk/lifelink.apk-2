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
