-- 0543: "Not contacted yet" for creators not on Guapd (0541).
-- Every entry used to start as 'contacted', so a creator staff had only
-- noted down already read "Contacted". New first state 'not_contacted' (the
-- default), and the add form says where things stand. Open states everywhere
-- (the list's Guapd match, edits, status changes, the P&L estimate) now include
-- it. Bodies are the live staging definitions with only that list changed.
-- Staging only.

ALTER TABLE experience_roster_prospects DROP CONSTRAINT IF EXISTS experience_roster_prospects_status_check;
ALTER TABLE experience_roster_prospects ADD CONSTRAINT experience_roster_prospects_status_check
  CHECK (status IN ('not_contacted', 'contacted', 'agreed', 'onboarding', 'linked', 'dropped'));
ALTER TABLE experience_roster_prospects ALTER COLUMN status SET DEFAULT 'not_contacted';

CREATE OR REPLACE FUNCTION public.compute_experience_pnl(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_billed bigint; v_received bigint; v_invoices int; v_agreed bigint;
  v_gross bigint; v_net bigint; v_per_leg jsonb;
  v_awaiting int; v_awaiting_net bigint; v_declined int; v_no_shoot int;
  v_costs bigint; v_by_cat jsonb;
  v_subtotal bigint; v_fee_kept bigint; v_margin bigint;
  v_invoiced_total bigint; v_gst bigint; v_brand_tds bigint; v_drafts int;
  v_paid_out bigint; v_creator_tds bigint; v_payouts_paid int;
  v_prospects int; v_prospects_est bigint;
BEGIN
  -- Revenue = issued + paid invoices, BEFORE GST (GST is collected for the
  -- government: a liability, never revenue). A void counts for nothing.
  SELECT coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(si.total_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(coalesce(si.cgst_paise, 0) + coalesce(si.sgst_paise, 0) + coalesce(si.igst_paise, 0)) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         count(*) FILTER (WHERE si.status IN ('issued', 'paid'))::int,
         count(*) FILTER (WHERE si.status = 'draft')::int
    INTO v_billed, v_invoiced_total, v_gst, v_invoices, v_drafts
    FROM service_invoices si WHERE si.experience_id = p_experience_id;
  -- Cash in: payments recorded (not reversed) on live invoices; TDS the brand withheld.
  SELECT coalesce(sum(x.amount_paise), 0)::bigint, coalesce(sum(x.tds_paise), 0)::bigint
    INTO v_received, v_brand_tds
    FROM service_invoice_payments x JOIN service_invoices si ON si.id = x.invoice_id
    WHERE x.experience_id = p_experience_id AND x.reversed_at IS NULL AND si.status IN ('issued', 'paid');
  -- Cash out to creators: paid payouts (what left Guapd, and TDS withheld from them).
  SELECT coalesce(sum(p.net_amount_paise), 0)::bigint, coalesce(sum(p.tds_paise), 0)::bigint, count(*)::int
    INTO v_paid_out, v_creator_tds, v_payouts_paid
    FROM vendor_payouts p WHERE p.experience_id = p_experience_id AND p.reason = 'creator_fee' AND p.status = 'paid';
  SELECT e.brand_service_total_paise INTO v_agreed FROM experiences e WHERE e.id = p_experience_id;

  -- Accepted legs only (agreed onward), minus any creator recorded as not shooting.
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
      AND d.status IN ('agreed', 'delivered', 'revision', 'approved', 'paid', 'complete')
      AND NOT EXISTS (SELECT 1 FROM experience_roster r WHERE r.leg_deal_id = t.deal_id AND r.leg_shoot_outcome = 'did_not_shoot');

  SELECT count(*) FILTER (WHERE d.status = 'negotiating')::int,
         coalesce(sum(t.creator_net_paise) FILTER (WHERE d.status = 'negotiating'), 0)::bigint,
         count(*) FILTER (WHERE d.status IN ('declined', 'cancelled'))::int,
         count(*) FILTER (WHERE r.leg_shoot_outcome = 'did_not_shoot')::int
    INTO v_awaiting, v_awaiting_net, v_declined, v_no_shoot
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id;

  -- 0541: creators not on Guapd yet, agreed with the brand: an estimate only, never in the margin.
  SELECT count(*)::int, coalesce(sum(x.expected_total_paise), 0)::bigint INTO v_prospects, v_prospects_est
    FROM experience_roster_prospects x
    WHERE x.experience_id = p_experience_id AND x.status IN ('not_contacted', 'contacted', 'agreed', 'onboarding') AND x.brand_decision IS DISTINCT FROM 'rejected';

  v_costs := experience_cost_total(p_experience_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'total_paise', x.total) ORDER BY x.category), '[]'::jsonb)
    INTO v_by_cat
    FROM (SELECT cl.category, sum(cl.total_paise)::bigint AS total FROM experience_cost_lines cl
          WHERE cl.experience_id = p_experience_id AND cl.provided_by = 'guapd' AND cl.removed_at IS NULL
          GROUP BY cl.category) x;

  v_subtotal := v_billed - v_gross - v_costs;
  v_fee_kept := v_gross - v_net;
  v_margin := v_billed - v_net - v_costs;
  IF v_subtotal + v_fee_kept IS DISTINCT FROM v_margin THEN
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
    'legs_declined', v_declined, 'legs_pending', v_awaiting, 'legs_did_not_shoot', v_no_shoot,
    'per_leg', v_per_leg,
    -- 0540: the money loop.
    'invoiced_total_paise', v_invoiced_total, 'gst_liability_paise', v_gst, 'brand_tds_withheld_paise', v_brand_tds,
    'brand_outstanding_paise', v_invoiced_total - v_received - v_brand_tds, 'invoices_draft', v_drafts,
    'invoiced_vs_agreed_paise', CASE WHEN v_agreed IS NULL OR v_invoices = 0 THEN NULL ELSE v_billed - v_agreed END,
    'creator_paid_out_paise', v_paid_out, 'creator_tds_withheld_paise', v_creator_tds,
    'creator_payouts_paid', v_payouts_paid, 'creator_payouts_due', greatest(jsonb_array_length(v_per_leg) - v_payouts_paid, 0),
    'prospects_pending', v_prospects, 'prospects_estimate_paise', v_prospects_est);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_prospects(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_rows jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'full_name', x.full_name, 'instagram_handle', x.instagram_handle, 'phone', x.phone,
           'cost_basis', x.cost_basis, 'expected_day_rate_paise', x.expected_day_rate_paise, 'expected_days', x.expected_days,
           'expected_total_paise', x.expected_total_paise, 'status', x.status, 'brand_decision', x.brand_decision,
           'decision_channel', x.decision_channel, 'note', x.note, 'linked_creator_id', x.linked_creator_id,
           'linked_creator_name', lc.full_name, 'linked_at', x.linked_at, 'dropped_reason', x.dropped_reason,
           'created_at', x.created_at, 'updated_at', x.updated_at,
           -- Someone on Guapd with the same handle (they may have joined since).
           'match', (SELECT jsonb_build_object('creator_id', c.id, 'full_name', c.full_name, 'bookable', c.is_bookable,
                                               'on_roster', EXISTS (SELECT 1 FROM experience_roster r WHERE r.experience_id = p_experience_id AND r.creator_id = c.id))
                     FROM creators c
                     WHERE x.status IN ('not_contacted', 'contacted', 'agreed', 'onboarding') AND c.is_guapd IS FALSE
                       AND experience_clean_handle(c.handle) = x.instagram_handle
                     ORDER BY c.is_bookable DESC, c.created_at LIMIT 1)
         ) ORDER BY x.status = 'dropped', x.created_at), '[]'::jsonb)
    INTO v_rows
    FROM experience_roster_prospects x LEFT JOIN creators lc ON lc.id = x.linked_creator_id
    WHERE x.experience_id = p_experience_id;
  RETURN jsonb_build_object('status', v_status, 'prospects', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_prospect_open(p_prospect_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_pstatus text;
BEGIN
  SELECT x.experience_id INTO v_exp FROM experience_roster_prospects x WHERE x.id = p_prospect_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT x.status INTO v_pstatus FROM experience_roster_prospects x WHERE x.id = p_prospect_id FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('rostering', 'confirmed') THEN
    RAISE EXCEPTION 'The roster changes once the price is agreed, and before the shoot is scheduled';
  END IF;
  IF v_pstatus IS NULL OR v_pstatus NOT IN ('not_contacted', 'contacted', 'agreed', 'onboarding') THEN
    RAISE EXCEPTION 'This entry is %: it no longer changes', coalesce(v_pstatus, 'gone');
  END IF;
  RETURN v_exp;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_prospect_status(p_prospect_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_before text;
BEGIN
  PERFORM experience_console_require();
  IF p_status IS NULL OR p_status NOT IN ('not_contacted', 'contacted', 'agreed', 'onboarding') THEN
    RAISE EXCEPTION 'Not contacted yet, contacted, agreed or onboarding (linking and dropping have their own steps)';
  END IF;
  v_exp := experience_prospect_open(p_prospect_id);
  SELECT x.status INTO v_before FROM experience_roster_prospects x WHERE x.id = p_prospect_id;
  UPDATE experience_roster_prospects SET status = p_status, updated_at = now() WHERE id = p_prospect_id;
  PERFORM experience_console_audit('experience.prospect_status_set', 'experience_roster_prospects', p_prospect_id,
    jsonb_build_object('experience_id', v_exp, 'status_before', v_before, 'status_after', p_status));
END;
$function$;

-- Add: now says where things stand (the old 9-argument version is dropped).
DROP FUNCTION IF EXISTS experience_console_prospect_add(uuid, text, text, text, text, bigint, numeric, bigint, text);
CREATE OR REPLACE FUNCTION public.experience_console_prospect_add(p_experience_id uuid, p_full_name text, p_handle text, p_phone text, p_cost_basis text, p_day_rate_paise bigint, p_days numeric, p_flat_paise bigint, p_note text, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_total bigint; v_handle text := experience_clean_handle(p_handle); v_id uuid;
BEGIN
  PERFORM experience_console_require();
  -- Where things stand when they are added; NULL is refused, never defaulted.
  IF p_status IS NULL OR p_status NOT IN ('not_contacted', 'contacted', 'agreed', 'onboarding') THEN
    RAISE EXCEPTION 'Pick where things stand: not contacted yet, contacted, agreed or onboarding';
  END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'Creators are added once the price is agreed, and before the shoot is scheduled'; END IF;
  v_total := experience_prospect_check(p_full_name, p_handle, p_phone, p_cost_basis, p_day_rate_paise, p_days, p_flat_paise, p_note);
  IF EXISTS (SELECT 1 FROM creators c WHERE c.is_bookable IS TRUE AND c.is_guapd IS FALSE AND experience_clean_handle(c.handle) = v_handle) THEN
    RAISE EXCEPTION '@% is already on Guapd. Add them from the pool', v_handle;
  END IF;
  IF EXISTS (SELECT 1 FROM experience_roster_prospects x WHERE x.experience_id = p_experience_id AND x.instagram_handle = v_handle AND x.status <> 'dropped') THEN
    RAISE EXCEPTION '@% is already on this list', v_handle;
  END IF;
  INSERT INTO experience_roster_prospects (experience_id, full_name, instagram_handle, phone, cost_basis, expected_day_rate_paise,
    expected_days, expected_total_paise, note, created_by, status)
  VALUES (p_experience_id, btrim(p_full_name), v_handle, nullif(btrim(coalesce(p_phone, '')), ''), p_cost_basis,
    CASE WHEN p_cost_basis = 'per_day' THEN p_day_rate_paise END, CASE WHEN p_cost_basis = 'per_day' THEN p_days END, v_total,
    nullif(btrim(coalesce(p_note, '')), ''), my_user_id(), p_status)
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.prospect_added', 'experience_roster_prospects', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'handle', v_handle, 'status', p_status));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION experience_prospect_open(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION compute_experience_pnl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION experience_console_prospect_add(uuid, text, text, text, text, bigint, numeric, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_prospect_add(uuid, text, text, text, text, bigint, numeric, bigint, text, text) TO authenticated;
