-- 037: Add settings-page profile fields to creators table.
-- Additive only — no columns altered or dropped.

ALTER TABLE creators ADD COLUMN IF NOT EXISTS location         text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS primary_platform text;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS contact_email    text;
