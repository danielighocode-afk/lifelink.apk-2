-- LIFELINK Stage 1: Schema (PROPOSED, NOT EXECUTED)
-- File: supabase/migrations/001_schema.sql
-- Static site: no build; localStorage ll_* untouched. No seeds, no admin creation.
-- Money in kobo integers. No card/PAN/CVV/password columns.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- profiles: one row per auth.users.id. Role immutable (see 002 trigger).
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','provider','admin')),
  full_name text CHECK (char_length(full_name) <= 120),
  email citext UNIQUE CHECK (char_length(email::text) <= 320),
  phone text UNIQUE CHECK (phone IS NULL OR char_length(phone) <= 32),
  avatar_url text, onboarded boolean NOT NULL DEFAULT false,
  interests text[] NOT NULL DEFAULT '{}', home_area text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- provider_profiles: public business data + privileged verification/metrics.
CREATE TABLE public.provider_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 120),
  category text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 80),
  bio text CHECK (char_length(bio) <= 2000), service_area text,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  trust_score int CHECK (trust_score IS NULL OR (trust_score BETWEEN 0 AND 100)),
  rating_avg numeric(2,1) CHECK (rating_avg IS NULL OR (rating_avg BETWEEN 0 AND 5)),
  jobs_done int NOT NULL DEFAULT 0 CHECK (jobs_done >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 80),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.service_categories(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description text CHECK (char_length(description) <= 2000),
  base_price_kobo int NOT NULL CHECK (base_price_kobo >= 100000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  category_text text CHECK (char_length(category_text) <= 80),
  description text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  location_area text NOT NULL CHECK (char_length(location_area) BETWEEN 2 AND 160),
  urgency text NOT NULL DEFAULT 'scheduled' CHECK (urgency IN ('scheduled','soon','emergency')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','quoted','accepted','paid','in_progress','completed','cancelled')),
  direct_provider_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  declined_by uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_direct CHECK (direct_provider_id IS NULL OR direct_provider_id <> customer_id)
);

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_kobo int NOT NULL CHECK (price_kobo >= 100000),
  arrival_text text CHECK (char_length(arrival_text) <= 60),
  message text CHECK (char_length(message) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_quote_per_provider_per_request UNIQUE (request_id, provider_id)
);

-- bookings: paid/escrow/payment_ref ONLY via backend function (003 denies client writes).
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE RESTRICT,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  price_kobo int NOT NULL CHECK (price_kobo >= 100000),
  service_fee_kobo int NOT NULL CHECK (service_fee_kobo >= 0),
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','in_progress','completed','cancelled','disputed','refunded')),
  escrow_status text NOT NULL DEFAULT 'none' CHECK (escrow_status IN ('none','held','released','refunded','locked')),
  payment_ref text UNIQUE CHECK (payment_ref IS NULL OR char_length(payment_ref) <= 80),
  scheduled_for timestamptz, completed_at timestamptz, reviewed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_booking CHECK (customer_id <> provider_id),
  CONSTRAINT completed_needs_time CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

-- payment_transactions: gateway refs only. Verified ONLY by backend webhook.
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  gateway text NOT NULL DEFAULT 'paystack' CHECK (gateway IN ('paystack')),
  gateway_ref text UNIQUE CHECK (gateway_ref IS NULL OR char_length(gateway_ref) <= 120),
  amount_kobo int NOT NULL CHECK (amount_kobo > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','verified')),
  verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verified_needs_time CHECK (status <> 'verified' OR verified_at IS NOT NULL)
);

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (char_length(comment) <= 1000),
  recommend boolean, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_review CHECK (reviewer_id <> provider_id)
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('quote','booking','payment','review','verification','dispute','system')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  body text CHECK (char_length(body) <= 1000),
  link text CHECK (char_length(link) <= 300),
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 80),
  description text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('nin','cert','other')),
  doc_ref text CHECK (char_length(doc_ref) <= 120),
  file_path text CHECK (char_length(file_path) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_note text CHECK (char_length(reviewer_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- Limited public provider directory. Definer view: anon needs NO base-table SELECT.
-- Exposes ONLY avatar + business fields + metrics. Excludes email/phone/home_area/exact payout.
CREATE OR REPLACE VIEW public.public_providers WITH (security_invoker = false) AS
SELECT p.id AS provider_id, p.avatar_url,
  pp.business_name, pp.category, pp.bio, pp.service_area,
  pp.verification_status, pp.trust_score, pp.rating_avg, pp.jobs_done
FROM public.provider_profiles pp JOIN public.profiles p ON p.id = pp.profile_id
WHERE pp.verification_status = 'verified' AND p.role = 'provider';
-- Privacy-preserving public reviews: hides booking_id + reviewer_id.
-- Only rating/comment/recommend/day + provider_id for filtering. Base reviews table has NO anon access.
-- Exposes reviews ONLY for accounts that are BOTH verification_status='verified' AND profiles.role='provider',
-- so a role-downgraded-but-verified account cannot leak reviews publicly.
CREATE OR REPLACE VIEW public.public_reviews WITH (security_invoker = false) AS
SELECT r.provider_id, r.rating, r.comment, r.recommend,
  date_trunc('day', r.created_at)::date AS created_on
FROM public.reviews r
JOIN public.provider_profiles pp ON pp.profile_id = r.provider_id
JOIN public.profiles p ON p.id = r.provider_id
WHERE pp.verification_status = 'verified' AND p.role = 'provider';

CREATE INDEX IF NOT EXISTS idx_requests_customer ON public.service_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.service_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_request ON public.quotes(request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_provider ON public.quotes(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON public.bookings(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON public.bookings(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_services_provider ON public.provider_services(provider_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_services_category ON public.provider_services(category_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_provider ON public.reviews(provider_id);

