-- 0563 (collab C3): the affiliate commission.
--   After the brand marks every collab ad on a creator deal complete, the
--   creator enters the sales through their affiliate link and raises an invoice
--   for the commission: sales × the affiliate % locked on the deal (half up),
--   less the deal's own Guapd fee % (30 Growth / 15 Deals). Guapd approves it or
--   turns it down with a reason (the creator may claim again); or closes it when
--   no commission is due. Finance bills approved commissions to the brand on a
--   follow-on service invoice (GST entered, as always) and pays the creator as a
--   'follow_on' payout, maker-checker as for the main fee.
--   * deal_follow_ons (0524) holds the claim; experience_creator_invoices.follow_on_id
--     the creator's invoice; vendor_payouts reason 'follow_on' the payout.
--   * Every "main invoice" lookup now also excludes follow_on_id.
--   * P&L: approved commissions are creator cost (gross/net, fee kept); the
--     follow-on invoice is revenue. Completion waits for collab ads complete and
--     commissions paid or closed and billed.
--   Brand paying the creator directly and TDS rules come later.

-- ── Schema ───────────────────────────────────────────────────────────────────
-- deal_follow_ons (0524) is the commission record: one live affiliate claim per
-- creator deal. 'sales_entered' = claimed with its invoice; 'verified' = Guapd
-- approved; 'paid' = its payout paid; 'cancelled' = not approved (the creator
-- may claim again); 'closed' = Guapd closed it, no commission due (final).
ALTER TABLE deal_follow_ons DROP CONSTRAINT IF EXISTS deal_follow_ons_status_check;
ALTER TABLE deal_follow_ons ADD CONSTRAINT deal_follow_ons_status_check
  CHECK (status IN ('pending', 'sales_entered', 'verified', 'billed', 'paid', 'cancelled', 'closed'));
ALTER TABLE deal_follow_ons ADD COLUMN IF NOT EXISTS platform_fee_paise bigint;
ALTER TABLE deal_follow_ons ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE deal_follow_ons ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE deal_follow_ons ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE deal_follow_ons ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE deal_follow_ons DROP CONSTRAINT IF EXISTS dfo_affiliate_figures;
-- An affiliate claim: commission = sales × % (half up), fee at the deal's locked %, net = commission − fee.
ALTER TABLE deal_follow_ons ADD CONSTRAINT dfo_affiliate_figures CHECK (
  type IS DISTINCT FROM 'affiliate' OR status = 'closed' OR (
    basis = 'pct_of_sales' AND pct > 0 AND sales_figure_paise > 0
    AND creator_gross_paise = round(sales_figure_paise::numeric * pct / 100)::bigint AND creator_gross_paise > 0
    AND platform_fee_paise = round(creator_gross_paise::numeric * platform_pct / 100)::bigint
    AND creator_net_paise = creator_gross_paise - platform_fee_paise AND creator_net_paise > 0));
ALTER TABLE deal_follow_ons DROP CONSTRAINT IF EXISTS dfo_review_shape;
ALTER TABLE deal_follow_ons ADD CONSTRAINT dfo_review_shape CHECK (
  (status NOT IN ('cancelled', 'closed') OR length(btrim(coalesce(review_note, ''))) BETWEEN 3 AND 300)
  AND (status NOT IN ('verified', 'paid', 'cancelled', 'closed') OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS dfo_one_live_affiliate ON deal_follow_ons (deal_id) WHERE type = 'affiliate' AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS dfo_deal_idx ON deal_follow_ons (deal_id);

-- The commission invoice is a creator invoice of its own (like an extra's).
ALTER TABLE experience_creator_invoices ADD COLUMN IF NOT EXISTS follow_on_id uuid REFERENCES deal_follow_ons (id);
ALTER TABLE experience_creator_invoices DROP CONSTRAINT IF EXISTS eci_one_kind;
ALTER TABLE experience_creator_invoices ADD CONSTRAINT eci_one_kind CHECK (extra_id IS NULL OR follow_on_id IS NULL);
DROP INDEX IF EXISTS eci_one_issued;
CREATE UNIQUE INDEX eci_one_issued ON experience_creator_invoices (deal_id) WHERE status = 'issued' AND extra_id IS NULL AND follow_on_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS eci_one_issued_follow_on ON experience_creator_invoices (follow_on_id) WHERE status = 'issued' AND follow_on_id IS NOT NULL;

-- The commission is paid on its own: reason follow_on, exactly the approved claim.
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_follow_on_statement;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_follow_on_statement CHECK ((reason = 'follow_on') = (follow_on_id IS NOT NULL)
  AND (reason IS DISTINCT FROM 'follow_on' OR (deal_id IS NOT NULL AND gross_paise IS NOT NULL AND platform_pct IS NOT NULL
       AND platform_fee_paise IS NOT NULL AND amount_paise = gross_paise - platform_fee_paise AND allowance_paise = 0)));
CREATE UNIQUE INDEX IF NOT EXISTS vp_one_live_follow_on ON vendor_payouts (follow_on_id) WHERE reason = 'follow_on' AND status NOT IN ('cancelled', 'failed');

-- ── Helpers ──────────────────────────────────────────────────────────────────
-- A creator deal's commission can be claimed: affiliate % locked on it, at least one collab post, every
-- collab ad marked complete by the brand.
CREATE OR REPLACE FUNCTION public.experience_affiliate_claimable(p_deal_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT t.affiliate_pct IS NOT NULL FROM experience_creator_terms t WHERE t.deal_id = p_deal_id)
    AND EXISTS (SELECT 1 FROM experience_collab_posts p WHERE p.deal_id = p_deal_id AND p.kind = 'collab' AND p.status <> 'cancelled')
    AND NOT EXISTS (SELECT 1 FROM experience_collab_posts p WHERE p.deal_id = p_deal_id AND p.kind = 'collab' AND p.status IN ('sent', 'posted')), false)
$function$;
REVOKE ALL ON FUNCTION public.experience_affiliate_claimable(uuid) FROM PUBLIC, anon, authenticated;

-- ── The creator claims: the sales through their link, and the invoice for the commission ──
CREATE OR REPLACE FUNCTION public.creator_affiliate_claim(p_deal_id uuid, p_sales_paise bigint, p_confirmed boolean,
  p_billing_name text, p_gstin text, p_expected_payable_paise bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_creator uuid; v_ref text; v_status text; v_estatus text; v_pct numeric; v_fee_pct numeric;
  v_gross bigint; v_fee bigint; v_net bigint; v_name text; v_gstin text; v_n int; v_number text; v_fo uuid; v_inv uuid;
BEGIN
  SELECT d.experience_id, d.creator_id, d.deal_ref, d.status::text INTO v_exp, v_creator, v_ref, v_status
    FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg' AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()
    FOR UPDATE;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF p_confirmed IS NOT TRUE THEN RAISE EXCEPTION 'Confirm the sales figure is what the brand''s affiliate link recorded'; END IF;
  IF v_status IS NULL OR v_status NOT IN ('agreed', 'paid') THEN RAISE EXCEPTION 'This deal is not open'; END IF;
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp;
  IF v_estatus IS NULL OR v_estatus NOT IN ('shoot_done', 'delivering') THEN RAISE EXCEPTION 'This Experience is not taking commission claims'; END IF;
  SELECT t.affiliate_pct, t.platform_pct INTO v_pct, v_fee_pct FROM experience_creator_terms t WHERE t.deal_id = p_deal_id;
  IF v_pct IS NULL THEN RAISE EXCEPTION 'There is no affiliate commission on this deal'; END IF;
  IF experience_affiliate_claimable(p_deal_id) IS NOT TRUE THEN RAISE EXCEPTION 'You can claim once the brand marks your collab ads complete'; END IF;
  IF EXISTS (SELECT 1 FROM deal_follow_ons f WHERE f.deal_id = p_deal_id AND f.type = 'affiliate' AND f.status <> 'cancelled') THEN
    RAISE EXCEPTION 'You have already claimed this commission';
  END IF;
  IF p_sales_paise IS NULL OR p_sales_paise <= 0 OR p_sales_paise > 100000000000 THEN RAISE EXCEPTION 'Enter the sales amount, more than zero'; END IF;
  v_gross := round(p_sales_paise::numeric * v_pct / 100)::bigint;
  IF v_gross <= 0 THEN RAISE EXCEPTION 'That sales amount earns no commission'; END IF;
  v_fee := round(v_gross::numeric * v_fee_pct / 100)::bigint;
  v_net := v_gross - v_fee;
  IF p_expected_payable_paise IS NULL OR p_expected_payable_paise IS DISTINCT FROM v_net THEN
    RAISE EXCEPTION 'These figures have changed. Refresh the page and check them again';
  END IF;
  v_name := nullif(btrim(coalesce(p_billing_name, '')), '');
  IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Enter the name to invoice from'; END IF;
  v_gstin := nullif(upper(btrim(coalesce(p_gstin, ''))), '');
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN RAISE EXCEPTION 'That GSTIN is not valid'; END IF;

  INSERT INTO deal_follow_ons (experience_id, deal_id, creator_id, type, trigger, basis, invoicer, pct, sales_figure_paise, sales_entered_by,
    creator_gross_paise, platform_pct, platform_fee_paise, creator_net_paise, status, claimed_at)
  VALUES (v_exp, p_deal_id, v_creator, 'affiliate', 'sales_final', 'pct_of_sales', 'creator', v_pct, p_sales_paise, my_user_id(),
    v_gross, v_fee_pct, v_fee, v_net, 'sales_entered', now())
  RETURNING id INTO v_fo;
  SELECT count(*) + 1 INTO v_n FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.follow_on_id IS NOT NULL;
  v_number := 'CI-' || coalesce(v_ref, left(p_deal_id::text, 8)) || '-AFF' || CASE WHEN v_n > 1 THEN '-' || v_n::text ELSE '' END;
  INSERT INTO experience_creator_invoices (deal_id, experience_id, creator_id, follow_on_id, number, shoot_confirmed_at, billing_name, gstin,
    day_rate_paise, days, gross_paise, platform_pct, platform_fee_paise, net_paise, allowance_paise, payable_paise, issued_by)
  VALUES (p_deal_id, v_exp, v_creator, v_fo, v_number, now(), v_name, v_gstin,
    v_gross, 1, v_gross, v_fee_pct, v_fee, v_net, 0, v_net, my_user_id())
  RETURNING id INTO v_inv;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (p_deal_id, my_user_id(), 'experience.affiliate_claimed', jsonb_build_object('follow_on_id', v_fo, 'invoice_id', v_inv, 'number', v_number,
    'sales_paise', p_sales_paise, 'affiliate_pct', v_pct, 'gross_paise', v_gross, 'platform_pct', v_fee_pct, 'net_paise', v_net));
  PERFORM experience_console_audit('experience.affiliate_claimed_by_creator', 'deal_follow_ons', v_fo,
    jsonb_build_object('experience_id', v_exp, 'deal_id', p_deal_id, 'invoice_id', v_inv, 'status_after', 'sales_entered',
      'sales_paise', p_sales_paise, 'gross_paise_after', v_gross, 'net_paise_after', v_net, 'channel', 'portal'));
  RETURN jsonb_build_object('id', v_fo, 'number', v_number);
END;
$function$;

CREATE OR REPLACE FUNCTION public.creator_affiliate_invoice_doc(p_follow_on_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF my_creator_id() IS NULL OR NOT EXISTS (SELECT 1 FROM deal_follow_ons f WHERE f.id = p_follow_on_id AND f.creator_id = my_creator_id()) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT experience_creator_invoice_doc_json(i.id) INTO v FROM experience_creator_invoices i WHERE i.follow_on_id = p_follow_on_id AND i.status = 'issued';
  IF v IS NULL THEN RAISE EXCEPTION 'No invoice yet'; END IF;
  RETURN v;
END;
$function$;

-- ── Guapd reviews the claim (operational, like the creator payout) ────────────
CREATE OR REPLACE FUNCTION public.experience_console_affiliate_review(p_follow_on_id uuid, p_approve boolean, p_note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_exp uuid; v_deal uuid; v_status text; v_estatus text; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT f.experience_id, f.deal_id INTO v_exp, v_deal FROM deal_follow_ons f WHERE f.id = p_follow_on_id AND f.type = 'affiliate';
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Commission claim not found'; END IF;
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT f.status INTO v_status FROM deal_follow_ons f WHERE f.id = p_follow_on_id FOR UPDATE;
  IF v_estatus IS NULL OR v_estatus NOT IN ('shoot_done', 'delivering') THEN RAISE EXCEPTION 'This Experience is closed'; END IF;
  IF v_status IS DISTINCT FROM 'sales_entered' THEN RAISE EXCEPTION 'Only a claim waiting for review is approved or turned down'; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Approve, or turn it down'; END IF;
  IF p_approve THEN
    UPDATE deal_follow_ons SET status = 'verified', sales_verified_by = my_user_id(), sales_verified_at = now(),
           reviewed_by = my_user_id(), reviewed_at = now(), review_note = v_note, updated_at = now() WHERE id = p_follow_on_id;
  ELSE
    IF v_note IS NULL OR length(v_note) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Tell the creator why (3 to 300 characters)'; END IF;
    UPDATE experience_creator_invoices SET status = 'void', voided_at = now(), voided_by = my_user_id(), void_reason = left('Claim not approved: ' || v_note, 500)
      WHERE follow_on_id = p_follow_on_id AND status = 'issued';
    UPDATE deal_follow_ons SET status = 'cancelled', reviewed_by = my_user_id(), reviewed_at = now(), review_note = v_note, updated_at = now()
      WHERE id = p_follow_on_id;
  END IF;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), CASE WHEN p_approve THEN 'experience.affiliate_approved' ELSE 'experience.affiliate_turned_down' END,
          jsonb_build_object('follow_on_id', p_follow_on_id));
  PERFORM experience_console_audit(CASE WHEN p_approve THEN 'experience.affiliate_approved' ELSE 'experience.affiliate_turned_down' END,
    'deal_follow_ons', p_follow_on_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'status_before', v_status,
      'status_after', CASE WHEN p_approve THEN 'verified' ELSE 'cancelled' END, 'note', v_note));
END;
$function$;

-- No commission due on a deal (no sales, or the creator will not claim): Guapd closes it (final).
CREATE OR REPLACE FUNCTION public.experience_console_affiliate_close(p_deal_id uuid, p_reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_exp uuid; v_creator uuid; v_estatus text; v_pct numeric; v_fee_pct numeric; v_id uuid; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT d.experience_id, d.creator_id INTO v_exp, v_creator FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Creator deal not found'; END IF;
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  IF v_estatus IS NULL OR v_estatus NOT IN ('shoot_done', 'delivering') THEN RAISE EXCEPTION 'This Experience is closed'; END IF;
  SELECT t.affiliate_pct, t.platform_pct INTO v_pct, v_fee_pct FROM experience_creator_terms t WHERE t.deal_id = p_deal_id;
  IF v_pct IS NULL THEN RAISE EXCEPTION 'There is no affiliate commission on this deal'; END IF;
  IF EXISTS (SELECT 1 FROM deal_follow_ons f WHERE f.deal_id = p_deal_id AND f.type = 'affiliate' AND f.status <> 'cancelled') THEN
    RAISE EXCEPTION 'This deal already has a commission claim';
  END IF;
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why no commission is due (3 to 300 characters)'; END IF;
  INSERT INTO deal_follow_ons (experience_id, deal_id, creator_id, type, trigger, basis, invoicer, pct, platform_pct, status,
    reviewed_by, reviewed_at, review_note)
  VALUES (v_exp, p_deal_id, v_creator, 'affiliate', 'sales_final', 'pct_of_sales', 'creator', v_pct, v_fee_pct, 'closed',
    my_user_id(), now(), v_reason)
  RETURNING id INTO v_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (p_deal_id, my_user_id(), 'experience.affiliate_closed', jsonb_build_object('follow_on_id', v_id, 'reason', v_reason));
  PERFORM experience_console_audit('experience.affiliate_closed', 'deal_follow_ons', v_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', p_deal_id, 'status_after', 'closed', 'reason', v_reason));
  RETURN v_id;
END;
$function$;

-- Guapd requests the commission payout (operational), maker-checker as for the main fee.
CREATE OR REPLACE FUNCTION public.experience_console_affiliate_payout_request(p_follow_on_id uuid, p_tds_paise bigint)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_deal uuid; v_exp uuid; v_creator uuid; v_status text; f record; v_name text; v_vendor uuid; v_attempt int; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT x.deal_id, x.experience_id, x.creator_id INTO v_deal, v_exp, v_creator FROM deal_follow_ons x WHERE x.id = p_follow_on_id AND x.type = 'affiliate';
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Commission claim not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('shoot_done', 'delivering') THEN RAISE EXCEPTION 'Commissions are paid before Complete'; END IF;
  SELECT x.status, x.creator_gross_paise, x.platform_pct, x.platform_fee_paise, x.creator_net_paise INTO f FROM deal_follow_ons x WHERE x.id = p_follow_on_id FOR UPDATE;
  IF f.status IS DISTINCT FROM 'verified' THEN RAISE EXCEPTION 'Approve the claim before paying it'; END IF;
  IF NOT EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.follow_on_id = p_follow_on_id AND i.status = 'issued') THEN
    RAISE EXCEPTION 'The creator''s commission invoice is missing';
  END IF;
  IF p_tds_paise IS NULL OR p_tds_paise < 0 OR p_tds_paise > f.creator_net_paise THEN RAISE EXCEPTION 'TDS must be between 0 and the amount due'; END IF;
  IF EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.follow_on_id = p_follow_on_id AND p.reason = 'follow_on' AND p.status NOT IN ('cancelled', 'failed')) THEN
    RAISE EXCEPTION 'This commission already has a payout. Cancel it to request again';
  END IF;
  SELECT c.full_name INTO v_name FROM creators c WHERE c.id = v_creator;
  INSERT INTO vendors (kind, creator_id, display_name) VALUES ('creator', v_creator, coalesce(v_name, 'Creator')) ON CONFLICT (creator_id) DO NOTHING;
  SELECT v.id INTO v_vendor FROM vendors v WHERE v.creator_id = v_creator;
  SELECT count(*) + 1 INTO v_attempt FROM vendor_payouts p WHERE p.follow_on_id = p_follow_on_id;
  INSERT INTO vendor_payouts (experience_id, deal_id, follow_on_id, vendor_id, reason, gross_paise, platform_pct, platform_fee_paise,
    amount_paise, allowance_paise, tds_paise, net_amount_paise, status, provider, idempotency_key, created_by)
  VALUES (v_exp, v_deal, p_follow_on_id, v_vendor, 'follow_on', f.creator_gross_paise, f.platform_pct, f.platform_fee_paise,
    f.creator_net_paise, 0, p_tds_paise, f.creator_net_paise - p_tds_paise, 'requested', 'manual', 'follow_on:' || p_follow_on_id::text || ':' || v_attempt::text, my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.payout_requested', 'vendor_payouts', v_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'follow_on_id', p_follow_on_id, 'creator_id', v_creator, 'attempt', v_attempt,
      'amount_paise_after', f.creator_net_paise, 'tds_paise', p_tds_paise));
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.payout_requested', jsonb_build_object('payout_id', v_id, 'follow_on_id', p_follow_on_id));
  RETURN v_id;
END;
$function$;

-- Finance bills approved commissions to the brand: one follow-on service invoice (a draft), lines per creator.
-- GST is entered, never computed (as for every invoice). Unbilled = not on a live (draft/issued/paid) invoice.
CREATE OR REPLACE FUNCTION public.experience_console_affiliate_bill(p_experience_id uuid, p_follow_on_ids uuid[], p_description text,
  p_gst_rate_pct numeric, p_cgst_paise bigint, p_sgst_paise bigint, p_igst_paise bigint, p_due_date date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_brand uuid; v_registered boolean; v_gst bigint; v_id uuid; v_n int; v_ok int; v_sub bigint; v_lines jsonb;
BEGIN
  PERFORM experience_finance_require();
  SELECT e.status, e.brand_id INTO v_status, v_brand FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF experience_invoice_window(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'Invoices are raised once the price is agreed and before Complete'; END IF;
  v_n := coalesce(array_length(p_follow_on_ids, 1), 0);
  IF v_n = 0 OR v_n > 100 THEN RAISE EXCEPTION 'Pick the commissions to bill'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_follow_on_ids) x WHERE x IS NULL) THEN RAISE EXCEPTION 'Pick the commissions to bill'; END IF;
  PERFORM 1 FROM deal_follow_ons f WHERE f.id = ANY (p_follow_on_ids) FOR UPDATE;
  SELECT count(*), coalesce(sum(f.creator_gross_paise), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object('description',
           'Affiliate commission: ' || c.full_name || ', ' || trim(trailing '.' from trim(trailing '0' from f.pct::text)) || '% of sales ₹'
             || to_char(f.sales_figure_paise / 100.0, 'FM99,99,99,99,990.00'),
           'amount_paise', f.creator_gross_paise) ORDER BY c.full_name), '[]'::jsonb)
    INTO v_ok, v_sub, v_lines
    FROM deal_follow_ons f JOIN creators c ON c.id = f.creator_id
    WHERE f.id = ANY (p_follow_on_ids) AND f.experience_id = p_experience_id AND f.type = 'affiliate' AND f.status IN ('verified', 'paid')
      AND (f.service_invoice_id IS NULL OR EXISTS (SELECT 1 FROM service_invoices si WHERE si.id = f.service_invoice_id AND si.status = 'void'));
  IF v_ok IS DISTINCT FROM (SELECT count(DISTINCT x) FROM unnest(p_follow_on_ids) x)::int THEN
    RAISE EXCEPTION 'Only approved commissions on this Experience that are not billed yet can be billed';
  END IF;
  SELECT s.gst_registered INTO v_registered FROM guapd_billing_settings s WHERE s.id;
  IF v_registered IS NULL THEN RAISE EXCEPTION 'Add Guapd''s billing details first'; END IF;
  v_gst := experience_invoice_check('follow_on', NULL, p_description, v_sub, p_gst_rate_pct, p_cgst_paise, p_sgst_paise, p_igst_paise, p_due_date, v_registered);
  INSERT INTO service_invoices (experience_id, brand_id, kind, source, status, description, lines, subtotal_paise,
    gst_rate_pct, cgst_paise, sgst_paise, igst_paise, total_paise, due_date, supplier_gst_registered, created_by)
  VALUES (p_experience_id, v_brand, 'follow_on', NULL, 'draft', btrim(p_description), v_lines, v_sub,
    p_gst_rate_pct, nullif(p_cgst_paise, 0), nullif(p_sgst_paise, 0), nullif(p_igst_paise, 0), v_sub + v_gst,
    p_due_date, v_registered, my_user_id())
  RETURNING id INTO v_id;
  UPDATE deal_follow_ons SET service_invoice_id = v_id, updated_at = now() WHERE id = ANY (p_follow_on_ids);
  PERFORM experience_console_audit('experience.invoice_drafted', 'service_invoices', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'kind', 'follow_on', 'follow_on_ids', to_jsonb(p_follow_on_ids), 'subtotal_paise', v_sub));
  RETURN v_id;
END;
$function$;

-- Staff list of commission claims on an Experience (operational: creator pay is operational).
CREATE OR REPLACE FUNCTION public.experience_console_affiliates(p_experience_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'deal_id', t.deal_id, 'creator_name', c.full_name, 'affiliate_pct', t.affiliate_pct, 'platform_pct', t.platform_pct,
      'claimable', coalesce(experience_affiliate_claimable(t.deal_id), false),
      'collabs', (SELECT count(*) FROM experience_collab_posts p WHERE p.deal_id = t.deal_id AND p.kind = 'collab' AND p.status <> 'cancelled'),
      'collabs_complete', (SELECT count(*) FROM experience_collab_posts p WHERE p.deal_id = t.deal_id AND p.kind = 'collab' AND p.status = 'ad_complete'),
      'claim', (SELECT jsonb_build_object('id', f.id, 'status', f.status, 'sales_paise', f.sales_figure_paise, 'gross_paise', f.creator_gross_paise,
                  'platform_fee_paise', f.platform_fee_paise, 'net_paise', f.creator_net_paise, 'claimed_at', f.claimed_at,
                  'reviewed_at', f.reviewed_at, 'review_note', f.review_note,
                  'billed_on', (SELECT jsonb_build_object('id', si.id, 'number', si.number, 'status', si.status) FROM service_invoices si
                                WHERE si.id = f.service_invoice_id AND si.status <> 'void'),
                  'invoice', (SELECT jsonb_build_object('id', i.id, 'number', i.number, 'issued_at', i.issued_at, 'payable_paise', i.payable_paise, 'gstin', i.gstin)
                              FROM experience_creator_invoices i WHERE i.follow_on_id = f.id AND i.status = 'issued'),
                  'payout', (SELECT jsonb_build_object('id', p.id, 'status', p.status, 'amount_paise', p.amount_paise, 'tds_paise', p.tds_paise,
                                'net_amount_paise', p.net_amount_paise, 'requested_by_name', coalesce(ru.full_name, ru.email), 'requested_at', p.created_at,
                                'approved_by_name', coalesce(au.full_name, au.email), 'approved_at', p.approved_at, 'paid_on', p.paid_on, 'method', p.method,
                                'reference', p.external_ref, 'has_proof', p.proof_path IS NOT NULL, 'i_requested', p.created_by IS NOT DISTINCT FROM v_me)
                             FROM vendor_payouts p LEFT JOIN users ru ON ru.id = p.created_by LEFT JOIN users au ON au.id = p.approved_by
                             WHERE p.follow_on_id = f.id AND p.reason = 'follow_on' AND p.status NOT IN ('cancelled', 'failed')))
                FROM deal_follow_ons f WHERE f.deal_id = t.deal_id AND f.type = 'affiliate'
                ORDER BY f.status = 'cancelled', f.created_at DESC LIMIT 1)
    ) ORDER BY c.full_name), '[]'::jsonb)
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id JOIN creators c ON c.id = t.creator_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL AND t.affiliate_pct IS NOT NULL
      AND d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome = 'done');
END;
$function$;

-- The creator's own commission, for creator_leg_context.
CREATE OR REPLACE FUNCTION public.experience_affiliate_for_creator(p_deal_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN t.affiliate_pct IS NULL THEN NULL ELSE jsonb_build_object(
    'affiliate_pct', t.affiliate_pct, 'platform_pct', t.platform_pct,
    'claimable', coalesce(experience_affiliate_claimable(p_deal_id), false),
    'can_claim', coalesce(experience_affiliate_claimable(p_deal_id) AND d.status IN ('agreed', 'paid') AND e.status IN ('shoot_done', 'delivering')
                 AND NOT EXISTS (SELECT 1 FROM deal_follow_ons f WHERE f.deal_id = p_deal_id AND f.type = 'affiliate' AND f.status <> 'cancelled'), false),
    'claim', (SELECT jsonb_build_object('id', f.id, 'status', f.status, 'sales_paise', f.sales_figure_paise, 'gross_paise', f.creator_gross_paise,
                'platform_fee_paise', f.platform_fee_paise, 'net_paise', f.creator_net_paise, 'claimed_at', f.claimed_at, 'reviewed_at', f.reviewed_at,
                'review_note', CASE WHEN f.status IN ('cancelled', 'closed') THEN f.review_note END,
                'invoice', (SELECT jsonb_build_object('number', i.number, 'issued_at', i.issued_at, 'payable_paise', i.payable_paise)
                            FROM experience_creator_invoices i WHERE i.follow_on_id = f.id AND i.status = 'issued'),
                'payout', (SELECT jsonb_build_object('status', p.status, 'net_paise', p.amount_paise, 'tds_paise', p.tds_paise, 'paid_paise', p.net_amount_paise,
                              'paid_on', p.paid_on, 'reference', CASE WHEN p.status = 'paid' THEN p.external_ref END)
                           FROM vendor_payouts p WHERE p.follow_on_id = f.id AND p.reason = 'follow_on' AND p.status NOT IN ('cancelled', 'failed')))
              FROM deal_follow_ons f WHERE f.deal_id = p_deal_id AND f.type = 'affiliate'
              ORDER BY f.status = 'cancelled', f.created_at DESC LIMIT 1)) END
  FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id JOIN experiences e ON e.id = t.experience_id
  WHERE t.deal_id = p_deal_id
$function$;
REVOKE ALL ON FUNCTION public.experience_affiliate_for_creator(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.creator_affiliate_claim(uuid, bigint, boolean, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.creator_affiliate_invoice_doc(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_affiliate_review(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_affiliate_close(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_affiliate_payout_request(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_affiliate_bill(uuid, uuid[], text, numeric, bigint, bigint, bigint, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_affiliates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creator_affiliate_claim(uuid, bigint, boolean, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_affiliate_invoice_doc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_affiliate_review(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_affiliate_close(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_affiliate_payout_request(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_affiliate_bill(uuid, uuid[], text, numeric, bigint, bigint, bigint, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_affiliates(uuid) TO authenticated;

-- ── Live definitions, patched for commissions ──
CREATE OR REPLACE FUNCTION public.guard_experience_creator_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Kept, never deleted; only the service role may remove rows (test teardown), as with counters.
    IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A creator invoice is never deleted; void it' USING ERRCODE = '42501'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'A void creator invoice does not change' USING ERRCODE = '42501'; END IF;
  IF (NEW.id, NEW.deal_id, NEW.experience_id, NEW.creator_id, NEW.number, NEW.shoot_confirmed_at, NEW.billing_name, NEW.gstin,
      NEW.day_rate_paise, NEW.days, NEW.gross_paise, NEW.platform_pct, NEW.platform_fee_paise, NEW.net_paise, NEW.allowance_paise,
      NEW.payable_paise, NEW.issued_at, NEW.issued_by, NEW.extra_id, NEW.follow_on_id)
     IS DISTINCT FROM
     (OLD.id, OLD.deal_id, OLD.experience_id, OLD.creator_id, OLD.number, OLD.shoot_confirmed_at, OLD.billing_name, OLD.gstin,
      OLD.day_rate_paise, OLD.days, OLD.gross_paise, OLD.platform_pct, OLD.platform_fee_paise, OLD.net_paise, OLD.allowance_paise,
      OLD.payable_paise, OLD.issued_at, OLD.issued_by, OLD.extra_id, OLD.follow_on_id)
     OR NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'An issued creator invoice can only be voided' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_creator_invoice_doc_json(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', i.id, 'number', i.number, 'status', i.status, 'issued_at', i.issued_at, 'shoot_confirmed_at', i.shoot_confirmed_at,
    'billing_name', i.billing_name, 'gstin', i.gstin,
    'extra', CASE WHEN x.id IS NULL THEN NULL ELSE jsonb_build_object('number', x.number, 'deliverables', x.deliverables, 'pricing', x.pricing,
              'unit_paise', x.unit_paise, 'items', x.items) END,
    'commission', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('sales_paise', f.sales_figure_paise, 'affiliate_pct', f.pct) END,
    'day_rate_paise', i.day_rate_paise, 'days', i.days, 'gross_paise', i.gross_paise, 'platform_pct', i.platform_pct,
    'platform_fee_paise', i.platform_fee_paise, 'net_paise', i.net_paise, 'allowance_paise', i.allowance_paise, 'payable_paise', i.payable_paise,
    'deal_ref', d.deal_ref, 'experience_title', e.title, 'brand_name', d.experience_brand_name, 'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
    'bill_to', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('legal_name', g.legal_name, 'address', g.address, 'state', g.state,
                 'gstin', g.gstin, 'pan', g.pan) END)
  FROM experience_creator_invoices i
  JOIN deals d ON d.id = i.deal_id
  JOIN experiences e ON e.id = i.experience_id
  LEFT JOIN experience_leg_extras x ON x.id = i.extra_id
  LEFT JOIN deal_follow_ons f ON f.id = i.follow_on_id
  LEFT JOIN guapd_billing_settings g ON g.id = true
  WHERE i.id = p_invoice_id;
$function$;

CREATE OR REPLACE FUNCTION public.creator_leg_context(p_deal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_ref text; v_brand_name text; v_title text;
  v_logo text; v_shoot_date date; v_shoot_city text; v_plan jsonb; v_estatus text;
  v_shared jsonb; v_override jsonb; v_brief jsonb;
  v_deliverables jsonb; v_aff int; v_ad int; v_boost int; v_outcome text;
  t_rate bigint; t_days numeric; t_gross bigint; t_pct numeric; t_net bigint; t_track text; t_allow bigint; t_aff_pct numeric;
  v_videos int; v_owner text; v_items jsonb; v_payout jsonb; v_counters jsonb; v_used int;
  v_ad_bought boolean; v_boost_bought boolean;
  v_invoice jsonb; v_extras jsonb;
BEGIN
  SELECT d.experience_id, d.status::text, d.deal_ref, d.experience_brand_name, d.title
    INTO v_exp, v_status, v_ref, v_brand_name, v_title
    FROM deals d
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
      AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id();
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;

  SELECT b.logo_url, e.shoot_date, e.shoot_city, e.agreed_plan, e.status, e.request_ad_rights IS TRUE, e.request_boost IS TRUE,
         jsonb_build_object('pitch', e.creator_brief, 'guidelines', e.creator_brief_guidelines, 'avoid', e.creator_brief_avoid,
                            'attachments', e.creator_brief_attachments, 'updated_at', e.creator_brief_updated_at)
    INTO v_logo, v_shoot_date, v_shoot_city, v_plan, v_estatus, v_ad_bought, v_boost_bought, v_shared
    FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = v_exp;
  SELECT r.leg_deliverables, r.leg_affiliate_count, r.leg_ad_rights_count, r.leg_boost_count, r.leg_shoot_outcome, r.brief_override
    INTO v_deliverables, v_aff, v_ad, v_boost, v_outcome, v_override
    FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  SELECT t.day_rate_paise, t.days, t.creator_gross_paise, t.platform_pct, t.creator_net_paise, t.platform_track, t.allowance_paise, t.affiliate_pct
    INTO t_rate, t_days, t_gross, t_pct, t_net, t_track, t_allow, t_aff_pct
    FROM experience_creator_terms t WHERE t.deal_id = p_deal_id;
  v_videos := experience_video_count(v_deliverables);
  v_owner := experience_leg_owner(p_deal_id);
  -- This creator's brief only: their own, else the shared one.
  v_brief := coalesce(v_override, v_shared);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'label', i.label, 'affiliate_link', i.affiliate_link, 'item_status', i.item_status, 'version', i.version,
           'external_url', CASE WHEN v_owner = 'creator' THEN i.external_url END,
           'file_name', CASE WHEN v_owner = 'creator' THEN i.file_name END,
           'revision_note', CASE WHEN v_owner = 'creator' AND i.item_status = 'revision' THEN i.revision_note END,
           'submitted_at', CASE WHEN v_owner = 'creator' THEN i.submitted_at END
         ) ORDER BY array_position(ARRAY['UGC video', 'Reel', 'Story', 'Static post', 'Photo set'], experience_item_type(i.label)), i.label), '[]'::jsonb)
    INTO v_items
    FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator;

  SELECT jsonb_build_object('status', p.status, 'gross_paise', p.gross_paise, 'platform_pct', p.platform_pct,
           'platform_fee_paise', p.platform_fee_paise, 'net_paise', p.amount_paise, 'allowance_paise', p.allowance_paise,
           'tds_paise', p.tds_paise, 'paid_paise', p.net_amount_paise, 'paid_on', p.paid_on,
           'reference', CASE WHEN p.status = 'paid' THEN p.external_ref END)
    INTO v_payout
    FROM vendor_payouts p WHERE p.deal_id = p_deal_id AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed');

  SELECT jsonb_build_object('id', i.id, 'number', i.number, 'issued_at', i.issued_at, 'shoot_confirmed_at', i.shoot_confirmed_at,
           'billing_name', i.billing_name, 'gstin', i.gstin, 'gross_paise', i.gross_paise, 'platform_pct', i.platform_pct,
           'platform_fee_paise', i.platform_fee_paise, 'net_paise', i.net_paise, 'allowance_paise', i.allowance_paise, 'payable_paise', i.payable_paise)
    INTO v_invoice
    FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued' AND i.extra_id IS NULL AND i.follow_on_id IS NULL;

  -- 0555: extra requests on this deal (not replaced ones), each with its own invoice and payout.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'number', x.number, 'status', x.status, 'deliverables', x.deliverables, 'items', x.items, 'videos', x.videos,
           'pricing', x.pricing, 'unit_paise', x.unit_paise, 'gross_paise', x.gross_paise, 'platform_pct', x.platform_pct,
           'platform_fee_paise', x.platform_fee_paise, 'net_paise', x.net_paise, 'message', x.message, 'decline_reason', x.decline_reason,
           'created_at', x.created_at, 'decided_at', x.decided_at,
           'invoice', (SELECT jsonb_build_object('id', i.id, 'number', i.number, 'issued_at', i.issued_at, 'payable_paise', i.payable_paise)
                       FROM experience_creator_invoices i WHERE i.extra_id = x.id AND i.status = 'issued'),
           'can_invoice', coalesce(x.status = 'accepted' AND v_estatus IN ('shoot_scheduled', 'shoot_done', 'delivering')
                       AND experience_leg_extra_work_complete(x.id) IS TRUE
                       AND NOT EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.extra_id = x.id AND i.status = 'issued'), false),
           'payout', (SELECT jsonb_build_object('status', p.status, 'net_paise', p.amount_paise, 'tds_paise', p.tds_paise, 'paid_paise', p.net_amount_paise,
                         'paid_on', p.paid_on, 'reference', CASE WHEN p.status = 'paid' THEN p.external_ref END)
                      FROM vendor_payouts p WHERE p.extra_id = x.id AND p.reason = 'creator_extra' AND p.status NOT IN ('cancelled', 'failed'))
         ) ORDER BY x.number), '[]'::jsonb)
    INTO v_extras
    FROM experience_leg_extras x WHERE x.deal_id = p_deal_id AND x.status <> 'superseded';

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'round', c.round, 'proposed_by', c.proposed_by, 'day_rate_paise', c.day_rate_paise,
           'days', c.days, 'gross_paise', c.gross_paise, 'platform_pct', c.platform_pct, 'net_paise', c.net_paise, 'note', c.note,
           'status', c.status, 'created_at', c.created_at, 'decided_at', c.decided_at, 'decision_note', c.decision_note) ORDER BY c.created_at), '[]'::jsonb),
         count(*) FILTER (WHERE c.proposed_by = 'creator')::int
    INTO v_counters, v_used
    FROM experience_leg_counters c WHERE c.deal_id = p_deal_id;

  RETURN jsonb_build_object(
    'brand_name', v_brand_name, 'brand_logo_url', v_logo, 'title', v_title, 'status', v_status, 'deal_ref', v_ref,
    'shoot_date', v_shoot_date, 'shoot_city', v_shoot_city,
    'brief', v_brief ->> 'pitch',
    'brief_detail', jsonb_build_object('pitch', v_brief ->> 'pitch', 'guidelines', v_brief ->> 'guidelines', 'avoid', v_brief ->> 'avoid',
                                       'attachments', coalesce(v_brief -> 'attachments', '[]'::jsonb), 'updated_at', v_brief ->> 'updated_at',
                                       'locked', experience_brief_editable(v_estatus) IS NOT TRUE),
    'deliverables', coalesce(v_deliverables, '[]'::jsonb), 'videos', v_videos, 'affiliate_count', coalesce(v_aff, 0), 'affiliate_pct', t_aff_pct,
    'collab_waiting', experience_leg_collab_waiting(p_deal_id),
    'commission', experience_affiliate_for_creator(p_deal_id),
    'ad_rights_months', CASE WHEN v_ad_bought THEN nullif(v_plan ->> 'ad_rights_months', '')::int END,
    'ad_rights_videos', CASE WHEN v_ad_bought THEN coalesce(v_ad, 0) ELSE 0 END,
    'boost_months', CASE WHEN v_boost_bought THEN nullif(v_plan ->> 'boost_months', '')::int END,
    'boost_videos', CASE WHEN v_boost_bought THEN coalesce(v_boost, 0) ELSE 0 END,
    'day_rate_paise', t_rate, 'days', t_days, 'gross_paise', t_gross, 'platform_pct', t_pct,
    'platform_track', t_track, 'net_paise', t_net,
    'allowance_paise', coalesce(t_allow, 0), 'total_to_creator_paise', CASE WHEN t_net IS NOT NULL THEN t_net + coalesce(t_allow, 0) END,
    'shoot_outcome', v_outcome, 'deliverables_owner', v_owner,
    'work_complete', experience_leg_work_complete(p_deal_id),
    'can_submit', coalesce(v_owner = 'creator' AND v_status IN ('agreed', 'paid') AND v_outcome = 'done'
                  AND v_estatus IN ('shoot_scheduled', 'shoot_done', 'delivering'), false),
    'can_message', coalesce(v_status NOT IN ('complete', 'declined', 'cancelled'), false),
    'items', v_items, 'payout', v_payout,
    'invoice', v_invoice, 'extras', v_extras,
    'can_invoice', coalesce(v_invoice IS NULL AND v_status = 'agreed' AND v_outcome = 'done'
                   AND v_estatus IN ('shoot_scheduled', 'shoot_done', 'delivering')
                   AND experience_leg_work_complete(p_deal_id) IS TRUE AND t_net IS NOT NULL, false),
    'counters', v_counters, 'counters_left', CASE WHEN v_status = 'negotiating' THEN greatest(3 - coalesce(v_used, 0), 0) ELSE 0 END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.creator_leg_invoice_raise(p_deal_id uuid, p_shoot_confirmed boolean, p_billing_name text, p_gstin text, p_expected_payable_paise bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_ref text; v_creator uuid; v_estatus text; v_outcome text;
  t record; v_name text; v_gstin text; v_n int; v_number text; v_id uuid;
BEGIN
  SELECT d.experience_id, d.status::text, d.deal_ref, d.creator_id INTO v_exp, v_status, v_ref, v_creator
    FROM deals d
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
      AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()
    FOR UPDATE;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF p_shoot_confirmed IS NOT TRUE THEN RAISE EXCEPTION 'Confirm the shoot is done first'; END IF;
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp;
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  IF v_status IS DISTINCT FROM 'agreed' OR v_outcome IS DISTINCT FROM 'done'
     OR v_estatus IS NULL OR v_estatus NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN
    RAISE EXCEPTION 'You can raise your invoice once Guapd marks your shoot done';
  END IF;
  IF experience_leg_work_complete(p_deal_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Your deliverables need Guapd''s approval before you invoice';
  END IF;
  IF EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued' AND i.extra_id IS NULL AND i.follow_on_id IS NULL) THEN
    RAISE EXCEPTION 'You have already raised your invoice for this deal';
  END IF;
  SELECT x.day_rate_paise, x.days, x.creator_gross_paise, x.platform_pct, x.creator_net_paise, x.allowance_paise, x.locked_at INTO t
    FROM experience_creator_terms x WHERE x.deal_id = p_deal_id;
  IF t.locked_at IS NULL OR t.creator_net_paise IS NULL THEN RAISE EXCEPTION 'Your terms are not locked'; END IF;
  IF p_expected_payable_paise IS NULL OR p_expected_payable_paise IS DISTINCT FROM t.creator_net_paise + coalesce(t.allowance_paise, 0) THEN
    RAISE EXCEPTION 'These figures have changed. Refresh the page and check them again';
  END IF;
  v_name := nullif(btrim(coalesce(p_billing_name, '')), '');
  IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Enter the name to invoice from'; END IF;
  v_gstin := nullif(upper(btrim(coalesce(p_gstin, ''))), '');
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN RAISE EXCEPTION 'That GSTIN is not valid'; END IF;
  SELECT count(*) + 1 INTO v_n FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.extra_id IS NULL AND i.follow_on_id IS NULL;
  v_number := 'CI-' || coalesce(v_ref, left(p_deal_id::text, 8)) || CASE WHEN v_n > 1 THEN '-' || v_n::text ELSE '' END;
  INSERT INTO experience_creator_invoices (deal_id, experience_id, creator_id, number, shoot_confirmed_at, billing_name, gstin,
    day_rate_paise, days, gross_paise, platform_pct, platform_fee_paise, net_paise, allowance_paise, payable_paise, issued_by)
  VALUES (p_deal_id, v_exp, v_creator, v_number, now(), v_name, v_gstin,
    t.day_rate_paise, t.days, t.creator_gross_paise, t.platform_pct, t.creator_gross_paise - t.creator_net_paise, t.creator_net_paise,
    coalesce(t.allowance_paise, 0), t.creator_net_paise + coalesce(t.allowance_paise, 0), my_user_id())
  RETURNING id INTO v_id;
  -- No amounts in the audit row.
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (p_deal_id, my_user_id(), 'experience.creator_invoice_raised', jsonb_build_object('invoice_id', v_id, 'number', v_number, 'shoot_confirmed', true));
  RETURN jsonb_build_object('id', v_id, 'number', v_number);
END;
$function$;

CREATE OR REPLACE FUNCTION public.creator_leg_invoice_doc(p_deal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
                   AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT experience_creator_invoice_doc_json(i.id) INTO v
    FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued' AND i.extra_id IS NULL AND i.follow_on_id IS NULL;
  IF v IS NULL THEN RAISE EXCEPTION 'No invoice yet'; END IF;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_payout_request(p_deal_id uuid, p_tds_paise bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_dstatus text; v_outcome text; v_creator uuid; v_name text;
  t record; v_vendor uuid; v_attempt int; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT d.experience_id INTO v_exp FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Creator deal not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT d.status::text, d.creator_id INTO v_dstatus, v_creator FROM deals d WHERE d.id = p_deal_id FOR UPDATE;
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  IF v_status IS NULL OR v_status NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN
    RAISE EXCEPTION 'Creators are paid after the shoot and before Complete';
  END IF;
  IF v_dstatus IS NULL OR v_dstatus NOT IN ('agreed', 'paid') OR v_outcome IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'Only a creator who accepted and shot is paid';
  END IF;
  IF experience_leg_work_complete(p_deal_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'This creator''s part is not complete yet (their deliverables need Guapd''s approval)';
  END IF;
  -- 0552: the creator confirms the shoot and raises their invoice to Guapd first.
  IF NOT EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued' AND i.extra_id IS NULL AND i.follow_on_id IS NULL) THEN
    RAISE EXCEPTION 'The creator has not confirmed the shoot and raised their invoice yet';
  END IF;
  SELECT x.creator_gross_paise, x.platform_pct, x.creator_net_paise, x.allowance_paise, x.locked_at INTO t
    FROM experience_creator_terms x WHERE x.deal_id = p_deal_id;
  IF t.locked_at IS NULL THEN RAISE EXCEPTION 'This creator''s terms are not locked'; END IF;
  IF p_tds_paise IS NULL OR p_tds_paise < 0 OR p_tds_paise > t.creator_net_paise + t.allowance_paise THEN
    RAISE EXCEPTION 'TDS must be between 0 and the amount due';
  END IF;
  IF EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.deal_id = p_deal_id AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed')) THEN
    RAISE EXCEPTION 'This creator already has a payout. Cancel it to request again';
  END IF;
  SELECT c.full_name INTO v_name FROM creators c WHERE c.id = v_creator;
  INSERT INTO vendors (kind, creator_id, display_name) VALUES ('creator', v_creator, coalesce(v_name, 'Creator'))
  ON CONFLICT (creator_id) DO NOTHING;
  SELECT v.id INTO v_vendor FROM vendors v WHERE v.creator_id = v_creator;
  SELECT count(*) + 1 INTO v_attempt FROM vendor_payouts p WHERE p.deal_id = p_deal_id AND p.reason = 'creator_fee';
  INSERT INTO vendor_payouts (experience_id, deal_id, vendor_id, reason, gross_paise, platform_pct, platform_fee_paise,
    amount_paise, allowance_paise, tds_paise, net_amount_paise, status, provider, idempotency_key, created_by)
  VALUES (v_exp, p_deal_id, v_vendor, 'creator_fee', t.creator_gross_paise, t.platform_pct, t.creator_gross_paise - t.creator_net_paise,
    t.creator_net_paise, t.allowance_paise, p_tds_paise, t.creator_net_paise + t.allowance_paise - p_tds_paise, 'requested', 'manual',
    'creator_fee:' || p_deal_id::text || ':' || v_attempt::text, my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.payout_requested', 'vendor_payouts', v_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', p_deal_id, 'creator_id', v_creator, 'attempt', v_attempt));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_payouts(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_legs jsonb; v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'deal_id', t.deal_id, 'creator_id', t.creator_id, 'full_name', c.full_name, 'deal_status', d.status::text,
           'shoot_outcome', r.leg_shoot_outcome, 'work_complete', coalesce(experience_leg_work_complete(t.deal_id), false),
           'gross_paise', t.creator_gross_paise, 'platform_pct', t.platform_pct,
           'platform_fee_paise', t.creator_gross_paise - t.creator_net_paise, 'net_paise', t.creator_net_paise,
           'allowance_paise', t.allowance_paise, 'due_paise', t.creator_net_paise + t.allowance_paise,
           'payment_details', jsonb_build_object('bank_on_file', pd.account_last4 IS NOT NULL,
              'account_masked', CASE WHEN pd.account_last4 IS NOT NULL THEN '••••' || pd.account_last4 END,
              'upi_on_file', c.upi_id IS NOT NULL, 'changed_at', pd.details_changed_at),
           'creator_invoice', (SELECT jsonb_build_object('id', i.id, 'number', i.number, 'issued_at', i.issued_at, 'payable_paise', i.payable_paise, 'gstin', i.gstin)
                      FROM experience_creator_invoices i WHERE i.deal_id = t.deal_id AND i.status = 'issued' AND i.extra_id IS NULL AND i.follow_on_id IS NULL),
           'extras', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'deliverables', x.deliverables,
                         'gross_paise', x.gross_paise, 'platform_pct', x.platform_pct, 'platform_fee_paise', x.platform_fee_paise, 'net_paise', x.net_paise,
                         'work_complete', coalesce(experience_leg_extra_work_complete(x.id), false),
                         'invoice', (SELECT jsonb_build_object('id', i.id, 'number', i.number, 'issued_at', i.issued_at, 'payable_paise', i.payable_paise, 'gstin', i.gstin)
                                     FROM experience_creator_invoices i WHERE i.extra_id = x.id AND i.status = 'issued'),
                         'payout', (SELECT jsonb_build_object('id', p.id, 'status', p.status, 'amount_paise', p.amount_paise, 'tds_paise', p.tds_paise,
                                       'net_amount_paise', p.net_amount_paise, 'requested_by_name', coalesce(ru.full_name, ru.email), 'requested_at', p.created_at,
                                       'approved_by_name', coalesce(au.full_name, au.email), 'approved_at', p.approved_at, 'paid_on', p.paid_on, 'method', p.method,
                                       'reference', p.external_ref, 'has_proof', p.proof_path IS NOT NULL, 'i_requested', p.created_by IS NOT DISTINCT FROM v_me,
                                       'details_changed_after_request', coalesce(pd.details_changed_at > p.created_at, false))
                                    FROM vendor_payouts p LEFT JOIN users ru ON ru.id = p.created_by LEFT JOIN users au ON au.id = p.approved_by
                                    WHERE p.extra_id = x.id AND p.reason = 'creator_extra' AND p.status NOT IN ('cancelled', 'failed'))
                       ) ORDER BY x.number), '[]'::jsonb)
                       FROM experience_leg_extras x WHERE x.deal_id = t.deal_id AND x.status = 'accepted'),
           -- 0563: the approved affiliate commission, paid on its own (reason follow_on).
           'commission', (SELECT jsonb_build_object('id', f.id, 'status', f.status, 'affiliate_pct', f.pct, 'sales_paise', f.sales_figure_paise,
                         'gross_paise', f.creator_gross_paise, 'platform_pct', f.platform_pct, 'platform_fee_paise', f.platform_fee_paise, 'net_paise', f.creator_net_paise,
                         'invoice', (SELECT jsonb_build_object('id', i.id, 'number', i.number, 'issued_at', i.issued_at, 'payable_paise', i.payable_paise, 'gstin', i.gstin)
                                     FROM experience_creator_invoices i WHERE i.follow_on_id = f.id AND i.status = 'issued'),
                         'payout', (SELECT jsonb_build_object('id', p.id, 'status', p.status, 'amount_paise', p.amount_paise, 'tds_paise', p.tds_paise,
                                       'net_amount_paise', p.net_amount_paise, 'requested_by_name', coalesce(ru.full_name, ru.email), 'requested_at', p.created_at,
                                       'approved_by_name', coalesce(au.full_name, au.email), 'approved_at', p.approved_at, 'paid_on', p.paid_on, 'method', p.method,
                                       'reference', p.external_ref, 'has_proof', p.proof_path IS NOT NULL, 'i_requested', p.created_by IS NOT DISTINCT FROM v_me,
                                       'details_changed_after_request', coalesce(pd.details_changed_at > p.created_at, false))
                                    FROM vendor_payouts p LEFT JOIN users ru ON ru.id = p.created_by LEFT JOIN users au ON au.id = p.approved_by
                                    WHERE p.follow_on_id = f.id AND p.reason = 'follow_on' AND p.status NOT IN ('cancelled', 'failed')))
                       FROM deal_follow_ons f WHERE f.deal_id = t.deal_id AND f.type = 'affiliate' AND f.status IN ('verified', 'paid')),
           'cancelled_before', (SELECT count(*) FROM vendor_payouts p WHERE p.deal_id = t.deal_id AND p.reason = 'creator_fee' AND p.status = 'cancelled'),
           'payout', (SELECT jsonb_build_object('id', p.id, 'status', p.status, 'amount_paise', p.amount_paise, 'allowance_paise', p.allowance_paise,
                         'tds_paise', p.tds_paise,
                         'net_amount_paise', p.net_amount_paise, 'requested_by_name', coalesce(ru.full_name, ru.email), 'requested_at', p.created_at,
                         'approved_by_name', coalesce(au.full_name, au.email), 'approved_at', p.approved_at, 'paid_on', p.paid_on, 'method', p.method,
                         'reference', p.external_ref, 'has_proof', p.proof_path IS NOT NULL,
                         'i_requested', p.created_by IS NOT DISTINCT FROM v_me,
                         'details_changed_after_request', coalesce(pd.details_changed_at > p.created_at, false))
                      FROM vendor_payouts p LEFT JOIN users ru ON ru.id = p.created_by LEFT JOIN users au ON au.id = p.approved_by
                      WHERE p.deal_id = t.deal_id AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed'))
         ) ORDER BY c.full_name), '[]'::jsonb)
    INTO v_legs
    FROM experience_creator_terms t
    JOIN deals d ON d.id = t.deal_id
    JOIN creators c ON c.id = t.creator_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    LEFT JOIN vendors vd ON vd.creator_id = t.creator_id
    LEFT JOIN vendor_payout_details pd ON pd.vendor_id = vd.id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL AND d.status IN ('agreed', 'paid');
  RETURN jsonb_build_object('experience_id', p_experience_id, 'status', v_status, 'legs', v_legs, 'can_pay', has_experience_access('financial') IS TRUE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_creator_invoice_void(p_invoice_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_deal uuid; v_exp uuid; v_status text; v_extra uuid; v_fo uuid; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT i.deal_id, i.experience_id, i.status, i.extra_id, i.follow_on_id INTO v_deal, v_exp, v_status, v_extra, v_fo FROM experience_creator_invoices i WHERE i.id = p_invoice_id FOR UPDATE;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'This invoice is already void'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  -- 0563: a commission invoice goes with its claim: turn the claim down instead.
  IF v_fo IS NOT NULL THEN RAISE EXCEPTION 'A commission invoice is voided by turning the claim down'; END IF;
  -- 0555: an extra invoice is protected by the extra payout; the main invoice by the main payout.
  IF EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.deal_id = v_deal AND p.status NOT IN ('cancelled', 'failed')
             AND ((v_extra IS NULL AND p.reason = 'creator_fee') OR (v_extra IS NOT NULL AND p.reason = 'creator_extra' AND p.extra_id = v_extra))) THEN
    RAISE EXCEPTION 'This creator has a live payout. Cancel it before voiding the invoice';
  END IF;
  UPDATE experience_creator_invoices SET status = 'void', voided_at = now(), voided_by = my_user_id(), void_reason = left(v_reason, 500)
    WHERE id = p_invoice_id;
  PERFORM experience_console_audit('experience.creator_invoice_voided', 'experience_creator_invoices', p_invoice_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'reason', left(v_reason, 500)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_vendor_payout()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  k text[] := ARRAY['status', 'approved_by', 'approved_at', 'paid_at', 'paid_on', 'method', 'proof_path', 'external_ref',
                    'recorded_by', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'failure_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A payout is cancelled, never deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.reason = 'creator_fee' AND NOT EXISTS (
      SELECT 1 FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
      WHERE t.deal_id = NEW.deal_id AND t.experience_id = NEW.experience_id AND d.leg_role = 'creator_leg'
        AND t.locked_at IS NOT NULL AND t.creator_gross_paise = NEW.gross_paise AND t.platform_pct = NEW.platform_pct
        AND t.creator_net_paise = NEW.amount_paise AND t.allowance_paise = NEW.allowance_paise
    ) THEN
      RAISE EXCEPTION 'A creator payout is exactly the locked terms of that creator''s deal';
    END IF;
    -- 0555: an extra payout is exactly that accepted extra, on its own creator deal.
    IF NEW.reason = 'creator_extra' AND NOT EXISTS (
      SELECT 1 FROM experience_leg_extras x
      WHERE x.id = NEW.extra_id AND x.deal_id = NEW.deal_id AND x.experience_id = NEW.experience_id AND x.status = 'accepted'
        AND x.gross_paise = NEW.gross_paise AND x.platform_pct = NEW.platform_pct AND x.net_paise = NEW.amount_paise
    ) THEN
      RAISE EXCEPTION 'An extra payout is exactly the accepted extra';
    END IF;
    -- 0563: a commission payout is exactly that approved claim, on its own creator deal.
    IF NEW.reason = 'follow_on' AND NOT EXISTS (
      SELECT 1 FROM deal_follow_ons f
      WHERE f.id = NEW.follow_on_id AND f.deal_id = NEW.deal_id AND f.experience_id = NEW.experience_id AND f.status = 'verified'
        AND f.creator_gross_paise = NEW.gross_paise AND f.platform_pct = NEW.platform_pct AND f.creator_net_paise = NEW.amount_paise
    ) THEN
      RAISE EXCEPTION 'A commission payout is exactly the approved claim';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('paid', 'cancelled') THEN RAISE EXCEPTION 'A % payout is final', OLD.status; END IF;
  IF OLD.status IS DISTINCT FROM 'requested'
     AND (NEW.tds_paise, NEW.net_amount_paise) IS DISTINCT FROM (OLD.tds_paise, OLD.net_amount_paise) THEN
    RAISE EXCEPTION 'An approved payout''s amounts are frozen; cancel it and request again';
  END IF;
  IF (to_jsonb(NEW) - k - ARRAY['tds_paise', 'net_amount_paise']) IS DISTINCT FROM (to_jsonb(OLD) - k - ARRAY['tds_paise', 'net_amount_paise']) THEN
    RAISE EXCEPTION 'A payout''s creator, deal and statement do not change';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_payout_approve(p_payout_id uuid, p_confirm_details_changed boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_pstatus text; v_by uuid; v_deal uuid; v_me uuid := my_user_id(); v_changed boolean; v_reason text; v_extra uuid; v_fo uuid;
BEGIN
  -- 0542: operational staff request; FINANCE approves (and is not the requester) and pays.
  PERFORM experience_finance_require();
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.created_by, p.deal_id, p.reason, p.extra_id, p.follow_on_id INTO v_pstatus, v_by, v_deal, v_reason, v_extra, v_fo FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
  IF v_status IS NULL OR v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete'; END IF;
  IF v_pstatus IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'Only a requested payout is approved'; END IF;
  IF v_by IS NOT DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'A different person approves a payout than the one who requested it';
  END IF;
  IF v_reason = 'follow_on' THEN
    IF NOT EXISTS (SELECT 1 FROM deal_follow_ons f WHERE f.id = v_fo AND f.status = 'verified') THEN RAISE EXCEPTION 'This commission claim is no longer approved'; END IF;
  ELSIF v_reason = 'creator_extra' THEN
    IF experience_leg_extra_work_complete(v_extra) IS NOT TRUE THEN RAISE EXCEPTION 'This extra is no longer complete'; END IF;
  ELSIF experience_leg_work_complete(v_deal) IS NOT TRUE THEN RAISE EXCEPTION 'This creator''s part is no longer complete'; END IF;
  SELECT coalesce(d.details_changed_at > p.created_at, false) INTO v_changed
    FROM vendor_payouts p LEFT JOIN vendor_payout_details d ON d.vendor_id = p.vendor_id WHERE p.id = p_payout_id;
  IF v_changed IS TRUE AND p_confirm_details_changed IS NOT TRUE THEN
    RAISE EXCEPTION 'The creator changed their bank details after this payout was requested. Confirm the new details with them, then approve';
  END IF;
  UPDATE vendor_payouts SET status = 'approved', approved_by = v_me, approved_at = now(), updated_at = now() WHERE id = p_payout_id;
  PERFORM experience_console_audit('experience.payout_approved', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'details_changed_confirmed', coalesce(v_changed, false)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_payout_paid(p_payout_id uuid, p_paid_on date, p_method text, p_reference text, p_proof_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_pstatus text; v_deal uuid; v_approved timestamptz; v_reason text; v_moved int; v_fo uuid;
  v_ref text := btrim(coalesce(p_reference, ''));
BEGIN
  -- 0542: FINANCE pays (it is the role that sees the bank details).
  PERFORM experience_finance_require();
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.deal_id, p.approved_at, p.reason, p.follow_on_id INTO v_pstatus, v_deal, v_approved, v_reason, v_fo FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
  IF v_status IS NULL OR v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete'; END IF;
  IF v_pstatus IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'A payout is approved before it is paid'; END IF;
  IF p_paid_on IS NULL OR p_paid_on > experience_today() THEN RAISE EXCEPTION 'Enter the date it was paid (not in the future)'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('bank_transfer', 'upi', 'other') THEN RAISE EXCEPTION 'Say how it was paid'; END IF;
  IF length(v_ref) NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'Enter the payment reference (UTR)'; END IF;
  IF experience_finance_file_ok('payout-proof', p_payout_id, p_proof_path) IS NOT TRUE THEN RAISE EXCEPTION 'Attach the payment proof'; END IF;
  UPDATE vendor_payouts SET status = 'paid', paid_at = now(), paid_on = p_paid_on, method = p_method, external_ref = v_ref,
    proof_path = p_proof_path, recorded_by = my_user_id(), updated_at = now()
  WHERE id = p_payout_id;
  -- 0551: the creator fee paid = the creator deal is paid, same as a normal deal.
  IF v_reason = 'creator_fee' THEN
    UPDATE deals SET status = 'paid' WHERE id = v_deal AND leg_role = 'creator_leg' AND status = 'agreed';
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    IF v_moved IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'This creator deal is not open, so it cannot be marked paid'; END IF;
  END IF;
  -- 0563: the commission paid = the claim is paid.
  IF v_reason = 'follow_on' THEN
    UPDATE deal_follow_ons SET status = 'paid', updated_at = now() WHERE id = v_fo AND status = 'verified';
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    IF v_moved IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'This commission claim is no longer approved'; END IF;
  END IF;
  PERFORM experience_console_audit('experience.payout_paid', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'method', p_method, 'reference', v_ref));
  -- On the creator's own deal timeline too (deal-scoped ops action).
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.payout_paid', jsonb_build_object('payout_id', p_payout_id, 'reference', v_ref));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_completion_check(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_brand_at timestamptz; v_prog jsonb;
  v_live int; v_unpaid int; v_drafts int;
  v_counted int; v_paid int; v_open int; v_no_outcome int; v_x_due int; v_x_paid int; v_x_open int;
  v_ads_open int; v_comm_open int; v_comm_unbilled int;
  ok_deliv boolean; ok_inv boolean; ok_pay boolean; ok_brand boolean; v_blockers text[] := ARRAY[]::text[];
BEGIN
  SELECT e.status, e.brand_signoff_at INTO v_status, v_brand_at FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  v_prog := experience_deliverables_progress(p_experience_id);
  ok_deliv := coalesce((v_prog ->> 'ready')::boolean, false);

  SELECT count(*) FILTER (WHERE si.status IN ('issued', 'paid')), count(*) FILTER (WHERE si.status = 'issued'), count(*) FILTER (WHERE si.status = 'draft')
    INTO v_live, v_unpaid, v_drafts FROM service_invoices si WHERE si.experience_id = p_experience_id;
  ok_inv := coalesce(v_live > 0 AND v_unpaid = 0 AND v_drafts = 0, false);

  SELECT count(*) FILTER (WHERE d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome = 'done'),
         count(*) FILTER (WHERE d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome = 'done' AND EXISTS (
           SELECT 1 FROM vendor_payouts p WHERE p.deal_id = t.deal_id AND p.reason = 'creator_fee' AND p.status = 'paid')),
         count(*) FILTER (WHERE d.status = 'negotiating'),
         count(*) FILTER (WHERE d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome IS NULL)
    INTO v_counted, v_paid, v_open, v_no_outcome
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL;
  -- 0555: accepted extras on counted creator deals are paid too; open extra requests are answered.
  SELECT count(*) FILTER (WHERE x.status = 'accepted'),
         count(*) FILTER (WHERE x.status = 'accepted' AND EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.extra_id = x.id AND p.reason = 'creator_extra' AND p.status = 'paid')),
         count(*) FILTER (WHERE x.status = 'open')
    INTO v_x_due, v_x_paid, v_x_open
    FROM experience_leg_extras x JOIN deals d ON d.id = x.deal_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = x.deal_id
    WHERE x.experience_id = p_experience_id AND d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome = 'done';
  -- 0563: collab ads complete; on deals with an affiliate %, the commission is paid or closed, and every
  -- paid commission is on a live follow-on invoice to the brand.
  SELECT count(*) INTO v_ads_open FROM experience_collab_posts p JOIN deals d ON d.id = p.deal_id
    WHERE p.experience_id = p_experience_id AND p.kind = 'collab' AND p.status IN ('sent', 'posted') AND d.status IN ('agreed', 'paid');
  SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM deal_follow_ons f WHERE f.deal_id = t.deal_id AND f.type = 'affiliate' AND f.status IN ('paid', 'closed'))),
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM deal_follow_ons f WHERE f.deal_id = t.deal_id AND f.type = 'affiliate' AND f.status IN ('verified', 'paid')
                            AND NOT EXISTS (SELECT 1 FROM service_invoices si WHERE si.id = f.service_invoice_id AND si.status IN ('issued', 'paid'))))
    INTO v_comm_open, v_comm_unbilled
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL AND t.affiliate_pct IS NOT NULL
      AND d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome = 'done'
      AND EXISTS (SELECT 1 FROM experience_collab_posts p WHERE p.deal_id = t.deal_id AND p.kind = 'collab' AND p.status <> 'cancelled');
  ok_pay := coalesce(v_counted = v_paid AND v_open = 0 AND v_no_outcome = 0 AND v_x_due = v_x_paid AND v_x_open = 0
                     AND v_ads_open = 0 AND v_comm_open = 0 AND v_comm_unbilled = 0, false);
  ok_brand := v_brand_at IS NOT NULL;

  IF NOT ok_deliv THEN v_blockers := array_append(v_blockers, 'The brand has not approved everything sold'); END IF;
  IF v_drafts > 0 THEN v_blockers := array_append(v_blockers, 'Issue or discard the draft invoices'); END IF;
  IF v_live = 0 THEN v_blockers := array_append(v_blockers, 'No invoice has been issued'); END IF;
  IF v_unpaid > 0 THEN v_blockers := array_append(v_blockers, format('%s invoice(s) not fully paid', v_unpaid)); END IF;
  IF v_open > 0 OR v_no_outcome > 0 THEN v_blockers := array_append(v_blockers, 'Some creators have no outcome yet'); END IF;
  IF coalesce(v_counted - v_paid, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s creator(s) not paid', v_counted - v_paid)); END IF;
  IF coalesce(v_x_due - v_x_paid, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s creator extra(s) not paid', v_x_due - v_x_paid)); END IF;
  IF coalesce(v_x_open, 0) > 0 THEN v_blockers := array_append(v_blockers, 'An extra request to a creator is unanswered'); END IF;
  IF coalesce(v_ads_open, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s collab ad(s) not complete', v_ads_open)); END IF;
  IF coalesce(v_comm_open, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s affiliate commission(s) not paid or closed', v_comm_open)); END IF;
  IF coalesce(v_comm_unbilled, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s affiliate commission(s) not billed to the brand', v_comm_unbilled)); END IF;
  IF NOT ok_brand THEN v_blockers := array_append(v_blockers, 'The brand has not signed off'); END IF;
  IF v_status IS DISTINCT FROM 'delivering' THEN v_blockers := array_append(v_blockers, 'An Experience is completed from Delivering'); END IF;

  RETURN jsonb_build_object(
    'status', v_status, 'deliverables_ok', ok_deliv, 'invoices_ok', ok_inv, 'payouts_ok', ok_pay, 'brand_signed_off', ok_brand,
    'invoices_live', v_live, 'invoices_unpaid', v_unpaid, 'invoices_draft', v_drafts,
    'creators_to_pay', v_counted, 'creators_paid', v_paid, 'extras_to_pay', v_x_due, 'extras_paid', v_x_paid, 'extras_open', v_x_open,
    'collab_ads_open', v_ads_open, 'commissions_open', v_comm_open, 'commissions_unbilled', v_comm_unbilled,
    'can_complete', coalesce(v_status = 'delivering' AND ok_deliv AND ok_inv AND ok_pay AND ok_brand, false),
    'blockers', to_jsonb(v_blockers));
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_experience_pnl(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_billed bigint; v_received bigint; v_invoices int; v_agreed bigint;
  v_gross bigint; v_net bigint; v_allow bigint; v_per_leg jsonb;
  v_awaiting int; v_awaiting_net bigint; v_awaiting_allow bigint; v_declined int; v_no_shoot int;
  v_costs bigint; v_by_cat jsonb;
  v_subtotal bigint; v_fee_kept bigint; v_margin bigint;
  v_invoiced_total bigint; v_gst bigint; v_brand_tds bigint; v_drafts int;
  v_paid_out bigint; v_creator_tds bigint; v_payouts_paid int;
  v_prospects int; v_prospects_est bigint; v_x_gross bigint; v_x_net bigint; v_c_gross bigint; v_c_net bigint;
BEGIN
  SELECT coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(si.total_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(coalesce(si.cgst_paise, 0) + coalesce(si.sgst_paise, 0) + coalesce(si.igst_paise, 0)) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         count(*) FILTER (WHERE si.status IN ('issued', 'paid'))::int,
         count(*) FILTER (WHERE si.status = 'draft')::int
    INTO v_billed, v_invoiced_total, v_gst, v_invoices, v_drafts
    FROM service_invoices si WHERE si.experience_id = p_experience_id;
  SELECT coalesce(sum(x.amount_paise), 0)::bigint, coalesce(sum(x.tds_paise), 0)::bigint
    INTO v_received, v_brand_tds
    FROM service_invoice_payments x JOIN service_invoices si ON si.id = x.invoice_id
    WHERE x.experience_id = p_experience_id AND x.reversed_at IS NULL AND si.status IN ('issued', 'paid');
  SELECT coalesce(sum(p.net_amount_paise), 0)::bigint, coalesce(sum(p.tds_paise), 0)::bigint, count(*)::int
    INTO v_paid_out, v_creator_tds, v_payouts_paid
    FROM vendor_payouts p WHERE p.experience_id = p_experience_id AND p.reason IN ('creator_fee', 'creator_extra', 'follow_on') AND p.status = 'paid';
  SELECT e.brand_service_total_paise INTO v_agreed FROM experiences e WHERE e.id = p_experience_id;

  SELECT coalesce(sum(t.creator_gross_paise), 0)::bigint, coalesce(sum(t.creator_net_paise), 0)::bigint,
         coalesce(sum(t.allowance_paise), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
           'deal_id', t.deal_id, 'creator_id', t.creator_id, 'full_name', c.full_name, 'deal_status', d.status::text,
           'platform_track', t.platform_track, 'platform_pct', t.platform_pct,
           'day_rate_paise', t.day_rate_paise, 'days', t.days,
           'creator_gross_paise', t.creator_gross_paise, 'platform_fee_paise', t.creator_gross_paise - t.creator_net_paise,
           'creator_net_paise', t.creator_net_paise, 'allowance_paise', t.allowance_paise) ORDER BY t.created_at), '[]'::jsonb)
    INTO v_gross, v_net, v_allow, v_per_leg
    FROM experience_creator_terms t
    JOIN deals d ON d.id = t.deal_id
    JOIN creators c ON c.id = t.creator_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL
      AND d.status IN ('agreed', 'delivered', 'revision', 'approved', 'paid', 'complete')
      AND NOT EXISTS (SELECT 1 FROM experience_roster r WHERE r.leg_deal_id = t.deal_id AND r.leg_shoot_outcome = 'did_not_shoot');

  -- 0555: accepted extras on counted creator deals are creator cost too (gross, fee kept, net).
  SELECT coalesce(sum(x.gross_paise), 0)::bigint, coalesce(sum(x.net_paise), 0)::bigint INTO v_x_gross, v_x_net
    FROM experience_leg_extras x JOIN deals d ON d.id = x.deal_id
    WHERE x.experience_id = p_experience_id AND x.status = 'accepted'
      AND d.status IN ('agreed', 'delivered', 'revision', 'approved', 'paid', 'complete')
      AND NOT EXISTS (SELECT 1 FROM experience_roster r WHERE r.leg_deal_id = x.deal_id AND r.leg_shoot_outcome = 'did_not_shoot');
  v_gross := v_gross + v_x_gross; v_net := v_net + v_x_net;
  -- 0563: approved affiliate commissions are creator cost too (gross, fee kept, net); billing them to the brand is revenue.
  SELECT coalesce(sum(f.creator_gross_paise), 0)::bigint, coalesce(sum(f.creator_net_paise), 0)::bigint INTO v_c_gross, v_c_net
    FROM deal_follow_ons f WHERE f.experience_id = p_experience_id AND f.type = 'affiliate' AND f.status IN ('verified', 'paid');
  v_gross := v_gross + v_c_gross; v_net := v_net + v_c_net;

  SELECT count(*) FILTER (WHERE d.status = 'negotiating')::int,
         coalesce(sum(t.creator_net_paise) FILTER (WHERE d.status = 'negotiating'), 0)::bigint,
         coalesce(sum(t.allowance_paise) FILTER (WHERE d.status = 'negotiating'), 0)::bigint,
         count(*) FILTER (WHERE d.status IN ('declined', 'cancelled'))::int,
         count(*) FILTER (WHERE r.leg_shoot_outcome = 'did_not_shoot')::int
    INTO v_awaiting, v_awaiting_net, v_awaiting_allow, v_declined, v_no_shoot
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id;

  SELECT count(*)::int, coalesce(sum(x.expected_total_paise), 0)::bigint INTO v_prospects, v_prospects_est
    FROM experience_roster_prospects x
    WHERE x.experience_id = p_experience_id AND x.status IN ('not_contacted', 'contacted', 'agreed', 'onboarding') AND x.brand_decision IS DISTINCT FROM 'rejected';

  v_costs := experience_cost_total(p_experience_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'total_paise', x.total) ORDER BY x.category), '[]'::jsonb)
    INTO v_by_cat
    FROM (SELECT cl.category, sum(cl.total_paise)::bigint AS total FROM experience_cost_lines cl
          WHERE cl.experience_id = p_experience_id AND cl.provided_by = 'guapd' AND cl.removed_at IS NULL
          GROUP BY cl.category) x;

  v_subtotal := v_billed - v_gross - v_allow - v_costs;
  v_fee_kept := v_gross - v_net;
  v_margin := v_billed - v_net - v_allow - v_costs;
  IF v_subtotal + v_fee_kept IS DISTINCT FROM v_margin THEN
    RAISE EXCEPTION 'P&L does not reconcile: sub-total % + fee kept % <> margin %', v_subtotal, v_fee_kept, v_margin;
  END IF;

  RETURN jsonb_build_object(
    'experience_id', p_experience_id,
    'brand_revenue_paise', v_billed, 'revenue_basis', 'invoiced', 'revenue_pending_invoice', v_invoices = 0,
    'invoices_counted', v_invoices, 'brand_received_paise', v_received, 'brand_agreed_paise', v_agreed,
    'creator_gross_total_paise', v_gross, 'creator_net_total_paise', v_net, 'creator_extras_gross_paise', v_x_gross, 'creator_extras_net_paise', v_x_net,
    'creator_commission_gross_paise', v_c_gross, 'creator_commission_net_paise', v_c_net,
    'creator_allowance_total_paise', v_allow,
    'guapd_costs_total_paise', v_costs, 'costs_by_category', v_by_cat,
    'subtotal_paise', v_subtotal, 'platform_fee_kept_paise', v_fee_kept, 'guapd_margin_paise', v_margin,
    'legs_counted', jsonb_array_length(v_per_leg), 'legs_awaiting', v_awaiting, 'awaiting_net_paise', v_awaiting_net,
    'awaiting_allowance_paise', v_awaiting_allow,
    'legs_declined', v_declined, 'legs_pending', v_awaiting, 'legs_did_not_shoot', v_no_shoot,
    'per_leg', v_per_leg,
    'invoiced_total_paise', v_invoiced_total, 'gst_liability_paise', v_gst, 'brand_tds_withheld_paise', v_brand_tds,
    'brand_outstanding_paise', v_invoiced_total - v_received - v_brand_tds, 'invoices_draft', v_drafts,
    'invoiced_vs_agreed_paise', CASE WHEN v_agreed IS NULL OR v_invoices = 0 THEN NULL ELSE v_billed - v_agreed END,
    'creator_paid_out_paise', v_paid_out, 'creator_tds_withheld_paise', v_creator_tds,
    'creator_payouts_paid', v_payouts_paid, 'creator_payouts_due', greatest(jsonb_array_length(v_per_leg) - v_payouts_paid, 0),
    'prospects_pending', v_prospects, 'prospects_estimate_paise', v_prospects_est);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_invoice_check(p_kind text, p_source text, p_description text, p_subtotal_paise bigint, p_gst_rate_pct numeric, p_cgst bigint, p_sgst bigint, p_igst bigint, p_due_date date, p_registered boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gst bigint := coalesce(p_cgst, 0) + coalesce(p_sgst, 0) + coalesce(p_igst, 0);
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('initial', 'additional', 'follow_on') THEN RAISE EXCEPTION 'An invoice is the service invoice, an additional one or a commission one'; END IF;
  IF p_kind = 'additional' AND (p_source IS NULL OR p_source NOT IN ('existing_footage', 'new_shoot')) THEN
    RAISE EXCEPTION 'Say what the additional invoice is for: existing footage or a new shoot';
  END IF;
  IF p_kind IN ('initial', 'follow_on') AND p_source IS NOT NULL THEN RAISE EXCEPTION 'Only an additional invoice has a source'; END IF;
  IF length(btrim(coalesce(p_description, ''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Describe the service (3 to 300 characters)'; END IF;
  IF p_subtotal_paise IS NULL OR p_subtotal_paise <= 0 OR p_subtotal_paise > 100000000000 THEN RAISE EXCEPTION 'The amount must be more than zero'; END IF;
  IF coalesce(p_cgst, 0) < 0 OR coalesce(p_sgst, 0) < 0 OR coalesce(p_igst, 0) < 0 THEN RAISE EXCEPTION 'GST cannot be negative'; END IF;
  IF p_registered IS NOT TRUE AND (v_gst > 0 OR p_gst_rate_pct IS NOT NULL) THEN
    RAISE EXCEPTION 'Guapd is not GST-registered: the invoice carries no GST';
  END IF;
  IF coalesce(p_igst, 0) > 0 AND (coalesce(p_cgst, 0) > 0 OR coalesce(p_sgst, 0) > 0) THEN
    RAISE EXCEPTION 'GST is either IGST, or CGST + SGST, not both';
  END IF;
  IF p_gst_rate_pct IS NOT NULL AND (p_gst_rate_pct < 0 OR p_gst_rate_pct > 28) THEN RAISE EXCEPTION 'GST rate looks wrong'; END IF;
  IF p_due_date IS NOT NULL AND p_due_date < experience_today() THEN RAISE EXCEPTION 'The due date is in the past'; END IF;
  RETURN v_gst;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_invoice_draft(p_experience_id uuid, p_kind text, p_source text, p_description text, p_subtotal_paise bigint, p_gst_rate_pct numeric, p_cgst_paise bigint, p_sgst_paise bigint, p_igst_paise bigint, p_due_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_brand uuid; v_registered boolean; v_gst bigint; v_id uuid;
BEGIN
  PERFORM experience_finance_require();
  -- 0563: commission invoices are drafted from the approved claims (experience_console_affiliate_bill).
  IF p_kind = 'follow_on' THEN RAISE EXCEPTION 'Bill affiliate commissions from the commission claims'; END IF;
  SELECT e.status, e.brand_id INTO v_status, v_brand FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF experience_invoice_window(v_status) IS NOT TRUE THEN
    RAISE EXCEPTION 'Invoices are raised once the price is agreed and before Complete';
  END IF;
  SELECT s.gst_registered INTO v_registered FROM guapd_billing_settings s WHERE s.id;
  IF v_registered IS NULL THEN RAISE EXCEPTION 'Add Guapd''s billing details first'; END IF;
  v_gst := experience_invoice_check(p_kind, p_source, p_description, p_subtotal_paise, p_gst_rate_pct, p_cgst_paise, p_sgst_paise, p_igst_paise, p_due_date, v_registered);
  INSERT INTO service_invoices (experience_id, brand_id, kind, source, status, description, lines, subtotal_paise,
    gst_rate_pct, cgst_paise, sgst_paise, igst_paise, total_paise, due_date, supplier_gst_registered, created_by)
  VALUES (p_experience_id, v_brand, p_kind, p_source, 'draft', btrim(p_description),
    jsonb_build_array(jsonb_build_object('description', btrim(p_description), 'amount_paise', p_subtotal_paise)), p_subtotal_paise,
    p_gst_rate_pct, nullif(p_cgst_paise, 0), nullif(p_sgst_paise, 0), nullif(p_igst_paise, 0), p_subtotal_paise + v_gst,
    p_due_date, v_registered, my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.invoice_drafted', 'service_invoices', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'kind', p_kind));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_invoice_update(p_invoice_id uuid, p_kind text, p_source text, p_description text, p_subtotal_paise bigint, p_gst_rate_pct numeric, p_cgst_paise bigint, p_sgst_paise bigint, p_igst_paise bigint, p_due_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_istatus text; v_registered boolean; v_gst bigint;
BEGIN
  PERFORM experience_finance_require();
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT si.status INTO v_istatus FROM service_invoices si WHERE si.id = p_invoice_id FOR UPDATE;
  IF v_istatus IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only a draft invoice is edited'; END IF;
  -- 0563: a commission invoice is its claims: discard it and bill again rather than edit it.
  IF p_kind = 'follow_on' OR EXISTS (SELECT 1 FROM service_invoices si WHERE si.id = p_invoice_id AND si.kind = 'follow_on') THEN
    RAISE EXCEPTION 'A commission invoice is not edited: discard it and bill the commissions again';
  END IF;
  IF experience_invoice_window(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'Invoices change once the price is agreed and before Complete'; END IF;
  SELECT s.gst_registered INTO v_registered FROM guapd_billing_settings s WHERE s.id;
  IF v_registered IS NULL THEN RAISE EXCEPTION 'Add Guapd''s billing details first'; END IF;
  v_gst := experience_invoice_check(p_kind, p_source, p_description, p_subtotal_paise, p_gst_rate_pct, p_cgst_paise, p_sgst_paise, p_igst_paise, p_due_date, v_registered);
  UPDATE service_invoices SET kind = p_kind, source = p_source, description = btrim(p_description),
    lines = jsonb_build_array(jsonb_build_object('description', btrim(p_description), 'amount_paise', p_subtotal_paise)),
    subtotal_paise = p_subtotal_paise, gst_rate_pct = p_gst_rate_pct, cgst_paise = nullif(p_cgst_paise, 0),
    sgst_paise = nullif(p_sgst_paise, 0), igst_paise = nullif(p_igst_paise, 0), total_paise = p_subtotal_paise + v_gst,
    due_date = p_due_date, supplier_gst_registered = v_registered, updated_at = now()
  WHERE id = p_invoice_id;
  PERFORM experience_console_audit('experience.invoice_draft_edited', 'service_invoices', p_invoice_id,
    jsonb_build_object('experience_id', v_exp, 'kind', p_kind));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_invoice_issue(p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_brand uuid; inv record; s record; b record;
  v_today date := experience_today(); v_fy text; v_no int; v_number text;
BEGIN
  PERFORM experience_finance_require();
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  SELECT e.status, e.brand_id INTO v_status, v_brand FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT si.status, si.kind, si.supplier_gst_registered, si.due_date INTO inv FROM service_invoices si WHERE si.id = p_invoice_id FOR UPDATE;
  IF inv.status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only a draft is issued'; END IF;
  IF experience_invoice_window(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'Invoices are issued once the price is agreed and before Complete'; END IF;
  -- 0563: a commission invoice is exactly its approved claims.
  IF inv.kind = 'follow_on' AND (SELECT si.subtotal_paise FROM service_invoices si WHERE si.id = p_invoice_id) IS DISTINCT FROM
     (SELECT sum(f.creator_gross_paise) FROM deal_follow_ons f WHERE f.service_invoice_id = p_invoice_id AND f.status IN ('verified', 'paid')) THEN
    RAISE EXCEPTION 'This commission invoice no longer matches its approved claims. Discard it and bill again';
  END IF;
  SELECT g.legal_name, g.address, g.state, g.gstin, g.gst_registered, g.pan, g.payment_instructions INTO s FROM guapd_billing_settings g WHERE g.id;
  IF s.legal_name IS NULL THEN RAISE EXCEPTION 'Add Guapd''s billing details first'; END IF;
  IF s.gst_registered IS DISTINCT FROM inv.supplier_gst_registered THEN
    RAISE EXCEPTION 'Guapd''s GST registration changed since this draft. Edit the draft first';
  END IF;
  SELECT p.legal_name, p.address, p.state, p.gstin, p.pan INTO b FROM brand_billing_profiles p WHERE p.brand_id = v_brand;
  IF b.legal_name IS NULL THEN RAISE EXCEPTION 'Add the brand''s billing details first'; END IF;
  IF inv.due_date IS NOT NULL AND inv.due_date < v_today THEN RAISE EXCEPTION 'The due date is in the past. Edit the draft'; END IF;

  v_fy := experience_fy(v_today);
  INSERT INTO service_invoice_counters (fy, last_no) VALUES (v_fy, 0) ON CONFLICT (fy) DO NOTHING;
  UPDATE service_invoice_counters SET last_no = last_no + 1 WHERE fy = v_fy RETURNING last_no INTO v_no;
  IF v_no IS NULL THEN RAISE EXCEPTION 'Could not number the invoice'; END IF;
  v_number := 'GPD/' || v_fy || '/' || lpad(v_no::text, 4, '0');

  UPDATE service_invoices SET status = 'issued', number = v_number, issue_date = v_today, issued_at = now(), issued_by = my_user_id(),
    supplier_legal_name = s.legal_name, supplier_address = s.address, supplier_state = s.state, supplier_gstin = s.gstin,
    supplier_gstin_provisional = (s.gst_registered IS NOT TRUE), supplier_pan = s.pan, supplier_payment_instructions = s.payment_instructions,
    recipient_legal_name = b.legal_name, recipient_address = b.address, recipient_state = b.state, recipient_gstin = b.gstin,
    recipient_pan = b.pan, place_of_supply = b.state, updated_at = now()
  WHERE id = p_invoice_id;
  PERFORM experience_console_audit('experience.invoice_issued', 'service_invoices', p_invoice_id,
    jsonb_build_object('experience_id', v_exp, 'number', v_number, 'kind', inv.kind));
  RETURN v_number;
END;
$function$;
