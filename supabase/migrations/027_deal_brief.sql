-- 027: Add brief fields to deals for standalone (non-campaign) briefs
ALTER TABLE deals ADD COLUMN IF NOT EXISTS brief_pitch text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS brief_guidelines text;
