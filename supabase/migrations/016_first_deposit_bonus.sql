-- =============================================================================
-- LifeLink 016 — First top-up bonus: a user's FIRST successful Paystack deposit is doubled.
--   e.g. deposit ₦500 -> ₦500 deposit + ₦500 bonus = ₦1,000 in the wallet. Customers AND providers.
--   * Bonus is platform credit like everything else in the wallet (non-withdrawable).
--   * Credited in the same transaction as the deposit, once per user, idempotent via ledger ref 'bonus:<reference>'.
--   * Apply AFTER 005 (Supabase dashboard -> SQL editor -> paste -> Run). Safe to run once.
-- =============================================================================

-- 1. Allow a 'bonus' ledger entry
ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_kind_check;
ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_kind_check
  CHECK (kind IN ('deposit','hold','release','fee_charge','adjustment','bonus'));

-- 2. Bonus rule in one place (change here to alter the promo; return 0 to switch it off)
CREATE OR REPLACE FUNCTION public.first_deposit_bonus_kobo(p_deposit_kobo bigint) RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$ SELECT p_deposit_kobo $$;   -- 100% bonus = doubles the first top-up

-- 3. Credit the deposit, then the bonus if it is this user's first credited deposit
CREATE OR REPLACE FUNCTION public.wallet_credit_deposit(p_reference text, p_paid_kobo bigint, p_gateway_response text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_d public.wallet_deposits%ROWTYPE; v_moved boolean; v_bonus bigint := 0; v_role text;
BEGIN
  SELECT * INTO v_d FROM public.wallet_deposits WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown deposit reference'; END IF;
  IF v_d.credited_at IS NOT NULL THEN RETURN 'already_credited'; END IF;
  IF p_paid_kobo IS NULL OR p_paid_kobo <> v_d.amount_kobo THEN
    UPDATE public.wallet_deposits SET status = 'failed', gateway_response = 'amount mismatch: expected ' || v_d.amount_kobo || ' got ' || COALESCE(p_paid_kobo::text,'null')
     WHERE id = v_d.id;
    RETURN 'amount_mismatch';
  END IF;
  v_moved := public._wallet_move(v_d.user_id, 'deposit', v_d.amount_kobo, 0, 'deposit:' || p_reference, NULL, 'Paystack deposit');

  -- First-top-up bonus. The wallet row is locked by _wallet_move above, so two simultaneous
  -- first deposits cannot both qualify: the second one sees the first as already credited.
  IF v_moved AND NOT EXISTS (
       SELECT 1 FROM public.wallet_deposits
        WHERE user_id = v_d.user_id AND credited_at IS NOT NULL AND id <> v_d.id) THEN
    v_bonus := public.first_deposit_bonus_kobo(v_d.amount_kobo);
    IF v_bonus > 0 THEN
      PERFORM public._wallet_move(v_d.user_id, 'bonus', v_bonus, 0, 'bonus:' || p_reference, NULL, 'First top-up bonus');
    END IF;
  END IF;

  UPDATE public.wallet_deposits SET status = 'success', credited_at = now(), gateway_response = COALESCE(p_gateway_response, gateway_response) WHERE id = v_d.id;
  IF v_moved THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_d.user_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_d.user_id, 'payment',
            CASE WHEN v_bonus > 0 THEN 'Wallet funded + bonus!' ELSE 'Wallet funded' END,
            CASE WHEN v_bonus > 0
                 THEN '₦' || (v_d.amount_kobo / 100) || ' was added to your LifeLink wallet, plus a ₦' || (v_bonus / 100) || ' first top-up bonus.'
                 ELSE '₦' || (v_d.amount_kobo / 100) || ' was added to your LifeLink wallet.' END,
            CASE WHEN v_role = 'provider' THEN 'provider-dashboard.html?section=wallet' ELSE 'dashboard.html?section=wallet' END);
  END IF;
  RETURN CASE WHEN v_moved THEN 'credited' ELSE 'already_credited' END;
END $$;
REVOKE ALL ON FUNCTION public.wallet_credit_deposit(text,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit_deposit(text,bigint,text) TO service_role;

-- 4. my_wallet() also tells the app whether the bonus is still available to this user
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
    'min_deposit_kobo', public.min_deposit_kobo(),
    'first_deposit_bonus', public.first_deposit_bonus_kobo(100) > 0
      AND NOT EXISTS (SELECT 1 FROM public.wallet_deposits WHERE user_id = auth.uid() AND credited_at IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION public.my_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_wallet() TO authenticated;
