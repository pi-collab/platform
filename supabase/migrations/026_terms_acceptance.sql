-- Track terms acceptance: version + timestamp.
-- terms_version is date-based (e.g. '2026-07-23').
-- Written at signup; can be updated when the user re-accepts after a terms change.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text;
