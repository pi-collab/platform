-- Experiences money tables (Phase 1 of 3 migrations). Schema only: no Razorpay.
-- RUN BY HAND after 0523. Verify with docs/test-cases.md §93.
--
-- The only money flows modelled are:
--   brand → Guapd   service_invoices   (Guapd bills the brand for a production service)
--   Guapd → vendor  vendor_payouts     (Guapd pays a creator/crew from its own funds)
-- Nothing here represents a brand paying a creator, or Guapd splitting a brand's
-- money. Brand bank details are never stored (not a column anywhere).
--
-- Access, by table:
--   experience_cost_lines   ops only
--   vendors                 ops only
--   vendor_payout_details   ops only (bank/UPI/PAN; off the creators table)
--   creator_private         ops only (PAN, day rate; the creator edits via server actions)
--   service_invoices        brand reads its own (granted columns); writes ops only
--   vendor_payouts          creator reads payouts to themselves (granted columns); writes ops only
--   deal_follow_ons         creator reads their own (granted columns); writes ops only
-- Every server action touching these uses explicit column lists (the service
-- role bypasses column grants).

-- ── experience_cost_lines (the cost sheet) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS experience_cost_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id         uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  creator_leg_deal_id   uuid REFERENCES deals (id) ON DELETE SET NULL,
  label                 text NOT NULL,
  -- Free text, so a new cost type needs no schema change. Suggested values live
  -- in the template (cost_line_categories): per_video, day_rate, retainer,
  -- travel, food, editing, photography, styling, makeup, misc.
  category              text NOT NULL DEFAULT 'misc',
  basis                 text NOT NULL CHECK (basis IN ('per_unit', 'flat_total')),
  quantity              numeric(10,2),
  unit_rate_paise       bigint,
  total_paise           bigint NOT NULL CHECK (total_paise >= 0),
  provided_by           text NOT NULL CHECK (provided_by IN ('guapd', 'brand', 'creator')),
  billable_to_brand     boolean NOT NULL DEFAULT false,
  payable_to_vendor_id  uuid,
  billed_on_invoice_id  uuid,
  note                  text,
  created_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- per_unit carries qty × rate and the stored total must equal it (rounded to
  -- the paisa); flat_total carries neither.
  CONSTRAINT ecl_basis_shape CHECK (
    (basis = 'per_unit' AND quantity IS NOT NULL AND quantity > 0 AND unit_rate_paise IS NOT NULL AND unit_rate_paise >= 0
       AND total_paise = round(quantity * unit_rate_paise))
    OR (basis = 'flat_total' AND quantity IS NULL AND unit_rate_paise IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS ecl_experience_idx ON experience_cost_lines (experience_id);
COMMENT ON TABLE experience_cost_lines IS
  'The Experience cost sheet. Brand service total = sum of billable_to_brand lines (computed in app). '
  'Brands never see lines; their invoice shows one service price. Ops only.';
ALTER TABLE experience_cost_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_cost_lines FROM anon, authenticated;

-- ── vendors + payout details ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('creator', 'crew', 'agency')),
  creator_id    uuid UNIQUE REFERENCES creators (id),
  display_name  text NOT NULL,
  phone         text,
  email         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendors_creator_kind CHECK ((kind = 'creator') = (creator_id IS NOT NULL))
);
COMMENT ON TABLE vendors IS
  'People and firms Guapd pays as the principal: creators (linked to their creators row) and crew. Ops only.';
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendors FROM anon, authenticated;

ALTER TABLE experience_cost_lines DROP CONSTRAINT IF EXISTS ecl_vendor_fk;
ALTER TABLE experience_cost_lines ADD CONSTRAINT ecl_vendor_fk
  FOREIGN KEY (payable_to_vendor_id) REFERENCES vendors (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS vendor_payout_details (
  vendor_id                 uuid PRIMARY KEY REFERENCES vendors (id) ON DELETE CASCADE,
  upi_vpa                   text,
  bank_account_number       text,
  ifsc                      text,
  account_holder_name       text,
  pan                       text,
  gst_registered            boolean,
  razorpay_contact_id       text,
  razorpay_fund_account_id  text,
  kyc_status                text CHECK (kyc_status IS NULL OR kyc_status IN ('pending', 'verified', 'rejected')),
  verified_at               timestamptz,
  updated_at                timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE vendor_payout_details IS
  'Where Guapd pays a vendor. Service role only; never on the creators table, so no creators query can leak it. '
  'Bank/PAN/GST/KYC are filled in the RazorpayX phase; today creators.upi_id is the only payout detail collected.';
ALTER TABLE vendor_payout_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendor_payout_details FROM anon, authenticated;

-- ── creator_private ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_private (
  creator_id            uuid PRIMARY KEY REFERENCES creators (id) ON DELETE CASCADE,
  pan                   text,
  shoot_day_rate_paise  bigint CHECK (shoot_day_rate_paise IS NULL OR shoot_day_rate_paise >= 0),
  shoot_day_rate_note   text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE creator_private IS
  'Creator data no brand may ever read: PAN, the per-day shoot rate (a minimum, counter-able) and its note. '
  'Service role only; the creator edits it through server actions. No date of birth (age bracket lives on creators).';
ALTER TABLE creator_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON creator_private FROM anon, authenticated;

-- ── service_invoices (Guapd → brand) ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS service_invoice_seq START 1;

CREATE TABLE IF NOT EXISTS service_invoices (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id               uuid NOT NULL REFERENCES experiences (id),
  brand_id                    uuid NOT NULL REFERENCES brands (id),
  kind                        text NOT NULL CHECK (kind IN ('initial', 'additional', 'follow_on')),
  number                      text UNIQUE,
  status                      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'void')),
  issue_date                  date,
  due_date                    date,
  -- Brand-facing lines only (the service price), snapshotted at issue.
  lines                       jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_paise              bigint NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
  -- GST/TDS present but NOT computed in v1: entered/edited by ops (provisional).
  gst_rate_pct                numeric(5,2),
  cgst_paise                  bigint,
  sgst_paise                  bigint,
  igst_paise                  bigint,
  tds_paise                   bigint,
  total_paise                 bigint NOT NULL DEFAULT 0 CHECK (total_paise >= 0),
  supplier_gstin              text,
  supplier_gstin_provisional  boolean NOT NULL DEFAULT true,
  supplier_arn                text,
  recipient_legal_name        text,
  recipient_gstin             text,
  recipient_state             text,
  place_of_supply             text,
  payment_reference           text,
  paid_at                     timestamptz,
  recorded_by                 uuid REFERENCES users (id) ON DELETE SET NULL,
  created_by                  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT si_paid_has_reference CHECK (status <> 'paid' OR (payment_reference IS NOT NULL AND paid_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS si_experience_idx ON service_invoices (experience_id);
CREATE INDEX IF NOT EXISTS si_brand_idx ON service_invoices (brand_id);

-- Number assigned on insert: GUAPD/<FY>/<seq>, FY in IST (April–March).
CREATE OR REPLACE FUNCTION assign_service_invoice_number()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  y  int  := extract(year FROM d)::int;
  fy text;
BEGIN
  IF NEW.number IS NULL THEN
    IF extract(month FROM d) < 4 THEN y := y - 1; END IF;
    fy := lpad((y % 100)::text, 2, '0') || '-' || lpad(((y + 1) % 100)::text, 2, '0');
    NEW.number := 'GUAPD/' || fy || '/' || lpad(nextval('service_invoice_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_service_invoice_number ON service_invoices;
CREATE TRIGGER t_service_invoice_number
  BEFORE INSERT ON service_invoices
  FOR EACH ROW EXECUTE FUNCTION assign_service_invoice_number();

ALTER TABLE experience_cost_lines DROP CONSTRAINT IF EXISTS ecl_invoice_fk;
ALTER TABLE experience_cost_lines ADD CONSTRAINT ecl_invoice_fk
  FOREIGN KEY (billed_on_invoice_id) REFERENCES service_invoices (id) ON DELETE SET NULL;

COMMENT ON TABLE service_invoices IS
  'Guapd bills the brand for a production service. Many per Experience (initial / additional / follow_on). '
  'Brand reads its own (granted columns: no internal fields exist here). Writes ops only. GST provisional until Guapd''s GSTIN.';
ALTER TABLE service_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_invoices FROM anon, authenticated;
GRANT SELECT (id, experience_id, brand_id, kind, number, status, issue_date, due_date, lines, subtotal_paise,
              gst_rate_pct, cgst_paise, sgst_paise, igst_paise, tds_paise, total_paise,
              supplier_gstin, supplier_gstin_provisional, supplier_arn,
              recipient_legal_name, recipient_gstin, recipient_state, place_of_supply,
              payment_reference, paid_at, created_at, updated_at)
  ON service_invoices TO authenticated;

-- ── vendor_payouts (Guapd → vendor) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_payouts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id     uuid NOT NULL REFERENCES experiences (id),
  deal_id           uuid REFERENCES deals (id),
  vendor_id         uuid NOT NULL REFERENCES vendors (id),
  cost_line_id      uuid REFERENCES experience_cost_lines (id) ON DELETE SET NULL,
  follow_on_id      uuid,
  reason            text NOT NULL,
  amount_paise      bigint NOT NULL CHECK (amount_paise > 0),
  tds_paise         bigint NOT NULL DEFAULT 0 CHECK (tds_paise >= 0),
  net_amount_paise  bigint NOT NULL CHECK (net_amount_paise >= 0),
  status            text NOT NULL DEFAULT 'requested' CHECK (status IN (
                      'requested', 'approved', 'processing', 'paid', 'failed', 'cancelled')),
  provider          text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'razorpayx')),
  idempotency_key   text NOT NULL UNIQUE,
  external_ref      text,
  failure_reason    text,
  approved_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_at       timestamptz,
  paid_at           timestamptz,
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vp_net CHECK (net_amount_paise = amount_paise - tds_paise),
  -- Paid means money moved: an approval came first, and a reference (UTR or
  -- the RazorpayX payout id) exists. Never "paid" on a click alone.
  CONSTRAINT vp_paid_has_ref CHECK (status <> 'paid' OR (external_ref IS NOT NULL AND paid_at IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS vp_experience_idx ON vendor_payouts (experience_id);
CREATE INDEX IF NOT EXISTS vp_vendor_idx ON vendor_payouts (vendor_id);
COMMENT ON TABLE vendor_payouts IS
  'Guapd paying a vendor from its own funds, behind PayoutProvider (manual now, razorpayx later). '
  'The creator reads payouts to themselves (granted columns). Writes ops only.';
ALTER TABLE vendor_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vendor_payouts FROM anon, authenticated;
GRANT SELECT (id, experience_id, deal_id, reason, amount_paise, tds_paise, net_amount_paise, status, external_ref, paid_at, created_at, updated_at)
  ON vendor_payouts TO authenticated;

-- ── deal_follow_ons (affiliate exposed in v1; others schema-only) ───────────
CREATE TABLE IF NOT EXISTS deal_follow_ons (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id             uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  deal_id                   uuid NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  creator_id                uuid NOT NULL REFERENCES creators (id),
  type                      text NOT NULL CHECK (type IN ('none', 'affiliate', 'boost_rights', 'revenue_share')),
  trigger                   text NOT NULL CHECK (trigger IN ('sales_final', 'campaign_end', 'on_agreement', 'date')),
  basis                     text NOT NULL CHECK (basis IN ('pct_of_sales', 'fixed')),
  invoicer                  text NOT NULL CHECK (invoicer IN ('creator', 'brand', 'ops')),
  pct                       numeric(5,2) CHECK (pct IS NULL OR (pct >= 0 AND pct <= 100)),
  fixed_paise               bigint CHECK (fixed_paise IS NULL OR fixed_paise >= 0),
  trigger_date              date,
  sales_figure_paise        bigint CHECK (sales_figure_paise IS NULL OR sales_figure_paise >= 0),
  sales_entered_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  sales_verified_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  sales_verified_at         timestamptz,
  creator_gross_paise       bigint,
  platform_pct              numeric(5,2) NOT NULL DEFAULT 30,
  creator_net_paise         bigint,
  guapd_margin_paise        bigint,
  service_invoice_id        uuid REFERENCES service_invoices (id) ON DELETE SET NULL,
  status                    text NOT NULL DEFAULT 'pending' CHECK (status IN (
                              'pending', 'sales_entered', 'verified', 'billed', 'paid', 'cancelled')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dfo_basis_shape CHECK (
    (basis = 'pct_of_sales' AND pct IS NOT NULL) OR (basis = 'fixed' AND fixed_paise IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS dfo_experience_idx ON deal_follow_ons (experience_id);

ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_follow_on_fk;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_follow_on_fk
  FOREIGN KEY (follow_on_id) REFERENCES deal_follow_ons (id) ON DELETE SET NULL;

COMMENT ON TABLE deal_follow_ons IS
  'A later obligation on a creator leg, e.g. affiliate: ops enters/verifies final sales, the creator bills Guapd '
  'pct × sales, Guapd pays them net of 30% and bills the brand a follow_on service invoice. The creator reads their own '
  'EXCEPT guapd_margin_paise. Brands have no access.';
ALTER TABLE deal_follow_ons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON deal_follow_ons FROM anon, authenticated;
GRANT SELECT (id, experience_id, deal_id, creator_id, type, trigger, basis, invoicer, pct, fixed_paise, trigger_date,
              sales_figure_paise, sales_verified_at, creator_gross_paise, platform_pct, creator_net_paise, status, created_at, updated_at)
  ON deal_follow_ons TO authenticated;

-- ── Integrity: the columns that decide who may READ a row must be right ─────
-- service_invoices.brand_id must be the Experience's brand; a follow-on's
-- creator must be that creator leg's own creator. A mistyped row would
-- otherwise show one party another's money.
CREATE OR REPLACE FUNCTION check_service_invoice_brand()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM experiences e WHERE e.id = NEW.experience_id AND e.brand_id = NEW.brand_id) THEN
    RAISE EXCEPTION 'A service invoice is addressed to its own Experience brand';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_si_brand_check ON service_invoices;
CREATE TRIGGER t_si_brand_check
  BEFORE INSERT OR UPDATE OF experience_id, brand_id ON service_invoices
  FOR EACH ROW EXECUTE FUNCTION check_service_invoice_brand();

CREATE OR REPLACE FUNCTION check_follow_on_leg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = NEW.deal_id AND d.leg_role = 'creator_leg'
      AND d.experience_id = NEW.experience_id AND d.creator_id = NEW.creator_id
  ) THEN
    RAISE EXCEPTION 'A follow-on belongs to that creator own leg of this Experience';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_dfo_leg_check ON deal_follow_ons;
CREATE TRIGGER t_dfo_leg_check
  BEFORE INSERT OR UPDATE OF experience_id, deal_id, creator_id ON deal_follow_ons
  FOR EACH ROW EXECUTE FUNCTION check_follow_on_leg();

-- ── Read policies (mirrored in rls.sql) ─────────────────────────────────────
DROP POLICY IF EXISTS si_read_brand ON service_invoices;
CREATE POLICY si_read_brand ON service_invoices FOR SELECT
  USING (brand_id = my_brand_id() AND brand_id IS DISTINCT FROM guapd_brand_id());

-- Policies run with the READER's privileges, and vendors is revoked from
-- users, so a plain subquery here would raise "permission denied for table
-- vendors" on every creator query. This definer helper answers only "is this
-- vendor me?" and exposes nothing else about vendors.
CREATE OR REPLACE FUNCTION is_my_vendor(p_vendor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM vendors
    WHERE id = p_vendor_id AND creator_id IS NOT NULL AND creator_id = my_creator_id()
  )
$$;

DROP POLICY IF EXISTS vp_read_own_creator ON vendor_payouts;
CREATE POLICY vp_read_own_creator ON vendor_payouts FOR SELECT
  USING (is_my_vendor(vendor_id));

DROP POLICY IF EXISTS dfo_read_own_creator ON deal_follow_ons;
CREATE POLICY dfo_read_own_creator ON deal_follow_ons FOR SELECT
  USING (creator_id = my_creator_id() AND creator_id IS DISTINCT FROM guapd_creator_id());
