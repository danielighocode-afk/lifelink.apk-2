-- OPTIONAL. Creates the five service categories shown on the home page so the request form and
-- provider onboarding have something to choose from. These are configuration, not sample data.
-- You can instead add/rename categories from Admin -> Categories after signing in as admin.
INSERT INTO public.service_categories (slug, name, active) VALUES
  ('repair-maintenance', 'Repair & Maintenance', true),
  ('cleaning', 'Cleaning', true),
  ('beauty-personal-care', 'Beauty & Personal Care', true),
  ('home-services', 'Home Services', true),
  ('auto-repair', 'Auto Repair', true)
ON CONFLICT (slug) DO NOTHING;
