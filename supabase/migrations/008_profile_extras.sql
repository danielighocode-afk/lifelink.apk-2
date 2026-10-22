-- 008: optional profile details for the customer Profile screens (date of birth, gender, about me).
-- Safe to run more than once. Only the signed-in user (and admins) can read these on profiles (existing RLS);
-- they are NOT exposed in public_providers or connected_profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS about text;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_dob_range CHECK (date_of_birth IS NULL OR date_of_birth >= DATE '1900-01-01');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_valid CHECK (gender IS NULL OR gender IN ('male','female','other','prefer_not_to_say'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_about_len CHECK (about IS NULL OR char_length(about) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Let a user edit these three fields on their own row (the existing own-row policy still applies).
GRANT UPDATE (date_of_birth, gender, about) ON public.profiles TO authenticated;
