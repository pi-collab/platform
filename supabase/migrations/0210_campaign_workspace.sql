-- Migration 016: Campaign workspace — budget + campaign drafts (pre-send roster)

-- Add budget to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS budget_paise bigint;

-- Campaign drafts: pre-send roster entries (one per campaign+creator)
-- These are NOT deals — they hold intended placements + pricing for the setup phase.
-- Phase 2b converts drafts → real deals at send time.
CREATE TABLE campaign_drafts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id         uuid NOT NULL REFERENCES creators(id),

  -- Intended placements as JSONB array:
  -- [{label, platform, handle, price_paise, product_id?, reel_type?, boosting_rights?, boosting_duration_months?}]
  placements         jsonb NOT NULL DEFAULT '[]',

  -- Computed totals (denormalized from placements for rollup speed)
  total_price_paise  bigint NOT NULL DEFAULT 0,

  -- Fee snapshot (from brand's fee settings at draft creation — preview only,
  -- Phase 2b re-snapshots the CURRENT fee when converting draft → deal)
  fee_percent        numeric NOT NULL DEFAULT 0,
  fee_mode           text NOT NULL DEFAULT 'on_top' CHECK (fee_mode IN ('on_top', 'deducted')),
  total_brand_paise  bigint NOT NULL DEFAULT 0,

  note               text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- One draft per (campaign, creator)
  UNIQUE (campaign_id, creator_id)
);

CREATE INDEX idx_campaign_drafts_campaign ON campaign_drafts(campaign_id);
CREATE INDEX idx_campaign_drafts_creator ON campaign_drafts(creator_id);

-- Auto-touch updated_at
CREATE TRIGGER t_campaign_drafts_touch
  BEFORE UPDATE ON campaign_drafts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE campaign_drafts ENABLE ROW LEVEL SECURITY;

-- Brand reads drafts for their own campaigns
CREATE POLICY campaign_drafts_read ON campaign_drafts
  FOR SELECT TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE brand_id = my_brand_id()));

-- Brand inserts drafts into their own campaigns
CREATE POLICY campaign_drafts_insert ON campaign_drafts
  FOR INSERT TO authenticated
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE brand_id = my_brand_id()));

-- Brand updates drafts in their own campaigns
CREATE POLICY campaign_drafts_update ON campaign_drafts
  FOR UPDATE TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE brand_id = my_brand_id()));

-- Brand deletes drafts from their own campaigns (remove creator from roster)
CREATE POLICY campaign_drafts_delete ON campaign_drafts
  FOR DELETE TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE brand_id = my_brand_id()));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
