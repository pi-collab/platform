-- 018: Add brief fields to campaigns (pitch + creative guidelines)
-- Brand-editable; creators read via server action (no direct RLS read on campaigns).

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brief_pitch text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brief_guidelines text;
