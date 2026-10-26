-- LifeLink 015 — job location change requests. Re-runnable. Run AFTER 014.
-- The job pin is locked once a booking exists (set_request_pin already refuses changes after acceptance, and the table
-- cannot be written to directly). The ONLY way to move it now: the customer asks, the provider accepts.

CREATE TABLE IF NOT EXISTS public.pin_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  new_lat double precision NOT NULL CHECK (new_lat BETWEEN -90 AND 90),
  new_lng double precision NOT NULL CHECK (new_lng BETWEEN -180 AND 180),
  new_line text CHECK (char_length(new_line) <= 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pin_change_one_pending ON public.pin_change_requests(booking_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pin_change_booking ON public.pin_change_requests(booking_id, created_at DESC);

ALTER TABLE public.pin_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pin_change_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pin_change_requests TO authenticated;
DROP POLICY IF EXISTS p_pcr_select ON public.pin_change_requests;
CREATE POLICY p_pcr_select ON public.pin_change_requests FOR SELECT TO authenticated
  USING (public.is_booking_party(booking_id) OR public.is_admin());

-- How long the provider has to answer.
CREATE OR REPLACE FUNCTION public.pin_change_ttl() RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '15 minutes' $$;
GRANT EXECUTE ON FUNCTION public.pin_change_ttl() TO authenticated;

-- Customer asks to move the job location.
CREATE OR REPLACE FUNCTION public.request_pin_change(p_booking uuid, p_lat double precision, p_lng double precision, p_line text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_id uuid; v_old public.request_locations%ROWTYPE; v_n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('confirmed','provider_on_the_way') THEN RAISE EXCEPTION 'the job location can no longer be changed'; END IF;
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'invalid location'; END IF;
  -- Old unanswered request: close it so a new one can be made.
  UPDATE public.pin_change_requests SET status = 'expired', responded_at = now()
   WHERE booking_id = p_booking AND status = 'pending' AND created_at < now() - public.pin_change_ttl();
  IF EXISTS (SELECT 1 FROM public.pin_change_requests WHERE booking_id = p_booking AND status = 'pending') THEN
    RAISE EXCEPTION 'you already have a change request waiting for the provider';
  END IF;
  SELECT count(*) INTO v_n FROM public.pin_change_requests WHERE booking_id = p_booking;
  IF v_n >= 3 THEN RAISE EXCEPTION 'you can ask to change the location up to 3 times for one booking'; END IF;
  SELECT * INTO v_old FROM public.request_locations WHERE request_id = v_b.request_id;
  IF FOUND AND public._dist_m(v_old.lat, v_old.lng, p_lat, p_lng) < 20 THEN RAISE EXCEPTION 'that is the same place as the current job location'; END IF;

  INSERT INTO public.pin_change_requests (booking_id, requested_by, new_lat, new_lng, new_line)
  VALUES (p_booking, auth.uid(), p_lat, p_lng, left(p_line, 200)) RETURNING id INTO v_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.provider_id, 'booking', 'Customer wants to change the job location', 'Open the booking to see the new place and accept or decline.', 'tracking.html?id=' || p_booking::text);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.request_pin_change(uuid, double precision, double precision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pin_change(uuid, double precision, double precision, text) TO authenticated;

-- Provider accepts or declines.
CREATE OR REPLACE FUNCTION public.respond_pin_change(p_change uuid, p_accept boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c public.pin_change_requests%ROWTYPE; v_b public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT * INTO v_c FROM public.pin_change_requests WHERE id = p_change FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  SELECT * INTO v_b FROM public.bookings WHERE id = v_c.booking_id FOR UPDATE;
  IF NOT FOUND OR v_b.provider_id <> auth.uid() THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'this request was already answered'; END IF;
  IF v_c.created_at < now() - public.pin_change_ttl() THEN
    UPDATE public.pin_change_requests SET status = 'expired', responded_at = now() WHERE id = p_change;
    RAISE EXCEPTION 'this request has expired';
  END IF;
  IF v_b.status NOT IN ('confirmed','provider_on_the_way') THEN
    UPDATE public.pin_change_requests SET status = 'expired', responded_at = now() WHERE id = p_change;
    RAISE EXCEPTION 'the job location can no longer be changed';
  END IF;

  IF p_accept THEN
    INSERT INTO public.request_locations (request_id, lat, lng) VALUES (v_b.request_id, v_c.new_lat, v_c.new_lng)
    ON CONFLICT (request_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng;
    -- Distance-based timers start fresh for the new place.
    UPDATE public.bookings SET approaching_notified_at = NULL, within_100m_since = NULL WHERE id = v_b.id;
    UPDATE public.pin_change_requests SET status = 'accepted', responded_at = now() WHERE id = p_change;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_b.customer_id, 'booking', 'Job location changed', 'Your provider accepted the new job location.', 'tracking.html?id=' || v_b.id::text);
    RETURN 'accepted';
  END IF;
  UPDATE public.pin_change_requests SET status = 'declined', responded_at = now() WHERE id = p_change;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.customer_id, 'booking', 'Location change declined', 'Your provider kept the original job location. You can message them to explain.', 'tracking.html?id=' || v_b.id::text);
  RETURN 'declined';
END $$;
REVOKE ALL ON FUNCTION public.respond_pin_change(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_pin_change(uuid, boolean) TO authenticated;

-- Customer withdraws a request that is still waiting.
CREATE OR REPLACE FUNCTION public.cancel_pin_change(p_change uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pin_change_requests SET status = 'cancelled', responded_at = now()
   WHERE id = p_change AND requested_by = auth.uid() AND status = 'pending';
END $$;
REVOKE ALL ON FUNCTION public.cancel_pin_change(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_pin_change(uuid) TO authenticated;

-- Instant updates for both people (the tracking page also checks every 10 s).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pin_change_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pin_change_requests;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add pin_change_requests to the realtime publication (%). The page checks every 10 s instead.', SQLERRM;
END $$;
