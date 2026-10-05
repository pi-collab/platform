-- Phase 3, stage 1: the Guapd house accounts, the brand's request, quote
-- history, and the brand name a creator sees on their leg. RUN BY HAND, in the
-- pieces given. Verify with docs/test-cases.md §98.

-- ── 1. The Guapd house accounts ─────────────────────────────────────────────
-- Leg 1 is Kiro → the house CREATOR; leg 2 is the house BRAND → a real creator
-- (0523). One of each, enforced by brands_one_guapd / creators_one_guapd.
-- Hidden from every list: the house creator is never bookable (vetting_status
-- stays 'pending', so is_bookable and is_vetted are false and browse, the Growth
-- pool and AI search cannot return it), and app code filters is_guapd = false
-- on browse, AI search and the ops lists as well. No user row, no login.
INSERT INTO brands (name, brand_status, is_guapd, contact_email)
  SELECT 'Guapd', 'approved', true, 'contact@guapd.com'
  WHERE NOT EXISTS (SELECT 1 FROM brands WHERE is_guapd);
INSERT INTO creators (full_name, vetting_status, is_guapd)
  SELECT 'Guapd', 'pending', true
  WHERE NOT EXISTS (SELECT 1 FROM creators WHERE is_guapd);

-- ── 2. What the brand asked for (the request, before any quote) ─────────────
-- shoot_date / shoot_city stay the FINAL agreed values; these are the ask.
ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS request_deliverables     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS request_affiliate        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_ad_rights        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_ad_rights_months int,
  ADD COLUMN IF NOT EXISTS request_boost            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_boost_months     int,
  ADD COLUMN IF NOT EXISTS request_location         text,
  ADD COLUMN IF NOT EXISTS request_date_from        date,
  ADD COLUMN IF NOT EXISTS request_date_to          date,
  ADD COLUMN IF NOT EXISTS request_brief            text,
  ADD COLUMN IF NOT EXISTS request_channel          text,
  ADD COLUMN IF NOT EXISTS requested_at             timestamptz;
ALTER TABLE experiences DROP CONSTRAINT IF EXISTS experiences_request_shape;
ALTER TABLE experiences ADD CONSTRAINT experiences_request_shape CHECK (
  jsonb_typeof(request_deliverables) = 'array'
  AND (request_channel IS NULL OR request_channel IN ('portal', 'whatsapp', 'email', 'call', 'in_person'))
  AND (request_date_to IS NULL OR request_date_from IS NULL OR request_date_to >= request_date_from)
  AND (request_ad_rights_months IS NULL OR (request_ad_rights AND request_ad_rights_months > 0))
  AND (request_boost_months IS NULL OR (request_boost AND request_boost_months > 0))
);
-- The brand may read its own request back (it is what they asked for).
GRANT SELECT (request_deliverables, request_affiliate, request_ad_rights, request_ad_rights_months,
              request_boost, request_boost_months, request_location, request_date_from, request_date_to,
              request_brief, request_channel, requested_at)
  ON experiences TO authenticated;

-- ── 3. Quote history (each round of the brand negotiation) ──────────────────
-- Guapd quotes, the brand counters, Guapd re-quotes … one row per round. The
-- brand sees its own Experience's quotes: they are prices TO the brand, never
-- creator rates or costs. Writes are server-only. Until the brand screens exist
-- (Phase 6), ops records a brand counter or acceptance with the channel it came
-- through.
CREATE TABLE IF NOT EXISTS experience_quotes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id     uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  version           int  NOT NULL CHECK (version > 0),
  proposed_by       text NOT NULL CHECK (proposed_by IN ('guapd', 'brand')),
  per_video_paise   bigint NOT NULL CHECK (per_video_paise >= 0),
  deliverable_count int    NOT NULL CHECK (deliverable_count >= 0),
  misc_paise        bigint NOT NULL DEFAULT 0 CHECK (misc_paise >= 0),
  total_paise       bigint NOT NULL,
  deliverables      jsonb  NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(deliverables) = 'array'),
  shoot_date        date,
  shoot_city        text,
  message           text,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'superseded', 'accepted', 'rejected', 'withdrawn')),
  recorded_channel  text CHECK (recorded_channel IS NULL OR recorded_channel IN ('portal', 'whatsapp', 'email', 'call', 'in_person')),
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,
  decided_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT eq_total_formula CHECK (total_paise = per_video_paise * deliverable_count + misc_paise),
  CONSTRAINT eq_version_unique UNIQUE (experience_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS eq_one_open     ON experience_quotes (experience_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS eq_one_accepted ON experience_quotes (experience_id) WHERE status = 'accepted';
ALTER TABLE experience_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_quotes FROM anon, authenticated;
GRANT SELECT (id, experience_id, version, proposed_by, per_video_paise, deliverable_count, misc_paise,
              total_paise, deliverables, shoot_date, shoot_city, message, status, created_at, decided_at)
  ON experience_quotes TO authenticated;
DROP POLICY IF EXISTS experience_quotes_read_brand ON experience_quotes;
CREATE POLICY experience_quotes_read_brand ON experience_quotes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM experiences e WHERE e.id = experience_quotes.experience_id
                 AND e.brand_id = my_brand_id() AND e.brand_id IS DISTINCT FROM guapd_brand_id()));

-- ── 4. The brand name a creator sees on their own leg ───────────────────────
-- A leg-2 deal's brand is the Guapd house brand, and the creator cannot read
-- experiences. This one display name ("Kiro") is copied onto the creator's own
-- deal so their screens can say "Kiro · Managed by Guapd". Name only: never a
-- price or any brand-leg term. Written by the server; the deal write guard
-- (0520) does not allow either party to set it.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS experience_brand_name text;
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_experience_brand_name_leg;
ALTER TABLE deals ADD CONSTRAINT deals_experience_brand_name_leg
  CHECK (experience_brand_name IS NULL OR leg_role = 'creator_leg');
