-- Campaigns: grouping container for multiple deals
CREATE TABLE campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES brands(id),
  name        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'completed', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaigns_brand ON campaigns(brand_id);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Brand reads own campaigns
CREATE POLICY campaigns_read_brand ON campaigns
  FOR SELECT TO authenticated
  USING (brand_id = my_brand_id());

-- Brand inserts own campaigns
CREATE POLICY campaigns_insert_brand ON campaigns
  FOR INSERT TO authenticated
  WITH CHECK (brand_id = my_brand_id());

-- Brand updates own campaigns
CREATE POLICY campaigns_update_brand ON campaigns
  FOR UPDATE TO authenticated
  USING (brand_id = my_brand_id())
  WITH CHECK (brand_id = my_brand_id());

-- Add campaign_id to deals (nullable FK — standalone deals have NULL)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id);

CREATE INDEX idx_deals_campaign ON deals(campaign_id) WHERE campaign_id IS NOT NULL;
