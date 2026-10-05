-- Experience P&L and who may see it. RUN BY HAND, in the pieces given.
-- Verify with docs/test-cases.md §96.
--
-- ── The margin (Palak, 2026-10-05) ──────────────────────────────────────────
--   brand revenue (issued + paid service invoices, ex-tax)
--   − creator payouts at GROSS (agreed / locked legs)
--   − other costs (cost lines Guapd bears)
--   = sub-total
--   + platform fee kept (Σ per leg: gross − net, each at its own snapshotted %)
--   = guapd_margin  = brand revenue − Σ creator NET − costs
-- Live while the Experience is open; snapshotted when it becomes 'complete'
-- so history does not drift; the snapshot is dropped if it is reopened.
-- compute_experience_pnl mirrors experienceMargin() in
-- apps/web/lib/experience-money.ts (the DB test checks they agree).
--
-- ── Access: OPERATIONAL vs FINANCIAL, enforced here, not in the UI ──────────
--   staff_access.experiences_operational  deliverables, roster, payouts…
--   staff_access.experiences_financial    the P&L. OPT-IN per person, default
--                                         false for everyone, admins included.
-- The P&L is reachable ONLY through experience_pnl(), which runs as definer
-- but checks the CALLER (auth.uid → users → staff_access). Called with the
-- service role there is no caller, so it refuses: ops code cannot read the
-- P&L on someone's behalf. Brands, creators and outreach have no staff_access
-- row and are refused. The raw tables stay readable by the service role (the
-- stated limit); scripts/check-pnl-isolation.ts fails the build if app code
-- reads them for display.

-- ── 1. staff_access ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_access (
  user_id                  uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  experiences_operational  boolean NOT NULL DEFAULT false,
  experiences_financial    boolean NOT NULL DEFAULT false,
  granted_by               uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE staff_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON staff_access FROM anon, authenticated;

CREATE OR REPLACE FUNCTION has_experience_access(p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT coalesce((
    SELECT CASE p_kind
             WHEN 'financial'   THEN experiences_financial
             WHEN 'operational' THEN experiences_operational OR experiences_financial
             ELSE false
           END
    FROM staff_access WHERE user_id = my_user_id()
  ), false)
$$;

-- ── 2. The P&L calculation (internal; nobody may call it directly) ──────────
CREATE OR REPLACE FUNCTION compute_experience_pnl(p_experience_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH inv AS (
    SELECT coalesce(sum(subtotal_paise) FILTER (WHERE status IN ('issued', 'paid')), 0) AS billed,
           coalesce(sum(subtotal_paise) FILTER (WHERE status = 'paid'), 0) AS received
    FROM service_invoices WHERE experience_id = p_experience_id
  ), legs AS (
    SELECT coalesce(sum(creator_gross_paise) FILTER (WHERE locked_at IS NOT NULL), 0) AS gross,
           coalesce(sum(creator_net_paise) FILTER (WHERE locked_at IS NOT NULL), 0) AS net,
           count(*) FILTER (WHERE locked_at IS NULL) AS pending,
           coalesce(jsonb_agg(jsonb_build_object(
             'deal_id', deal_id, 'creator_id', creator_id, 'platform_track', platform_track,
             'platform_pct', platform_pct, 'creator_gross_paise', creator_gross_paise,
             'platform_fee_paise', creator_gross_paise - creator_net_paise, 'creator_net_paise', creator_net_paise
           ) ORDER BY created_at) FILTER (WHERE locked_at IS NOT NULL), '[]'::jsonb) AS per_leg
    FROM experience_creator_terms WHERE experience_id = p_experience_id
  ), costs AS (
    SELECT coalesce(sum(total_paise), 0) AS total
    FROM experience_cost_lines WHERE experience_id = p_experience_id AND provided_by = 'guapd'
  )
  SELECT jsonb_build_object(
    'experience_id', p_experience_id,
    'brand_revenue_paise', inv.billed,
    'brand_received_paise', inv.received,
    'creator_gross_total_paise', legs.gross,
    'creator_net_total_paise', legs.net,
    'guapd_costs_total_paise', costs.total,
    'subtotal_paise', inv.billed - legs.gross - costs.total,
    'platform_fee_kept_paise', legs.gross - legs.net,
    'guapd_margin_paise', inv.billed - legs.net - costs.total,
    'legs_pending', legs.pending,
    'per_leg', legs.per_leg
  )
  FROM inv, legs, costs
$$;

-- ── 3. Snapshot at completion ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experience_pnl_snapshots (
  experience_id  uuid PRIMARY KEY REFERENCES experiences (id) ON DELETE CASCADE,
  pnl            jsonb NOT NULL,
  captured_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE experience_pnl_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_pnl_snapshots FROM anon, authenticated;

CREATE OR REPLACE FUNCTION snapshot_experience_pnl() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' THEN
    INSERT INTO experience_pnl_snapshots (experience_id, pnl, captured_at)
    VALUES (NEW.id, compute_experience_pnl(NEW.id), now())
    ON CONFLICT (experience_id) DO UPDATE SET pnl = EXCLUDED.pnl, captured_at = EXCLUDED.captured_at;
  ELSIF OLD.status = 'complete' AND NEW.status IS DISTINCT FROM 'complete' THEN
    DELETE FROM experience_pnl_snapshots WHERE experience_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_experience_pnl_snapshot ON experiences;
CREATE TRIGGER t_experience_pnl_snapshot AFTER UPDATE OF status ON experiences
  FOR EACH ROW EXECUTE FUNCTION snapshot_experience_pnl();

-- ── 4. What a caller may ask for ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION experience_pnl(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  snap_pnl jsonb;
  snap_at  timestamptz;
BEGIN
  IF NOT has_experience_access('financial') THEN
    RAISE EXCEPTION 'Financial access required' USING ERRCODE = '42501';
  END IF;
  SELECT pnl, captured_at INTO snap_pnl, snap_at FROM experience_pnl_snapshots WHERE experience_id = p_experience_id;
  IF snap_pnl IS NOT NULL THEN
    RETURN snap_pnl || jsonb_build_object('source', 'snapshot', 'captured_at', snap_at);
  END IF;
  RETURN compute_experience_pnl(p_experience_id) || jsonb_build_object('source', 'live');
END;
$$;

CREATE OR REPLACE FUNCTION experience_payouts(p_experience_id uuid)
RETURNS TABLE (id uuid, vendor_name text, deal_id uuid, reason text, amount_paise bigint, tds_paise bigint,
               net_amount_paise bigint, status text, external_ref text, approved_at timestamptz, paid_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT has_experience_access('operational') THEN
    RAISE EXCEPTION 'Operational access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, v.display_name, p.deal_id, p.reason, p.amount_paise, p.tds_paise,
           p.net_amount_paise, p.status, p.external_ref, p.approved_at, p.paid_at
    FROM vendor_payouts p JOIN vendors v ON v.id = p.vendor_id
    WHERE p.experience_id = p_experience_id
    ORDER BY p.created_at;
END;
$$;

-- Functions are executable by PUBLIC by default; close that, then open only
-- the two front doors to signed-in users (who still need the flag inside).
REVOKE EXECUTE ON FUNCTION compute_experience_pnl(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION snapshot_experience_pnl()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION experience_pnl(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_payouts(uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION has_experience_access(text)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_pnl(uuid)          TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_payouts(uuid)      TO authenticated;
GRANT  EXECUTE ON FUNCTION has_experience_access(text)   TO authenticated;
