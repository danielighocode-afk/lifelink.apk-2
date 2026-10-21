-- LIFELINK Stage 2a: Helpers (PROPOSED, NOT EXECUTED)
-- File: supabase/migrations/002_helpers.sql
-- PROPOSED migrations: safe first-time order is 001_schema.sql, then 002_helpers.sql, then 003_rls.sql.
-- WARNING: not verified as fully rerunnable (001 uses CREATE TABLE without IF NOT EXISTS; only some
-- objects use CREATE OR REPLACE / DROP IF EXISTS). Do NOT blindly rerun; review each statement first.
-- All SECURITY DEFINER fns: fixed search_path, qualified names, least-privilege grants.
-- No auto-admin creation. Manual bootstrap documented in ADMIN_BOOTSTRAP.md (to be written on approval).

-- is_admin: single recursion-safe check used by RLS. Reads profiles bypassing RLS (definer).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- is_verified_provider: recursion-safe helper for cross-table RLS visibility.
-- RLS subqueries on provider_profiles are invisible to anon (no SELECT policy), which would
-- wrongly hide ALL services. Policies call this definer fn instead of querying the table directly.
-- Requires BOTH provider_profiles.verification_status='verified' AND profiles.role='provider',
-- so a role-downgraded-but-verified account (e.g. admin via bootstrap_first_admin) does not
-- keep active services public via p_svc_public / p_svc_owner_insert.
CREATE OR REPLACE FUNCTION public.is_verified_provider(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.provider_profiles pp
    JOIN public.profiles p ON p.id = pp.profile_id
    WHERE pp.profile_id = p_id
      AND pp.verification_status = 'verified'
      AND p.role = 'provider'
  );
$$;
REVOKE ALL ON FUNCTION public.is_verified_provider(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_verified_provider(uuid) TO anon, authenticated;

-- handle_new_user: creates profile row on signup. Forces role='customer'; validates metadata.
-- Rejects blank-after-trim names, overlong names, bad email/phone shapes instead of inserting '' or bad data.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_name text; v_phone text;
BEGIN
  v_name := TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name',''));
  IF v_name = '' THEN v_name := NULL; END IF;
  IF v_name IS NOT NULL AND (char_length(v_name) < 2 OR char_length(v_name) > 120) THEN
    RAISE EXCEPTION 'invalid full_name in signup metadata';
  END IF;
  v_phone := TRIM(COALESCE(NEW.raw_user_meta_data->>'phone',''));
  IF v_phone = '' THEN v_phone := NULL; END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^[0-9+() -]{7,32}$' THEN
    RAISE EXCEPTION 'invalid phone in signup metadata';
  END IF;
  IF NEW.email IS NULL OR position('@' IN NEW.email) < 2 OR position('.' IN split_part(NEW.email, '@', 2)) < 2 THEN
    RAISE EXCEPTION 'invalid signup email';
  END IF;
  INSERT INTO public.profiles (id, role, full_name, email, phone)
  VALUES (NEW.id, 'customer', v_name, NEW.email, v_phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- forbid_role_change: role changes ONLY via trusted definer functions (set_verification/bootstrap_first_admin)
-- which set app.internal_role='1'. Direct client UPDATEs of role always fail (column grant excludes role too).
CREATE OR REPLACE FUNCTION public.forbid_role_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.internal_role', true) = '1' THEN NEW.updated_at := now(); RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'role is immutable from client';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_role_immutable ON public.profiles;
CREATE TRIGGER trg_profiles_role_immutable BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.forbid_role_change();

-- forbid_provider_privilege_escalation: clients cannot set verification/trust/jobs/rating.
CREATE OR REPLACE FUNCTION public.forbid_provider_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.trust_score IS DISTINCT FROM OLD.trust_score
     OR NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
     OR NEW.jobs_done IS DISTINCT FROM OLD.jobs_done THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'privileged provider fields require admin'; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_provider_priv ON public.provider_profiles;
CREATE TRIGGER trg_provider_priv BEFORE UPDATE ON public.provider_profiles
FOR EACH ROW EXECUTE FUNCTION public.forbid_provider_privilege_escalation();

-- forbid_service_provider_change: provider_id immutable; only owner row writes (RLS also enforces).
CREATE OR REPLACE FUNCTION public.forbid_service_provider_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN RAISE EXCEPTION 'service provider immutable'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_service_provider_immutable ON public.provider_services;
CREATE TRIGGER trg_service_provider_immutable BEFORE UPDATE ON public.provider_services
FOR EACH ROW EXECUTE FUNCTION public.forbid_service_provider_change();

-- forbid_notification_mutation: only read_at may change; user_id/type/title/body/link/created_at immutable.
CREATE OR REPLACE FUNCTION public.forbid_notification_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.link IS DISTINCT FROM OLD.link OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'only read_at may change on notifications';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notification_immutable ON public.notifications;
CREATE TRIGGER trg_notification_immutable BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.forbid_notification_mutation();

-- touch_updated_at: generic timestamp maintenance (non-privileged).
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_requests ON public.service_requests;
CREATE TRIGGER trg_touch_requests BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_services ON public.provider_services;
CREATE TRIGGER trg_touch_services BEFORE UPDATE ON public.provider_services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_bookings ON public.bookings;
CREATE TRIGGER trg_touch_bookings BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_disputes ON public.disputes;
CREATE TRIGGER trg_touch_disputes BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_verifications ON public.provider_verifications;
CREATE TRIGGER trg_touch_verifications BEFORE UPDATE ON public.provider_verifications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- guard_request_status_client: customers may only edit description/location/urgency or cancel own open/quoted requests.
-- Ownership, direct_provider_id, declined_by immutable via direct UPDATE (provider path uses decline_request()).
CREATE OR REPLACE FUNCTION public.guard_request_status_client()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
-- Internal trusted path for accept_quote's own status transition (token-scoped).
  IF current_setting('app.internal_op', true) = 'accept:' || NEW.id::text THEN RETURN NEW; END IF;
  IF current_setting('app.internal_op', true) = 'decline:' || NEW.id::text THEN RETURN NEW; END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.direct_provider_id IS DISTINCT FROM OLD.direct_provider_id
     OR NEW.declined_by IS DISTINCT FROM OLD.declined_by THEN
    RAISE EXCEPTION 'ownership/direct/declined_by immutable via direct update';
  END IF;
  IF NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.category_text IS DISTINCT FROM OLD.category_text THEN
    RAISE EXCEPTION 'category immutable after creation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.customer_id = auth.uid() AND NEW.status = 'cancelled' AND OLD.status IN ('open','quoted')) THEN
      RAISE EXCEPTION 'request status change not permitted from client';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_request ON public.service_requests;
CREATE TRIGGER trg_guard_request BEFORE UPDATE ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_request_status_client();

-- decline_request: verified-provider-only decline path. Caller must have profiles.role='provider'
-- AND provider_profiles.verification_status='verified'. Row lock + revalidation blocks concurrent bypass.
-- Changes ONLY declined_by; ownership/status/category locked by guard_request_status_client().
CREATE OR REPLACE FUNCTION public.decline_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_r public.service_requests%ROWTYPE; v_role text; v_verified boolean;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'provider' THEN RAISE EXCEPTION 'only providers may decline'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.provider_profiles WHERE profile_id = auth.uid() AND verification_status = 'verified') INTO v_verified;
  IF NOT v_verified THEN RAISE EXCEPTION 'only verified providers may decline'; END IF;
  SELECT * INTO v_r FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_r.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'request not available for decline'; END IF;
  IF auth.uid() = ANY (v_r.declined_by) THEN RAISE EXCEPTION 'request not available for decline'; END IF;
  IF v_r.direct_provider_id IS NOT NULL AND v_r.direct_provider_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'request not available for decline'; END IF;
  PERFORM set_config('app.internal_op', 'decline:' || p_request_id::text, true);
  UPDATE public.service_requests SET declined_by = declined_by || auth.uid()
  WHERE id = p_request_id;
END $$;
REVOKE ALL ON FUNCTION public.decline_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_request(uuid) TO authenticated;

-- accept_quote: ONLY request owner accepts own pending quote. Row locks prevent double-booking race.
-- Price/fee from locked DB rows; client price ignored. Booking has UNIQUE(request_id).
CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_q public.quotes%ROWTYPE; v_r public.service_requests%ROWTYPE; v_b uuid; v_fee int;
BEGIN
  -- Consistent lock order: request (parent) BEFORE quote (child) to avoid deadlocks.
  -- Lock request via quote's request_id without reading quote state first.
  SELECT * INTO v_r FROM public.service_requests WHERE id = (SELECT request_id FROM public.quotes WHERE id = p_quote_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  SELECT * INTO v_q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote not found'; END IF;
  -- Revalidate AFTER locks: owner, pending, open. Blocks concurrent accepts (second waiter sees accepted/declined).
  IF v_r.customer_id <> auth.uid() THEN RAISE EXCEPTION 'only request owner may accept'; END IF;
  IF v_q.status <> 'pending' THEN RAISE EXCEPTION 'quote not pending'; END IF;
  IF v_r.status NOT IN ('open','quoted') THEN RAISE EXCEPTION 'request not open'; END IF;
  v_fee := GREATEST(0, (v_q.price_kobo / 20)::int);
  PERFORM set_config('app.internal_op', 'accept:' || v_r.id::text, true); -- allow guarded status transition below
  UPDATE public.quotes SET status='accepted' WHERE id=v_q.id;
  UPDATE public.quotes SET status='declined' WHERE request_id=v_r.id AND id<>v_q.id AND status='pending';
  INSERT INTO public.bookings (request_id, quote_id, customer_id, provider_id, price_kobo, service_fee_kobo)
  VALUES (v_r.id, v_q.id, v_r.customer_id, v_q.provider_id, v_q.price_kobo, v_fee)
  RETURNING id INTO v_b;
  UPDATE public.service_requests SET status='accepted' WHERE id=v_r.id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_q.provider_id, 'booking', 'Quote accepted', 'Customer accepted your quote.', '/provider-dashboard.html');
  RETURN v_b;
END $$;
REVOKE ALL ON FUNCTION public.accept_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote(uuid) TO authenticated;

-- submit_review: one review per completed booking by booking customer only.
CREATE OR REPLACE FUNCTION public.submit_review(p_booking uuid, p_rating int, p_comment text, p_recommend boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_r uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'only booking customer may review'; END IF;
  IF v_b.status <> 'completed' THEN RAISE EXCEPTION 'booking not completed'; END IF;
  IF v_b.reviewed THEN RAISE EXCEPTION 'already reviewed'; END IF;
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid rating'; END IF;
  INSERT INTO public.reviews (booking_id, reviewer_id, provider_id, rating, comment, recommend)
  VALUES (v_b.id, auth.uid(), v_b.provider_id, p_rating, NULLIF(TRIM(COALESCE(p_comment,'')),''), p_recommend)
  RETURNING id INTO v_r;
  UPDATE public.bookings SET reviewed = true WHERE id = v_b.id;
  RETURN v_r;
END $$;
REVOKE ALL ON FUNCTION public.submit_review(uuid,int,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid,int,text,boolean) TO authenticated;

-- set_verification: admin-only. No client direct writes to verification_status.
CREATE OR REPLACE FUNCTION public.set_verification(p_provider uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_status NOT IN ('verified','rejected','pending') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE public.provider_profiles SET verification_status = p_status WHERE profile_id = p_provider;
  IF NOT FOUND THEN RAISE EXCEPTION 'provider not found'; END IF;
  -- Role promotion happens ONLY here (admin path): verified->provider, rejected/pending->customer.
  PERFORM set_config('app.internal_role', '1', true);
  UPDATE public.profiles SET role = CASE WHEN p_status = 'verified' THEN 'provider' ELSE 'customer' END
  WHERE id = p_provider AND role <> 'admin';
  UPDATE public.provider_verifications SET status = CASE WHEN p_status='verified' THEN 'approved' WHEN p_status='rejected' THEN 'rejected' ELSE 'pending' END, reviewer_note = p_note WHERE provider_id = p_provider AND status = 'pending';
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_provider, 'verification', 'Verification ' || p_status, 'Your verification is ' || p_status || '.', '/provider-dashboard.html');
END $$;
REVOKE ALL ON FUNCTION public.set_verification(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_verification(uuid,text,text) TO authenticated;

-- set_category: admin-only category create/update. No direct client writes (no INSERT/UPDATE policy).
-- Validates slug shape, name length, and explicit active flag to prevent mass-assignment.
CREATE OR REPLACE FUNCTION public.set_category(p_id uuid DEFAULT NULL, p_slug text DEFAULT NULL, p_name text DEFAULT NULL, p_active boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9-]{2,60}$' THEN RAISE EXCEPTION 'invalid slug'; END IF;
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'invalid name'; END IF;
  IF p_active IS NULL THEN RAISE EXCEPTION 'active required'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.service_categories (slug, name, active) VALUES (p_slug, p_name, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.service_categories SET slug = p_slug, name = p_name, active = p_active WHERE id = p_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'category not found'; END IF;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.set_category(uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_category(uuid,text,text,boolean) TO authenticated;

-- request_provider_role: safe self-serve application. Creates pending profile row; NEVER sets role.
-- Role flips to provider ONLY inside set_verification() when an admin approves. No client path to role.
CREATE OR REPLACE FUNCTION public.request_provider_role(p_business text, p_category text, p_bio text DEFAULT NULL, p_area text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF p_business IS NULL OR char_length(TRIM(p_business)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'invalid business_name'; END IF;
  IF p_category IS NULL OR char_length(TRIM(p_category)) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'invalid category'; END IF;
  INSERT INTO public.provider_profiles (profile_id, business_name, category, bio, service_area, verification_status)
  VALUES (auth.uid(), TRIM(p_business), TRIM(p_category), NULLIF(TRIM(COALESCE(p_bio,'')),''), NULLIF(TRIM(COALESCE(p_area,'')),''), 'pending')
  ON CONFLICT (profile_id) DO UPDATE SET business_name = EXCLUDED.business_name, category = EXCLUDED.category, bio = EXCLUDED.bio, service_area = EXCLUDED.service_area
  WHERE public.provider_profiles.verification_status <> 'verified';
  IF NOT FOUND THEN RAISE EXCEPTION 'already verified; contact support to edit'; END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (auth.uid(), 'verification', 'Application received', 'Your provider application is pending review.', '/provider-verification.html');
END $$;
REVOKE ALL ON FUNCTION public.request_provider_role(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_provider_role(text,text,text,text) TO authenticated;

-- bootstrap_first_admin(p_email): ONE-TIME manual bootstrap. Runs in Supabase SQL editor as superuser,
-- NOT callable by anon/authenticated (no grants). Fails if any admin already exists.
-- Steps: 1) create user in Auth dashboard, 2) run SELECT public.bootstrap_first_admin('you@domain');
-- 3) verify exactly one admin, 4) never expose this to clients.
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth AS $$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'admin already exists; use set_verification/admin dashboard for further grants';
  END IF;
  SELECT u.id INTO v_id FROM auth.users u WHERE lower(u.email) = lower(TRIM(p_email));
  IF NOT FOUND THEN RAISE EXCEPTION 'auth user not found; create it in Auth dashboard first'; END IF;
  PERFORM set_config('app.internal_role', '1', true);
  INSERT INTO public.profiles (id, role, email) VALUES (v_id, 'admin', (SELECT email FROM auth.users WHERE id = v_id))
  ON CONFLICT (id) DO UPDATE SET role = 'admin';
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(text) FROM PUBLIC, anon, authenticated;
