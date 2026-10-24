-- 012: show the provider's cover photo on their public profile. Appends banner_url to public_providers
-- (the image is already public in the avatars bucket). Safe to run more than once. Run AFTER 011.
CREATE OR REPLACE VIEW public.public_providers WITH (security_invoker = false) AS
SELECT p.id AS provider_id, p.avatar_url,
  pp.business_name, pp.category, pp.bio, pp.service_area,
  pp.verification_status, pp.trust_score, pp.rating_avg, pp.jobs_done,
  pp.available, pp.years_experience, pp.skills,
  (SELECT count(*) FROM public.reviews r WHERE r.provider_id = pp.profile_id)::int AS review_count,
  (SELECT min(s.base_price_kobo) FROM public.provider_services s WHERE s.provider_id = pp.profile_id AND s.active) AS min_price_kobo,
  pp.provider_type, pp.store_url,
  p.banner_url
FROM public.provider_profiles pp JOIN public.profiles p ON p.id = pp.profile_id
WHERE pp.verification_status = 'verified' AND p.role = 'provider';
GRANT SELECT ON public.public_providers TO anon, authenticated;
