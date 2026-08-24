-- Migration 0479: the first question becomes multi-select
--
-- "What's your biggest pain with brand deals right now?" was one choice. In
-- practice the answers are not exclusive — late payment and chaotic channels
-- are the same person's week — and forcing a single pick throws away the shape
-- of the problem we are asking about.
--
-- RENAMED, not just retyped. A column called biggest_pain holding an array
-- reads as a single value to everyone who meets it later; the plural is the
-- only warning that a query returning one row can still mean four answers.

ALTER TABLE creator_onboarding_responses
  DROP CONSTRAINT IF EXISTS creator_onboarding_biggest_pain_chk;

ALTER TABLE creator_onboarding_responses
  ALTER COLUMN biggest_pain TYPE text[]
  USING (CASE WHEN biggest_pain IS NULL THEN NULL ELSE ARRAY[biggest_pain] END);

ALTER TABLE creator_onboarding_responses
  RENAME COLUMN biggest_pain TO biggest_pains;

-- At least one, no more than the five options, and every element a known code.
-- The containment check is what keeps the aggregate trustworthy: without it a
-- typo in one deploy silently becomes its own bucket.
ALTER TABLE creator_onboarding_responses
  DROP CONSTRAINT IF EXISTS creator_onboarding_biggest_pains_chk;
ALTER TABLE creator_onboarding_responses
  ADD CONSTRAINT creator_onboarding_biggest_pains_chk
  CHECK (
    array_length(biggest_pains, 1) BETWEEN 1 AND 5
    AND biggest_pains <@ ARRAY['few_deals', 'slow_payments', 'chaotic_channels', 'no_record', 'other']::text[]
  );

-- pain_other still belongs to the 'other' code, which is now one element of a
-- set rather than the whole answer.
COMMENT ON COLUMN creator_onboarding_responses.biggest_pains IS
  'One or more pain codes. Multi-select — percentages computed from this sum to more than 100% of respondents, and should be labelled as such.';
COMMENT ON COLUMN creator_onboarding_responses.pain_other IS
  'Free text, meaningful only when biggest_pains contains ''other''.';
