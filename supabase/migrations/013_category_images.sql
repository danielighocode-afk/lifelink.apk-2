-- LifeLink 013 — category photos. Re-runnable. Run AFTER 012_public_banner.sql.
-- Adds an optional photo to each service category, set by admins from Admin -> Categories.
-- Categories without a photo fall back to a bundled photo (original five) or a placeholder in the app.

ALTER TABLE public.service_categories ADD COLUMN IF NOT EXISTS image_path text;
ALTER TABLE public.service_categories DROP CONSTRAINT IF EXISTS service_categories_image_path_len;
ALTER TABLE public.service_categories ADD CONSTRAINT service_categories_image_path_len CHECK (image_path IS NULL OR char_length(image_path) <= 200);

-- Public bucket (category photos are shown to everyone, including signed-out visitors). Admin-only writes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('category-images', 'category-images', true, 3145728, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS ll_catimg_insert ON storage.objects;
CREATE POLICY ll_catimg_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'category-images' AND public.is_admin());
DROP POLICY IF EXISTS ll_catimg_update ON storage.objects;
CREATE POLICY ll_catimg_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'category-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'category-images' AND public.is_admin());
DROP POLICY IF EXISTS ll_catimg_delete ON storage.objects;
CREATE POLICY ll_catimg_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'category-images' AND public.is_admin());
DROP POLICY IF EXISTS ll_catimg_select ON storage.objects;
CREATE POLICY ll_catimg_select ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'category-images');

-- set_category: now also sets/removes the photo. Omitting p_image_path keeps the current photo.
DROP FUNCTION IF EXISTS public.set_category(uuid,text,text,boolean);
CREATE OR REPLACE FUNCTION public.set_category(
  p_id uuid DEFAULT NULL, p_slug text DEFAULT NULL, p_name text DEFAULT NULL, p_active boolean DEFAULT true,
  p_image_path text DEFAULT NULL, p_remove_image boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9-]{2,60}$' THEN RAISE EXCEPTION 'invalid slug'; END IF;
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'invalid name'; END IF;
  IF p_active IS NULL THEN RAISE EXCEPTION 'active required'; END IF;
  IF p_image_path IS NOT NULL AND (char_length(p_image_path) > 200 OR p_image_path !~ '^[A-Za-z0-9._/-]+$' OR p_image_path LIKE '%..%') THEN
    RAISE EXCEPTION 'invalid image path';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.service_categories (slug, name, active, image_path) VALUES (p_slug, p_name, p_active, p_image_path)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.service_categories SET slug = p_slug, name = p_name, active = p_active,
      image_path = CASE WHEN COALESCE(p_remove_image, false) THEN NULL WHEN p_image_path IS NOT NULL THEN p_image_path ELSE image_path END
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'category not found'; END IF;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.set_category(uuid,text,text,boolean,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_category(uuid,text,text,boolean,text,boolean) TO authenticated;
