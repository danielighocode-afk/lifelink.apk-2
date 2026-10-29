# LifeLink — services marketplace (static HTML + Tailwind CDN + Supabase)

Everything except **AI matching and push notifications** reads and writes real data in Supabase. Stage 2 (maps, live location, GPS arrival, log-only penalties) is included but has NOT yet been run against your live project. Stage 1 (wallet + Paystack test-mode deposits + fee holds) is included.
There is no dummy data in the pages: empty tables show empty states.

## Setup (first run)
1. In the Supabase SQL editor run, in order: `supabase/migrations/001_schema.sql`, `002_helpers.sql`, `003_rls.sql`, `004_app_backend.sql`, **`005_wallet.sql`** (004 = messaging, reports, disputes, storage; 005 = wallet, fee holds, new booking states). All are re-runnable.
2. Optional: run `supabase/seed_categories.sql` (five categories) — or add categories later in Admin → Categories. Without categories nobody can complete a request or provider application.
3. Sign up in the app with the email you want as administrator, then run once in the SQL editor: `select public.bootstrap_first_admin('you@example.com');`
4. Serve this folder statically (`python -m http.server 8000`) and open `http://localhost:8000`. `supabase-config.js` holds the project URL and *publishable* key only — never put a secret/service-role key in frontend files.
5. In Supabase Auth settings, add your site URL(s) to the redirect list so password-reset links work.
6. **Paystack (LIVE mode) — wallet top-ups.** `supabase-config.js` holds your *public* live key (`pk_live_…`).
   - Supabase dashboard → **Edge Functions → Secrets** → add `PAYSTACK_SECRET_KEY` = your Paystack **live secret** key (`sk_live_…`). It goes ONLY there, never in this folder or in chat.
   - Deploy three functions from `supabase/functions/`: `paystack-init` and `paystack-verify` (JWT verification **on**) and `paystack-webhook` (JWT verification **off**). Dashboard: Edge Functions → *Deploy a new function* → paste each `index.ts`. CLI: `supabase functions deploy paystack-init paystack-verify paystack-webhook` (uses `supabase/config.toml`).
   - Paystack dashboard → Settings → API Keys & Webhooks → set the **Live webhook URL** to `https://<your-project-ref>.supabase.co/functions/v1/paystack-webhook`.
   - Check: Dashboard → Wallet → add the minimum amount → pay with a real card (real money; refundable from the Paystack dashboard). The balance updates from the server; the browser never credits anything.

7. **Maps (Stage 2).** Run `supabase/migrations/006_maps.sql` in the SQL editor (after 005). It also tries to enable `pg_cron` and schedule `process_arrival_reminders()` every minute; if you see a NOTICE that pg_cron could not be enabled, turn it on in Dashboard -> Database -> Extensions and re-run the last block of the file. Then in Dashboard -> Database -> Replication make sure `booking_locations` is in the realtime publication (the file attempts this itself; the tracking page polls every 10 s if realtime is off).
   - `supabase-config.js` holds `maptilerKey` (the public MapTiler key). In the MapTiler dashboard restrict it to `http://localhost:8000` and your real site address. MapTiler's free plan may be non-commercial only: check their terms before launch.
   - Test: customer posts a request with a map pin -> accepts a quote -> provider taps "I am on the way" on a phone with location allowed -> customer opens "Track my provider". Within 100 m the provider taps "I have arrived" and both fees are charged by the server. Without a pin, or if GPS is unavailable, the old manual flow (customer confirms) is used.

8. **Live pop-ups (optional but recommended).** Run `supabase/migrations/007_notifications_realtime.sql` so notifications arrive instantly. Without it the app polls every 4 seconds, so pop-ups still work, just up to 4 s later.
   - Map upgrade: street-level vector map (MapLibre via jsDelivr), address search and a Bolt-style pin picker all use the same `maptilerKey`. If WebGL or the vector libraries are unavailable it falls back to sharp raster tiles.

## Fees and wallet (Stage 1)
- Wallet = prepaid **platform credit** for LifeLink's flat fee. Not escrow, not withdrawable. Money is integer kobo.
- Accepting a quote **reserves ₦100 from the customer's wallet and ₦100 from the provider's**. If either side can't cover it, nothing happens (no partial deduction).
- Cancelling before verified arrival **returns both reservations**. Fee is **charged** when the provider says they've arrived **and the customer confirms** (GPS will replace the customer tap in the maps stage). The job price is paid directly between the two people; LifeLink never touches it.
- Booking states: `confirmed → provider_on_the_way → arrived → in_progress → completed` (+ `cancelled`, `disputed`). `fee_status`: `held → charged | released`.
- Ledger (`wallet_ledger`) is append-only; deposits are credited only by the server after Paystack verification, idempotently per reference.
- ₦200 penalties, GPS checks and warnings are **not built yet** (planned: log-only first).


## What works
Sign-up/sign-in, roles, customer requests (with photos), provider applications (with documents) and admin verification, quotes, accepting a quote → booking, scheduling, messaging (polls every 8s), reviews, disputes with evidence, notifications, reports/support (Trust & Safety → Admin → Reports), provider services and profile, admin overview/users/categories/disputes, account deletion (only if the account has no bookings).

## Not connected yet (deliberately)
- **Penalties are LOG-ONLY:** `arrival_penalty_log` records what would apply; nothing is charged. Admin -> Arrival penalties (log). Real penalties are a later decision.
- **AI assistant / AI matching:** needs an AI key; page is an honest "not available" page.
- **Paystack live mode:** only test keys have been used. Going live means swapping both keys and the webhook URL and re-testing.
- **Push notifications / PWA:** later stage.

## Layout
`page-*.js` — one script per page · `ll-api.js` — all Supabase calls (`window.LLApi`) · `lifelink.js` — UI helpers, route guard, account chip, notifications · `ll-chat.js` — message panel · `_archive/` — old dev tooling and non-functional mobile mockups (not used).
Page contract: `<body data-ll-page=".." data-ll-role="public|any|customer|provider|admin">`; protected pages stay hidden until the role is verified.
