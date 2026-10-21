-- =============================================================================
-- LifeLink 006 — Maps stage: job pin, live location, GPS-verified arrival,
-- arrival reminders and LOG-ONLY penalties.  Re-runnable. Run AFTER 005_wallet.sql.
--
--   * Customers may drop a pin for the job. The pin lives in its own table so it is
--     NOT visible to every provider browsing open requests — only to the customer,
--     the booked provider, and admins.
--   * While a booking is provider_on_the_way / arrived, each party may share a live
--     point. Only the LATEST point per person is stored; rows are deleted when the job
--     starts, completes or is cancelled. Only the two parties and admins can read them.
--   * 200 m "approaching" notice (once). 100 m verified arrival: provider taps
--     "I've arrived" and the SERVER checks a fresh (<=60 s), accurate (<=50 m) point.
--   * No pin, or GPS unavailable => the old manual flow (customer confirms) still works.
--   * Reminders + penalties are LOG-ONLY: a "would apply" row is written, no money moves.
--     Penalties never come from GPS failure, denied permission or dropped connection,
--     and are paused/reset by disputes.
-- All tunable numbers live in the small functions in section 0.
-- =============================================================================

-- 0. Tunables ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.arrival_radius_m()   RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 100 $$;
CREATE OR REPLACE FUNCTION public.approach_radius_m()  RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 200 $$;
CREATE OR REPLACE FUNCTION public.loc_max_accuracy_m() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$;
CREATE OR REPLACE FUNCTION public.loc_fresh_seconds()  RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 60 $$;
CREATE OR REPLACE FUNCTION public.penalty_kobo()       RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 20000 $$;   -- ₦200 (log-only)
GRANT EXECUTE ON FUNCTION public.arrival_radius_m(), public.approach_radius_m(), public.loc_max_accuracy_m(),
  public.loc_fresh_seconds(), public.penalty_kobo() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._dist_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;

-- 1. Job pin (private to customer, booked provider, admin) ----------------------
CREATE TABLE IF NOT EXISTS public.request_locations (
  request_id uuid PRIMARY KEY REFERENCES public.service_requests(id) ON DELETE CASCADE,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.request_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.request_locations TO authenticated;

CREATE OR REPLACE FUNCTION public.is_booking_party(p_booking uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = p_booking AND auth.uid() IN (b.customer_id, b.provider_id));
$$;
REVOKE ALL ON FUNCTION public.is_booking_party(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_booking_party(uuid) TO authenticated;

DROP POLICY IF EXISTS p_reqloc_owner ON public.request_locations;
CREATE POLICY p_reqloc_owner ON public.request_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.service_requests r WHERE r.id = request_id AND r.customer_id = auth.uid()));
DROP POLICY IF EXISTS p_reqloc_booked_provider ON public.request_locations;
CREATE POLICY p_reqloc_booked_provider ON public.request_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.request_id = request_locations.request_id AND b.provider_id = auth.uid()
                 AND b.status IN ('confirmed','provider_on_the_way','arrived','in_progress','completed','disputed')));
DROP POLICY IF EXISTS p_reqloc_admin ON public.request_locations;
CREATE POLICY p_reqloc_admin ON public.request_locations FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_request_pin(p_request uuid, p_lat double precision, p_lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r public.service_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.service_requests WHERE id = p_request;
  IF NOT FOUND OR v_r.customer_id <> auth.uid() THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_r.status NOT IN ('open','quoted') THEN RAISE EXCEPTION 'the job location can no longer be changed'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'invalid location'; END IF;
  INSERT INTO public.request_locations (request_id, lat, lng) VALUES (p_request, p_lat, p_lng)
  ON CONFLICT (request_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng;
END $$;
REVOKE ALL ON FUNCTION public.set_request_pin(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_request_pin(uuid, double precision, double precision) TO authenticated;

-- 2. Booking columns -------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS approaching_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS within_100m_since timestamptz,
  ADD COLUMN IF NOT EXISTS arrival_method text;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_arrival_method_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_arrival_method_check CHECK (arrival_method IS NULL OR arrival_method IN ('gps','manual'));

-- 3. Live location (latest point per person) --------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_locations (
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, user_id)
);
ALTER TABLE public.booking_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_locations TO authenticated;
DROP POLICY IF EXISTS p_bloc_select ON public.booking_locations;
CREATE POLICY p_bloc_select ON public.booking_locations FOR SELECT TO authenticated
  USING (public.is_booking_party(booking_id) OR public.is_admin());

-- Realtime (the table must be in the publication; RLS still limits who receives rows).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'booking_locations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_locations;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not add booking_locations to the realtime publication (%). The tracking page falls back to polling.', SQLERRM;
END $$;

-- Delete points when the job starts / ends; reset arrival timers on dispute.
CREATE OR REPLACE FUNCTION public._booking_status_housekeeping()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('in_progress','completed','cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.booking_locations WHERE booking_id = NEW.id;
  END IF;
  IF NEW.status = 'disputed' AND OLD.status IS DISTINCT FROM 'disputed' THEN
    NEW.within_100m_since := NULL;
    DELETE FROM public.booking_reminders WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

-- 4. Reminders + log-only penalty records -----------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_reminders (
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  party text NOT NULL CHECK (party IN ('provider','customer')),
  step int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, party, step)
);
ALTER TABLE public.booking_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_reminders FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.arrival_penalty_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  party text NOT NULL CHECK (party IN ('provider','customer')),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  amount_kobo int NOT NULL,
  status text NOT NULL DEFAULT 'would_apply' CHECK (status IN ('would_apply')),   -- log-only: nothing is ever charged here
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, party)
);
ALTER TABLE public.arrival_penalty_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arrival_penalty_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.arrival_penalty_log TO authenticated;
DROP POLICY IF EXISTS p_apl_admin ON public.arrival_penalty_log;
CREATE POLICY p_apl_admin ON public.arrival_penalty_log FOR SELECT TO authenticated USING (public.is_admin());

-- 5. Triggers (created after the tables they touch exist) --------------------------
DROP TRIGGER IF EXISTS trg_booking_housekeeping ON public.bookings;
CREATE TRIGGER trg_booking_housekeeping BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public._booking_status_housekeeping();

-- 6. update_my_location: called every few seconds by the page that is sharing -------
CREATE OR REPLACE FUNCTION public.update_my_location(
  p_booking uuid, p_lat double precision, p_lng double precision,
  p_accuracy double precision DEFAULT NULL, p_captured_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b public.bookings%ROWTYPE; v_pin public.request_locations%ROWTYPE;
  v_d double precision; v_acc double precision := COALESCE(p_accuracy, 99999); v_good boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'invalid location'; END IF;
  IF v_acc < 0 THEN RAISE EXCEPTION 'invalid accuracy'; END IF;
  IF p_captured_at < now() - make_interval(secs => public.loc_fresh_seconds())
     OR p_captured_at > now() + interval '30 seconds' THEN RAISE EXCEPTION 'location reading is too old'; END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() NOT IN (v_b.customer_id, v_b.provider_id) THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('provider_on_the_way','arrived') THEN RAISE EXCEPTION 'location is only shared while the provider is on the way'; END IF;

  INSERT INTO public.booking_locations (booking_id, user_id, lat, lng, accuracy_m, updated_at)
  VALUES (p_booking, auth.uid(), p_lat, p_lng, p_accuracy, now())
  ON CONFLICT (booking_id, user_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, accuracy_m = EXCLUDED.accuracy_m, updated_at = now();

  IF auth.uid() = v_b.provider_id AND v_b.status = 'provider_on_the_way' THEN
    SELECT * INTO v_pin FROM public.request_locations WHERE request_id = v_b.request_id;
    IF FOUND THEN
      v_d := public._dist_m(p_lat, p_lng, v_pin.lat, v_pin.lng);
      v_good := v_acc <= public.loc_max_accuracy_m();
      IF v_good THEN
        IF v_d <= public.approach_radius_m() AND v_b.approaching_notified_at IS NULL THEN
          UPDATE public.bookings SET approaching_notified_at = now() WHERE id = p_booking;
          INSERT INTO public.notifications (user_id, type, title, body, link)
          VALUES (v_b.customer_id, 'booking', 'Your provider is almost there', 'Your provider is within about 200 m of the job location.', 'tracking.html?id=' || p_booking::text);
        END IF;
        IF v_d <= public.arrival_radius_m() THEN
          IF v_b.within_100m_since IS NULL THEN UPDATE public.bookings SET within_100m_since = now() WHERE id = p_booking; END IF;
        ELSIF v_b.within_100m_since IS NOT NULL THEN
          UPDATE public.bookings SET within_100m_since = NULL WHERE id = p_booking;
        END IF;
      END IF;
      RETURN jsonb_build_object('distance_m', round(v_d), 'accurate', v_good);
    END IF;
  END IF;
  RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.update_my_location(uuid, double precision, double precision, double precision, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_location(uuid, double precision, double precision, double precision, timestamptz) TO authenticated;

-- 7. provider_arrived: GPS-verified when the booking has a pin ---------------------
DROP FUNCTION IF EXISTS public.provider_arrived(uuid);
CREATE OR REPLACE FUNCTION public.provider_arrived(p_booking uuid, p_manual boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b public.bookings%ROWTYPE; v_pin public.request_locations%ROWTYPE; v_loc public.booking_locations%ROWTYPE;
  v_fee int := public.platform_fee_kobo(); v_d double precision; v_fresh boolean := false;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.provider_id <> auth.uid() THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('confirmed','provider_on_the_way') THEN RAISE EXCEPTION 'this booking is not waiting for your arrival'; END IF;

  SELECT * INTO v_pin FROM public.request_locations WHERE request_id = v_b.request_id;
  IF FOUND THEN
    SELECT * INTO v_loc FROM public.booking_locations WHERE booking_id = p_booking AND user_id = auth.uid();
    IF FOUND AND v_loc.updated_at > now() - make_interval(secs => public.loc_fresh_seconds())
       AND COALESCE(v_loc.accuracy_m, 99999) <= public.loc_max_accuracy_m() THEN v_fresh := true; END IF;

    IF v_fresh THEN
      v_d := public._dist_m(v_loc.lat, v_loc.lng, v_pin.lat, v_pin.lng);
      IF v_d > public.arrival_radius_m() THEN
        RAISE EXCEPTION 'You are about % m from the job location. Get within % m, then tap "I have arrived" again.', round(v_d), public.arrival_radius_m();
      END IF;
      -- VERIFIED BY GPS: charge both fees now (idempotent on ledger refs)
      IF v_b.fee_status <> 'held' THEN RAISE EXCEPTION 'no platform fee is reserved for this booking'; END IF;
      PERFORM public._wallet_move(v_b.customer_id, 'fee_charge', 0, -v_fee, 'fee:' || p_booking::text || ':customer', p_booking, 'LifeLink platform fee');
      PERFORM public._wallet_move(v_b.provider_id, 'fee_charge', 0, -v_fee, 'fee:' || p_booking::text || ':provider', p_booking, 'LifeLink platform fee');
      UPDATE public.bookings SET status = 'arrived', provider_arrived_at = now(), arrival_method = 'gps',
        fee_status = 'charged', fee_charged_at = now(), within_100m_since = NULL WHERE id = p_booking;
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (v_b.customer_id, 'booking', 'Your provider has arrived', 'Arrival was verified by GPS. The flat LifeLink fee has been charged.', 'booking.html?id=' || p_booking::text);
      RETURN 'gps';
    ELSIF NOT p_manual THEN
      RAISE EXCEPTION 'We could not get a recent, accurate GPS location from your phone. Allow location access and wait a few seconds, or choose "My GPS is not working" so the customer can confirm instead.';
    END IF;
  END IF;

  -- Manual flow (no pin on the request, or GPS unavailable and the provider chose manual): customer confirms.
  UPDATE public.bookings SET status = 'arrived', provider_arrived_at = now(), arrival_method = 'manual' WHERE id = p_booking;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.customer_id, 'booking', 'Your provider says they have arrived', 'Please confirm their arrival to begin the job.', 'booking.html?id=' || p_booking::text);
  RETURN 'manual';
END $$;
REVOKE ALL ON FUNCTION public.provider_arrived(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_arrived(uuid, boolean) TO authenticated;

-- 8. Reminder + log-only penalty job (run every minute by pg_cron) ------------------
-- Provider: within 100 m (fresh GPS) without tapping arrived -> reminders at 3, 8, 13 min, final window to 18 min.
-- Customer: provider reported arrival manually and customer has not confirmed -> reminders at 0, 5, 10 min, final window to 15 min.
--   A customer penalty record is only written when GPS ALSO shows the provider within 100 m; with no GPS evidence nobody is penalised.
CREATE OR REPLACE FUNCTION public.process_arrival_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_min numeric; s int;
BEGIN
  -- Provider side
  FOR r IN
    SELECT b.id, b.provider_id, b.within_100m_since, l.updated_at AS loc_at
    FROM public.bookings b JOIN public.booking_locations l ON l.booking_id = b.id AND l.user_id = b.provider_id
    WHERE b.status = 'provider_on_the_way' AND b.within_100m_since IS NOT NULL
  LOOP
    CONTINUE WHEN r.loc_at < now() - interval '120 seconds';                 -- GPS gap: never penalise, never nag
    v_min := extract(epoch FROM (now() - r.within_100m_since)) / 60;
    FOREACH s IN ARRAY ARRAY[3, 8, 13] LOOP
      IF v_min >= s AND NOT EXISTS (SELECT 1 FROM public.booking_reminders WHERE booking_id = r.id AND party = 'provider' AND step = s) THEN
        INSERT INTO public.booking_reminders (booking_id, party, step) VALUES (r.id, 'provider', s);
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (r.provider_id, 'booking', 'You are at the job location',
                'You are within 100 m of the customer. Tap "I have arrived" so the job can begin.', 'provider-dashboard.html?section=bookings');
      END IF;
    END LOOP;
    IF v_min >= 18 THEN
      INSERT INTO public.arrival_penalty_log (booking_id, party, user_id, reason, amount_kobo)
      VALUES (r.id, 'provider', r.provider_id, 'Within 100 m for 18+ minutes without confirming arrival', public.penalty_kobo())
      ON CONFLICT (booking_id, party) DO NOTHING;
      IF FOUND THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (r.provider_id, 'booking', 'Arrival reminder window ended',
                'A ₦200 penalty would apply in a future release. Nothing has been charged.', 'provider-dashboard.html?section=bookings');
      END IF;
    END IF;
  END LOOP;

  -- Customer side
  FOR r IN
    SELECT b.id, b.customer_id, b.provider_arrived_at, b.within_100m_since
    FROM public.bookings b
    WHERE b.status = 'arrived' AND b.fee_status = 'held' AND b.provider_arrived_at IS NOT NULL
  LOOP
    v_min := extract(epoch FROM (now() - r.provider_arrived_at)) / 60;
    FOREACH s IN ARRAY ARRAY[0, 5, 10] LOOP
      IF v_min >= s AND NOT EXISTS (SELECT 1 FROM public.booking_reminders WHERE booking_id = r.id AND party = 'customer' AND step = s) THEN
        INSERT INTO public.booking_reminders (booking_id, party, step) VALUES (r.id, 'customer', s);
        IF s > 0 THEN   -- step 0 is the original "provider says they arrived" notification
          INSERT INTO public.notifications (user_id, type, title, body, link)
          VALUES (r.customer_id, 'booking', 'Please confirm your provider''s arrival', 'Your provider reported arriving. Confirm if they are with you, or report a problem.', 'booking.html?id=' || r.id::text);
        END IF;
      END IF;
    END LOOP;
    IF v_min >= 15 AND r.within_100m_since IS NOT NULL THEN
      INSERT INTO public.arrival_penalty_log (booking_id, party, user_id, reason, amount_kobo)
      VALUES (r.id, 'customer', r.customer_id, 'Provider reported arrival (GPS agrees); no confirmation within 15 minutes', public.penalty_kobo())
      ON CONFLICT (booking_id, party) DO NOTHING;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.process_arrival_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_arrival_reminders() TO service_role;

-- 9. Schedule it every minute (needs the pg_cron extension) -------------------------
DO $$
BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_cron could not be enabled (%). Enable it in Database -> Extensions, then re-run this block.', SQLERRM; END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('lifelink-arrival-reminders'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('lifelink-arrival-reminders', '* * * * *', 'select public.process_arrival_reminders()');
  END IF;
END $$;
