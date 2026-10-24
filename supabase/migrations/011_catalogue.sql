-- =============================================================================
-- LifeLink 011 — Provider type (A / B), Catalogue, store link, product chats (₦50 each side).
-- Apply AFTER 001-010. Safe to run more than once.
--
--   provider_type : NULL = not chosen yet (the app asks on next login)
--                   'service_only'     (A) work photos + optional description, NEVER a price
--                   'service_business' (B) work photos AND/OR products with description + price
--   store_url     : optional link to the provider's own online store (B only)
--   provider_catalog : max 10 items per provider, one photo each.
--       kind 'work'    -> no price
--       kind 'product' -> price in kobo, only for type B
--   public_catalog : what customers see. If a B provider switches back to A, their products and
--       prices stay stored but are hidden here (switching back to B restores them).
--   Product chat   : opening a chat about a product costs ₦50 from EACH side, once per chat.
--       If the seller never replies within 24h the customer's ₦50 is returned (refund_unanswered_chats).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Provider profile columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS provider_type text,
  ADD COLUMN IF NOT EXISTS store_url text;

DO $$ BEGIN
  ALTER TABLE public.provider_profiles ADD CONSTRAINT provider_type_valid
    CHECK (provider_type IS NULL OR provider_type IN ('service_only','service_business'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.provider_profiles ADD CONSTRAINT store_url_valid
    CHECK (store_url IS NULL OR (char_length(store_url) <= 300 AND store_url ~* '^https?://[^\s]+$'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT UPDATE (provider_type, store_url) ON public.provider_profiles TO authenticated;

-- The store link only makes sense for type B: clear it when a provider is (or goes back to) type A.
CREATE OR REPLACE FUNCTION public._provider_type_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider_type IS DISTINCT FROM 'service_business' THEN NEW.store_url := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_provider_type_guard ON public.provider_profiles;
CREATE TRIGGER trg_provider_type_guard BEFORE INSERT OR UPDATE ON public.provider_profiles
  FOR EACH ROW EXECUTE FUNCTION public._provider_type_guard();

-- ---------------------------------------------------------------------------
-- 2. Catalogue table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'work' CHECK (kind IN ('work','product')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  price_kobo bigint CHECK (price_kobo IS NULL OR (price_kobo >= 0 AND price_kobo <= 100000000000)),
  image_url text NOT NULL CHECK (char_length(image_url) <= 500),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_price_rule CHECK ((kind = 'work' AND price_kobo IS NULL) OR (kind = 'product' AND price_kobo IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS provider_catalog_idx ON public.provider_catalog (provider_id, created_at DESC);

-- Max 10 items per provider; products only for type B.
CREATE OR REPLACE FUNCTION public._catalog_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.provider_catalog WHERE provider_id = NEW.provider_id) >= 10 THEN
      RAISE EXCEPTION 'You can add up to 10 photos to your catalogue.';
    END IF;
  END IF;
  IF NEW.kind = 'product' THEN
    SELECT provider_type INTO v_type FROM public.provider_profiles WHERE profile_id = NEW.provider_id;
    IF v_type IS DISTINCT FROM 'service_business' THEN
      RAISE EXCEPTION 'Products and prices are only available to Service Provider / Business Owner accounts.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_catalog_guard ON public.provider_catalog;
CREATE TRIGGER trg_catalog_guard BEFORE INSERT OR UPDATE ON public.provider_catalog
  FOR EACH ROW EXECUTE FUNCTION public._catalog_guard();

ALTER TABLE public.provider_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_catalog TO authenticated;
GRANT ALL ON public.provider_catalog TO service_role;
DROP POLICY IF EXISTS p_pc_owner_select ON public.provider_catalog;
DROP POLICY IF EXISTS p_pc_owner_insert ON public.provider_catalog;
DROP POLICY IF EXISTS p_pc_owner_update ON public.provider_catalog;
DROP POLICY IF EXISTS p_pc_owner_delete ON public.provider_catalog;
CREATE POLICY p_pc_owner_select ON public.provider_catalog FOR SELECT TO authenticated USING (provider_id = auth.uid());
CREATE POLICY p_pc_owner_insert ON public.provider_catalog FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid());
CREATE POLICY p_pc_owner_update ON public.provider_catalog FOR UPDATE TO authenticated USING (provider_id = auth.uid()) WITH CHECK (provider_id = auth.uid());
CREATE POLICY p_pc_owner_delete ON public.provider_catalog FOR DELETE TO authenticated USING (provider_id = auth.uid());

-- Public view: verified providers only, active items only; products + prices only while type B.
CREATE OR REPLACE VIEW public.public_catalog WITH (security_invoker = false) AS
SELECT c.id, c.provider_id, c.kind, c.title, c.description,
       CASE WHEN c.kind = 'product' THEN c.price_kobo ELSE NULL END AS price_kobo,
       c.image_url, c.created_at
FROM public.provider_catalog c
JOIN public.provider_profiles pp ON pp.profile_id = c.provider_id
WHERE c.active AND pp.verification_status = 'verified'
  AND (c.kind = 'work' OR pp.provider_type = 'service_business');
GRANT SELECT ON public.public_catalog TO anon, authenticated;

-- Public provider directory: append provider_type + store_url (new columns go last).
CREATE OR REPLACE VIEW public.public_providers WITH (security_invoker = false) AS
SELECT p.id AS provider_id, p.avatar_url,
  pp.business_name, pp.category, pp.bio, pp.service_area,
  pp.verification_status, pp.trust_score, pp.rating_avg, pp.jobs_done,
  pp.available, pp.years_experience, pp.skills,
  (SELECT count(*) FROM public.reviews r WHERE r.provider_id = pp.profile_id)::int AS review_count,
  (SELECT min(s.base_price_kobo) FROM public.provider_services s WHERE s.provider_id = pp.profile_id AND s.active) AS min_price_kobo,
  pp.provider_type, pp.store_url
FROM public.provider_profiles pp JOIN public.profiles p ON p.id = pp.profile_id
WHERE pp.verification_status = 'verified' AND p.role = 'provider';
GRANT SELECT ON public.public_providers TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Conversations about a catalogue item (no service request behind them)
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations ALTER COLUMN request_id DROP NOT NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS catalog_item_id uuid REFERENCES public.provider_catalog(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS item_title text;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS fee_refunded_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conv_has_context CHECK (request_id IS NOT NULL OR item_title IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS one_conv_per_item_customer ON public.conversations (customer_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.product_chat_fee_kobo() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 5000 $$;   -- ₦50 per side
GRANT EXECUTE ON FUNCTION public.product_chat_fee_kobo() TO anon, authenticated, service_role;

-- send_message: a conversation without a request has no request status to check.
CREATE OR REPLACE FUNCTION public.send_message(p_conversation uuid, p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_c public.conversations%ROWTYPE; v_id uuid; v_to uuid; v_status text; v_body text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT * INTO v_c FROM public.conversations WHERE id = p_conversation;
  IF NOT FOUND OR v_uid NOT IN (v_c.customer_id, v_c.provider_id) THEN RAISE EXCEPTION 'conversation not found'; END IF;
  IF v_c.request_id IS NOT NULL THEN
    SELECT status INTO v_status FROM public.service_requests WHERE id = v_c.request_id;
    IF v_status = 'cancelled' THEN RAISE EXCEPTION 'this request was cancelled'; END IF;
  END IF;
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

-- Open (or reopen) a chat about a product. First open: ₦50 from the customer AND ₦50 from the seller,
-- charged together or not at all. Reopening the same chat is free.
CREATE OR REPLACE FUNCTION public.open_product_chat(p_item uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_i public.provider_catalog%ROWTYPE; v_conv uuid; v_fee int := public.product_chat_fee_kobo();
        v_c_av bigint; v_p_av bigint; v_type text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  SELECT * INTO v_i FROM public.provider_catalog WHERE id = p_item AND active;
  IF NOT FOUND OR v_i.kind <> 'product' THEN RAISE EXCEPTION 'this product is no longer available'; END IF;
  IF v_i.provider_id = v_uid THEN RAISE EXCEPTION 'you cannot chat about your own product'; END IF;
  IF NOT public.is_verified_provider(v_i.provider_id) THEN RAISE EXCEPTION 'this seller is not available'; END IF;
  SELECT provider_type INTO v_type FROM public.provider_profiles WHERE profile_id = v_i.provider_id;
  IF v_type IS DISTINCT FROM 'service_business' THEN RAISE EXCEPTION 'this product is no longer available'; END IF;

  SELECT id INTO v_conv FROM public.conversations WHERE customer_id = v_uid AND catalog_item_id = p_item;
  IF FOUND THEN RETURN v_conv; END IF;

  INSERT INTO public.wallet_accounts (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.wallet_accounts (user_id) VALUES (v_i.provider_id) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.wallet_accounts WHERE user_id IN (v_uid, v_i.provider_id) ORDER BY user_id FOR UPDATE;
  SELECT available_kobo INTO v_c_av FROM public.wallet_accounts WHERE user_id = v_uid;
  SELECT available_kobo INTO v_p_av FROM public.wallet_accounts WHERE user_id = v_i.provider_id;
  IF v_c_av < v_fee THEN RAISE EXCEPTION 'WALLET_CUSTOMER: your wallet needs at least ₦% to start this chat. Add funds first.', v_fee / 100; END IF;
  IF v_p_av < v_fee THEN RAISE EXCEPTION 'WALLET_PROVIDER: this seller cannot take new chats right now. Please try again later.'; END IF;

  INSERT INTO public.conversations (customer_id, provider_id, catalog_item_id, item_title)
  VALUES (v_uid, v_i.provider_id, v_i.id, v_i.title) RETURNING id INTO v_conv;

  PERFORM public._wallet_move(v_uid, 'fee_charge', -v_fee, 0, 'prodchat:' || v_conv::text || ':customer', NULL, 'Product chat fee');
  PERFORM public._wallet_move(v_i.provider_id, 'fee_charge', -v_fee, 0, 'prodchat:' || v_conv::text || ':provider', NULL, 'Product chat fee');

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_i.provider_id, 'message', 'Someone is interested in your product',
          'A customer wants to chat about "' || v_i.title || '". ₦' || (v_fee/100) || ' was taken from your wallet. Reply within 24 hours so they are not refunded.',
          'provider-dashboard.html?section=messages&c=' || v_conv::text);
  RETURN v_conv;
END $$;
REVOKE ALL ON FUNCTION public.open_product_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_product_chat(uuid) TO authenticated;

-- Return the customer's ₦50 when the seller has not replied within 24 hours. Idempotent (ledger ref + refunded flag).
-- Callable by the app for the signed-in customer; can also be scheduled (pg_cron) with p_customer = NULL.
CREATE OR REPLACE FUNCTION public.refund_unanswered_chats(p_customer uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r record; n int := 0; v_fee int := public.product_chat_fee_kobo();
BEGIN
  IF v_uid IS NOT NULL THEN p_customer := v_uid; END IF;   -- signed-in callers can only sweep their own chats
  FOR r IN
    SELECT c.id, c.customer_id, c.item_title FROM public.conversations c
    WHERE c.catalog_item_id IS NOT NULL AND c.fee_refunded_at IS NULL
      AND c.created_at < now() - interval '24 hours'
      AND (p_customer IS NULL OR c.customer_id = p_customer)
      AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.conversation_id = c.id AND m.sender_id = c.provider_id)
    FOR UPDATE OF c SKIP LOCKED
  LOOP
    IF public._wallet_move(r.customer_id, 'adjustment', v_fee, 0, 'prodchat-refund:' || r.id::text, NULL, 'Product chat fee returned (no reply in 24h)') THEN
      n := n + 1;
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (r.customer_id, 'payment', 'Chat fee returned', '₦' || (v_fee/100) || ' was returned to your wallet because the seller did not reply to your chat about "' || COALESCE(r.item_title, 'a product') || '".', 'dashboard.html?section=wallet');
    END IF;
    UPDATE public.conversations SET fee_refunded_at = now() WHERE id = r.id;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.refund_unanswered_chats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_unanswered_chats(uuid) TO authenticated, service_role;
