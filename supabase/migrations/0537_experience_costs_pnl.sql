-- 0537: Experiences stage 3c: the cost sheet and the margin / P&L view.
--
-- Decided (Palak, 2026-10-08):
--   a. Revenue in the margin = the INVOICED amount (issued service invoices,
--      paid ones included; drafts and voids never). Until invoices exist
--      (Phase 4) revenue is an honest ₹0, shown as "revenue pending invoice";
--      the agreed price is never substituted.
--   b. Only creator legs the creator ACCEPTED count (deal status agreed
--      onward). Since 0534 a leg's terms lock at SEND, so the old filter
--      (locked_at IS NOT NULL) counted unanswered and declined legs as
--      payouts: fixed here. Unanswered and declined legs are footnotes only.
--   c. Operational staff must not be able to derive the margin. The BRAND
--      PRICE is now financial-only: experience_console_get masks the brand
--      money fields, experience_console_quotes masks quote amounts and
--      messages, and creating or accepting a quote needs financial access.
--      Operational keeps creator payouts (to pay creators) and costs (to run
--      the shoot); without the brand price the margin cannot be worked out.
--   d. A Complete Experience's P&L is frozen. Late costs need an explicit,
--      audited REOPEN (financial access, reason required), then the cost,
--      then COMPLETE again.
--
-- margin = brand_invoiced − Σ creator NET (accepted legs) − Σ Guapd costs.
-- Shown two ways, one number: sub-total (creators at gross) + platform fee
-- kept (Σ per leg, each at its own snapshotted %) = margin. The database
-- refuses to return a P&L where the two ways disagree.
--
-- Costs are summed in exactly one function (experience_cost_total), so the
-- later budgeting phase (provisional vs final) changes one place. Cost lines
-- are soft-deleted. Creator pay lives on legs, so cost categories per_video,
-- day_rate and retainer are refused (no double count).
--
-- The stored margin (experience_pnl_snapshots.guapd_margin_paise) refreshes
-- by trigger whenever an input changes while the Experience is open, and
-- freezes at Complete. It is read only through experience_pnl(), which checks
-- financial access in Postgres. No SELECT * anywhere below.

-- ── A. Cost lines: soft delete and shape ───────────────────────────────────
ALTER TABLE experience_cost_lines
  ADD COLUMN IF NOT EXISTS removed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_reason text;

ALTER TABLE experience_cost_lines DROP CONSTRAINT IF EXISTS ecl_removed_shape;
ALTER TABLE experience_cost_lines ADD CONSTRAINT ecl_removed_shape
  CHECK ((removed_at IS NULL) = (removed_by IS NULL) AND (removed_at IS NULL OR removed_reason IS NOT NULL));
ALTER TABLE experience_cost_lines DROP CONSTRAINT IF EXISTS ecl_label_len;
ALTER TABLE experience_cost_lines ADD CONSTRAINT ecl_label_len CHECK (length(btrim(label)) BETWEEN 1 AND 120);
ALTER TABLE experience_cost_lines DROP CONSTRAINT IF EXISTS ecl_note_len;
ALTER TABLE experience_cost_lines ADD CONSTRAINT ecl_note_len CHECK (note IS NULL OR length(note) <= 1000);
ALTER TABLE experience_cost_lines DROP CONSTRAINT IF EXISTS ecl_qty_2dp;
ALTER TABLE experience_cost_lines ADD CONSTRAINT ecl_qty_2dp CHECK (quantity IS NULL OR quantity * 100 = round(quantity * 100));
ALTER TABLE experience_cost_lines DROP CONSTRAINT IF EXISTS ecl_total_cap;
ALTER TABLE experience_cost_lines ADD CONSTRAINT ecl_total_cap CHECK (total_paise <= 1000000000);
-- Phase 4 (re-billing to the brand, vendor payouts) drops this on purpose.
ALTER TABLE experience_cost_lines DROP CONSTRAINT IF EXISTS ecl_not_billed_yet;
ALTER TABLE experience_cost_lines ADD CONSTRAINT ecl_not_billed_yet
  CHECK (billed_on_invoice_id IS NULL AND payable_to_vendor_id IS NULL AND billable_to_brand = false);
CREATE INDEX IF NOT EXISTS ecl_live_idx ON experience_cost_lines (experience_id) WHERE removed_at IS NULL;

COMMENT ON TABLE experience_cost_lines IS
  'What Guapd spends running an Experience (travel, makeup, studio...). FINAL amounts only; provisional budgeting is a later phase and will add its stage filter inside experience_cost_total(). Creator pay is never a cost line: it lives on the creator legs. No policies: reached only through staff-gated definer functions.';

-- ── B. The stored margin ───────────────────────────────────────────────────
ALTER TABLE experience_pnl_snapshots
  ADD COLUMN IF NOT EXISTS is_final         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refreshed_reason text;
UPDATE experience_pnl_snapshots SET is_final = true WHERE is_final = false;  -- rows only ever existed for Complete Experiences
ALTER TABLE experience_pnl_snapshots
  ADD COLUMN IF NOT EXISTS guapd_margin_paise bigint GENERATED ALWAYS AS ((pnl ->> 'guapd_margin_paise')::bigint) STORED;

-- ── C. Internal helpers (callable by nobody) ───────────────────────────────
CREATE OR REPLACE FUNCTION experience_cost_total(p_experience_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- The ONE place costs are summed. Budgeting will add its stage filter here.
  SELECT coalesce(sum(cl.total_paise), 0)::bigint
  FROM experience_cost_lines cl
  WHERE cl.experience_id = p_experience_id AND cl.provided_by = 'guapd' AND cl.removed_at IS NULL
$$;

CREATE OR REPLACE FUNCTION experience_cost_category_ok(p_experience_id uuid, p_category text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_category IS NOT NULL
     AND p_category NOT IN ('per_video', 'day_rate', 'retainer')   -- creator pay lives on legs
     AND (
       p_category IN ('studio', 'misc')
       OR p_category IN (
         SELECT jsonb_array_elements_text(coalesce(e.settings_snapshot -> 'cost_line_categories', t.settings -> 'cost_line_categories', '[]'::jsonb))
         FROM experiences e LEFT JOIN deal_templates t ON t.id = e.template_id
         WHERE e.id = p_experience_id
       )
       OR p_category IN ('travel', 'food', 'editing', 'photography', 'styling', 'makeup')
     )
$$;

CREATE OR REPLACE FUNCTION compute_experience_pnl(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_billed bigint; v_received bigint; v_invoices int; v_agreed bigint;
  v_gross bigint; v_net bigint; v_per_leg jsonb;
  v_awaiting int; v_awaiting_net bigint; v_declined int;
  v_costs bigint; v_by_cat jsonb;
  v_subtotal bigint; v_fee_kept bigint; v_margin bigint;
BEGIN
  SELECT coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status = 'paid'), 0)::bigint,
         count(*) FILTER (WHERE si.status IN ('issued', 'paid'))::int
    INTO v_billed, v_received, v_invoices
    FROM service_invoices si WHERE si.experience_id = p_experience_id;
  SELECT e.brand_service_total_paise INTO v_agreed FROM experiences e WHERE e.id = p_experience_id;

  -- Accepted legs only: the creator said yes (agreed onward).
  SELECT coalesce(sum(t.creator_gross_paise), 0)::bigint, coalesce(sum(t.creator_net_paise), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
           'deal_id', t.deal_id, 'creator_id', t.creator_id, 'full_name', c.full_name, 'deal_status', d.status::text,
           'platform_track', t.platform_track, 'platform_pct', t.platform_pct,
           'day_rate_paise', t.day_rate_paise, 'days', t.days,
           'creator_gross_paise', t.creator_gross_paise, 'platform_fee_paise', t.creator_gross_paise - t.creator_net_paise,
           'creator_net_paise', t.creator_net_paise) ORDER BY t.created_at), '[]'::jsonb)
    INTO v_gross, v_net, v_per_leg
    FROM experience_creator_terms t
    JOIN deals d ON d.id = t.deal_id
    JOIN creators c ON c.id = t.creator_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL
      AND d.status IN ('agreed', 'delivered', 'revision', 'approved', 'paid', 'complete');

  SELECT count(*) FILTER (WHERE d.status = 'negotiating')::int,
         coalesce(sum(t.creator_net_paise) FILTER (WHERE d.status = 'negotiating'), 0)::bigint,
         count(*) FILTER (WHERE d.status IN ('declined', 'cancelled'))::int
    INTO v_awaiting, v_awaiting_net, v_declined
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
    WHERE t.experience_id = p_experience_id;

  v_costs := experience_cost_total(p_experience_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'total_paise', x.total) ORDER BY x.category), '[]'::jsonb)
    INTO v_by_cat
    FROM (SELECT cl.category, sum(cl.total_paise)::bigint AS total FROM experience_cost_lines cl
          WHERE cl.experience_id = p_experience_id AND cl.provided_by = 'guapd' AND cl.removed_at IS NULL
          GROUP BY cl.category) x;

  v_subtotal := v_billed - v_gross - v_costs;
  v_fee_kept := v_gross - v_net;
  v_margin := v_billed - v_net - v_costs;
  IF v_subtotal + v_fee_kept <> v_margin THEN
    RAISE EXCEPTION 'P&L does not reconcile: sub-total % + fee kept % <> margin %', v_subtotal, v_fee_kept, v_margin;
  END IF;

  RETURN jsonb_build_object(
    'experience_id', p_experience_id,
    'brand_revenue_paise', v_billed, 'revenue_basis', 'invoiced', 'revenue_pending_invoice', v_invoices = 0,
    'invoices_counted', v_invoices, 'brand_received_paise', v_received, 'brand_agreed_paise', v_agreed,
    'creator_gross_total_paise', v_gross, 'creator_net_total_paise', v_net,
    'guapd_costs_total_paise', v_costs, 'costs_by_category', v_by_cat,
    'subtotal_paise', v_subtotal, 'platform_fee_kept_paise', v_fee_kept, 'guapd_margin_paise', v_margin,
    'legs_counted', jsonb_array_length(v_per_leg), 'legs_awaiting', v_awaiting, 'awaiting_net_paise', v_awaiting_net,
    'legs_declined', v_declined, 'legs_pending', v_awaiting,
    'per_leg', v_per_leg);
END;
$$;

-- Store (or refresh) the margin for an open Experience. A final row is never touched.
CREATE OR REPLACE FUNCTION experience_pnl_store(p_experience_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_experience_id IS NULL OR NOT EXISTS (SELECT 1 FROM experiences e WHERE e.id = p_experience_id) THEN
    RETURN;
  END IF;
  INSERT INTO experience_pnl_snapshots (experience_id, pnl, captured_at, is_final, refreshed_reason)
  VALUES (p_experience_id, compute_experience_pnl(p_experience_id), now(), false, p_reason)
  ON CONFLICT (experience_id) DO UPDATE
    SET pnl = EXCLUDED.pnl, captured_at = EXCLUDED.captured_at, refreshed_reason = EXCLUDED.refreshed_reason
    WHERE experience_pnl_snapshots.is_final = false;
END;
$$;

-- Refresh triggers: whatever path writes an input, the stored margin follows.
CREATE OR REPLACE FUNCTION experience_pnl_refresh_from_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid;
BEGIN
  v_exp := CASE WHEN TG_OP = 'DELETE' THEN OLD.experience_id ELSE NEW.experience_id END;
  PERFORM experience_pnl_store(v_exp, TG_TABLE_NAME || '.' || lower(TG_OP));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS t_ecl_pnl_refresh ON experience_cost_lines;
CREATE TRIGGER t_ecl_pnl_refresh AFTER INSERT OR UPDATE OR DELETE ON experience_cost_lines
  FOR EACH ROW EXECUTE FUNCTION experience_pnl_refresh_from_row();
DROP TRIGGER IF EXISTS t_ect_pnl_refresh ON experience_creator_terms;
CREATE TRIGGER t_ect_pnl_refresh AFTER INSERT OR UPDATE ON experience_creator_terms
  FOR EACH ROW EXECUTE FUNCTION experience_pnl_refresh_from_row();
DROP TRIGGER IF EXISTS t_si_pnl_refresh ON service_invoices;
CREATE TRIGGER t_si_pnl_refresh AFTER INSERT OR UPDATE OF status, subtotal_paise ON service_invoices
  FOR EACH ROW EXECUTE FUNCTION experience_pnl_refresh_from_row();
DROP TRIGGER IF EXISTS t_deals_04_pnl_refresh ON deals;
CREATE TRIGGER t_deals_04_pnl_refresh AFTER UPDATE OF status ON deals
  FOR EACH ROW WHEN (NEW.leg_role = 'creator_leg') EXECUTE FUNCTION experience_pnl_refresh_from_row();

-- Freeze at Complete; un-freeze (and recompute) on leaving Complete. Never deleted.
CREATE OR REPLACE FUNCTION snapshot_experience_pnl() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' THEN
    UPDATE experience_pnl_snapshots SET is_final = false WHERE experience_id = NEW.id;
    PERFORM experience_pnl_store(NEW.id, 'completed');
    UPDATE experience_pnl_snapshots SET is_final = true WHERE experience_id = NEW.id;
  ELSIF OLD.status = 'complete' AND NEW.status IS DISTINCT FROM 'complete' THEN
    UPDATE experience_pnl_snapshots SET is_final = false WHERE experience_id = NEW.id;
    PERFORM experience_pnl_store(NEW.id, 'reopened');
  END IF;
  RETURN NEW;
END;
$$;

-- ── D. The P&L front door (financial only) ─────────────────────────────────
CREATE OR REPLACE FUNCTION experience_pnl(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pnl jsonb; v_at timestamptz; v_final boolean; v_stored bigint;
BEGIN
  IF NOT has_experience_access('financial') THEN
    RAISE EXCEPTION 'Financial access required' USING ERRCODE = '42501';
  END IF;
  SELECT s.pnl, s.captured_at, s.is_final, s.guapd_margin_paise INTO v_pnl, v_at, v_final, v_stored
    FROM experience_pnl_snapshots s WHERE s.experience_id = p_experience_id;
  IF v_final THEN
    RETURN v_pnl || jsonb_build_object('source', 'snapshot', 'captured_at', v_at);
  END IF;
  RETURN compute_experience_pnl(p_experience_id)
         || jsonb_build_object('source', 'live', 'stored_at', v_at, 'stored_margin_paise', v_stored);
END;
$$;

-- ── E. The cost sheet (operational) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_costs(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_lines jsonb; v_cats jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', cl.id, 'label', cl.label, 'category', cl.category, 'basis', cl.basis, 'quantity', cl.quantity,
           'unit_rate_paise', cl.unit_rate_paise, 'total_paise', cl.total_paise, 'provided_by', cl.provided_by,
           'creator_leg_deal_id', cl.creator_leg_deal_id, 'creator_name', c.full_name, 'note', cl.note,
           'created_at', cl.created_at, 'updated_at', cl.updated_at) ORDER BY cl.created_at), '[]'::jsonb)
    INTO v_lines
    FROM experience_cost_lines cl
    LEFT JOIN deals d ON d.id = cl.creator_leg_deal_id
    LEFT JOIN creators c ON c.id = d.creator_id
    WHERE cl.experience_id = p_experience_id AND cl.removed_at IS NULL;
  SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO v_cats FROM (
    SELECT jsonb_array_elements_text(coalesce(e.settings_snapshot -> 'cost_line_categories', t.settings -> 'cost_line_categories', '[]'::jsonb)) AS x
      FROM experiences e LEFT JOIN deal_templates t ON t.id = e.template_id WHERE e.id = p_experience_id
    UNION SELECT unnest(ARRAY['travel', 'food', 'editing', 'photography', 'styling', 'makeup', 'studio', 'misc'])
  ) y WHERE x NOT IN ('per_video', 'day_rate', 'retainer');
  RETURN jsonb_build_object('status', v_status, 'categories', v_cats, 'lines', v_lines,
                            'guapd_total_paise', experience_cost_total(p_experience_id));
END;
$$;

CREATE OR REPLACE FUNCTION experience_cost_validate(p_experience_id uuid, p_label text, p_category text, p_basis text,
  p_quantity numeric, p_unit_rate_paise bigint, p_total_paise bigint, p_provided_by text, p_creator_leg_deal_id uuid, p_note text)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total bigint;
BEGIN
  IF length(btrim(coalesce(p_label, ''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Give the cost a label (up to 120 characters)'; END IF;
  IF NOT experience_cost_category_ok(p_experience_id, p_category) THEN
    RAISE EXCEPTION 'Pick a cost category. Creator pay (per video, day rate, retainer) is on the creator deals, not a cost line';
  END IF;
  IF p_provided_by NOT IN ('guapd', 'brand', 'creator') THEN RAISE EXCEPTION 'Say who provides it: Guapd, the brand or the creator'; END IF;
  IF p_note IS NOT NULL AND length(p_note) > 1000 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  IF p_basis = 'per_unit' THEN
    IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity * 100 <> round(p_quantity * 100) OR p_unit_rate_paise IS NULL OR p_unit_rate_paise < 0 THEN
      RAISE EXCEPTION 'A per-unit cost needs a quantity (up to two decimals) and a rate';
    END IF;
    v_total := round(p_quantity * p_unit_rate_paise)::bigint;
    IF p_total_paise IS DISTINCT FROM v_total THEN
      RAISE EXCEPTION 'The total changed (now %). Reload and check', v_total;
    END IF;
  ELSIF p_basis = 'flat_total' THEN
    IF p_quantity IS NOT NULL OR p_unit_rate_paise IS NOT NULL OR p_total_paise IS NULL OR p_total_paise < 0 THEN
      RAISE EXCEPTION 'A flat cost needs just its total';
    END IF;
    v_total := p_total_paise;
  ELSE
    RAISE EXCEPTION 'Pick per unit or a flat total';
  END IF;
  IF v_total > 1000000000 THEN RAISE EXCEPTION 'That cost looks too high (over ₹1 crore). Check the number'; END IF;
  IF p_creator_leg_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM deals d WHERE d.id = p_creator_leg_deal_id AND d.leg_role = 'creator_leg' AND d.experience_id = p_experience_id
  ) THEN
    RAISE EXCEPTION 'That creator is not on this Experience';
  END IF;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_cost_add(p_experience_id uuid, p_label text, p_category text, p_basis text,
  p_quantity numeric, p_unit_rate_paise bigint, p_total_paise bigint, p_provided_by text, p_creator_leg_deal_id uuid, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_total bigint; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete and its P&L is frozen. Reopen it first (finance)'; END IF;
  IF v_status NOT IN ('rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering') THEN
    RAISE EXCEPTION 'Costs are recorded once the price is agreed';
  END IF;
  v_total := experience_cost_validate(p_experience_id, p_label, p_category, p_basis, p_quantity, p_unit_rate_paise, p_total_paise, p_provided_by, p_creator_leg_deal_id, p_note);
  INSERT INTO experience_cost_lines (experience_id, creator_leg_deal_id, label, category, basis, quantity, unit_rate_paise,
                                     total_paise, provided_by, billable_to_brand, note, created_by)
  VALUES (p_experience_id, p_creator_leg_deal_id, btrim(p_label), p_category, p_basis,
          CASE WHEN p_basis = 'per_unit' THEN p_quantity END, CASE WHEN p_basis = 'per_unit' THEN p_unit_rate_paise END,
          v_total, p_provided_by, false, nullif(btrim(coalesce(p_note, '')), ''), my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.cost_added', 'experience_cost_lines', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'after', jsonb_build_object('label', btrim(p_label), 'category', p_category,
      'basis', p_basis, 'quantity', p_quantity, 'unit_rate_paise', p_unit_rate_paise, 'total_paise', v_total,
      'provided_by', p_provided_by, 'creator_leg_deal_id', p_creator_leg_deal_id)));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_cost_update(p_cost_id uuid, p_label text, p_category text, p_basis text,
  p_quantity numeric, p_unit_rate_paise bigint, p_total_paise bigint, p_provided_by text, p_creator_leg_deal_id uuid,
  p_note text, p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_total bigint; v_before jsonb; v_removed timestamptz; v_updated timestamptz;
BEGIN
  PERFORM experience_console_require();
  SELECT cl.experience_id INTO v_exp FROM experience_cost_lines cl WHERE cl.id = p_cost_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Cost line not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT cl.removed_at, cl.updated_at,
         jsonb_build_object('label', cl.label, 'category', cl.category, 'basis', cl.basis, 'quantity', cl.quantity,
           'unit_rate_paise', cl.unit_rate_paise, 'total_paise', cl.total_paise, 'provided_by', cl.provided_by,
           'creator_leg_deal_id', cl.creator_leg_deal_id)
    INTO v_removed, v_updated, v_before
    FROM experience_cost_lines cl WHERE cl.id = p_cost_id FOR UPDATE;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete and its P&L is frozen. Reopen it first (finance)'; END IF;
  IF v_status NOT IN ('rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering') THEN RAISE EXCEPTION 'Costs cannot change at this stage'; END IF;
  IF v_removed IS NOT NULL THEN RAISE EXCEPTION 'This cost line was removed'; END IF;
  IF p_expected_updated_at IS DISTINCT FROM v_updated THEN RAISE EXCEPTION 'Someone changed this cost line since you opened it. Reload'; END IF;
  v_total := experience_cost_validate(v_exp, p_label, p_category, p_basis, p_quantity, p_unit_rate_paise, p_total_paise, p_provided_by, p_creator_leg_deal_id, p_note);
  UPDATE experience_cost_lines SET label = btrim(p_label), category = p_category, basis = p_basis,
         quantity = CASE WHEN p_basis = 'per_unit' THEN p_quantity END,
         unit_rate_paise = CASE WHEN p_basis = 'per_unit' THEN p_unit_rate_paise END,
         total_paise = v_total, provided_by = p_provided_by, creator_leg_deal_id = p_creator_leg_deal_id,
         note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   WHERE id = p_cost_id;
  PERFORM experience_console_audit('experience.cost_updated', 'experience_cost_lines', p_cost_id,
    jsonb_build_object('experience_id', v_exp, 'before', v_before, 'after', jsonb_build_object('label', btrim(p_label),
      'category', p_category, 'basis', p_basis, 'quantity', p_quantity, 'unit_rate_paise', p_unit_rate_paise,
      'total_paise', v_total, 'provided_by', p_provided_by, 'creator_leg_deal_id', p_creator_leg_deal_id)));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_cost_remove(p_cost_id uuid, p_reason text, p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_before jsonb; v_removed timestamptz; v_updated timestamptz;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT cl.experience_id INTO v_exp FROM experience_cost_lines cl WHERE cl.id = p_cost_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Cost line not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT cl.removed_at, cl.updated_at,
         jsonb_build_object('label', cl.label, 'category', cl.category, 'total_paise', cl.total_paise, 'provided_by', cl.provided_by)
    INTO v_removed, v_updated, v_before
    FROM experience_cost_lines cl WHERE cl.id = p_cost_id FOR UPDATE;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete and its P&L is frozen. Reopen it first (finance)'; END IF;
  IF v_removed IS NOT NULL THEN RAISE EXCEPTION 'This cost line was already removed'; END IF;
  IF p_expected_updated_at IS DISTINCT FROM v_updated THEN RAISE EXCEPTION 'Someone changed this cost line since you opened it. Reload'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being removed (3 to 300 characters)'; END IF;
  UPDATE experience_cost_lines SET removed_at = now(), removed_by = my_user_id(), removed_reason = v_reason, updated_at = now()
   WHERE id = p_cost_id;
  PERFORM experience_console_audit('experience.cost_removed', 'experience_cost_lines', p_cost_id,
    jsonb_build_object('experience_id', v_exp, 'before', v_before, 'reason_length', length(v_reason)));
END;
$$;

-- ── F. Complete and reopen (the freeze points) ─────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_complete(p_experience_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status <> 'delivering' THEN RAISE EXCEPTION 'An Experience is completed from Delivering'; END IF;
  UPDATE experiences SET status = 'complete', updated_at = now() WHERE id = p_experience_id;  -- freezes the P&L (trigger)
  PERFORM experience_console_audit('experience.completed', 'experiences', p_experience_id,
    jsonb_build_object('status_before', v_status, 'status_after', 'complete'));
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_reopen(p_experience_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  -- Reopening un-freezes a Complete Experience's P&L: finance only.
  IF NOT has_experience_access('financial') THEN
    RAISE EXCEPTION 'Financial access required to reopen a Complete Experience' USING ERRCODE = '42501';
  END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status <> 'complete' THEN RAISE EXCEPTION 'Only a Complete Experience is reopened'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being reopened (3 to 300 characters)'; END IF;
  UPDATE experiences SET status = 'delivering', updated_at = now() WHERE id = p_experience_id;  -- un-freezes (trigger)
  PERFORM experience_console_audit('experience.reopened', 'experiences', p_experience_id,
    jsonb_build_object('status_before', 'complete', 'status_after', 'delivering', 'reason', v_reason));
END;
$$;

-- ── G. The brand price is financial only (decision c) ──────────────────────
-- Redefined from their live bodies: the brand money fields and quote amounts
-- are masked unless the caller has financial access, and creating or
-- accepting a quote requires it. SELECT * row reads replaced with explicit
-- columns. Operational staff keep the request, the plan and the roster.
CREATE OR REPLACE FUNCTION public.experience_console_get(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_fin boolean;
BEGIN
  PERFORM experience_console_require();
  v_fin := has_experience_access('financial');
  SELECT jsonb_build_object(
    'id', e.id, 'title', e.title, 'status', e.status, 'brand_id', e.brand_id, 'brand_name', b.name,
    'request_creator_count', e.request_creator_count,
    'request_deliverables', e.request_deliverables,
    'plan_totals', experience_plan_totals(e.request_deliverables, e.request_creator_count),
    'plan_videos_per_creator', experience_plan_count(e.request_deliverables, true),
    'plan_videos_total', experience_plan_count(e.request_deliverables, true) * coalesce(e.request_creator_count, 1),
    'request_affiliate', e.request_affiliate, 'request_affiliate_per_creator', e.request_affiliate_per_creator,
    'request_ad_rights', e.request_ad_rights, 'request_ad_rights_per_creator', e.request_ad_rights_per_creator,
    'request_ad_rights_months', e.request_ad_rights_months,
    'request_boost', e.request_boost, 'request_boost_per_creator', e.request_boost_per_creator,
    'request_boost_months', e.request_boost_months,
    'request_location', e.request_location, 'request_date_from', e.request_date_from,
    'request_date_to', e.request_date_to, 'request_brief', e.request_brief,
    'request_channel', e.request_channel, 'requested_at', e.requested_at,
    -- The brand's price: financial access only (0537), so operational staff cannot derive the margin.
    'can_see_brand_price', v_fin,
    'brand_per_video_paise', CASE WHEN v_fin THEN e.brand_per_video_paise END,
    'brand_deliverable_count', e.brand_deliverable_count,
    'brand_misc_paise', CASE WHEN v_fin THEN e.brand_misc_paise END,
    'brand_service_total_paise', CASE WHEN v_fin THEN e.brand_service_total_paise END,
    'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city, 'agreed_plan', e.agreed_plan,
    'created_at', e.created_at, 'updated_at', e.updated_at
  ) INTO v
  FROM experiences e JOIN brands b ON b.id = e.brand_id
  WHERE e.id = p_experience_id;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_quotes(p_experience_id uuid)
 RETURNS TABLE(id uuid, version integer, proposed_by text, per_video_paise bigint, deliverable_count integer, misc_paise bigint, total_paise bigint, deliverables jsonb, shoot_date date, shoot_city text, message text, status text, recorded_channel text, created_at timestamp with time zone, decided_at timestamp with time zone, created_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fin boolean;
BEGIN
  PERFORM experience_console_require();
  v_fin := has_experience_access('financial');
  RETURN QUERY
    -- Amounts and the free-text message (people type prices into it) are financial only (0537).
    SELECT q.id, q.version, q.proposed_by,
           CASE WHEN v_fin THEN q.per_video_paise END, q.deliverable_count,
           CASE WHEN v_fin THEN q.misc_paise END, CASE WHEN v_fin THEN q.total_paise END,
           q.deliverables, q.shoot_date, q.shoot_city, CASE WHEN v_fin THEN q.message END, q.status, q.recorded_channel,
           q.created_at, q.decided_at, coalesce(u.full_name, u.email)
    FROM experience_quotes q LEFT JOIN users u ON u.id = q.created_by
    WHERE q.experience_id = p_experience_id
    ORDER BY q.version DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_quote(p_experience_id uuid, p_proposed_by text, p_per_video_paise bigint, p_deliverable_count integer, p_misc_paise bigint, p_deliverables jsonb, p_shoot_date date, p_shoot_city text, p_message text, p_channel text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_prev uuid;
  v_version int;
  v_id uuid;
  v_misc bigint := coalesce(p_misc_paise, 0);
BEGIN
  PERFORM experience_console_require();
  -- Quoting IS the brand price: financial access only (0537).
  IF NOT has_experience_access('financial') THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM experiences WHERE id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status <> 'requested' THEN RAISE EXCEPTION 'The price is already agreed; quotes are closed'; END IF;
  IF p_proposed_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A quote is from Guapd or the brand'; END IF;
  IF p_proposed_by = 'brand' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand sent its counter'; END IF;
  IF p_per_video_paise IS NULL OR p_per_video_paise <= 0 THEN RAISE EXCEPTION 'Price per video must be more than zero'; END IF;
  IF p_deliverable_count IS NULL OR p_deliverable_count <= 0 THEN RAISE EXCEPTION 'Number of videos must be more than zero'; END IF;
  IF v_misc < 0 THEN RAISE EXCEPTION 'Extras cannot be negative'; END IF;

  UPDATE experience_quotes SET status = 'superseded', decided_at = now(), decided_by = my_user_id()
    WHERE experience_id = p_experience_id AND status = 'open'
    RETURNING id INTO v_prev;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM experience_quotes WHERE experience_id = p_experience_id;

  INSERT INTO experience_quotes (experience_id, version, proposed_by, per_video_paise, deliverable_count,
    misc_paise, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by)
  VALUES (p_experience_id, v_version, p_proposed_by, p_per_video_paise, p_deliverable_count, v_misc,
    p_per_video_paise * p_deliverable_count + v_misc, coalesce(p_deliverables, '[]'::jsonb), p_shoot_date,
    nullif(btrim(p_shoot_city), ''), nullif(btrim(p_message), ''), 'open', p_channel, my_user_id())
  RETURNING id INTO v_id;

  PERFORM experience_console_audit(
    CASE WHEN p_proposed_by = 'guapd' THEN 'experience.quote_sent' ELSE 'experience.brand_counter_recorded' END,
    'experience_quotes', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'version', v_version, 'replaced_quote_id', v_prev,
      'total_paise', p_per_video_paise * p_deliverable_count + v_misc, 'channel', p_channel));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_accept(p_quote_id uuid, p_channel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q experience_quotes%ROWTYPE;
  e experiences%ROWTYPE;
  v_plan jsonb;
BEGIN
  PERFORM experience_console_require();
  -- Quoting IS the brand price: financial access only (0537).
  IF NOT has_experience_access('financial') THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  SELECT id, experience_id, version, proposed_by, per_video_paise, deliverable_count, misc_paise, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by, created_at, decided_at, decided_by INTO q FROM experience_quotes WHERE id = p_quote_id FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  SELECT id, brand_id, title, status, template_id, template_version, settings_snapshot, brand_service_total_paise, shoot_date, shoot_city, created_by, created_at, updated_at, brand_per_video_paise, brand_deliverable_count, brand_misc_paise, request_deliverables, request_affiliate, request_ad_rights, request_ad_rights_months, request_boost, request_boost_months, request_location, request_date_from, request_date_to, request_brief, request_channel, requested_at, request_creator_count, request_affiliate_per_creator, request_ad_rights_per_creator, request_boost_per_creator, agreed_plan, creator_brief INTO e FROM experiences WHERE id = q.experience_id FOR UPDATE;
  IF e.status <> 'requested' THEN RAISE EXCEPTION 'The price is already agreed'; END IF;
  IF q.status <> 'open' THEN RAISE EXCEPTION 'Only the current open quote can be accepted'; END IF;
  IF q.proposed_by = 'guapd' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand accepted'; END IF;
  IF q.shoot_date IS NULL OR q.shoot_city IS NULL THEN RAISE EXCEPTION 'The quote needs a shoot date and city before it can be accepted'; END IF;

  v_plan := jsonb_build_object(
    'creator_count', e.request_creator_count,
    'per_creator', e.request_deliverables,
    'totals', experience_plan_totals(e.request_deliverables, e.request_creator_count),
    'plan_videos', experience_plan_count(e.request_deliverables, true) * coalesce(e.request_creator_count, 1),
    'videos_sold', q.deliverable_count,
    'affiliate_per_creator', e.request_affiliate_per_creator,
    'ad_rights_per_creator', e.request_ad_rights_per_creator, 'ad_rights_months', e.request_ad_rights_months,
    'boost_per_creator', e.request_boost_per_creator, 'boost_months', e.request_boost_months,
    'quote_id', q.id, 'locked_at', now());

  UPDATE experience_quotes SET status = 'accepted', decided_at = now(), decided_by = my_user_id(),
    recorded_channel = coalesce(p_channel, recorded_channel)
    WHERE id = q.id;
  UPDATE experiences SET
    brand_per_video_paise = q.per_video_paise, brand_deliverable_count = q.deliverable_count,
    brand_misc_paise = q.misc_paise, brand_service_total_paise = q.total_paise,
    shoot_date = q.shoot_date, shoot_city = q.shoot_city, agreed_plan = v_plan,
    status = 'rostering', updated_at = now()
    WHERE id = q.experience_id;

  PERFORM experience_console_audit('experience.quote_accepted', 'experiences', q.experience_id,
    jsonb_build_object('quote_id', q.id, 'version', q.version, 'accepted_by', CASE WHEN q.proposed_by = 'guapd' THEN 'brand' ELSE 'guapd' END,
      'channel', p_channel, 'total_paise', q.total_paise, 'shoot_date', q.shoot_date, 'shoot_city', q.shoot_city,
      'videos_sold', q.deliverable_count, 'plan_videos', v_plan -> 'plan_videos',
      'status_before', 'requested', 'status_after', 'rostering'));
END;
$function$;

-- ── H. Who may call what ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION experience_cost_total(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_cost_category_ok(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION compute_experience_pnl(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_pnl_store(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_pnl_refresh_from_row() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_cost_validate(uuid, text, text, text, numeric, bigint, bigint, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_console_costs(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_cost_add(uuid, text, text, text, numeric, bigint, bigint, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_cost_update(uuid, text, text, text, numeric, bigint, bigint, text, uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_cost_remove(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_complete(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_reopen(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_costs(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_cost_add(uuid, text, text, text, numeric, bigint, bigint, text, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_cost_update(uuid, text, text, text, numeric, bigint, bigint, text, uuid, text, timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_cost_remove(uuid, text, timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_complete(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_reopen(uuid, text) TO authenticated;

-- ── I. Backfill the stored margin for open Experiences ─────────────────────
SELECT experience_pnl_store(e.id, 'backfill_0537')
FROM experiences e WHERE e.status NOT IN ('draft', 'requested', 'cancelled', 'complete');
