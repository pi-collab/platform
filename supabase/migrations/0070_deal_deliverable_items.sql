-- Migration: Structured deliverable items per deal
-- Each deal's deliverables become discrete tracked items (one row per unit).

CREATE TABLE deal_deliverable_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  label         text NOT NULL,           -- e.g. "Sponsored Reel"
  platform      text NOT NULL,           -- e.g. "instagram"
  handle        text NOT NULL,           -- e.g. "@aaravmoney"
  price_paise   bigint,                  -- per-item price snapshot at offer time
  item_status   text NOT NULL DEFAULT 'pending'
                CHECK (item_status IN ('pending','submitted','revision','approved')),
  external_url  text,                    -- null until creator submits a link
  version       int NOT NULL DEFAULT 1,  -- increments on revision resubmit
  submitted_at  timestamptz,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON deal_deliverable_items (deal_id);

ALTER TABLE deal_deliverable_items ENABLE ROW LEVEL SECURITY;

-- Both parties read their deal's items
CREATE POLICY deal_deliverable_items_read
  ON deal_deliverable_items FOR SELECT
  USING (can_access_deal(deal_id));

-- Creator updates items (submit links, resubmit after revision)
CREATE POLICY deal_deliverable_items_update_creator
  ON deal_deliverable_items FOR UPDATE
  USING (deal_id IN (SELECT id FROM deals WHERE creator_id = my_creator_id()));

-- Brand updates items (approve, request revision)
CREATE POLICY deal_deliverable_items_update_brand
  ON deal_deliverable_items FOR UPDATE
  USING (deal_id IN (SELECT id FROM deals WHERE brand_id = my_brand_id()));

-- Insert: brand-only (items created at offer time)
CREATE POLICY deal_deliverable_items_insert_brand
  ON deal_deliverable_items FOR INSERT
  WITH CHECK (deal_id IN (SELECT id FROM deals WHERE brand_id = my_brand_id()));
