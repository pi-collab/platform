-- Migration 0495: keep the history, not just the latest reading
--
-- ig_insights (0494) holds the most recent numbers and is overwritten on every
-- refresh. That is enough to say what a post has done; it cannot say how it got
-- there, and "reach climbed for four days then flattened" is the thing a brand
-- is actually trying to learn when they look at a chart.
--
-- ── An array on the item, not a table ───────────────────────────────────────
-- The refresh cadence is daily for a fortnight, weekly to thirty days, then
-- stopped: about eighteen readings per post, forever. A separate table would be
-- the right shape for millions of rows and is not worth its RLS policies and
-- joins for eighteen. The cap in the app keeps it that size.
--
-- ── What a point MEANS ──────────────────────────────────────────────────────
-- Instagram returns per-post insights as running totals, not per-day figures.
-- So each entry is the cumulative value at that moment, and the chart is a
-- growth curve. It is deliberately NOT differenced into daily numbers: the
-- readings are irregular by design (daily, then weekly), so a delta between two
-- of them would be a day for some pairs and a week for others while looking
-- like the same unit.

ALTER TABLE deal_deliverable_items
  ADD COLUMN IF NOT EXISTS ig_insight_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN deal_deliverable_items.ig_insight_history IS
  'Append-only readings: [{ at, views, reach, likes, comments, saved, shares, totalInteractions }]. CUMULATIVE totals as Instagram reports them, one entry per refresh, capped in the app. Never differenced into per-day values: the refresh interval changes from daily to weekly, so deltas would not share a unit.';
