-- Allow an under-18 age bracket.
--
-- 0515 started the brackets at 18 on the assumption that every creator is an
-- adult. They are not: there are child creators on the platform, usually run
-- by a parent. Leaving them unable to answer means they either pick a bracket
-- that is false or abandon signup, and both are worse than knowing.
--
-- New file rather than an edit to 0515: 0515 is already applied on staging,
-- and editing an applied migration makes the file and the database disagree.
-- Mirrors AGE_BRACKETS in apps/web/lib/creator-location.ts.

ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_age_bracket_check;
ALTER TABLE creators ADD CONSTRAINT creators_age_bracket_check
  CHECK (age_bracket IS NULL OR age_bracket IN ('under_18', '18_24', '25_34', '35_44', '45_plus'));

COMMENT ON COLUMN creators.age_bracket IS
  'Age bracket code (under_18, 18_24, 25_34, 35_44, 45_plus), never a date of birth. Mirrors AGE_BRACKETS in apps/web/lib/creator-location.ts.';
