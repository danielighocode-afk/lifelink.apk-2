-- =============================================================================
-- LifeLink 019 - "Continue with Google" sign-up.
-- Google sends the person's name as full_name / name and NO phone number. This updates the signup trigger so such accounts are
-- created cleanly as customers (the app then asks for the phone number on first use). Email sign-ups behave exactly as before:
-- a bad name or phone typed into the sign-up form is still rejected.
-- Safe to run more than once. Run in: Supabase dashboard -> SQL editor -> paste -> Run.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_name text; v_phone text; v_google boolean;
BEGIN
  v_google := COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'google';
  v_name := TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  IF v_name = '' AND v_google THEN v_name := TRIM(COALESCE(NEW.raw_user_meta_data->>'name', '')); END IF;
  IF v_name = '' THEN v_name := NULL; END IF;
  IF v_google AND v_name IS NOT NULL THEN
    v_name := left(v_name, 120);                         -- Google names are trusted but may be unusually long
    IF char_length(v_name) < 2 THEN v_name := NULL; END IF;   -- one-letter names: ask the person later
  END IF;
  IF v_name IS NOT NULL AND (char_length(v_name) < 2 OR char_length(v_name) > 120) THEN
    RAISE EXCEPTION 'invalid full_name in signup metadata';
  END IF;
  v_phone := TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
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
