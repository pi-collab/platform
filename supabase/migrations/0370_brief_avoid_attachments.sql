-- 032: Add "what to avoid" and attachments to deal briefs
ALTER TABLE deals ADD COLUMN IF NOT EXISTS brief_avoid text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS brief_attachments jsonb DEFAULT '[]'::jsonb;
