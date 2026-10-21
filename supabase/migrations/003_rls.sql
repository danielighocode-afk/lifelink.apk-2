-- LIFELINK Stage 2b: RLS (PROPOSED, NOT EXECUTED)
-- File: supabase/migrations/003_rls.sql
-- Least privilege: anon only reads public_providers/active categories/verified services.
-- No client writes to role/verification/price/escrow/payment. Grants minimal.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_verifications ENABLE ROW LEVEL SECURITY;

-- Base grants: least privilege. Views granted below; private tables have NO anon access.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON public.public_providers TO anon, authenticated; -- definer view, safe for anon
GRANT SELECT ON public.public_reviews TO anon, authenticated; -- definer view, hides booking/reviewer ids
GRANT SELECT ON public.service_categories TO anon, authenticated;
GRANT SELECT ON public.provider_services TO anon; -- anon sees verified+active rows via p_svc_public only
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_services TO authenticated; -- row+column scope enforced by RLS policies + immutability trigger below
REVOKE UPDATE ON public.provider_services FROM authenticated;
GRANT UPDATE (category_id, title, description, base_price_kobo, active) ON public.provider_services TO authenticated; -- provider_id immutable
GRANT SELECT, UPDATE ON public.profiles TO authenticated; -- no INSERT: profiles are created by handle_new_user() auth.users trigger; UPDATE narrowed by column grants below
GRANT SELECT ON public.provider_profiles TO authenticated;
GRANT INSERT (profile_id, business_name, category, bio, service_area) ON public.provider_profiles TO authenticated; -- verification_status forced pending by policy; use request_provider_role()
REVOKE UPDATE ON public.provider_profiles FROM authenticated;
GRANT UPDATE (business_name, category, bio, service_area) ON public.provider_profiles TO authenticated; -- ordinary users: business fields only
GRANT SELECT ON public.service_requests TO authenticated;
REVOKE INSERT ON public.service_requests FROM authenticated;
GRANT UPDATE (description, location_area, urgency, status) ON public.service_requests TO authenticated;
GRANT SELECT ON public.quotes TO authenticated;
REVOKE INSERT ON public.quotes FROM authenticated;
GRANT INSERT (request_id, provider_id, price_kobo, arrival_text, message) ON public.quotes TO authenticated; -- status forced pending by policy
GRANT UPDATE (status) ON public.quotes TO authenticated; -- withdraw path only, guarded by policy+checks
GRANT SELECT ON public.bookings TO authenticated;
GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT SELECT ON public.reviews TO authenticated; -- NO anon grant: anon uses public_reviews view only
GRANT SELECT ON public.notifications TO authenticated; -- UPDATE via column grant below; NO INSERT grant
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated; -- mark-as-read only; content/ownership immutable
GRANT SELECT ON public.disputes TO authenticated; -- INSERT via column grant below (reporter-owned open only)
GRANT INSERT (booking_id, reporter_id, category, description) ON public.disputes TO authenticated;
GRANT SELECT ON public.provider_verifications TO authenticated; -- INSERT via column grant below (own pending only)
GRANT INSERT (provider_id, doc_type, doc_ref, file_path) ON public.provider_verifications TO authenticated;
REVOKE INSERT ON public.service_requests FROM authenticated;
GRANT INSERT (customer_id, category_id, category_text, description, location_area, urgency) ON public.service_requests TO authenticated;

-- Rerunnable policy section: drop in dependency-safe order, then recreate below.
DROP POLICY IF EXISTS p_profiles_self_select ON public.profiles;
DROP POLICY IF EXISTS p_profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS p_profiles_admin_select ON public.profiles;
DROP POLICY IF EXISTS p_pp_owner_select ON public.provider_profiles;
DROP POLICY IF EXISTS p_pp_owner_insert ON public.provider_profiles;
DROP POLICY IF EXISTS p_pp_owner_update ON public.provider_profiles;
DROP POLICY IF EXISTS p_pp_admin_select ON public.provider_profiles;
DROP POLICY IF EXISTS p_cat_public ON public.service_categories;
DROP POLICY IF EXISTS p_cat_admin_read ON public.service_categories;
DROP POLICY IF EXISTS p_svc_public ON public.provider_services;
DROP POLICY IF EXISTS p_svc_owner_select ON public.provider_services;
DROP POLICY IF EXISTS p_svc_owner_insert ON public.provider_services;
DROP POLICY IF EXISTS p_svc_owner_update ON public.provider_services;
DROP POLICY IF EXISTS p_svc_owner_delete ON public.provider_services;
DROP POLICY IF EXISTS p_svc_owner ON public.provider_services;
DROP POLICY IF EXISTS p_req_insert ON public.service_requests;
DROP POLICY IF EXISTS p_req_owner_select ON public.service_requests;
DROP POLICY IF EXISTS p_req_provider_select ON public.service_requests;
DROP POLICY IF EXISTS p_req_admin_select ON public.service_requests;
DROP POLICY IF EXISTS p_req_owner_update ON public.service_requests;
DROP POLICY IF EXISTS p_q_provider_insert ON public.quotes;
DROP POLICY IF EXISTS p_q_customer_select ON public.quotes;
DROP POLICY IF EXISTS p_q_provider_select ON public.quotes;
DROP POLICY IF EXISTS p_q_admin_select ON public.quotes;
DROP POLICY IF EXISTS p_q_owner_withdraw ON public.quotes;
DROP POLICY IF EXISTS p_b_party_select ON public.bookings;
DROP POLICY IF EXISTS p_b_admin_select ON public.bookings;
DROP POLICY IF EXISTS p_pay_party_select ON public.payment_transactions;
DROP POLICY IF EXISTS p_pay_admin_select ON public.payment_transactions;
DROP POLICY IF EXISTS p_rev_customer_select ON public.reviews;
DROP POLICY IF EXISTS p_rev_provider_select ON public.reviews;
DROP POLICY IF EXISTS p_rev_admin_select ON public.reviews;
DROP POLICY IF EXISTS p_not_owner_select ON public.notifications;
DROP POLICY IF EXISTS p_not_owner_update ON public.notifications;
DROP POLICY IF EXISTS p_not_owner_mark_read ON public.notifications;
DROP POLICY IF EXISTS p_not_admin_select ON public.notifications;
DROP POLICY IF EXISTS p_dis_insert ON public.disputes;
DROP POLICY IF EXISTS p_dis_owner_select ON public.disputes;
DROP POLICY IF EXISTS p_dis_admin_select ON public.disputes;
DROP POLICY IF EXISTS p_ver_insert ON public.provider_verifications;
DROP POLICY IF EXISTS p_ver_owner_select ON public.provider_verifications;
DROP POLICY IF EXISTS p_ver_admin_select ON public.provider_verifications;

-- profiles: own row only. Role immutable via trigger; column grants block id/role/email* writes.
-- NOTE: email changes must go through Supabase Auth admin API, not direct table UPDATE.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, avatar_url, onboarded, interests, home_area) ON public.profiles TO authenticated;
CREATE POLICY p_profiles_self_select ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY p_profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY p_profiles_admin_select ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());
-- provider_profiles: owner sees own; direct anon select denied (use public_providers view).
CREATE POLICY p_pp_owner_select ON public.provider_profiles FOR SELECT TO authenticated USING (profile_id = auth.uid());
CREATE POLICY p_pp_owner_insert ON public.provider_profiles FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid() AND verification_status='pending' AND trust_score IS NULL AND rating_avg IS NULL AND jobs_done=0);
CREATE POLICY p_pp_owner_update ON public.provider_profiles FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY p_pp_admin_select ON public.provider_profiles FOR SELECT TO authenticated USING (public.is_admin());
-- Trigger blocks non-admin verification/trust/rating/jobs writes.

-- categories: public read active only. Writes via set_category() allowlist only (no direct client write grant).
-- set_category() validates slug/name/active and requires is_admin(); revokes FOR ALL policy bypass risk.
CREATE POLICY p_cat_public ON public.service_categories FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY p_cat_admin_read ON public.service_categories FOR SELECT TO authenticated USING (public.is_admin());

-- services: public reads verified+active only via is_verified_provider() definer helper.
-- Direct subquery on provider_profiles would be invisible to anon (no SELECT policy) and hide everything.
CREATE POLICY p_svc_public ON public.provider_services FOR SELECT TO anon, authenticated USING (active = true AND public.is_verified_provider(provider_services.provider_id));
CREATE POLICY p_svc_owner_select ON public.provider_services FOR SELECT TO authenticated USING (provider_id = auth.uid());
CREATE POLICY p_svc_owner_insert ON public.provider_services FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND (active = false OR public.is_verified_provider(auth.uid())));
CREATE POLICY p_svc_owner_update ON public.provider_services FOR UPDATE TO authenticated USING (provider_id = auth.uid()) WITH CHECK (provider_id = auth.uid() AND (active = false OR public.is_verified_provider(auth.uid())));
CREATE POLICY p_svc_owner_delete ON public.provider_services FOR DELETE TO authenticated USING (provider_id = auth.uid());

-- requests: owner insert (column grants exclude status/direct/declined; defaults apply)/select/cancel.
-- p_req_provider_select: an authenticated user may read the open-request board ONLY if they are a
-- verified provider (public.is_verified_provider(auth.uid())), preserving the existing restrictions:
-- the request must be open, not declined by them, and either undirected or directed specifically at them.
CREATE POLICY p_req_insert ON public.service_requests FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY p_req_owner_select ON public.service_requests FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY p_req_provider_select ON public.service_requests FOR SELECT TO authenticated USING (public.is_verified_provider(auth.uid()) AND status='open' AND NOT (auth.uid() = ANY (declined_by)) AND (direct_provider_id IS NULL OR direct_provider_id = auth.uid()));
CREATE POLICY p_req_admin_select ON public.service_requests FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY p_req_owner_update ON public.service_requests FOR UPDATE TO authenticated USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid() AND status IN ('open','quoted','cancelled'));

-- quotes: verified provider inserts on open requests; parties read scoped rows; accept via function only.
-- Verification checked via is_verified_provider() definer helper (RLS-safe for all roles).
CREATE POLICY p_q_provider_insert ON public.quotes FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND status='pending' AND public.is_verified_provider(auth.uid()) AND EXISTS (SELECT 1 FROM public.service_requests r WHERE r.id = quotes.request_id AND r.status IN ('open','quoted')));
CREATE POLICY p_q_customer_select ON public.quotes FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.service_requests r WHERE r.id = quotes.request_id AND r.customer_id = auth.uid()));
CREATE POLICY p_q_provider_select ON public.quotes FOR SELECT TO authenticated USING (provider_id = auth.uid());
CREATE POLICY p_q_admin_select ON public.quotes FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY p_q_owner_withdraw ON public.quotes FOR UPDATE TO authenticated USING (provider_id = auth.uid() AND status='pending') WITH CHECK (provider_id = auth.uid() AND status IN ('pending','withdrawn'));

-- bookings: NO client INSERT/UPDATE. Parties read only; writes via backend functions/webhook.
CREATE POLICY p_b_party_select ON public.bookings FOR SELECT TO authenticated USING (customer_id = auth.uid() OR provider_id = auth.uid());
CREATE POLICY p_b_admin_select ON public.bookings FOR SELECT TO authenticated USING (public.is_admin());

-- payment_transactions: party read; NO client writes (webhook backend only).
CREATE POLICY p_pay_party_select ON public.payment_transactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = payment_transactions.booking_id AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())));
CREATE POLICY p_pay_admin_select ON public.payment_transactions FOR SELECT TO authenticated USING (public.is_admin());

-- reviews: NO anon base-table access. Anon uses public_reviews view (no booking_id/reviewer_id).
-- Authenticated parties read own rows; inserts ONLY via submit_review().
CREATE POLICY p_rev_customer_select ON public.reviews FOR SELECT TO authenticated USING (reviewer_id = auth.uid());
CREATE POLICY p_rev_provider_select ON public.reviews FOR SELECT TO authenticated USING (provider_id = auth.uid());
CREATE POLICY p_rev_admin_select ON public.reviews FOR SELECT TO authenticated USING (public.is_admin());

-- notifications: owner read; update limited to read_at by column grant + immutability trigger.
CREATE POLICY p_not_owner_select ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY p_not_owner_mark_read ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY p_not_admin_select ON public.notifications FOR SELECT TO authenticated USING (public.is_admin());

-- disputes: reporter insert/select own; resolution admin-only (future function).
CREATE POLICY p_dis_insert ON public.disputes FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid() AND status='open' AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = disputes.booking_id AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())));
CREATE POLICY p_dis_owner_select ON public.disputes FOR SELECT TO authenticated USING (reporter_id = auth.uid());
CREATE POLICY p_dis_admin_select ON public.disputes FOR SELECT TO authenticated USING (public.is_admin());

-- verifications: provider inserts own pending docs; admin resolves via set_verification().
CREATE POLICY p_ver_insert ON public.provider_verifications FOR INSERT TO authenticated WITH CHECK (provider_id = auth.uid() AND status='pending');
CREATE POLICY p_ver_owner_select ON public.provider_verifications FOR SELECT TO authenticated USING (provider_id = auth.uid());
CREATE POLICY p_ver_admin_select ON public.provider_verifications FOR SELECT TO authenticated USING (public.is_admin());

-- FUTURE BACKEND REQUIRED (not in SQL scope): payment verify/webhook -> bookings paid/escrow,
-- booking lifecycle (in_progress/completed/cancel/dispute/refund), dispute resolution, rating aggregates.
-- Client must NEVER mark paid; payment.html confetti is demo only until webhook verifies.
-- Verify anon: SELECT * FROM public.public_providers (ok) vs SELECT email FROM public.profiles (denied);
-- SELECT * FROM public.public_reviews (ok, no booking_id/reviewer_id) vs SELECT * FROM public.reviews (denied).
