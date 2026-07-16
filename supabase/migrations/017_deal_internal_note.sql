-- 017: Add internal_note to deals (brand-only, never shown to creator)
-- Used in campaign roster for per-creator notes that persist after send.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS internal_note text;
