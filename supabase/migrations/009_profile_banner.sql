-- 009: optional customer profile banner photo. Image lives in the existing public "avatars" bucket
-- (own-folder write policy already applies); only the URL is stored here. Safe to run more than once.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url text;
GRANT UPDATE (banner_url) ON public.profiles TO authenticated;
