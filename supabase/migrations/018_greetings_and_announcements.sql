-- =============================================================================
-- LifeLink 018 — Daily morning greetings + "new update" announcements (push notifications).
--   Apply AFTER 010 (device tokens) and 017. Safe to run more than once.
--   * Daily greeting: 11 rotating messages, each carrying the person's first name, sent at a random
--     time between 07:00 and 10:00 (Africa/Lagos) to customers and providers who have a phone registered.
--     ON by default for everyone; a person can switch it off in Settings.
--   * Update announcements: the admin page sends one push to phones that are on an older app version.
--   * Nothing here sends anything by itself. The Edge Functions send-greetings (called every 5 minutes by
--     pg_cron, see 018b_schedule_greetings.sql) and admin-push do the sending.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Phones also report their app version and time zone
-- ---------------------------------------------------------------------------
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS app_version_code int,
  ADD COLUMN IF NOT EXISTS timezone text;

DROP FUNCTION IF EXISTS public.register_device_token(text, text);
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token text, p_platform text DEFAULT 'android', p_app_version int DEFAULT NULL, p_tz text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tz text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_token IS NULL OR char_length(p_token) < 20 THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF p_tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz) THEN v_tz := p_tz; END IF;
  INSERT INTO public.device_tokens (user_id, token, platform, app_version_code, timezone)
  VALUES (auth.uid(), p_token, COALESCE(NULLIF(p_platform, ''), 'android'), p_app_version, v_tz)
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = EXCLUDED.platform, updated_at = now(),
        app_version_code = COALESCE(EXCLUDED.app_version_code, public.device_tokens.app_version_code),
        timezone = COALESCE(EXCLUDED.timezone, public.device_tokens.timezone);
END $$;
REVOKE ALL ON FUNCTION public.register_device_token(text,text,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text,text,int,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. A person's own switch (no row = ON)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_greeting boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_prefs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
DROP POLICY IF EXISTS p_np_owner_select ON public.notification_prefs;
CREATE POLICY p_np_owner_select ON public.notification_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.my_notification_prefs() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  RETURN jsonb_build_object('daily_greeting',
    COALESCE((SELECT daily_greeting FROM public.notification_prefs WHERE user_id = auth.uid()), true));
END $$;
REVOKE ALL ON FUNCTION public.my_notification_prefs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_notification_prefs() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_daily_greeting(p_on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  INSERT INTO public.notification_prefs (user_id, daily_greeting) VALUES (auth.uid(), COALESCE(p_on, true))
  ON CONFLICT (user_id) DO UPDATE SET daily_greeting = COALESCE(p_on, true), updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_daily_greeting(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_greeting(boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Greeting settings (one row), the messages, and the "already sent today" log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.greeting_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  start_hour int NOT NULL DEFAULT 7  CHECK (start_hour BETWEEN 0 AND 22),
  end_hour int NOT NULL DEFAULT 10   CHECK (end_hour BETWEEN 1 AND 23),
  cutoff_hour int NOT NULL DEFAULT 12 CHECK (cutoff_hour BETWEEN 1 AND 23),   -- a greeting missed by the scheduler is skipped after this hour
  tz text NOT NULL DEFAULT 'Africa/Lagos',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_hour > start_hour AND cutoff_hour >= end_hour)
);
INSERT INTO public.greeting_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.greeting_messages (
  id serial PRIMARY KEY,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  body  text NOT NULL CHECK (char_length(btrim(body))  BETWEEN 1 AND 200),
  active boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.greeting_log (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  message_id int REFERENCES public.greeting_messages(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  devices int NOT NULL DEFAULT 0,
  delivered int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_greeting_log_day ON public.greeting_log(day);

ALTER TABLE public.greeting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.greeting_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.greeting_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.greeting_settings, public.greeting_messages, public.greeting_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.greeting_settings, public.greeting_messages, public.greeting_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.greeting_messages_id_seq TO service_role;

-- The 11 messages (only inserted while the table is empty, so your later edits are never overwritten)
INSERT INTO public.greeting_messages (title, body, sort)
SELECT v.title, v.body, v.sort FROM (VALUES
  ('Good Morning from LifeLink, {name} ☀️',                       'Wishing you a great day ahead.', 1),
  ('Good Morning from LIFELINK, {name} ☀️',                       'Wishing you a beautiful day filled with happiness!', 2),
  ('Rise and Shine with LIFELINK, {name}! 🌅',                    'May your day be filled with wonderful moments.', 3),
  ('A Fresh Morning, A Fresh Start, {name}! 🌞',                  'LIFELINK wishes you an amazing day ahead.', 4),
  ('Hello, New Day, {name}! 💚',                                  'The LIFELINK team wishes you a productive and joyful day.', 5),
  ('Start Your Day with a Smile, {name}! 😊',                     'Good morning from LIFELINK. Have a fantastic day!', 6),
  ('Good Morning, {name}! A New Day Awaits. 🌤️',                  'Let LIFELINK make your day a little easier.', 7),
  ('Sending You Morning Cheer from LIFELINK, {name}! 💚',         'May today bring you peace, progress, and happiness.', 8),
  ('It''s a Beautiful Day to Begin Again, {name}! 🌻',            'LIFELINK wishes you success and wonderful experiences today.', 9),
  ('Your Day, Your Possibilities, {name}! ✨',                    'Good morning from LIFELINK. Make today count!', 10),
  ('A Wonderful Morning to You, {name}! 🌞',                      'From all of us at LIFELINK, have a refreshing and fulfilling day.', 11)
) AS v(title, body, sort)
WHERE NOT EXISTS (SELECT 1 FROM public.greeting_messages);

-- ---------------------------------------------------------------------------
-- 4. Greeting logic
-- ---------------------------------------------------------------------------
-- First name, tidied ("ADA OKAFOR" -> "Ada"; "Ada Okafor" -> "Ada"; empty -> NULL)
CREATE OR REPLACE FUNCTION public._greeting_first_name(p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN w IS NULL OR w = '' THEN NULL
              WHEN w = upper(w) OR w = lower(w) THEN initcap(w) ELSE w END
    FROM (SELECT NULLIF(split_part(btrim(COALESCE(full_name, '')), ' ', 1), '') AS w FROM public.profiles WHERE id = p_user) s
$$;
REVOKE ALL ON FUNCTION public._greeting_first_name(uuid) FROM PUBLIC, anon, authenticated;

-- Put the name in; if there is no name, remove the {name} part and its comma/space cleanly.
CREATE OR REPLACE FUNCTION public.greeting_render(p_text text, p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(regexp_replace(regexp_replace(
           CASE WHEN p_name IS NOT NULL AND p_name <> '' THEN replace(p_text, '{name}', p_name) ELSE p_text END,
           '\{name\}\s*,\s*', '', 'g'), '\s*,?\s*\{name\}', '', 'g'), '\s{2,}', ' ', 'g'))
$$;

-- Which message a person gets on a day: everyone starts at a different point in the list and moves on by one
-- every day, so a person sees all active messages before any repeats and different people differ on the same day.
CREATE OR REPLACE FUNCTION public.greeting_pick(p_user uuid, p_day date) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT id, (row_number() OVER (ORDER BY sort, id) - 1) AS rn, count(*) OVER () AS n
      FROM public.greeting_messages WHERE active)
  SELECT id FROM m
   WHERE rn = ((abs(hashtext(p_user::text)::bigint) % n) + ((p_day - DATE '2026-01-01') % n)) % n
$$;
REVOKE ALL ON FUNCTION public.greeting_pick(uuid,date) FROM PUBLIC, anon, authenticated;

-- Each person's random moment inside the window on a given day
CREATE OR REPLACE FUNCTION public.greeting_send_at(p_user uuid, p_day date, p_tz text, p_start int, p_end int) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_day::timestamp + make_interval(mins => p_start * 60 + (abs(hashtext(p_user::text || p_day::text)::bigint) % ((p_end - p_start) * 60))::int)) AT TIME ZONE p_tz
$$;

-- Called by the send-greetings Edge Function (service role only). Atomically "claims" everyone whose moment has
-- come and who has not had today's greeting, so two overlapping runs can never send the same greeting twice.
CREATE OR REPLACE FUNCTION public.greeting_claim_due(p_limit int DEFAULT 200)
RETURNS TABLE (user_id uuid, day date, title text, body text, tokens text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.greeting_settings%ROWTYPE; v_day date;
BEGIN
  SELECT * INTO s FROM public.greeting_settings WHERE id;
  IF NOT FOUND OR NOT s.enabled THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.greeting_messages WHERE active) THEN RETURN; END IF;
  v_day := (now() AT TIME ZONE s.tz)::date;
  IF now() >= ((v_day::timestamp + make_interval(hours => s.cutoff_hour)) AT TIME ZONE s.tz) THEN RETURN; END IF;
  RETURN QUERY
  WITH cand AS (
    SELECT p.id AS uid, public.greeting_send_at(p.id, v_day, s.tz, s.start_hour, s.end_hour) AS send_at
      FROM public.profiles p
     WHERE p.role IN ('customer', 'provider')
       AND EXISTS (SELECT 1 FROM public.device_tokens d WHERE d.user_id = p.id)
       AND COALESCE((SELECT np.daily_greeting FROM public.notification_prefs np WHERE np.user_id = p.id), true)
       AND NOT EXISTS (SELECT 1 FROM public.greeting_log g WHERE g.user_id = p.id AND g.day = v_day)
  ), due AS (
    SELECT c.uid, c.send_at, public.greeting_pick(c.uid, v_day) AS mid FROM cand c
     WHERE c.send_at <= now() ORDER BY c.send_at LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))
  ), ins AS (
    INSERT INTO public.greeting_log (user_id, day, message_id, scheduled_at)
    SELECT d.uid, v_day, d.mid, d.send_at FROM due d WHERE d.mid IS NOT NULL
    ON CONFLICT ON CONSTRAINT greeting_log_pkey DO NOTHING
    RETURNING greeting_log.user_id AS uid, greeting_log.message_id AS mid
  )
  SELECT i.uid, v_day,
         public.greeting_render(m.title, public._greeting_first_name(i.uid)),
         public.greeting_render(m.body,  public._greeting_first_name(i.uid)),
         ARRAY(SELECT dt.token FROM public.device_tokens dt WHERE dt.user_id = i.uid)
    FROM ins i JOIN public.greeting_messages m ON m.id = i.mid;
END $$;
REVOKE ALL ON FUNCTION public.greeting_claim_due(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.greeting_claim_due(int) TO service_role;

-- Preview/test helper for the admin screen: the rendered title and body a person would get (service role only).
CREATE OR REPLACE FUNCTION public.greeting_preview(p_user uuid, p_message int DEFAULT NULL)
RETURNS TABLE (title text, body text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.greeting_render(m.title, public._greeting_first_name(p_user)),
         public.greeting_render(m.body,  public._greeting_first_name(p_user))
    FROM public.greeting_messages m
   WHERE m.id = COALESCE(p_message, public.greeting_pick(p_user, (now() AT TIME ZONE (SELECT tz FROM public.greeting_settings WHERE id))::date))
$$;
REVOKE ALL ON FUNCTION public.greeting_preview(uuid,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.greeting_preview(uuid,int) TO service_role;
GRANT EXECUTE ON FUNCTION public._greeting_first_name(uuid), public.greeting_pick(uuid,date) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Update announcements (written by the admin-push Edge Function)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code int NOT NULL UNIQUE,
  version_name text NOT NULL,
  notes text,
  announced_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  targeted int NOT NULL DEFAULT 0,
  sent int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_announcements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_announcements TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Admin screens (read/write through admin-only functions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_greeting_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.greeting_settings%ROWTYPE; v_day date; v_eligible int; v_claimed int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO s FROM public.greeting_settings WHERE id;
  v_day := (now() AT TIME ZONE s.tz)::date;
  SELECT count(*) INTO v_eligible FROM public.profiles p
   WHERE p.role IN ('customer','provider') AND EXISTS (SELECT 1 FROM public.device_tokens d WHERE d.user_id = p.id)
     AND COALESCE((SELECT np.daily_greeting FROM public.notification_prefs np WHERE np.user_id = p.id), true);
  SELECT count(*) INTO v_claimed FROM public.greeting_log WHERE day = v_day;
  RETURN jsonb_build_object(
    'settings', to_jsonb(s),
    'today', jsonb_build_object('day', v_day, 'eligible', v_eligible, 'sent', v_claimed,
              'delivered', (SELECT COALESCE(sum(delivered), 0) FROM public.greeting_log WHERE day = v_day),
              'waiting', GREATEST(v_eligible - v_claimed, 0)),
    'opted_out', (SELECT count(*) FROM public.notification_prefs WHERE NOT daily_greeting),
    'phones', (SELECT count(*) FROM public.device_tokens),
    'recent', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.day DESC) FROM (
                SELECT day, count(*) AS sent, COALESCE(sum(delivered), 0) AS delivered
                  FROM public.greeting_log WHERE day > v_day - 7 GROUP BY day) r), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.sort, m.id) FROM public.greeting_messages m), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_greeting_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_greeting_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_greeting_enabled(p_enabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  UPDATE public.greeting_settings SET enabled = COALESCE(p_enabled, true), updated_at = now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_greeting_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_greeting_enabled(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_save_greeting(p_id int, p_title text, p_body text, p_active boolean DEFAULT true) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'The title must be 1 to 100 characters.'; END IF;
  IF char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'The message must be 1 to 200 characters.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.greeting_messages (title, body, active, sort)
    VALUES (btrim(p_title), btrim(p_body), COALESCE(p_active, true), COALESCE((SELECT max(sort) FROM public.greeting_messages), 0) + 1)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.greeting_messages SET title = btrim(p_title), body = btrim(p_body), active = COALESCE(p_active, true) WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'message not found'; END IF;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_greeting(int,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_greeting(int,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_greeting(p_id int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  DELETE FROM public.greeting_messages WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_greeting(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_greeting(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_announcements() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM (
    SELECT id, version_code, version_name, notes, targeted, sent, failed, created_at,
           public._admin_name(announced_by) AS by_name
      FROM public.app_announcements ORDER BY created_at DESC LIMIT 50) a), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_announcements() TO authenticated;
