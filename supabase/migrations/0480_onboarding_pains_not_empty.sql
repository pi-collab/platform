-- Migration 0480: an empty pain selection must be rejected
--
-- 0479 wrote:
--
--   CHECK (array_length(biggest_pains, 1) BETWEEN 1 AND 5 AND ...)
--
-- which accepts '{}'. array_length returns NULL for an empty array, NULL
-- BETWEEN 1 AND 5 is NULL, and a CHECK only fails on FALSE — so the one case
-- the bound existed to catch was the one it let through. Caught by testing the
-- constraint rather than reading it.
--
-- The server action already refuses an empty selection, so nothing has stored
-- one. This is the database saying it too, which is where it belongs: the
-- action is one caller, and ops writes to this table as well.

ALTER TABLE creator_onboarding_responses
  DROP CONSTRAINT IF EXISTS creator_onboarding_biggest_pains_chk;

ALTER TABLE creator_onboarding_responses
  ADD CONSTRAINT creator_onboarding_biggest_pains_chk
  CHECK (
    coalesce(array_length(biggest_pains, 1), 0) BETWEEN 1 AND 5
    AND biggest_pains <@ ARRAY['few_deals', 'slow_payments', 'chaotic_channels', 'no_record', 'other']::text[]
  );
