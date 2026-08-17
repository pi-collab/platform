-- Migration 003: Convert single niche text → niches text[] array
-- Old `niche` column kept as safety net. CLEANUP TODO: DROP COLUMN niche once confirmed.

-- 1. Add niches array column
ALTER TABLE creators ADD COLUMN niches text[] NOT NULL DEFAULT '{}';

-- 2. Migrate + normalize existing values to exact shared-constant strings
UPDATE creators SET niches = ARRAY['Finance']        WHERE niche = 'finance';
UPDATE creators SET niches = ARRAY['Fintech']        WHERE niche = 'fintech';
UPDATE creators SET niches = ARRAY['Lifestyle']      WHERE niche = 'lifestyle';
UPDATE creators SET niches = ARRAY['Tech / Gadgets'] WHERE niche = 'tech';
-- null niche stays as empty array '{}' (Utkarsh — set via form after)
