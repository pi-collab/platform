-- Invoice workflow: one invoice per deal, workflow record (not GST-compliant).
-- Amounts snapshotted at generation. Status: draft → issued → accepted → paid.

CREATE TABLE IF NOT EXISTS invoices (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                   uuid NOT NULL UNIQUE REFERENCES deals (id) ON DELETE CASCADE,
  status                    text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'issued', 'accepted', 'paid', 'overdue')),

  -- Snapshotted amounts (paise, frozen at generation)
  base_paise                bigint NOT NULL,
  overage_paise             bigint NOT NULL DEFAULT 0,
  fee_paise                 bigint NOT NULL DEFAULT 0,
  fee_percent               numeric NOT NULL DEFAULT 0,
  fee_mode                  text NOT NULL DEFAULT 'on_top' CHECK (fee_mode IN ('on_top', 'deducted')),
  brand_pays_paise          bigint NOT NULL,
  creator_receives_paise    bigint NOT NULL,

  -- Payment terms + due date
  payment_terms             text,
  payment_due_days          int,
  due_date                  date,

  -- Timestamps
  issued_at                 timestamptz,
  accepted_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON invoices (deal_id);
CREATE INDEX ON invoices (status);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Both parties read their deal's invoice
CREATE POLICY invoices_read ON invoices FOR SELECT
  USING (can_access_deal(deal_id));

-- Creator inserts (lazy-create when deal is approved) and updates (draft → issued)
CREATE POLICY invoices_insert_creator ON invoices FOR INSERT
  WITH CHECK (deal_id IN (SELECT id FROM deals WHERE creator_id = my_creator_id()));

CREATE POLICY invoices_update_creator ON invoices FOR UPDATE
  USING (deal_id IN (SELECT id FROM deals WHERE creator_id = my_creator_id()));

-- Brand updates (issued → accepted)
CREATE POLICY invoices_update_brand ON invoices FOR UPDATE
  USING (deal_id IN (SELECT id FROM deals WHERE brand_id = my_brand_id()));
