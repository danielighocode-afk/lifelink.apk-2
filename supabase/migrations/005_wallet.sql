-- =============================================================================
-- LifeLink 005 — Wallet (platform-fee ledger), Paystack deposits, fee holds,
-- revised booking lifecycle.   Apply AFTER 001-004.
--
-- WHAT THIS IS
--   * A LifeLink wallet = prepaid PLATFORM CREDIT used only to pay LifeLink's flat
--     fee (₦100 per side per booking). It is NOT escrow: the price of the job is
--     paid directly between customer and provider, in or outside the app.
--   * Balance is non-withdrawable platform credit.
--   * All money is integer kobo (₦1 = 100 kobo).
--   * wallet_ledger is APPEND-ONLY. Balances live in wallet_accounts and only change
--     through the SECURITY DEFINER functions below (clients have SELECT only).
--   * Deposits are credited ONLY by the Paystack Edge Functions (service_role) after the
--     transaction is verified server-side; crediting is idempotent per Paystack reference.
--   * Insufficient balance never creates a fake deduction: a hold/charge either moves the
--     full amount atomically or raises an error and changes nothing.
--
-- FEE LIFECYCLE
--   quote accepted  -> ₦100 HELD from customer wallet and ₦100 HELD from provider wallet
--                      (both must have it, otherwise accept_quote fails and nothing moves)
--   cancelled early -> both holds RELEASED
--   verified arrival-> both holds CHARGED (Stage 1: provider says "arrived", customer confirms;
--                      GPS replaces the customer tap in the maps stage)
--
-- BOOKING STATES (replaces pending_payment / paid / refunded):
--   confirmed -> provider_on_the_way -> arrived -> in_progress -> completed
--   plus cancelled and disputed (prev_status remembers where a dispute interrupted).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Constants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_fee_kobo() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 10000 $$;      -- ₦100 per side
CREATE OR REPLACE FUNCTION public.min_deposit_kobo()  RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 50000 $$;      -- ₦500
CREATE OR REPLACE FUNCTION public.max_deposit_kobo()  RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 50000000 $$;   -- ₦500,000 sanity cap
GRANT EXECUTE ON FUNCTION public.platform_fee_kobo(), public.min_deposit_kobo(), public.max_deposit_kobo() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  available_kobo bigint NOT NULL DEFAULT 0 CHECK (available_kobo >= 0),
  held_kobo bigint NOT NULL DEFAULT 0 CHECK (held_kobo >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('deposit','hold','release','fee_charge','adjustment')),
  available_delta bigint NOT NULL,
  held_delta bigint NOT NULL,
  available_after bigint NOT NULL CHECK (available_after >= 0),
  held_after bigint NOT NULL CHECK (held_after >= 0),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  ref text NOT NULL UNIQUE CHECK (char_length(ref) <= 160),        -- idempotency key
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_idx ON public.wallet_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_ledger_booking_idx ON public.wallet_ledger (booking_id);

CREATE OR REPLACE FUNCTION public.wallet_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'wallet_ledger is append-only'; END $$;
DROP TRIGGER IF EXISTS trg_wallet_ledger_no_update ON public.wallet_ledger;
CREATE TRIGGER trg_wallet_ledger_no_update BEFORE UPDATE OR DELETE ON public.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.wallet_ledger_append_only();
DROP TRIGGER IF EXISTS trg_wallet_ledger_no_truncate ON public.wallet_ledger;
CREATE TRIGGER trg_wallet_ledger_no_truncate BEFORE TRUNCATE ON public.wallet_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.wallet_ledger_append_only();

-- Paystack deposit attempts. Created server-side when a deposit is initialised.
CREATE TABLE IF NOT EXISTS public.wallet_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE CHECK (char_length(reference) BETWEEN 8 AND 100),
  amount_kobo int NOT NULL CHECK (amount_kobo >= 50000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','abandoned')),
  gateway_response text,
  credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credited_only_on_success CHECK (credited_at IS NULL OR status = 'success')
);
CREATE INDEX IF NOT EXISTS wallet_deposits_user_idx ON public.wallet_deposits (user_id, created_at DESC);

ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_accounts, public.wallet_ledger, public.wallet_deposits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wallet_accounts, public.wallet_ledger, public.wallet_deposits TO authenticated;
GRANT ALL ON public.wallet_accounts, public.wallet_ledger, public.wallet_deposits TO service_role;

DROP POLICY IF EXISTS p_wa_owner_select ON public.wallet_accounts;
DROP POLICY IF EXISTS p_wa_admin_select ON public.wallet_accounts;
DROP POLICY IF EXISTS p_wl_owner_select ON public.wallet_ledger;
DROP POLICY IF EXISTS p_wl_admin_select ON public.wallet_ledger;
DROP POLICY IF EXISTS p_wd_owner_select ON public.wallet_deposits;
DROP POLICY IF EXISTS p_wd_admin_select ON public.wallet_deposits;
CREATE POLICY p_wa_owner_select ON public.wallet_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY p_wa_admin_select ON public.wallet_accounts FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY p_wl_owner_select ON public.wallet_ledger   FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY p_wl_admin_select ON public.wallet_ledger   FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY p_wd_owner_select ON public.wallet_deposits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY p_wd_admin_select ON public.wallet_deposits FOR SELECT TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Booking columns + new lifecycle states
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_fee_status_check;

-- Existing test rows from the old model move to the closest new state (they never held a fee).
UPDATE public.bookings SET status = 'confirmed'  WHERE status IN ('pending_payment','paid');
UPDATE public.bookings SET status = 'cancelled'  WHERE status = 'refunded';
UPDATE public.bookings SET prev_status = 'confirmed' WHERE prev_status IN ('pending_payment','paid');
UPDATE public.bookings SET prev_status = 'cancelled' WHERE prev_status = 'refunded';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS fee_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS provider_arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_confirmed_arrival_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_charged_at timestamptz;

ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'confirmed';
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check CHECK (status IN
  ('confirmed','provider_on_the_way','arrived','in_progress','completed','cancelled','disputed'));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_fee_status_check CHECK (fee_status IN ('none','held','charged','released'));
-- service_fee_kobo = TOTAL LifeLink fee for the booking (customer side + provider side).
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_service_fee_kobo_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_service_fee_kobo_check CHECK (service_fee_kobo >= 0);

-- ---------------------------------------------------------------------------
-- 4. Internal wallet movement (not callable by clients)
-- ---------------------------------------------------------------------------
-- Moves money atomically and appends exactly one ledger row. Idempotent per p_ref:
-- a repeat call with the same ref changes nothing and returns false.
CREATE OR REPLACE FUNCTION public._wallet_move(
  p_user uuid, p_kind text, p_avail_delta bigint, p_held_delta bigint,
  p_ref text, p_booking uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a public.wallet_accounts%ROWTYPE; v_na bigint; v_nh bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM public.wallet_ledger WHERE ref = p_ref) THEN RETURN false; END IF;
  INSERT INTO public.wallet_accounts (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_a FROM public.wallet_accounts WHERE user_id = p_user FOR UPDATE;
  -- re-check after taking the row lock (a concurrent call with the same ref may have just finished)
  IF EXISTS (SELECT 1 FROM public.wallet_ledger WHERE ref = p_ref) THEN RETURN false; END IF;
  v_na := v_a.available_kobo + p_avail_delta;
  v_nh := v_a.held_kobo + p_held_delta;
  IF v_na < 0 OR v_nh < 0 THEN RAISE EXCEPTION 'insufficient wallet balance'; END IF;
  UPDATE public.wallet_accounts SET available_kobo = v_na, held_kobo = v_nh, updated_at = now() WHERE user_id = p_user;
  INSERT INTO public.wallet_ledger (user_id, kind, available_delta, held_delta, available_after, held_after, booking_id, ref, note)
  VALUES (p_user, p_kind, p_avail_delta, p_held_delta, v_na, v_nh, p_booking, p_ref, p_note);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public._wallet_move(uuid,text,bigint,bigint,text,uuid,text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Deposits (called ONLY by Edge Functions with the service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_start_deposit(p_user uuid, p_reference text, p_amount_kobo int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user;
  IF v_role IS NULL THEN RAISE EXCEPTION 'unknown user'; END IF;
  IF v_role = 'admin' THEN RAISE EXCEPTION 'admin accounts do not use wallets'; END IF;
  IF p_amount_kobo IS NULL OR p_amount_kobo < public.min_deposit_kobo() THEN
    RAISE EXCEPTION 'minimum deposit is ₦%', public.min_deposit_kobo() / 100;
  END IF;
  IF p_amount_kobo > public.max_deposit_kobo() THEN RAISE EXCEPTION 'maximum deposit is ₦%', public.max_deposit_kobo() / 100; END IF;
  INSERT INTO public.wallet_deposits (user_id, reference, amount_kobo) VALUES (p_user, p_reference, p_amount_kobo) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.wallet_start_deposit(uuid,text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_start_deposit(uuid,text,int) TO service_role;

-- Credits a deposit AFTER the Edge Function verified it with Paystack (status success, same
-- currency NGN, amount equal to what we expected). Safe to call many times (webhook + verify).
-- Returns 'credited', 'already_credited' or 'amount_mismatch' (nothing credited); raises on unknown reference.
CREATE OR REPLACE FUNCTION public.wallet_credit_deposit(p_reference text, p_paid_kobo bigint, p_gateway_response text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.wallet_deposits%ROWTYPE; v_moved boolean;
BEGIN
  SELECT * INTO v_d FROM public.wallet_deposits WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown deposit reference'; END IF;
  IF v_d.credited_at IS NOT NULL THEN RETURN 'already_credited'; END IF;
  IF p_paid_kobo IS NULL OR p_paid_kobo <> v_d.amount_kobo THEN
    -- Returned (not raised) so the 'failed' marker is kept; nothing is credited.
    UPDATE public.wallet_deposits SET status = 'failed', gateway_response = 'amount mismatch: expected ' || v_d.amount_kobo || ' got ' || COALESCE(p_paid_kobo::text,'null')
     WHERE id = v_d.id;
    RETURN 'amount_mismatch';
  END IF;
  v_moved := public._wallet_move(v_d.user_id, 'deposit', v_d.amount_kobo, 0, 'deposit:' || p_reference, NULL, 'Paystack deposit');
  UPDATE public.wallet_deposits SET status = 'success', credited_at = now(), gateway_response = COALESCE(p_gateway_response, gateway_response) WHERE id = v_d.id;
  IF v_moved THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_d.user_id, 'payment', 'Wallet funded', '₦' || (v_d.amount_kobo / 100) || ' was added to your LifeLink wallet.',
            CASE WHEN (SELECT role FROM public.profiles WHERE id = v_d.user_id) = 'provider' THEN 'provider-dashboard.html?section=wallet' ELSE 'dashboard.html?section=wallet' END);
  END IF;
  RETURN CASE WHEN v_moved THEN 'credited' ELSE 'already_credited' END;
END $$;
REVOKE ALL ON FUNCTION public.wallet_credit_deposit(text,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit_deposit(text,bigint,text) TO service_role;

-- Records a failed / abandoned attempt (no money moves). Never downgrades a credited deposit.
CREATE OR REPLACE FUNCTION public.wallet_fail_deposit(p_reference text, p_status text, p_gateway_response text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('failed','abandoned') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE public.wallet_deposits SET status = p_status, gateway_response = COALESCE(p_gateway_response, gateway_response)
   WHERE reference = p_reference AND credited_at IS NULL AND status IN ('pending','failed','abandoned');
END $$;
REVOKE ALL ON FUNCTION public.wallet_fail_deposit(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_fail_deposit(text,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Reading my wallet (single call for the UI)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_wallet()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a public.wallet_accounts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT * INTO v_a FROM public.wallet_accounts WHERE user_id = auth.uid();
  RETURN jsonb_build_object(
    'available_kobo', COALESCE(v_a.available_kobo, 0),
    'held_kobo', COALESCE(v_a.held_kobo, 0),
    'fee_kobo', public.platform_fee_kobo(),
    'min_deposit_kobo', public.min_deposit_kobo());
END $$;
REVOKE ALL ON FUNCTION public.my_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_wallet() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. accept_quote — flat ₦100 per side, held from BOTH wallets (all or nothing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q public.quotes%ROWTYPE; v_r public.service_requests%ROWTYPE; v_b uuid; v_fee int := public.platform_fee_kobo();
        v_c_av bigint; v_p_av bigint;
BEGIN
  SELECT * INTO v_r FROM public.service_requests WHERE id = (SELECT request_id FROM public.quotes WHERE id = p_quote_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  SELECT * INTO v_q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote not found'; END IF;
  IF v_r.customer_id <> auth.uid() THEN RAISE EXCEPTION 'only request owner may accept'; END IF;
  IF v_q.status <> 'pending' THEN RAISE EXCEPTION 'quote not pending'; END IF;
  IF v_r.status NOT IN ('open','quoted') THEN RAISE EXCEPTION 'request not open'; END IF;
  IF NOT public.is_verified_provider(v_q.provider_id) THEN RAISE EXCEPTION 'provider is no longer verified'; END IF;

  -- Wallet checks first, so nothing changes when a side cannot cover the fee.
  INSERT INTO public.wallet_accounts (user_id) VALUES (v_r.customer_id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.wallet_accounts (user_id) VALUES (v_q.provider_id) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.wallet_accounts WHERE user_id IN (v_r.customer_id, v_q.provider_id) ORDER BY user_id FOR UPDATE;
  SELECT available_kobo INTO v_c_av FROM public.wallet_accounts WHERE user_id = v_r.customer_id;
  SELECT available_kobo INTO v_p_av FROM public.wallet_accounts WHERE user_id = v_q.provider_id;
  IF v_c_av < v_fee THEN RAISE EXCEPTION 'WALLET_CUSTOMER: your wallet needs at least ₦% to confirm a booking. Add funds first.', v_fee / 100; END IF;
  IF v_p_av < v_fee THEN RAISE EXCEPTION 'WALLET_PROVIDER: this provider cannot accept bookings right now. Try another quote.'; END IF;

  PERFORM set_config('app.internal_op', 'accept:' || v_r.id::text, true);
  UPDATE public.quotes SET status = 'accepted' WHERE id = v_q.id;
  UPDATE public.quotes SET status = 'declined' WHERE request_id = v_r.id AND id <> v_q.id AND status = 'pending';
  INSERT INTO public.bookings (request_id, quote_id, customer_id, provider_id, price_kobo, service_fee_kobo, status, fee_status)
  VALUES (v_r.id, v_q.id, v_r.customer_id, v_q.provider_id, v_q.price_kobo, v_fee * 2, 'confirmed', 'held')
  RETURNING id INTO v_b;
  UPDATE public.service_requests SET status = 'accepted' WHERE id = v_r.id;
  PERFORM set_config('app.internal_op', '', true);

  PERFORM public._wallet_move(v_r.customer_id, 'hold', -v_fee, v_fee, 'hold:' || v_b::text || ':customer', v_b, 'Platform fee reserved');
  PERFORM public._wallet_move(v_q.provider_id, 'hold', -v_fee, v_fee, 'hold:' || v_b::text || ':provider', v_b, 'Platform fee reserved');

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_q.provider_id, 'booking', 'Quote accepted', 'A customer accepted your quote. ₦' || (v_fee/100) || ' is reserved from your wallet.', 'provider-dashboard.html?section=bookings');
  RETURN v_b;
END $$;
REVOKE ALL ON FUNCTION public.accept_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Booking lifecycle RPCs
-- ---------------------------------------------------------------------------
-- internal: release both holds (idempotent through ledger refs)
CREATE OR REPLACE FUNCTION public._release_fee_holds(p_booking uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_fee int := public.platform_fee_kobo();
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.fee_status <> 'held' THEN RETURN; END IF;
  PERFORM public._wallet_move(v_b.customer_id, 'release', v_fee, -v_fee, 'release:' || p_booking::text || ':customer', p_booking, 'Platform fee released');
  PERFORM public._wallet_move(v_b.provider_id, 'release', v_fee, -v_fee, 'release:' || p_booking::text || ':provider', p_booking, 'Platform fee released');
  UPDATE public.bookings SET fee_status = 'released' WHERE id = p_booking;
END $$;
REVOKE ALL ON FUNCTION public._release_fee_holds(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_booking_schedule(p_booking uuid, p_when timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_other uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() NOT IN (v_b.customer_id, v_b.provider_id) THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('confirmed','provider_on_the_way') THEN RAISE EXCEPTION 'this booking can no longer be rescheduled'; END IF;
  IF p_when IS NULL OR p_when < now() THEN RAISE EXCEPTION 'choose a date and time in the future'; END IF;
  UPDATE public.bookings SET scheduled_for = p_when WHERE id = p_booking;
  v_other := CASE WHEN auth.uid() = v_b.customer_id THEN v_b.provider_id ELSE v_b.customer_id END;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_other, 'booking', 'Schedule updated', 'The booking time was set or changed.',
          CASE WHEN v_other = v_b.provider_id THEN 'provider-dashboard.html?section=bookings' ELSE 'booking.html?id=' || p_booking::text END);
END $$;
REVOKE ALL ON FUNCTION public.set_booking_schedule(uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_booking_schedule(uuid,timestamptz) TO authenticated;

-- Either side may cancel BEFORE the fee is charged (i.e. before verified arrival). Holds are released.
-- No penalty is applied here (penalties are a later, log-only stage).
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_other uuid;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() NOT IN (v_b.customer_id, v_b.provider_id) THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('confirmed','provider_on_the_way','arrived') OR v_b.fee_status = 'charged' THEN
    RAISE EXCEPTION 'this booking can no longer be cancelled here; open a dispute instead';
  END IF;
  PERFORM public._release_fee_holds(p_booking);
  UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking;
  PERFORM set_config('app.internal_op', 'sys:' || v_b.request_id::text, true);
  UPDATE public.service_requests SET status = 'cancelled' WHERE id = v_b.request_id;
  PERFORM set_config('app.internal_op', '', true);
  v_other := CASE WHEN auth.uid() = v_b.customer_id THEN v_b.provider_id ELSE v_b.customer_id END;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_other, 'booking', 'Booking cancelled', 'A booking was cancelled. Your reserved platform fee was returned to your wallet.',
          CASE WHEN v_other = v_b.provider_id THEN 'provider-dashboard.html?section=bookings' ELSE 'booking.html?id=' || p_booking::text END);
END $$;
REVOKE ALL ON FUNCTION public.cancel_booking(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_on_the_way(p_booking uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.provider_id <> auth.uid() THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status <> 'confirmed' THEN RAISE EXCEPTION 'this booking is not waiting for you to set off'; END IF;
  UPDATE public.bookings SET status = 'provider_on_the_way' WHERE id = p_booking;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.customer_id, 'booking', 'Provider is on the way', 'Your provider has set off.', 'booking.html?id=' || p_booking::text);
END $$;
REVOKE ALL ON FUNCTION public.mark_on_the_way(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_on_the_way(uuid) TO authenticated;

-- Provider says they have arrived. (Maps stage: also requires fresh GPS within 100 m.)
CREATE OR REPLACE FUNCTION public.provider_arrived(p_booking uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.provider_id <> auth.uid() THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('confirmed','provider_on_the_way') THEN RAISE EXCEPTION 'this booking is not waiting for your arrival'; END IF;
  UPDATE public.bookings SET status = 'arrived', provider_arrived_at = now() WHERE id = p_booking;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.customer_id, 'booking', 'Your provider says they have arrived', 'Please confirm their arrival to begin the job.', 'booking.html?id=' || p_booking::text);
END $$;
REVOKE ALL ON FUNCTION public.provider_arrived(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_arrived(uuid) TO authenticated;

-- Customer confirms the provider arrived => VERIFIED ARRIVAL => both ₦100 fees are charged, once.
CREATE OR REPLACE FUNCTION public.confirm_arrival(p_booking uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_fee int := public.platform_fee_kobo();
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.customer_id <> auth.uid() THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status <> 'arrived' THEN RAISE EXCEPTION 'the provider has not reported arriving yet'; END IF;
  IF v_b.fee_status = 'charged' THEN RETURN; END IF;                       -- never charge twice
  IF v_b.fee_status <> 'held' THEN RAISE EXCEPTION 'no platform fee is reserved for this booking'; END IF;
  -- charge: held -> gone (ledger rows are idempotent on their refs)
  PERFORM public._wallet_move(v_b.customer_id, 'fee_charge', 0, -v_fee, 'fee:' || p_booking::text || ':customer', p_booking, 'LifeLink platform fee');
  PERFORM public._wallet_move(v_b.provider_id, 'fee_charge', 0, -v_fee, 'fee:' || p_booking::text || ':provider', p_booking, 'LifeLink platform fee');
  UPDATE public.bookings SET fee_status = 'charged', fee_charged_at = now(), customer_confirmed_arrival_at = now() WHERE id = p_booking;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.provider_id, 'booking', 'Arrival confirmed', 'The customer confirmed your arrival. You can start the job.', 'provider-dashboard.html?section=bookings');
END $$;
REVOKE ALL ON FUNCTION public.confirm_arrival(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_arrival(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_booking(p_booking uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR v_b.provider_id <> auth.uid() THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status <> 'arrived' OR v_b.fee_status <> 'charged' THEN
    RAISE EXCEPTION 'a job can only start after the customer has confirmed your arrival';
  END IF;
  UPDATE public.bookings SET status = 'in_progress' WHERE id = p_booking;
  PERFORM set_config('app.internal_op', 'sys:' || v_b.request_id::text, true);
  UPDATE public.service_requests SET status = 'in_progress' WHERE id = v_b.request_id;
  PERFORM set_config('app.internal_op', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_b.customer_id, 'booking', 'Job started', 'Your provider has started the job.', 'booking.html?id=' || p_booking::text);
END $$;
REVOKE ALL ON FUNCTION public.start_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_booking(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Disputes: allowed on any live or finished booking; resolution restores the prior state
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_dispute(p_booking uuid, p_category text, p_description text, p_evidence text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE; v_id uuid; v_other uuid; v_ev text[] := COALESCE(p_evidence, '{}');
BEGIN
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR auth.uid() NOT IN (v_b.customer_id, v_b.provider_id) THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status NOT IN ('confirmed','provider_on_the_way','arrived','in_progress','completed','disputed') THEN
    RAISE EXCEPTION 'a dispute can only be opened on an active or completed booking';
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
      UPDATE public.bookings SET status = COALESCE(v_b.prev_status, 'confirmed'), prev_status = NULL WHERE id = v_b.id;
    END IF;
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_d.reporter_id, 'dispute', 'Dispute ' || replace(p_status, '_', ' '), 'Your dispute is now ' || replace(p_status, '_', ' ') || '.', 'dashboard.html?section=bookings');
END $$;
REVOKE ALL ON FUNCTION public.admin_resolve_dispute(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid,text,text) TO authenticated;

-- Admin escape hatch for a booking stuck with reserved fees (e.g. abandoned during a dispute).
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(p_booking uuid, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.bookings%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_b.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'booking already closed'; END IF;
  PERFORM public._release_fee_holds(p_booking);
  UPDATE public.bookings SET status = 'cancelled', prev_status = NULL WHERE id = p_booking;
  PERFORM set_config('app.internal_op', 'sys:' || v_b.request_id::text, true);
  UPDATE public.service_requests SET status = 'cancelled' WHERE id = v_b.request_id;
  PERFORM set_config('app.internal_op', '', true);
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT u, 'booking', 'Booking cancelled by LifeLink', COALESCE(NULLIF(btrim(p_note),''), 'An administrator cancelled this booking. Any reserved platform fee was returned.'), 'dashboard.html?section=bookings'
    FROM unnest(ARRAY[v_b.customer_id, v_b.provider_id]) u;
END $$;
REVOKE ALL ON FUNCTION public.admin_cancel_booking(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(uuid,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Account deletion must not orphan money
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  IF public.is_admin() THEN RAISE EXCEPTION 'admin accounts cannot be deleted here'; END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE customer_id = auth.uid() OR provider_id = auth.uid()) THEN
    RAISE EXCEPTION 'accounts with bookings cannot be deleted automatically; contact support';
  END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_ledger WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'accounts with wallet activity cannot be deleted automatically; contact support';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Admin overview adds wallet totals
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN
  ('quote','booking','payment','dispute','verification','review','system','message','report'));

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
    'completed_value_kobo', (SELECT COALESCE(sum(price_kobo), 0) FROM public.bookings WHERE status = 'completed'),
    'wallet_available_kobo', (SELECT COALESCE(sum(available_kobo), 0) FROM public.wallet_accounts),
    'wallet_held_kobo', (SELECT COALESCE(sum(held_kobo), 0) FROM public.wallet_accounts),
    'fees_collected_kobo', (SELECT COALESCE(-sum(held_delta), 0) FROM public.wallet_ledger WHERE kind = 'fee_charge')
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
