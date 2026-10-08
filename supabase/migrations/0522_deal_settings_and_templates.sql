-- Deal settings + deal templates (Experiences, Phase 1 of 3 migrations).
-- RUN BY HAND. Verify with the information_schema checks in docs/test-cases.md §93.
--
-- A deal is a container of configurable SETTINGS, not a hardcoded type. A
-- template is a named bundle of them; creating a deal from a template SNAPSHOTS
-- the settings onto the deal, so editing a template never mutates a live deal.
--
-- Every enum value is allowed by the schema now, including ones not exposed
-- yet (per_post, boost_rights, …), so a future variant is a config change.
-- route_split is the exception: it is BLOCKED by its own CHECK until Razorpay
-- Route is confirmed, so it cannot be stored even by the service role.
--
-- Existing deals: payment_flow backfills to 'brand_pays_creator_direct' (what
-- they are). The other settings stay NULL, meaning "the existing behaviour",
-- so no current deal changes meaning.

-- ── deal_templates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deal_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  scope       text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'brand')),
  brand_id    uuid REFERENCES brands (id) ON DELETE CASCADE,
  version     int  NOT NULL DEFAULT 1 CHECK (version >= 1),
  settings    jsonb NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  text NOT NULL DEFAULT 'guapd',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_templates_scope_brand CHECK ((scope = 'brand') = (brand_id IS NOT NULL))
);

COMMENT ON TABLE deal_templates IS
  'Named bundles of deal settings. Snapshotted onto deals at creation (deals.settings_snapshot); '
  'edit = bump version, never mutate live deals. Ops-only (service role). Validated in apps/web/lib/deal-settings.ts.';

-- No user access. Supabase grants ALL on new tables to anon/authenticated by
-- default (see 0498), so revoke explicitly; RLS with no policies backs it up.
ALTER TABLE deal_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON deal_templates FROM anon, authenticated;

-- The Kiro template: "Experience — UGC Day Shoot".
INSERT INTO deal_templates (slug, name, scope, version, settings, created_by)
VALUES (
  'experience-ugc-day-shoot',
  'Experience — UGC Day Shoot',
  'global',
  1,
  jsonb_build_object(
    'kind',                 'experience',
    'completion_trigger',   'on_shoot_done',
    'deliverables_owner',   'guapd',
    'pricing_basis',        'per_deliverable',
    'payment_flow',         'guapd_principal_vendor_payout',
    'platform_pct',         30,
    'default_unit_price_paise', 350000,
    'follow_on', jsonb_build_object(
      'type', 'affiliate', 'trigger', 'sales_final', 'basis', 'pct_of_sales', 'invoicer', 'creator'
    ),
    'cost_line_categories', jsonb_build_array(
      'per_video', 'day_rate', 'retainer', 'travel', 'food', 'editing',
      'photography', 'styling', 'makeup', 'misc'
    )
  ),
  'guapd'
)
ON CONFLICT (slug) DO NOTHING;

-- ── Settings on deals ───────────────────────────────────────────────────────
ALTER TABLE deals ADD COLUMN IF NOT EXISTS template_id       uuid REFERENCES deal_templates (id);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS template_version  int;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS completion_trigger text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS deliverables_owner text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pricing_basis      text;
-- NOT NULL with a DEFAULT: existing rows backfill to the default, and an
-- insert naming none of these (every current createDeal) gets the default,
-- which satisfies both CHECKs below (the 0485 constraint-vs-defaults trap).
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_flow text NOT NULL DEFAULT 'brand_pays_creator_direct';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS follow_on          jsonb;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS settings_snapshot  jsonb;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_completion_trigger_check;
ALTER TABLE deals ADD CONSTRAINT deals_completion_trigger_check
  CHECK (completion_trigger IS NULL OR completion_trigger IN ('on_shoot_done', 'on_content_posted', 'on_delivery_accepted'));

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_deliverables_owner_check;
ALTER TABLE deals ADD CONSTRAINT deals_deliverables_owner_check
  CHECK (deliverables_owner IS NULL OR deliverables_owner IN ('guapd', 'creator', 'brand'));

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_pricing_basis_check;
ALTER TABLE deals ADD CONSTRAINT deals_pricing_basis_check
  CHECK (pricing_basis IS NULL OR pricing_basis IN ('per_deliverable', 'per_day', 'per_post', 'package'));

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_payment_flow_check;
ALTER TABLE deals ADD CONSTRAINT deals_payment_flow_check
  CHECK (payment_flow IN ('guapd_principal_vendor_payout', 'brand_pays_creator_direct', 'route_split'));

-- Route split: pooling a brand's money and splitting it to creators is
-- payment-aggregator activity. Disabled until Razorpay Route is approved.
-- Lifting it is a deliberate migration, never an app change.
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_payment_flow_route_split_disabled;
ALTER TABLE deals ADD CONSTRAINT deals_payment_flow_route_split_disabled
  CHECK (payment_flow <> 'route_split');

COMMENT ON COLUMN deals.payment_flow IS
  'guapd_principal_vendor_payout (Experiences: brand pays Guapd, Guapd pays vendors) | '
  'brand_pays_creator_direct (every pre-Experience deal) | route_split (DISABLED by CHECK).';
COMMENT ON COLUMN deals.settings_snapshot IS
  'Template settings frozen onto this deal at creation. Later template edits never change it.';

-- ── Per-item visibility and authorship ──────────────────────────────────────
ALTER TABLE deal_deliverable_items ADD COLUMN IF NOT EXISTS visible_to_creator boolean NOT NULL DEFAULT true;
ALTER TABLE deal_deliverable_items ADD COLUMN IF NOT EXISTS added_by text NOT NULL DEFAULT 'brand';
ALTER TABLE deal_deliverable_items DROP CONSTRAINT IF EXISTS ddi_added_by_check;
ALTER TABLE deal_deliverable_items ADD CONSTRAINT ddi_added_by_check
  CHECK (added_by IN ('brand', 'creator', 'guapd'));

COMMENT ON COLUMN deal_deliverable_items.visible_to_creator IS
  'False hides the item from the creator at the database (read policy). Default true: unchanged for every existing item.';

-- The creator stops seeing items marked hidden; the brand still sees all of
-- its own. Default true keeps every existing deal exactly as it was.
DROP POLICY IF EXISTS deal_deliverable_items_read ON deal_deliverable_items;
CREATE POLICY deal_deliverable_items_read
  ON deal_deliverable_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_id
        AND (d.brand_id = my_brand_id()
             OR (d.creator_id = my_creator_id() AND visible_to_creator))
    )
  );
