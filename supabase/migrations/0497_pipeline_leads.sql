-- Migration 0497: outreach pipeline (leads + notes)
--
-- The outreach team tracks who they have contacted, who replied, and who
-- signed up. Today that lives in a spreadsheet. This is the table behind the
-- /ops/pipeline board that replaces it.
--
-- ── Why a SEPARATE table and not columns on brands/creators ─────────────────
-- The obvious version is `stage`, `owner`, `source`, `notes` on the existing
-- rows. Three reasons it is the wrong shape:
--
--   1. A PROSPECT HAS NO ROW. The whole point is tracking a brand before they
--      sign up. Creating a placeholder in `brands`/`creators` to hold a stage
--      would put fake supply and fake demand into the tables that drive the
--      live product — a stub creator can surface in /browse, which is a lie
--      told to a paying brand for the sake of an internal spreadsheet.
--
--   2. `creators` HAS A COLUMN-LEVEL SELECT ALLOWLIST (0470, extended by 0489).
--      A column that is not in the grant makes ANY rls-scoped query naming it
--      fail outright with "permission denied for table creators" — not a null,
--      the whole query. That already caused a live routing bug once (see the
--      header of 0489). Four new columns is four fresh chances to repeat it.
--
--   3. SALES NOTES MUST NOT LIVE ON A CUSTOMER-READABLE ROW. "Flaky, went
--      quiet, asked for too much" belongs nowhere near a table creators and
--      brands read through RLS. Here it is behind a deny-all policy and can
--      only ever be reached by ops code holding the service key.
--
-- ── Linked, not merged ──────────────────────────────────────────────────────
-- When a lead signs up, `brand_id`/`creator_id` is filled in. The lead keeps
-- its own history; the real row stays the source of truth for everything the
-- product cares about. Deliberately NOT copied over: vetting status, storefront
-- state, deal counts. Those are derived live for the activation checklist —
-- a hand-set copy of a fact the database already owns is a fact that goes
-- stale silently and then misreports the funnel.

-- ── Stage vocabulary ────────────────────────────────────────────────────────
-- Only what a human knows and no machine can infer. Everything downstream of
-- signup (vetted, storefront live, bio link, first deal) is computed, so it
-- cannot drift from reality when someone forgets to drag a card.

CREATE TABLE IF NOT EXISTS pipeline_leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'brand' or 'creator'. One table, because the board, the filters, the notes
  -- and the funnel maths are identical for both; only the display columns differ.
  kind         text NOT NULL,

  -- What we know before they exist to us. `name` is the only required one:
  -- an outreach row with no name is not a lead, it is a blank card.
  name         text NOT NULL,
  handle       text,
  contact_email text,
  contact_phone text,
  platform     text,
  followers    bigint,
  niche        text,
  notes        text,

  stage        text NOT NULL DEFAULT 'contacted',
  -- Free text, not an FK to users: the owner is one of three teammates
  -- identified by email, and they are not necessarily platform users.
  owner_email  text,
  source       text,

  -- Filled in when the lead becomes real. Nullable forever — most leads never
  -- convert, and that is the normal case, not a missing value.
  brand_id     uuid REFERENCES brands (id)   ON DELETE SET NULL,
  creator_id   uuid REFERENCES creators (id) ON DELETE SET NULL,

  -- Set by the app on any edit. Powers "nobody has touched this in three
  -- weeks", which is the single most useful column in a sales spreadsheet.
  last_touch_at timestamptz NOT NULL DEFAULT now(),
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The DEFAULT above ('contacted') is a value these CHECKs accept. A CHECK whose
-- column default violates it passes its own migration and then fails every
-- future INSERT, because a migration never exercises the defaults it just
-- declared (see 0485/0491, and the note in 0494).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_leads_kind_chk') THEN
    ALTER TABLE pipeline_leads ADD CONSTRAINT pipeline_leads_kind_chk
      CHECK (kind IN ('brand', 'creator'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_leads_stage_chk') THEN
    ALTER TABLE pipeline_leads ADD CONSTRAINT pipeline_leads_stage_chk
      CHECK (stage IN ('contacted', 'replied', 'interested', 'signed_up', 'lost'));
  END IF;

  -- A lead links to at most one real row, and only of its own kind. Without
  -- this a creator lead could be pointed at a brand, which would make the
  -- activation checklist read the wrong table and quietly show nothing.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_leads_link_chk') THEN
    ALTER TABLE pipeline_leads ADD CONSTRAINT pipeline_leads_link_chk
      CHECK (
        (kind = 'brand'   AND creator_id IS NULL) OR
        (kind = 'creator' AND brand_id   IS NULL)
      );
  END IF;
END $$;

-- The board filters on kind+stage, and the funnel counts group by them.
CREATE INDEX IF NOT EXISTS pipeline_leads_kind_stage_idx ON pipeline_leads (kind, stage);
CREATE INDEX IF NOT EXISTS pipeline_leads_owner_idx      ON pipeline_leads (owner_email);
CREATE INDEX IF NOT EXISTS pipeline_leads_touch_idx      ON pipeline_leads (last_touch_at DESC);
-- Partial: most leads never convert, so the index only carries the ones that did.
CREATE INDEX IF NOT EXISTS pipeline_leads_brand_idx      ON pipeline_leads (brand_id)   WHERE brand_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS pipeline_leads_creator_idx    ON pipeline_leads (creator_id) WHERE creator_id IS NOT NULL;

COMMENT ON TABLE pipeline_leads IS
  'Outreach pipeline. Deliberately separate from brands/creators: prospects have no row there, `creators` has a column-level SELECT allowlist that makes added columns hazardous, and internal sales notes must not sit on a customer-readable table.';
COMMENT ON COLUMN pipeline_leads.stage IS
  'Human-owned outreach stage ONLY. Vetting, storefront and deal state are derived live from their own tables for the activation checklist — never copied here, because a hand-set copy goes stale and then misreports the funnel.';

-- ── Feedback / requests log ─────────────────────────────────────────────────
-- Objections and feature requests heard during outreach. Kept as its own table
-- rather than more `notes` text so it can be counted and filtered — "eleven
-- brands asked for X" is the output that makes it worth logging at all.

CREATE TABLE IF NOT EXISTS pipeline_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid REFERENCES pipeline_leads (id) ON DELETE CASCADE,
  -- Denormalised so feedback survives a deleted lead and can be logged
  -- against someone already signed up, who has no lead row at all.
  kind        text NOT NULL,
  source_name text,
  category    text NOT NULL DEFAULT 'other',
  body        text NOT NULL,
  status      text NOT NULL DEFAULT 'open',
  logged_by   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_feedback_kind_chk') THEN
    ALTER TABLE pipeline_feedback ADD CONSTRAINT pipeline_feedback_kind_chk
      CHECK (kind IN ('brand', 'creator'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_feedback_category_chk') THEN
    ALTER TABLE pipeline_feedback ADD CONSTRAINT pipeline_feedback_category_chk
      CHECK (category IN ('objection', 'feature_request', 'pricing', 'trust', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_feedback_status_chk') THEN
    ALTER TABLE pipeline_feedback ADD CONSTRAINT pipeline_feedback_status_chk
      CHECK (status IN ('open', 'planned', 'shipped', 'wont_do'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pipeline_feedback_status_idx   ON pipeline_feedback (status, category);
CREATE INDEX IF NOT EXISTS pipeline_feedback_lead_idx     ON pipeline_feedback (lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON TABLE pipeline_feedback IS
  'Objections and feature requests heard during outreach. Categorised rather than free text so it can be counted — the point is "N brands asked for this", not a diary.';

-- ── RLS: deny all, service role only ────────────────────────────────────────
-- Same posture as ops_events (0290). Every ops read already goes through
-- createAdminClient(), and nothing outside ops has any business here: these
-- tables hold internal commentary about named companies and people, including
-- ones who never became customers and never consented to a profile.
--
-- Policies are duplicated into supabase/rls.sql per CLAUDE.md — that file is
-- the single source of truth, and migration-only policies have already caused
-- orphaned duplicates in the live DB.

ALTER TABLE pipeline_leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_leads_deny_all    ON pipeline_leads;
DROP POLICY IF EXISTS pipeline_feedback_deny_all ON pipeline_feedback;

CREATE POLICY pipeline_leads_deny_all    ON pipeline_leads    FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY pipeline_feedback_deny_all ON pipeline_feedback FOR ALL USING (false) WITH CHECK (false);

-- No GRANTs to anon/authenticated. The service role bypasses RLS and is the
-- only intended reader.
