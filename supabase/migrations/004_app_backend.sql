-- LIFELINK Stage 3: application backend (messaging, booking lifecycle, disputes, storage, admin).
-- File: supabase/migrations/004_app_backend.sql
--
-- RUN ORDER: 001_schema.sql -> 002_helpers.sql -> 003_rls.sql -> 004_app_backend.sql
-- Run it once in the Supabase SQL Editor. It is written to be re-runnable (IF NOT EXISTS /
-- CREATE OR REPLACE / DROP ... IF EXISTS), but read it before running.
--
-- WHAT THIS ADDS (everything except wallet/escrow, Paystack payments and maps/tracking):
--   * provider profile extras (availability, experience, skills) + richer public_providers view
--   * request extras (preferred date/window, photo attachments, direct-to-provider requests)
--   * messaging (conversations + messages) with participant-only RLS and RPCs
--   * quote / request / booking notifications and status triggers
--   * booking lifecycle RPCs: schedule, cancel (unpaid only), start, complete
--   * review rating aggregates
--   * disputes via RPC (+ evidence files) and admin resolution
--   * provider application RPC and verification document rules
--   * private storage buckets (verification docs, dispute evidence, request photos) + public avatars
--   * reports / support requests (Trust & Safety page), account deletion
--   * admin overview counts
--
-- WHAT THIS DELIBERATELY DOES NOT DO (deferred by the owner):
--   * Nothing here can mark a booking "paid", hold escrow, move money or write wallet ledgers.
--     bookings.status = 'paid' is reserved for the future Paystack webhook (server-side).
--   * No maps / GPS / live tracking tables.

-- ---------------------------------------------------------------------------
-- 0. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS years_experience smallint CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 80),
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}' CHECK (cardinality(skills) <= 15);
GRANT UPDATE (available, years_experience, skills) ON public.provider_profiles TO authenticated;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS preferred_date date,
  ADD COLUMN IF NOT EXISTS preferred_window text CHECK (preferred_window IS NULL OR preferred_window IN ('morning','afternoon','evening')),
  ADD COLUMN IF NOT EXISTS media_paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(media_paths) <= 5);
GRANT INSERT (direct_provider_id, preferred_date, preferred_window, media_paths) ON public.service_requests TO authenticated;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS prev_status text;  -- status before a dispute (restored on resolution)

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS evidence_paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(evidence_paths) <= 5),
  ADD COLUMN IF NOT EXISTS resolution_note text CHECK (char_length(resolution_note) <= 2000),
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
-- Disputes are now opened ONLY through open_dispute() (it also moves the booking to 'disputed').
REVOKE INSERT ON public.disputes FROM authenticated;

-- notifications: allow a 'message' type.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('quote','booking','payment','review','verification','dispute','system','message','report'));

-- ---------------------------------------------------------------------------
-- 1. Messaging tables (RLS: participants only; writes only through RPCs below)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  CONSTRAINT one_conversation_per_request_provider UNIQUE (request_id, provider_id),
  CONSTRAINT no_self_conversation CHECK (customer_id <> provider_id)
);
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_conv_customer ON public.conversations(customer_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conv_provider ON public.conversations(provider_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON public.messages(conversation_id, created_at);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversations, public.messages FROM anon, authenticated;
GRANT SELECT ON public.conversations, public.messages TO authenticated;

DROP POLICY IF EXISTS p_conv_party_select ON public.conversations;
CREATE POLICY p_conv_party_select ON public.conversations FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR provider_id = auth.uid());
DROP POLICY IF EXISTS p_msg_party_select ON public.messages;
CREATE POLICY p_msg_party_select ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c
                 WHERE c.id = messages.conversation_id AND (c.customer_id = auth.uid() OR c.provider_id = auth.uid())));

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_admins(p_type text, p_title text, p_body text, p_link text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT id, p_type, p_title, p_body, p_link FROM public.profiles WHERE role = 'admin';
$$;
REVOKE ALL ON FUNCTION public.notify_admins(text,text,text,text) FROM PUBLIC, anon, authenticated;

-- Providers may read requests they are linked to (quoted / booked / messaged), even after the request
-- left the open board. Definer helper avoids RLS recursion between requests <-> quotes.
CREATE OR REPLACE FUNCTION public.provider_has_request_link(p_request uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.quotes q WHERE q.request_id = p_request AND q.provider_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.request_id = p_request AND b.provider_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.request_id = p_request AND c.provider_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.provider_has_request_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_has_request_link(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guards updated for trusted internal transitions
-- ---------------------------------------------------------------------------
-- Request status: customers may only cancel; trusted functions use a request-scoped token.
CREATE OR REPLACE FUNCTION public.guard_request_status_client()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.internal_op', true) = 'accept:' || NEW.id::text THEN RETURN NEW; END IF;
  IF current_setting('app.internal_op', true) = 'decline:' || NEW.id::text THEN RETURN NEW; END IF;
  IF current_setting('app.internal_op', true) = 'sys:' || NEW.id::text THEN RETURN NEW; END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.direct_provider_id IS DISTINCT FROM OLD.direct_provider_id
     OR NEW.declined_by IS DISTINCT FROM OLD.declined_by THEN
    RAISE EXCEPTION 'ownership/direct/declined_by immutable via direct update';
  END IF;
  IF NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.category_text IS DISTINCT FROM OLD.category_text THEN
    RAISE EXCEPTION 'category immutable after creation';
  END IF;
  IF NEW.media_paths IS DISTINCT FROM OLD.media_paths
     OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date
     OR NEW.preferred_window IS DISTINCT FROM OLD.preferred_window THEN
    RAISE EXCEPTION 'attachments and preferred schedule are fixed after creation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.customer_id = auth.uid() AND NEW.status = 'cancelled' AND OLD.status IN ('open','quoted')) THEN
      RAISE EXCEPTION 'request status change not permitted from client';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Provider privileged fields: admin OR a trusted definer function that set app.internal_provider.
CREATE OR REPLACE FUNCTION public.forbid_provider_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.internal_provider', true) = '1' THEN NEW.updated_at := now(); RETURN NEW; END IF;
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.trust_score IS DISTINCT FROM OLD.trust_score
     OR NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
     OR NEW.jobs_done IS DISTINCT FROM OLD.jobs_done THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'privileged provider fields require admin'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 4. RLS policy updates
-- ---------------------------------------------------------------------------
-- Requests: only customers insert; direct provider must be verified; attachments must live in the caller's folder.
DROP POLICY IF EXISTS p_req_insert ON public.service_requests;
CREATE POLICY p_req_insert ON public.service_requests FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'customer')
    AND (direct_provider_id IS NULL OR public.is_verified_provider(direct_provider_id))
    AND NOT EXISTS (SELECT 1 FROM unnest(media_paths) m WHERE split_part(m, '/', 1) <> auth.uid()::text)
  );

-- Provider board: verified providers see OPEN or QUOTED requests (so several providers can quote one request).
DROP POLICY IF EXISTS p_req_provider_select ON public.service_requests;
CREATE POLICY p_req_provider_select ON public.service_requests FOR SELECT TO authenticated
  USING (public.is_verified_provider(auth.uid()) AND status IN ('open','quoted')
         AND NOT (auth.uid() = ANY (declined_by))
         AND (direct_provider_id IS NULL OR direct_provider_id = auth.uid()));
DROP POLICY IF EXISTS p_req_provider_linked_select ON public.service_requests;
CREATE POLICY p_req_provider_linked_select ON public.service_requests FOR SELECT TO authenticated
  USING (public.provider_has_request_link(id));

-- Booking parties can read each other's disputes on their booking.
DROP POLICY IF EXISTS p_dis_party_select ON public.disputes;
CREATE POLICY p_dis_party_select ON public.disputes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = disputes.booking_id
                 AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())));

-- Verification documents: provider inserts own pending rows, only after an application exists, only own folder.
DROP POLICY IF EXISTS p_ver_insert ON public.provider_verifications;
CREATE POLICY p_ver_insert ON public.provider_verifications FOR INSERT TO authenticated
  WITH CHECK (provider_id = auth.uid() AND status = 'pending'
              AND EXISTS (SELECT 1 FROM public.provider_profiles pp WHERE pp.profile_id = auth.uid())
              AND (file_path IS NULL OR split_part(file_path, '/', 1) = auth.uid()::text));

-- decline_request: also allowed while a request is 'quoted'.
CREATE OR REPLACE FUNCTION public.decline_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r public.service_requests%ROWTYPE; v_role text; v_verified boolean;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'provider' THEN RAISE EXCEPTION 'only providers may decline'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.provider_profiles WHERE profile_id = auth.uid() AND verification_status = 'verified') INTO v_verified;
  IF NOT v_verified THEN RAISE EXCEPTION 'only verified providers may decline'; END IF;
  SELECT * INTO v_r FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_r.status NOT IN ('open','quoted') THEN RAISE EXCEPTION 'request not available for decline'; END IF;
  IF auth.uid() = ANY (v_r.declined_by) THEN RAISE EXCEPTION 'request not available for decline'; END IF;
  IF v_r.direct_provider_id IS NOT NULL AND v_r.direct_provider_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'request not available for decline'; END IF;
  IF EXISTS (SELECT 1 FROM public.quotes WHERE request_id = p_request_id AND provider_id = auth.uid() AND status = 'pending') THEN
    RAISE EXCEPTION 'withdraw your quote before declining';
  END IF;
  PERFORM set_config('app.internal_op', 'decline:' || p_request_id::text, true);
  UPDATE public.service_requests SET declined_by = declined_by || auth.uid() WHERE id = p_request_id;
  PERFORM set_config('app.internal_op', '', true);
END $$;
REVOKE ALL ON FUNCTION public.decline_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_request(uuid) TO authenticated;

-- accept_quote: same logic as 002, plus "provider must still be verified".
CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q public.quotes%ROWTYPE; v_r public.service_requests%ROWTYPE; v_b uuid; v_fee int;
BEGIN
  SELECT * INTO v_r FROM public.service_requests WHERE id = (SELECT request_id FROM public.quotes WHERE id = p_quote_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  SELECT * INTO v_q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote not found'; END IF;
  IF v_r.customer_id <> auth.uid() THEN RAISE EXCEPTION 'only request owner may accept'; END IF;
  IF v_q.status <> 'pending' THEN RAISE EXCEPTION 'quote not pending'; END IF;
  IF v_r.status NOT IN ('open','quoted') THEN RAISE EXCEPTION 'request not open'; END IF;
  IF NOT public.is_verified_provider(v_q.provider_id) THEN RAISE EXCEPTION 'provider is no longer verified'; END IF;
  v_fee := GREATEST(0, (v_q.price_kobo / 20)::int);
  PERFORM set_config('app.internal_op', 'accept:' || v_r.id::text, true);
  UPDATE public.quotes SET status = 'accepted' WHERE id = v_q.id;
  UPDATE public.quotes SET status = 'declined' WHERE request_id = v_r.id AND id <> v_q.id AND status = 'pending';
  INSERT INTO public.bookings (request_id, quote_id, customer_id, provider_id, price_kobo, service_fee_kobo)
  VALUES (v_r.id, v_q.id, v_r.customer_id, v_q.provider_id, v_q.price_kobo, v_fee)
  RETURNING id INTO v_b;
  UPDATE public.service_requests SET status = 'accepted' WHERE id = v_r.id;
  PERFORM set_config('app.internal_op', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_q.provider_id, 'booking', 'Quote accepted', 'A customer accepted your quote.', 'provider-dashboard.html?section=bookings');
  RETURN v_b;
END $$;
REVOKE ALL ON FUNCTION public.accept_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Triggers: notifications + status upkeep
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_quote_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cust uuid; v_name text;
BEGIN
  SELECT customer_id INTO v_cust FROM public.service_requests WHERE id = NEW.request_id;
  SELECT business_name INTO v_name FROM public.provider_profiles WHERE profile_id = NEW.provider_id;
  PERFORM set_config('app.internal_op', 'sys:' || NEW.request_id::text, true);
  UPDATE public.service_requests SET status = 'quoted' WHERE id = NEW.request_id AND status = 'open';
  PERFORM set_config('app.internal_op', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_cust, 'quote', 'New quote received', COALESCE(v_name, 'A provider') || ' sent you a quote.',
          'compare-quotes.html?request=' || NEW.request_id::text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_quote_created ON public.quotes;
CREATE TRIGGER trg_quote_created AFTER INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.on_quote_created();

CREATE OR REPLACE FUNCTION public.on_quote_withdrawn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'withdrawn' AND OLD.status = 'pending'
     AND NOT EXISTS (SELECT 1 FROM public.quotes WHERE request_id = NEW.request_id AND status = 'pending') THEN
    PERFORM set_config('app.internal_op', 'sys:' || NEW.request_id::text, true);
    UPDATE public.service_requests SET status = 'open' WHERE id = NEW.request_id AND status = 'quoted';
    PERFORM set_config('app.internal_op', '', true);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_quote_withdrawn ON public.quotes;
CREATE TRIGGER trg_quote_withdrawn AFTER UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.on_quote_withdrawn();

CREATE OR REPLACE FUNCTION public.on_request_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direct_provider_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.direct_provider_id, 'system', 'New direct request', 'A customer sent you a service request.',
            'provider-request.html?id=' || NEW.id::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_request_created ON public.service_requests;
CREATE TRIGGER trg_request_created AFTER INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.on_request_created();

-- When a customer cancels a request, its pending quotes are declined.
CREATE OR REPLACE FUNCTION public.on_request_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.quotes SET status = 'declined' WHERE request_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_request_cancelled ON public.service_requests;
CREATE TRIGGER trg_request_cancelled AFTER UPDATE OF status ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.on_request_cancelled();

-- Review aggregates: rating_avg recomputed from real reviews; provider is notified.
CREATE OR REPLACE FUNCTION public.apply_review_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.internal_provider', '1', true);
  UPDATE public.provider_profiles
     SET rating_avg = (SELECT round(avg(rating)::numeric, 1) FROM public.reviews WHERE provider_id = NEW.provider_id)
   WHERE profile_id = NEW.provider_id;
  PERFORM set_config('app.internal_provider', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.provider_id, 'review', 'New review', 'A customer reviewed a completed job.', 'provider-dashboard.html?section=reviews');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_review_stats ON public.reviews;
CREATE TRIGGER trg_review_stats AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.apply_review_stats();

-- ---------------------------------------------------------------------------
-- 6. Messaging RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_conversation(p_request uuid, p_provider uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_r public.service_requests%ROWTYPE; v_prov uuid; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT * INTO v_r FROM public.service_requests WHERE id = p_request;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_r.status = 'cancelled' THEN RAISE EXCEPTION 'this request was cancelled'; END IF;
  IF v_r.customer_id = v_uid THEN
    v_prov := p_provider;
    IF v_prov IS NULL THEN RAISE EXCEPTION 'choose a provider to message'; END IF;
    IF NOT (EXISTS (SELECT 1 FROM public.quotes WHERE request_id = p_request AND provider_id = v_prov)
            OR v_r.direct_provider_id IS NOT DISTINCT FROM v_prov) THEN
      RAISE EXCEPTION 'that provider has not responded to this request';
    END IF;
    IF NOT public.is_verified_provider(v_prov) THEN RAISE EXCEPTION 'provider is not verified'; END IF;
  ELSE
    IF NOT public.is_verified_provider(v_uid) THEN RAISE EXCEPTION 'only verified providers can message about requests'; END IF;
    v_prov := v_uid;
    IF NOT (EXISTS (SELECT 1 FROM public.quotes WHERE request_id = p_request AND provider_id = v_uid)
            OR (v_r.status IN ('open','quoted') AND NOT (v_uid = ANY (v_r.declined_by))
                AND (v_r.direct_provider_id IS NULL OR v_r.direct_provider_id = v_uid))) THEN
      RAISE EXCEPTION 'you cannot message about this request';
    END IF;
  END IF;
  INSERT INTO public.conversations (request_id, customer_id, provider_id)
  VALUES (p_request, v_r.customer_id, v_prov)
  ON CONFLICT (request_id, provider_id) DO NOTHING;
  SELECT id INTO v_id FROM public.conversations WHERE request_id = p_request AND provider_id = v_prov;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.open_conversation(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_conversation(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_message(p_conversation uuid, p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_c public.conversations%ROWTYPE; v_id uuid; v_to uuid; v_status text; v_body text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT * INTO v_c FROM public.conversations WHERE id = p_conversation;
  IF NOT FOUND OR v_uid NOT IN (v_c.customer_id, v_c.provider_id) THEN RAISE EXCEPTION 'conversation not found'; END IF;
  SELECT status INTO v_status FROM public.service_requests WHERE id = v_c.request_id;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'this request was cancelled'; END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF char_length(v_body) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'message must be 1-2000 characters'; END IF;
  INSERT INTO public.messages (conversation_id, sender_id, body) VALUES (p_conversation, v_uid, v_body) RETURNING id INTO v_id;
  UPDATE public.conversations SET last_message_at = now() WHERE id = p_conversation;
  v_to := CASE WHEN v_uid = v_c.customer_id THEN v_c.provider_id ELSE v_c.customer_id END;
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = p_conversation AND sender_id = v_uid AND read_at IS NULL AND id <> v_id) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_to, 'message', 'New message', 'You have a new message.',
            CASE WHEN v_to = v_c.provider_id THEN 'provider-dashboard.html?section=messages&c=' ELSE 'dashboard.html?section=messages&c=' END || p_conversation::text);
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.send_message(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation AND v_uid IN (customer_id, provider_id)) THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;
  UPDATE public.messages SET read_at = now() WHERE conversation_id = p_conversation AND sender_id <> v_uid AND read_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- Names of people you legitimately deal with (quote / conversation / booking), shown as "First L.".
CREATE OR REPLACE FUNCTION public.connected_profiles()
RETURNS TABLE (id uuid, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         NULLIF(btrim(split_part(btrim(p.full_name), ' ', 1)
           || CASE WHEN position(' ' IN btrim(p.full_name)) > 0
                   THEN ' ' || left(split_part(btrim(p.full_name), ' ', 2), 1) || '.' ELSE '' END), '') AS display_name,
         p.avatar_url
  FROM public.profiles p
  WHERE p.id IN (
    SELECT customer_id FROM public.bookings WHERE provider_id = auth.uid()
    UNION SELECT provider_id FROM public.bookings WHERE customer_id = auth.uid()
    UNION SELECT customer_id FROM public.conversations WHERE provider_id = auth.uid()
    UNION SELECT provider_id FROM public.conversations WHERE customer_id = auth.uid()
    UNION SELECT r.customer_id FROM public.quotes q JOIN public.service_requests r ON r.id = q.request_id WHERE q.provider_id = auth.uid()
    UNION SELECT q.provider_id FROM public.quotes q JOIN public.service_requests r ON r.id = q.request_id WHERE r.customer_id = auth.uid()
    UNION SELECT r.customer_id FROM public.service_requests r WHERE r.direct_provider_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.connected_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.connected_profiles() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Booking lifecycle RPCs (no payment/escrow side effects)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_booking_schedule(p_booking uuid, p_when timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_other uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() NOT IN (v_b.customer_id, v_b.provider_id) THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('pending_payment','paid') THEN RAISE EXCEPTION 'this booking can no longer be rescheduled'; END IF;
  IF p_when IS NULL OR p_when < now() THEN RAISE EXCEPTION 'choose a date and time in the future'; END IF;
  UPDATE public.bookings SET scheduled_for = p_when WHERE id = p_booking;
  v_other := CASE WHEN auth.uid() = v_b.customer_id THEN v_b.provider_id ELSE v_b.customer_id END;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_other, 'booking', 'Schedule updated', 'The booking time was set or changed.',
          CASE WHEN v_other = v_b.provider_id THEN 'provider-dashboard.html?section=bookings' ELSE 'booking.html?id=' || p_booking::text END);
END $$;
REVOKE ALL ON FUNCTION public.set_booking_schedule(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_booking_schedule(uuid,timestamptz) TO authenticated;

-- Cancellation is only possible BEFORE payment (nothing to refund). Paid bookings must use a dispute.
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_other uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() NOT IN (v_b.customer_id, v_b.provider_id) THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'only unpaid bookings can be cancelled here; open a dispute for paid bookings';
  END IF;
  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking;
  PERFORM set_config('app.internal_op', 'sys:' || v_b.request_id::text, true);
  UPDATE public.service_requests SET status = 'cancelled' WHERE id = v_b.request_id;
  PERFORM set_config('app.internal_op', '', true);
  v_other := CASE WHEN auth.uid() = v_b.customer_id THEN v_b.provider_id ELSE v_b.customer_id END;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_other, 'booking', 'Booking cancelled', 'A booking was cancelled before payment.',
          CASE WHEN v_other = v_b.provider_id THEN 'provider-dashboard.html?section=bookings' ELSE 'booking.html?id=' || p_booking::text END);
END $$;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_booking(p_booking uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.provider_id <> auth.uid() THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status <> 'paid' THEN RAISE EXCEPTION 'a job can only be started after the customer has paid'; END IF;
  UPDATE public.bookings SET status = 'in_progress' WHERE id = p_booking;
  PERFORM set_config('app.internal_op', 'sys:' || v_b.request_id::text, true);
  UPDATE public.service_requests SET status = 'in_progress' WHERE id = v_b.request_id;
  PERFORM set_config('app.internal_op', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.customer_id, 'booking', 'Job started', 'Your provider has started the job.', 'booking.html?id=' || p_booking::text);
END $$;
REVOKE ALL ON FUNCTION public.start_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_booking(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_booking(p_booking uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.provider_id <> auth.uid() THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status <> 'in_progress' THEN RAISE EXCEPTION 'only a job in progress can be completed'; END IF;
  UPDATE public.bookings SET status = 'completed', completed_at = now() WHERE id = p_booking;
  PERFORM set_config('app.internal_op', 'sys:' || v_b.request_id::text, true);
  UPDATE public.service_requests SET status = 'completed' WHERE id = v_b.request_id;
  PERFORM set_config('app.internal_op', '', true);
  PERFORM set_config('app.internal_provider', '1', true);
  UPDATE public.provider_profiles SET jobs_done = jobs_done + 1 WHERE profile_id = v_b.provider_id;
  PERFORM set_config('app.internal_provider', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.customer_id, 'booking', 'Job completed', 'Your job was marked complete. You can now leave a review.', 'review.html?booking=' || p_booking::text);
END $$;
REVOKE ALL ON FUNCTION public.complete_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_booking(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Provider application
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_provider_application(
  p_business text, p_category text, p_bio text DEFAULT NULL, p_area text DEFAULT NULL,
  p_years int DEFAULT NULL, p_skills text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_skills text[]; v_rows int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role = 'admin' THEN RAISE EXCEPTION 'this account cannot apply as a provider'; END IF;
  IF p_business IS NULL OR char_length(btrim(p_business)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'invalid business_name'; END IF;
  IF p_category IS NULL OR char_length(btrim(p_category)) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'invalid category'; END IF;
  IF p_years IS NOT NULL AND p_years NOT BETWEEN 0 AND 80 THEN RAISE EXCEPTION 'invalid years of experience'; END IF;
  SELECT COALESCE(array_agg(s), '{}') INTO v_skills FROM (
    SELECT btrim(x) AS s FROM unnest(COALESCE(p_skills, '{}')) x
    WHERE char_length(btrim(x)) BETWEEN 1 AND 40 LIMIT 15) t;
  PERFORM set_config('app.internal_provider', '1', true);
  INSERT INTO public.provider_profiles (profile_id, business_name, category, bio, service_area, years_experience, skills, verification_status)
  VALUES (auth.uid(), btrim(p_business), btrim(p_category), NULLIF(btrim(COALESCE(p_bio, '')), ''),
          NULLIF(btrim(COALESCE(p_area, '')), ''), p_years, v_skills, 'pending')
  ON CONFLICT (profile_id) DO UPDATE
     SET business_name = EXCLUDED.business_name, category = EXCLUDED.category, bio = EXCLUDED.bio,
         service_area = EXCLUDED.service_area, years_experience = EXCLUDED.years_experience,
         skills = EXCLUDED.skills, verification_status = 'pending'
   WHERE public.provider_profiles.verification_status <> 'verified';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('app.internal_provider', '', true);
  IF v_rows = 0 THEN RAISE EXCEPTION 'already verified; contact support to edit'; END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (auth.uid(), 'verification', 'Application received', 'Your provider application is pending review.', 'provider-verification.html');
  PERFORM public.notify_admins('verification', 'New provider application', btrim(p_business) || ' applied to become a provider.', 'admin.html?section=verification');
END $$;
REVOKE ALL ON FUNCTION public.submit_provider_application(text,text,text,text,int,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_provider_application(text,text,text,text,int,text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Disputes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_dispute(p_booking uuid, p_category text, p_description text, p_evidence text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_id uuid; v_other uuid; v_ev text[] := COALESCE(p_evidence, '{}');
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() NOT IN (v_b.customer_id, v_b.provider_id) THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('paid','in_progress','completed','disputed') THEN
    RAISE EXCEPTION 'a dispute can only be opened on a paid booking';
  END IF;
  IF p_category IS NULL OR char_length(btrim(p_category)) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'choose a dispute category'; END IF;
  IF p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'describe the problem (5-2000 characters)'; END IF;
  IF cardinality(v_ev) > 5 THEN RAISE EXCEPTION 'at most 5 evidence files'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ev) e WHERE split_part(e, '/', 1) <> auth.uid()::text) THEN RAISE EXCEPTION 'invalid evidence file'; END IF;
  IF EXISTS (SELECT 1 FROM public.disputes WHERE booking_id = p_booking AND reporter_id = auth.uid() AND status IN ('open','under_review')) THEN
    RAISE EXCEPTION 'you already have an open dispute on this booking';
  END IF;
  INSERT INTO public.disputes (booking_id, reporter_id, category, description, evidence_paths)
  VALUES (p_booking, auth.uid(), btrim(p_category), btrim(p_description), v_ev) RETURNING id INTO v_id;
  IF v_b.status <> 'disputed' THEN
    UPDATE public.bookings SET prev_status = v_b.status, status = 'disputed' WHERE id = p_booking;
  END IF;
  v_other := CASE WHEN auth.uid() = v_b.customer_id THEN v_b.provider_id ELSE v_b.customer_id END;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_other, 'dispute', 'A dispute was opened', 'A dispute was opened on one of your bookings.',
          CASE WHEN v_other = v_b.provider_id THEN 'provider-dashboard.html?section=bookings' ELSE 'booking.html?id=' || p_booking::text END);
  PERFORM public.notify_admins('dispute', 'New dispute', 'A dispute needs review.', 'admin.html?section=disputes');
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.open_dispute(uuid,text,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid,text,text,text[]) TO authenticated;

-- Admin updates a dispute. Refunds / escrow release are NOT performed here (payments are deferred);
-- the note records the decision for when the payment integration exists.
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(p_dispute uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.disputes%ROWTYPE; v_b public.bookings%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_status NOT IN ('under_review','resolved','closed') THEN RAISE EXCEPTION 'bad status'; END IF;
  SELECT * INTO v_d FROM public.disputes WHERE id = p_dispute FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dispute not found'; END IF;
  UPDATE public.disputes
     SET status = p_status, resolution_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
         resolved_by = CASE WHEN p_status IN ('resolved','closed') THEN auth.uid() ELSE NULL END,
         resolved_at = CASE WHEN p_status IN ('resolved','closed') THEN now() ELSE NULL END
   WHERE id = p_dispute;
  IF p_status IN ('resolved','closed') THEN
    SELECT * INTO v_b FROM public.bookings WHERE id = v_d.booking_id FOR UPDATE;
    IF v_b.status = 'disputed'
       AND NOT EXISTS (SELECT 1 FROM public.disputes WHERE booking_id = v_d.booking_id AND id <> p_dispute AND status IN ('open','under_review')) THEN
      UPDATE public.bookings SET status = COALESCE(v_b.prev_status, 'paid'), prev_status = NULL WHERE id = v_b.id;
    END IF;
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_d.reporter_id, 'dispute', 'Dispute ' || replace(p_status, '_', ' '), 'Your dispute is now ' || replace(p_status, '_', ' ') || '.', 'dashboard.html?section=bookings');
END $$;
REVOKE ALL ON FUNCTION public.admin_resolve_dispute(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid,text,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9b. Reports / support requests (Trust & Safety page) + account deletion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('provider','suspicious','support')),
  category text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 80),
  reference text CHECK (char_length(reference) <= 200),
  description text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','actioned','dismissed')),
  admin_note text CHECK (char_length(admin_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status, created_at DESC);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reports FROM anon, authenticated;
GRANT SELECT ON public.reports TO authenticated;
GRANT INSERT (reporter_id, kind, category, reference, description) ON public.reports TO authenticated;
DROP POLICY IF EXISTS p_rep_insert ON public.reports;
CREATE POLICY p_rep_insert ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid() AND status = 'open');
DROP POLICY IF EXISTS p_rep_owner_select ON public.reports;
CREATE POLICY p_rep_owner_select ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());
DROP POLICY IF EXISTS p_rep_admin_select ON public.reports;
CREATE POLICY p_rep_admin_select ON public.reports FOR SELECT TO authenticated USING (public.is_admin());
DROP TRIGGER IF EXISTS trg_touch_reports ON public.reports;
CREATE TRIGGER trg_touch_reports BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.on_report_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_admins('report', CASE NEW.kind WHEN 'support' THEN 'New support request' ELSE 'New safety report' END,
                               NEW.category, 'admin.html?section=reports');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_report_created ON public.reports;
CREATE TRIGGER trg_report_created AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.on_report_created();

CREATE OR REPLACE FUNCTION public.admin_set_report_status(p_report uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_status NOT IN ('open','reviewing','actioned','dismissed') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE public.reports SET status = p_status, admin_note = NULLIF(btrim(COALESCE(p_note, '')), '') WHERE id = p_report;
  IF NOT FOUND THEN RAISE EXCEPTION 'report not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_report_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_report_status(uuid,text,text) TO authenticated;

-- Self-service account deletion. Refused when the account has bookings (financial / dispute history must stay).
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  IF public.is_admin() THEN RAISE EXCEPTION 'admin accounts cannot be deleted here'; END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE customer_id = auth.uid() OR provider_id = auth.uid()) THEN
    RAISE EXCEPTION 'accounts with bookings cannot be deleted automatically; contact support';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Admin overview (real counts only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN jsonb_build_object(
    'customers', (SELECT count(*) FROM public.profiles WHERE role = 'customer'),
    'providers', (SELECT count(*) FROM public.profiles WHERE role = 'provider'),
    'pending_applications', (SELECT count(*) FROM public.provider_profiles WHERE verification_status = 'pending'),
    'requests', (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*) n FROM public.service_requests GROUP BY status) s),
    'bookings', (SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*) n FROM public.bookings GROUP BY status) s),
    'open_disputes', (SELECT count(*) FROM public.disputes WHERE status IN ('open','under_review')),
    'reviews', (SELECT count(*) FROM public.reviews),
    'avg_rating', (SELECT round(avg(rating)::numeric, 2) FROM public.reviews),
    'completed_value_kobo', (SELECT COALESCE(sum(price_kobo), 0) FROM public.bookings WHERE status = 'completed')
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Public provider directory (adds availability, experience, skills, review count, starting price)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_providers WITH (security_invoker = false) AS
SELECT p.id AS provider_id, p.avatar_url,
  pp.business_name, pp.category, pp.bio, pp.service_area,
  pp.verification_status, pp.trust_score, pp.rating_avg, pp.jobs_done,
  pp.available, pp.years_experience, pp.skills,
  (SELECT count(*) FROM public.reviews r WHERE r.provider_id = pp.profile_id)::int AS review_count,
  (SELECT min(s.base_price_kobo) FROM public.provider_services s WHERE s.provider_id = pp.profile_id AND s.active) AS min_price_kobo
FROM public.provider_profiles pp JOIN public.profiles p ON p.id = pp.profile_id
WHERE pp.verification_status = 'verified' AND p.role = 'provider';
GRANT SELECT ON public.public_providers TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Storage buckets and policies
--     verification-docs / dispute-evidence / request-media: PRIVATE. avatars: public read.
--     Object path convention: <auth.uid()>/<file>. Files are read through signed URLs.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('verification-docs', 'verification-docs', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png']),
  ('dispute-evidence',  'dispute-evidence',  false, 10485760, ARRAY['application/pdf','image/jpeg','image/png']),
  ('request-media',     'request-media',     false, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('avatars',           'avatars',           true,   2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- verification-docs: owner uploads/reads own folder; admin reads all.
DROP POLICY IF EXISTS ll_verif_insert ON storage.objects;
CREATE POLICY ll_verif_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS ll_verif_select ON storage.objects;
CREATE POLICY ll_verif_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));

-- dispute-evidence: owner uploads; reader = uploader, admin, or a party who can see the dispute (RLS on disputes applies).
DROP POLICY IF EXISTS ll_dispute_insert ON storage.objects;
CREATE POLICY ll_dispute_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dispute-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS ll_dispute_select ON storage.objects;
CREATE POLICY ll_dispute_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dispute-evidence' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()
         OR EXISTS (SELECT 1 FROM public.disputes d WHERE storage.objects.name = ANY (d.evidence_paths))));

-- request-media: owner uploads; readable by the owner, admin, and anyone who can see the request (RLS on requests applies).
DROP POLICY IF EXISTS ll_reqmedia_insert ON storage.objects;
CREATE POLICY ll_reqmedia_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'request-media' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS ll_reqmedia_select ON storage.objects;
CREATE POLICY ll_reqmedia_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'request-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()
         OR EXISTS (SELECT 1 FROM public.service_requests r WHERE storage.objects.name = ANY (r.media_paths))));

-- avatars: public read (bucket is public); only the owner writes inside their own folder.
DROP POLICY IF EXISTS ll_avatar_insert ON storage.objects;
CREATE POLICY ll_avatar_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS ll_avatar_update ON storage.objects;
CREATE POLICY ll_avatar_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS ll_avatar_delete ON storage.objects;
CREATE POLICY ll_avatar_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
