-- 010: push notifications. Each phone saves its Firebase (FCM) token here; the send-push Edge Function reads it.
-- Safe to run more than once. Run AFTER 009_profile_banner.sql.
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL CHECK (char_length(token) BETWEEN 20 AND 4096),
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android','ios','web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_tokens_token_key UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

-- Row level security: a person can only see and delete their own tokens. Saving goes through register_device_token() below.
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_tokens FROM anon, authenticated;
GRANT SELECT, DELETE ON public.device_tokens TO authenticated;
DROP POLICY IF EXISTS p_dt_owner_select ON public.device_tokens;
DROP POLICY IF EXISTS p_dt_owner_delete ON public.device_tokens;
CREATE POLICY p_dt_owner_select ON public.device_tokens FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY p_dt_owner_delete ON public.device_tokens FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Called by the app after sign-in. If this phone's token was still saved under someone who signed out here,
-- it is moved to the person now signed in, so notifications never reach the wrong person.
CREATE OR REPLACE FUNCTION public.register_device_token(p_token text, p_platform text DEFAULT 'android')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_token IS NULL OR char_length(p_token) < 20 THEN RAISE EXCEPTION 'invalid token'; END IF;
  INSERT INTO public.device_tokens (user_id, token, platform)
  VALUES (auth.uid(), p_token, COALESCE(NULLIF(p_platform, ''), 'android'))
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = EXCLUDED.platform, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.register_device_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;
