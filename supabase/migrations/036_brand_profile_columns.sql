-- 036: Add profile fields to brands table + user preferences for settings page.
-- Additive only — no columns altered or dropped.

ALTER TABLE brands ADD COLUMN IF NOT EXISTS bio      text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url text;

-- User-level preferences (language, timezone, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
