-- Add brief_avoid and brief_attachments to campaigns table (matching deals table)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brief_avoid text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brief_attachments jsonb DEFAULT '[]'::jsonb;
