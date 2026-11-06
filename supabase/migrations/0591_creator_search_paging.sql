-- 0591: "Load more" on Guapd AI search, with a stable order.
--
-- ranked_ids: the full ranked order of a search (at most 500 creators),
-- written when the brief runs or a chip edit re-runs it, and only then. Load
-- more reads the next 20 from it, so a creator can never appear twice and the
-- order never shifts under the brand. result_ids keeps meaning "shown to the
-- brand" (it grows as pages load) and still feeds "Your visibility".
-- shown_count: how many of ranked_ids have been shown. Server only, as 0585.
ALTER TABLE brand_creator_searches ADD COLUMN IF NOT EXISTS ranked_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE brand_creator_searches ADD COLUMN IF NOT EXISTS shown_count integer NOT NULL DEFAULT 0 CHECK (shown_count >= 0);
ALTER TABLE brand_creator_searches DROP CONSTRAINT IF EXISTS bcs_ranked_ids_cap;
ALTER TABLE brand_creator_searches ADD CONSTRAINT bcs_ranked_ids_cap CHECK (coalesce(array_length(ranked_ids, 1), 0) <= 500);
