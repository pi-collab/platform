-- Where a creator is, and roughly how old.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- creators.location is free text that settings offered and nothing else asked
-- for. It was empty on every staging row checked. A brand cannot filter a
-- roster by a place nobody recorded, and AI search reports "no city on file"
-- against nearly everyone.
--
-- ── What this adds ──────────────────────────────────────────────────────────
-- city        typed by the creator, tidied (lib/creator-location.ts cleanCity)
-- state       one of INDIAN_STATES in lib/creator-location.ts, checked in the app
-- age_bracket a bracket, NOT a date of birth. A brand needs "is this creator in
--             my audience's age range"; a birthday is personal data we would
--             have to protect for no extra use.
--
-- location is KEPT and the app writes "City, State" into it on every save, so
-- AI search and the Growth pool filter, which read it, keep working unchanged.
--
-- All nullable, no backfill: every existing creator genuinely has not told us,
-- and the dashboard asks them. A CHECK on a nullable column passes the NULL an
-- INSERT gets by default, so signup's creator insert is unaffected.

ALTER TABLE creators ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS age_bracket text;

ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_age_bracket_check;
ALTER TABLE creators ADD CONSTRAINT creators_age_bracket_check
  CHECK (age_bracket IS NULL OR age_bracket IN ('18_24', '25_34', '35_44', '45_plus'));

COMMENT ON COLUMN creators.city IS
  'Creator''s city, self-reported. Set with state and age_bracket at signup or from the dashboard prompt.';
COMMENT ON COLUMN creators.state IS
  'Indian state or UT, from INDIAN_STATES in apps/web/lib/creator-location.ts.';
COMMENT ON COLUMN creators.age_bracket IS
  'Age bracket code (18_24, 25_34, 35_44, 45_plus), never a date of birth. Mirrors AGE_BRACKETS in apps/web/lib/creator-location.ts.';

NOTIFY pgrst, 'reload schema';
