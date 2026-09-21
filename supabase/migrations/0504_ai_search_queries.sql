-- Migration 0504: what brands asked the AI creator search, and what it understood
--
-- One table doing three jobs on purpose, because they are the same row:
--   1. LOG      - every search, for ops to read and for ranking to learn from later.
--   2. CACHE    - the PARSE of a query (text -> filters) keyed by its normalised
--                 form, so the same question does not pay for a second LLM call
--                 within the window.
--   3. RATE CAP - the per-brand daily count is a count of these rows.
--
-- The cache stores the PARSE, never the results. A parse is a function of the
-- query text alone, so reusing one across brands tells nobody anything they did
-- not type themselves; results are always recomputed against live creator data
-- and the searching brand's own access.

CREATE TABLE IF NOT EXISTS ai_search_queries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  brand_id       uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  -- Who typed it. SET NULL rather than CASCADE: a teammate leaving must not
  -- delete the brand's search history.
  user_id        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- What they typed, and the normalised form the cache is keyed on (lowercased,
  -- collapsed whitespace). Both kept: the raw text is what ops should read.
  query_raw      text NOT NULL,
  query_norm     text NOT NULL,

  -- The structured filters the model produced. The shape is owned by
  -- lib/ai-search/types.ts, not by this table: it will grow, and a column per
  -- filter would mean a migration every time it does.
  filters        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The creators returned, best first. Ids only. This is what makes the later
  -- feedback loop possible: which suggestions a brand actually pitched.
  result_ids     jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_count   integer NOT NULL DEFAULT 0,

  -- What the call cost, so the bill is answerable from the data rather than
  -- guessed. Null on a cache hit, which is itself the signal the cache worked.
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  latency_ms     integer,
  cache_hit      boolean NOT NULL DEFAULT false,

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- The cache lookup: newest parse for a normalised query inside the window.
CREATE INDEX IF NOT EXISTS ai_search_queries_norm_idx
  ON ai_search_queries (query_norm, created_at DESC);

-- The rate cap: this brand's searches in the last day.
CREATE INDEX IF NOT EXISTS ai_search_queries_brand_idx
  ON ai_search_queries (brand_id, created_at DESC);

-- Ops reads the newest first.
CREATE INDEX IF NOT EXISTS ai_search_queries_created_idx
  ON ai_search_queries (created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Consolidated into supabase/rls.sql in the same commit, per the standing rule.

ALTER TABLE ai_search_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_search_select_own  ON ai_search_queries;
DROP POLICY IF EXISTS ai_search_deny_insert ON ai_search_queries;
DROP POLICY IF EXISTS ai_search_deny_update ON ai_search_queries;
DROP POLICY IF EXISTS ai_search_deny_delete ON ai_search_queries;

-- A brand's members see their own brand's searches and nobody else's. What one
-- brand is looking for is commercially theirs. Ops reads via the service role.
CREATE POLICY ai_search_select_own
  ON ai_search_queries FOR SELECT
  USING (brand_id = my_brand_id());

-- Writes are service-role only: the row records what the server did, including
-- the token counts the rate cap depends on, so a client must not be able to
-- write one (or to write a cheap-looking row to reset its own cap).
CREATE POLICY ai_search_deny_insert
  ON ai_search_queries FOR INSERT
  WITH CHECK (false);

CREATE POLICY ai_search_deny_update
  ON ai_search_queries FOR UPDATE
  USING (false);

CREATE POLICY ai_search_deny_delete
  ON ai_search_queries FOR DELETE
  USING (false);

COMMENT ON TABLE ai_search_queries IS
  'AI creator search: one row per search. Log, parse cache (keyed on query_norm) and per-brand rate cap in one. Service-role writes only; a brand reads its own rows.';
