-- =============================================================================
-- LifeLink 017 — Admin insights: top-ups & bonuses, wallets, activity feed, booking timeline.
--   Apply AFTER 005 (and 016 if you use the first top-up bonus). Safe to re-run.
--   Every function is SECURITY DEFINER, READ-ONLY, and refuses anyone who is not an admin.
-- =============================================================================

-- Display-name helper (internal only; not callable from the browser)
CREATE OR REPLACE FUNCTION public._admin_name(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), p.email::text, 'User') FROM public.profiles p WHERE p.id = p_user
$$;
REVOKE ALL ON FUNCTION public._admin_name(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Top-ups & bonuses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_topups(p_limit int DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.credited_at DESC), '[]'::jsonb) INTO v_rows FROM (
    SELECT d.id, d.reference, d.user_id,
           COALESCE(NULLIF(btrim(p.full_name), ''), p.email::text, 'User') AS name,
           p.email::text AS email, p.phone, p.role,
           d.amount_kobo, COALESCE(b.available_delta, 0) AS bonus_kobo, d.credited_at,
           (d.id = (SELECT d2.id FROM public.wallet_deposits d2
                     WHERE d2.user_id = d.user_id AND d2.credited_at IS NOT NULL
                     ORDER BY d2.credited_at, d2.id LIMIT 1)) AS is_first
      FROM public.wallet_deposits d
      JOIN public.profiles p ON p.id = d.user_id
      LEFT JOIN public.wallet_ledger b ON b.ref = 'bonus:' || d.reference AND b.kind = 'bonus'
     WHERE d.credited_at IS NOT NULL
     ORDER BY d.credited_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000))
  ) r;
  RETURN jsonb_build_object(
    'summary', jsonb_build_object(
      'users_topped_up',     (SELECT count(DISTINCT user_id) FROM public.wallet_deposits WHERE credited_at IS NOT NULL),
      'topups',              (SELECT count(*) FROM public.wallet_deposits WHERE credited_at IS NOT NULL),
      'total_deposited_kobo',(SELECT COALESCE(sum(amount_kobo), 0) FROM public.wallet_deposits WHERE credited_at IS NOT NULL),
      'bonus_users',         (SELECT count(DISTINCT user_id) FROM public.wallet_ledger WHERE kind = 'bonus'),
      'total_bonus_kobo',    (SELECT COALESCE(sum(available_delta), 0) FROM public.wallet_ledger WHERE kind = 'bonus'),
      'pending',             (SELECT count(*) FROM public.wallet_deposits WHERE status = 'pending'),
      'failed',              (SELECT count(*) FROM public.wallet_deposits WHERE status IN ('failed','abandoned'))),
    'rows', v_rows);
END $$;
REVOKE ALL ON FUNCTION public.admin_topups(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_topups(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Wallets: one row per user + one user's full ledger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_wallets()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.available_kobo DESC, r.name) FROM (
      SELECT p.id AS user_id, COALESCE(NULLIF(btrim(p.full_name), ''), p.email::text, 'User') AS name,
             p.email::text AS email, p.role,
             a.available_kobo, a.held_kobo,
             COALESCE((SELECT sum(l.available_delta) FROM public.wallet_ledger l WHERE l.user_id = p.id AND l.kind = 'deposit'), 0) AS deposited_kobo,
             COALESCE((SELECT sum(l.available_delta) FROM public.wallet_ledger l WHERE l.user_id = p.id AND l.kind = 'bonus'), 0) AS bonus_kobo,
             COALESCE((SELECT -(sum(l.held_delta) + sum(l.available_delta)) FROM public.wallet_ledger l WHERE l.user_id = p.id AND l.kind = 'fee_charge'), 0) AS fees_paid_kobo,
             (SELECT max(l.created_at) FROM public.wallet_ledger l WHERE l.user_id = p.id) AS last_activity
        FROM public.wallet_accounts a
        JOIN public.profiles p ON p.id = a.user_id
       WHERE p.role <> 'admin'
       LIMIT 2000
    ) r), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_wallets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_wallets() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_wallet_ledger(p_user uuid, p_limit int DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN jsonb_build_object(
    'user', (SELECT jsonb_build_object('id', p.id, 'name', public._admin_name(p.id), 'email', p.email::text, 'phone', p.phone, 'role', p.role,
                                       'available_kobo', COALESCE(a.available_kobo, 0), 'held_kobo', COALESCE(a.held_kobo, 0))
               FROM public.profiles p LEFT JOIN public.wallet_accounts a ON a.user_id = p.id WHERE p.id = p_user),
    'ledger', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC) FROM (
        SELECT id, kind, available_delta, held_delta, available_after, held_after, booking_id, note, created_at
          FROM public.wallet_ledger WHERE user_id = p_user
         ORDER BY created_at DESC LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))) l), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_wallet_ledger(uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_wallet_ledger(uuid,int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Activity feed: newest events across the whole app
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_activity(p_limit int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := GREATEST(1, LEAST(COALESCE(p_limit, 100), 300));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(e) ORDER BY e.at DESC) FROM (
      SELECT * FROM (
        SELECT p.created_at AS at, 'signup' AS kind, p.id AS user_id, NULL::uuid AS ref_id,
               public._admin_name(p.id) || ' joined as a ' || p.role AS title, NULL::text AS detail
          FROM public.profiles p WHERE p.role <> 'admin'
        UNION ALL
        SELECT d.credited_at, 'topup', d.user_id, NULL, public._admin_name(d.user_id) || ' topped up ₦' || (d.amount_kobo / 100), NULL
          FROM public.wallet_deposits d WHERE d.credited_at IS NOT NULL
        UNION ALL
        SELECT l.created_at, 'bonus', l.user_id, NULL, public._admin_name(l.user_id) || ' got a ₦' || (l.available_delta / 100) || ' first top-up bonus', NULL
          FROM public.wallet_ledger l WHERE l.kind = 'bonus'
        UNION ALL
        SELECT r.created_at, 'request', r.customer_id, r.id, public._admin_name(r.customer_id) || ' posted a request',
               concat_ws(' · ', NULLIF(COALESCE(sc.name, r.category_text, ''), ''), r.location_area)
          FROM public.service_requests r LEFT JOIN public.service_categories sc ON sc.id = r.category_id
        UNION ALL
        SELECT q.created_at, 'quote', q.provider_id, q.request_id, public._admin_name(q.provider_id) || ' sent a quote of ₦' || (q.price_kobo / 100), NULL
          FROM public.quotes q
        UNION ALL
        SELECT b.created_at, 'booking', b.customer_id, b.id, 'Booking confirmed: ' || public._admin_name(b.customer_id) || ' with ' || public._admin_name(b.provider_id),
               '₦' || (b.price_kobo / 100)
          FROM public.bookings b
        UNION ALL
        SELECT b.provider_arrived_at, 'arrived', b.provider_id, b.id, public._admin_name(b.provider_id) || ' marked arrival', NULL
          FROM public.bookings b WHERE b.provider_arrived_at IS NOT NULL
        UNION ALL
        SELECT b.completed_at, 'completed', b.customer_id, b.id, 'Job completed: ' || public._admin_name(b.provider_id) || ' for ' || public._admin_name(b.customer_id),
               '₦' || (b.price_kobo / 100)
          FROM public.bookings b WHERE b.completed_at IS NOT NULL
        UNION ALL
        SELECT b.updated_at, 'cancelled', b.customer_id, b.id, 'Booking cancelled: ' || public._admin_name(b.customer_id) || ' / ' || public._admin_name(b.provider_id), NULL
          FROM public.bookings b WHERE b.status = 'cancelled'
        UNION ALL
        SELECT x.created_at, 'dispute', x.reporter_id, x.booking_id, public._admin_name(x.reporter_id) || ' opened a dispute', x.category
          FROM public.disputes x
        UNION ALL
        SELECT v.created_at, 'review', v.reviewer_id, v.booking_id, public._admin_name(v.reviewer_id) || ' rated ' || public._admin_name(v.provider_id) || ' ' || v.rating || '/5',
               NULLIF(left(COALESCE(v.comment, ''), 120), '')
          FROM public.reviews v
        UNION ALL
        SELECT rp.created_at, 'report', rp.reporter_id, rp.id, public._admin_name(rp.reporter_id) || ' sent a ' || rp.kind || ' report', rp.category
          FROM public.reports rp
      ) u
      ORDER BY u.at DESC
      LIMIT v_n
    ) e), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_activity(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activity(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Booking timeline: everything that happened to one booking, in order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_booking_timeline(p_booking uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings%ROWTYPE; v_cat text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = p_booking;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  SELECT COALESCE(sc.name, r.category_text, '') INTO v_cat
    FROM public.service_requests r LEFT JOIN public.service_categories sc ON sc.id = r.category_id WHERE r.id = b.request_id;
  RETURN jsonb_build_object(
    'booking', jsonb_build_object(
      'id', b.id, 'status', b.status, 'fee_status', b.fee_status, 'price_kobo', b.price_kobo, 'category', v_cat,
      'customer_id', b.customer_id, 'customer', public._admin_name(b.customer_id),
      'provider_id', b.provider_id, 'provider', public._admin_name(b.provider_id),
      'scheduled_for', b.scheduled_for, 'created_at', b.created_at,
      'messages', (SELECT count(*) FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
                    WHERE c.request_id = b.request_id AND c.provider_id = b.provider_id)),
    'events', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.at, e.ord) FROM (
        SELECT r.created_at AS at, 1 AS ord, 'Request posted' AS title, public._admin_name(r.customer_id) AS detail
          FROM public.service_requests r WHERE r.id = b.request_id
        UNION ALL
        SELECT q.created_at, 2, 'Quote from ' || public._admin_name(q.provider_id), '₦' || (q.price_kobo / 100) || ' (' || q.status || ')'
          FROM public.quotes q WHERE q.request_id = b.request_id
        UNION ALL
        SELECT b.created_at, 3, 'Booking confirmed', '₦' || (b.price_kobo / 100) || ' agreed'
        UNION ALL
        SELECT l.created_at, 4,
               CASE l.kind WHEN 'hold' THEN 'Fee reserved' WHEN 'release' THEN 'Fee returned' WHEN 'fee_charge' THEN 'Fee charged' ELSE initcap(l.kind) END,
               public._admin_name(l.user_id) || ' · ₦' || (GREATEST(abs(l.available_delta), abs(l.held_delta)) / 100)
          FROM public.wallet_ledger l WHERE l.booking_id = b.id
        UNION ALL
        SELECT b.provider_arrived_at, 5, 'Provider marked arrival', public._admin_name(b.provider_id)
         WHERE b.provider_arrived_at IS NOT NULL
        UNION ALL
        SELECT b.customer_confirmed_arrival_at, 6, 'Arrival confirmed',
               CASE WHEN b.arrival_method = 'gps' THEN 'by GPS' WHEN b.arrival_method = 'manual' THEN 'by customer tap' ELSE public._admin_name(b.customer_id) END
         WHERE b.customer_confirmed_arrival_at IS NOT NULL
        UNION ALL
        SELECT b.completed_at, 7, 'Job completed', '₦' || (b.price_kobo / 100)
         WHERE b.completed_at IS NOT NULL
        UNION ALL
        SELECT b.updated_at, 7, 'Booking cancelled', NULL
         WHERE b.status = 'cancelled'
        UNION ALL
        SELECT x.created_at, 8, 'Dispute opened by ' || public._admin_name(x.reporter_id), x.category || ' · ' || left(x.description, 140)
          FROM public.disputes x WHERE x.booking_id = b.id
        UNION ALL
        SELECT x.updated_at, 9, 'Dispute ' || x.status, NULL
          FROM public.disputes x WHERE x.booking_id = b.id AND x.status IN ('resolved','closed')
        UNION ALL
        SELECT v.created_at, 10, 'Review: ' || v.rating || '/5 from ' || public._admin_name(v.reviewer_id), NULLIF(left(COALESCE(v.comment, ''), 160), '')
          FROM public.reviews v WHERE v.booking_id = b.id
      ) e), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_booking_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_booking_timeline(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Daily counts for the Activity charts (last N days, in the admin's own time zone)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_activity_daily(p_days int DEFAULT 7, p_tz text DEFAULT 'UTC')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := GREATEST(1, LEAST(COALESCE(p_days, 7), 60)); v_tz text := 'UTC';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz) THEN v_tz := p_tz; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.day) FROM (
      SELECT d.day::date::text AS day,
             count(*) FILTER (WHERE e.kind = 'signup')    AS signups,
             count(*) FILTER (WHERE e.kind = 'request')   AS requests,
             count(*) FILTER (WHERE e.kind = 'quote')     AS quotes,
             count(*) FILTER (WHERE e.kind = 'booking')   AS bookings,
             count(*) FILTER (WHERE e.kind = 'completed') AS completed,
             count(*) FILTER (WHERE e.kind = 'topup')     AS topups,
             COALESCE(sum(e.amt) FILTER (WHERE e.kind = 'topup'), 0) AS topup_kobo,
             COALESCE(sum(e.amt) FILTER (WHERE e.kind = 'bonus'), 0) AS bonus_kobo,
             count(*) FILTER (WHERE e.kind = 'dispute')   AS disputes,
             count(*) FILTER (WHERE e.kind = 'report')    AS reports,
             count(*) FILTER (WHERE e.kind = 'review')    AS reviews
        FROM generate_series((now() AT TIME ZONE v_tz)::date - (v_n - 1), (now() AT TIME ZONE v_tz)::date, interval '1 day') AS d(day)
        LEFT JOIN (
          SELECT (p.created_at AT TIME ZONE v_tz)::date AS day, 'signup' AS kind, 0::bigint AS amt FROM public.profiles p WHERE p.role <> 'admin'
          UNION ALL SELECT (r.created_at AT TIME ZONE v_tz)::date, 'request', 0 FROM public.service_requests r
          UNION ALL SELECT (q.created_at AT TIME ZONE v_tz)::date, 'quote', 0 FROM public.quotes q
          UNION ALL SELECT (b.created_at AT TIME ZONE v_tz)::date, 'booking', 0 FROM public.bookings b
          UNION ALL SELECT (b.completed_at AT TIME ZONE v_tz)::date, 'completed', 0 FROM public.bookings b WHERE b.completed_at IS NOT NULL
          UNION ALL SELECT (w.credited_at AT TIME ZONE v_tz)::date, 'topup', w.amount_kobo::bigint FROM public.wallet_deposits w WHERE w.credited_at IS NOT NULL
          UNION ALL SELECT (l.created_at AT TIME ZONE v_tz)::date, 'bonus', l.available_delta FROM public.wallet_ledger l WHERE l.kind = 'bonus'
          UNION ALL SELECT (x.created_at AT TIME ZONE v_tz)::date, 'dispute', 0 FROM public.disputes x
          UNION ALL SELECT (rp.created_at AT TIME ZONE v_tz)::date, 'report', 0 FROM public.reports rp
          UNION ALL SELECT (v.created_at AT TIME ZONE v_tz)::date, 'review', 0 FROM public.reviews v
        ) e ON e.day = d.day::date
       GROUP BY d.day
    ) x), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_activity_daily(int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_daily(int,text) TO authenticated;
