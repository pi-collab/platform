-- Experiences Phase 2: two independent legs, derived margin, frozen terms.
-- RUN BY HAND, in the pieces given (the SQL editor mis-splits long blocks).
-- Verify with docs/test-cases.md §94.
--
-- ── Locked money model ──────────────────────────────────────────────────────
-- Leg 1 (brand ↔ Guapd): brand_service_total is GUAPD'S PRICE, set directly:
--   brand_per_video × brand_deliverable_count + brand_misc. Brand-leg fields,
--   never derived from creator cost. No platform %, no margin line.
-- Leg 2 (Guapd ↔ creator): creator_net = creator_gross − round_half_up(gross ×
--   platform_pct / 100), platform_pct from the creator's OWN track at send time
--   (Growth 30 / Deals 15), snapshotted and then LOCKED.
-- Margin: DERIVED for the ops P&L only (apps/web/lib/experience-money.ts).
--   Never stored, so it can never become the source of either invoice. The
--   margin columns added in 0523/0524 are dropped here.
-- Nothing here links one leg's money to the other's.

-- ── 1. Brand-leg pricing fields on the Experience ───────────────────────────
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS brand_per_video_paise   bigint CHECK (brand_per_video_paise IS NULL OR brand_per_video_paise >= 0);
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS brand_deliverable_count int    CHECK (brand_deliverable_count IS NULL OR brand_deliverable_count >= 0);
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS brand_misc_paise        bigint NOT NULL DEFAULT 0 CHECK (brand_misc_paise >= 0);
-- When priced per video, the total is exactly that sum. A row without
-- per-video fields (a flat-priced variant) is unconstrained.
ALTER TABLE experiences DROP CONSTRAINT IF EXISTS experiences_brand_total_formula;
ALTER TABLE experiences ADD CONSTRAINT experiences_brand_total_formula CHECK (
  brand_per_video_paise IS NULL OR brand_deliverable_count IS NULL
  OR brand_service_total_paise = brand_per_video_paise * brand_deliverable_count + brand_misc_paise
);

-- ── 2. Service invoices: priced the same way; follow-ons record their source
ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS per_video_paise   bigint CHECK (per_video_paise IS NULL OR per_video_paise >= 0);
ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS deliverable_count int    CHECK (deliverable_count IS NULL OR deliverable_count >= 0);
ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS misc_paise        bigint NOT NULL DEFAULT 0 CHECK (misc_paise >= 0);
ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS source            text;
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_source_check;
ALTER TABLE service_invoices ADD CONSTRAINT si_source_check
  CHECK (source IS NULL OR source IN ('existing_footage', 'new_shoot'));
-- An 'additional' invoice (more videos later) must say where they come from.
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_additional_has_source;
ALTER TABLE service_invoices ADD CONSTRAINT si_additional_has_source
  CHECK (kind <> 'additional' OR source IS NOT NULL);
ALTER TABLE service_invoices DROP CONSTRAINT IF EXISTS si_subtotal_formula;
ALTER TABLE service_invoices ADD CONSTRAINT si_subtotal_formula CHECK (
  per_video_paise IS NULL OR deliverable_count IS NULL
  OR subtotal_paise = per_video_paise * deliverable_count + misc_paise
);
GRANT SELECT (per_video_paise, deliverable_count, misc_paise, source) ON service_invoices TO authenticated;

-- Once issued, an invoice's money is frozen. Only payment recording (status
-- issued → paid / void, reference, paid_at, recorded_by) may change.
CREATE OR REPLACE FUNCTION freeze_issued_service_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF (to_jsonb(NEW) - ARRAY['status', 'payment_reference', 'paid_at', 'recorded_by', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'payment_reference', 'paid_at', 'recorded_by', 'updated_at']) THEN
      RAISE EXCEPTION 'An issued invoice cannot be edited; void it and issue a new one';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_si_freeze ON service_invoices;
CREATE TRIGGER t_si_freeze BEFORE UPDATE ON service_invoices
  FOR EACH ROW EXECUTE FUNCTION freeze_issued_service_invoice();

-- ── 3. Creator terms: track snapshot, rounding in the database, lock ────────
ALTER TABLE experience_creator_terms DROP COLUMN IF EXISTS guapd_margin_paise;
ALTER TABLE experience_creator_terms ADD COLUMN IF NOT EXISTS platform_track text;
ALTER TABLE experience_creator_terms ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE experience_creator_terms DROP CONSTRAINT IF EXISTS ect_platform_track_check;
ALTER TABLE experience_creator_terms ADD CONSTRAINT ect_platform_track_check
  CHECK (platform_track IS NULL OR platform_track IN ('growth', 'deals'));
-- The ONE rounding rule, also enforced here: fee = gross × pct / 100 rounded
-- half up to the paisa (Postgres round(numeric) rounds halves away from zero,
-- which is half up for non-negative amounts), net = gross − fee. Mirrors
-- platformFeePaise() in apps/web/lib/experience-money.ts.
ALTER TABLE experience_creator_terms DROP CONSTRAINT IF EXISTS ect_net_formula;
ALTER TABLE experience_creator_terms ADD CONSTRAINT ect_net_formula
  CHECK (creator_net_paise = creator_gross_paise - round(creator_gross_paise * platform_pct / 100));
GRANT SELECT (platform_track, locked_at) ON experience_creator_terms TO authenticated;

-- Agreed terms never move: later rate edits do not touch a locked leg.
CREATE OR REPLACE FUNCTION freeze_locked_creator_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF (NEW.day_rate_paise, NEW.days, NEW.creator_gross_paise, NEW.platform_pct, NEW.creator_net_paise, NEW.platform_track, NEW.locked_at)
       IS DISTINCT FROM (OLD.day_rate_paise, OLD.days, OLD.creator_gross_paise, OLD.platform_pct, OLD.creator_net_paise, OLD.platform_track, OLD.locked_at) THEN
      RAISE EXCEPTION 'These creator terms are agreed and locked; change them with a new or extended leg';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_ect_freeze ON experience_creator_terms;
CREATE TRIGGER t_ect_freeze BEFORE UPDATE ON experience_creator_terms
  FOR EACH ROW EXECUTE FUNCTION freeze_locked_creator_terms();

-- ── 4. Margin is derived, never stored ──────────────────────────────────────
ALTER TABLE deal_follow_ons    DROP COLUMN IF EXISTS guapd_margin_paise;
ALTER TABLE experience_finance DROP COLUMN IF EXISTS guapd_margin_total_paise;
ALTER TABLE experience_finance DROP COLUMN IF EXISTS vendor_cost_total_paise;

-- ── 5. Template v2: platform % comes from the creator's track, not the template
UPDATE deal_templates
SET version  = 2,
    settings = (settings - 'platform_pct' - 'default_unit_price_paise')
               || jsonb_build_object('brand_per_video_paise_default', 350000),
    updated_at = now()
WHERE slug = 'experience-ugc-day-shoot' AND version = 1;
