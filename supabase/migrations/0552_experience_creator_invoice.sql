-- 0552: Experiences. After Guapd marks the shoot done, the creator confirms it
-- and raises their invoice to Guapd from their deal page. The payout request
-- needs that invoice. Staging first.
--
-- experience_creator_invoices: one ISSUED invoice per creator deal (a voided one
-- keeps its number; the creator raises again). Figures are copied from the
-- locked experience_creator_terms by the database, never typed: gross (day rate
-- x days), the Guapd platform fee, net, the fee-free allowance, total payable.
-- TDS is not on the invoice; Guapd deducts it at payment (payout statement).
-- GST is not computed (CA to confirm the format); an optional creator GSTIN is
-- printed if given. No bank details on the invoice.
-- No policies and no grants: creators act through creator_leg_invoice_raise and
-- read through creator_leg_context / creator_leg_invoice_doc (own deal only);
-- staff through the console functions (operational access).

CREATE TABLE IF NOT EXISTS experience_creator_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             uuid NOT NULL REFERENCES deals (id),
  experience_id       uuid NOT NULL REFERENCES experiences (id),
  creator_id          uuid NOT NULL REFERENCES creators (id),
  number              text NOT NULL UNIQUE,
  status              text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'void')),
  shoot_confirmed_at  timestamptz NOT NULL,
  billing_name        text NOT NULL CHECK (length(btrim(billing_name)) BETWEEN 2 AND 200),
  gstin               text CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  day_rate_paise      bigint NOT NULL CHECK (day_rate_paise > 0),
  days                numeric(6,2) NOT NULL CHECK (days > 0),
  gross_paise         bigint NOT NULL CHECK (gross_paise > 0),
  platform_pct        numeric NOT NULL CHECK (platform_pct >= 0 AND platform_pct < 100),
  platform_fee_paise  bigint NOT NULL CHECK (platform_fee_paise >= 0),
  net_paise           bigint NOT NULL CHECK (net_paise > 0),
  allowance_paise     bigint NOT NULL DEFAULT 0 CHECK (allowance_paise >= 0),
  payable_paise       bigint NOT NULL CHECK (payable_paise > 0),
  issued_at           timestamptz NOT NULL DEFAULT now(),
  issued_by           uuid REFERENCES users (id),
  voided_at           timestamptz,
  voided_by           uuid REFERENCES users (id),
  void_reason         text,
  CONSTRAINT eci_sums CHECK (gross_paise - platform_fee_paise = net_paise AND net_paise + allowance_paise = payable_paise),
  CONSTRAINT eci_void_complete CHECK ((status = 'void') = (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS eci_one_issued ON experience_creator_invoices (deal_id) WHERE status = 'issued';
CREATE INDEX IF NOT EXISTS eci_experience_idx ON experience_creator_invoices (experience_id);
COMMENT ON TABLE experience_creator_invoices IS
  '0552: the creator invoice to Guapd on an Experience deal. Function access only. Figures copied from the locked terms.';
ALTER TABLE experience_creator_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_creator_invoices FROM anon, authenticated;

-- Never deleted; once issued only the void columns change, once.
CREATE OR REPLACE FUNCTION guard_experience_creator_invoice() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Kept, never deleted; only the service role may remove rows (test teardown), as with counters.
    IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'A creator invoice is never deleted; void it' USING ERRCODE = '42501'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'A void creator invoice does not change' USING ERRCODE = '42501'; END IF;
  IF (NEW.id, NEW.deal_id, NEW.experience_id, NEW.creator_id, NEW.number, NEW.shoot_confirmed_at, NEW.billing_name, NEW.gstin,
      NEW.day_rate_paise, NEW.days, NEW.gross_paise, NEW.platform_pct, NEW.platform_fee_paise, NEW.net_paise, NEW.allowance_paise,
      NEW.payable_paise, NEW.issued_at, NEW.issued_by)
     IS DISTINCT FROM
     (OLD.id, OLD.deal_id, OLD.experience_id, OLD.creator_id, OLD.number, OLD.shoot_confirmed_at, OLD.billing_name, OLD.gstin,
      OLD.day_rate_paise, OLD.days, OLD.gross_paise, OLD.platform_pct, OLD.platform_fee_paise, OLD.net_paise, OLD.allowance_paise,
      OLD.payable_paise, OLD.issued_at, OLD.issued_by)
     OR NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'An issued creator invoice can only be voided' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_eci_guard ON experience_creator_invoices;
CREATE TRIGGER t_eci_guard BEFORE UPDATE OR DELETE ON experience_creator_invoices
  FOR EACH ROW EXECUTE FUNCTION guard_experience_creator_invoice();

-- The creator confirms the shoot is done and raises the invoice. Own deal only;
-- accepted, shot, work complete, inside the payout window, no issued invoice;
-- the screen total must match the database (stale-screen check).
CREATE OR REPLACE FUNCTION creator_leg_invoice_raise(p_deal_id uuid, p_shoot_confirmed boolean, p_billing_name text, p_gstin text, p_expected_payable_paise bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued') THEN
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
  SELECT count(*) + 1 INTO v_n FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id;
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
$$;

-- What the invoice document needs, for the creator who raised it.
CREATE OR REPLACE FUNCTION creator_leg_invoice_doc(p_deal_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
                   AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT experience_creator_invoice_doc_json(i.id) INTO v
    FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued';
  IF v IS NULL THEN RAISE EXCEPTION 'No invoice yet'; END IF;
  RETURN v;
END;
$$;

-- Shared body of the document read (internal; callers check access first).
CREATE OR REPLACE FUNCTION experience_creator_invoice_doc_json(p_invoice_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', i.id, 'number', i.number, 'status', i.status, 'issued_at', i.issued_at, 'shoot_confirmed_at', i.shoot_confirmed_at,
    'billing_name', i.billing_name, 'gstin', i.gstin,
    'day_rate_paise', i.day_rate_paise, 'days', i.days, 'gross_paise', i.gross_paise, 'platform_pct', i.platform_pct,
    'platform_fee_paise', i.platform_fee_paise, 'net_paise', i.net_paise, 'allowance_paise', i.allowance_paise, 'payable_paise', i.payable_paise,
    'deal_ref', d.deal_ref, 'experience_title', e.title, 'brand_name', d.experience_brand_name, 'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
    'bill_to', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('legal_name', g.legal_name, 'address', g.address, 'state', g.state,
                 'gstin', g.gstin, 'pan', g.pan) END)
  FROM experience_creator_invoices i
  JOIN deals d ON d.id = i.deal_id
  JOIN experiences e ON e.id = i.experience_id
  LEFT JOIN guapd_billing_settings g ON g.id = true
  WHERE i.id = p_invoice_id;
$$;

-- Staff read of the same document (operational access).
CREATE OR REPLACE FUNCTION experience_console_creator_invoice_doc(p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM experience_console_require();
  v := experience_creator_invoice_doc_json(p_invoice_id);
  IF v IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  RETURN v;
END;
$$;

-- Staff void a wrong invoice (with a reason) so the creator can raise it again.
-- Refused while a payout on that deal is live: cancel the payout first.
CREATE OR REPLACE FUNCTION experience_console_creator_invoice_void(p_invoice_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deal uuid; v_exp uuid; v_status text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT i.deal_id, i.experience_id, i.status INTO v_deal, v_exp, v_status FROM experience_creator_invoices i WHERE i.id = p_invoice_id FOR UPDATE;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'This invoice is already void'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
  IF EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.deal_id = v_deal AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed')) THEN
    RAISE EXCEPTION 'This creator has a live payout. Cancel it before voiding the invoice';
  END IF;
  UPDATE experience_creator_invoices SET status = 'void', voided_at = now(), voided_by = my_user_id(), void_reason = left(v_reason, 500)
    WHERE id = p_invoice_id;
  PERFORM experience_console_audit('experience.creator_invoice_voided', 'experience_creator_invoices', p_invoice_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'reason', left(v_reason, 500)));
END;
$$;

-- The payout request now needs the creator invoice (live definition + one check).
CREATE OR REPLACE FUNCTION experience_console_payout_request(p_deal_id uuid, p_tds_paise bigint)
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
  IF NOT EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued') THEN
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

-- creator_leg_context: the invoice and whether the creator can raise it now.
CREATE OR REPLACE FUNCTION creator_leg_context(p_deal_id uuid)
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
  t_rate bigint; t_days numeric; t_gross bigint; t_pct numeric; t_net bigint; t_track text; t_allow bigint;
  v_videos int; v_owner text; v_items jsonb; v_payout jsonb; v_counters jsonb; v_used int;
  v_ad_bought boolean; v_boost_bought boolean;
  v_invoice jsonb;
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
  SELECT t.day_rate_paise, t.days, t.creator_gross_paise, t.platform_pct, t.creator_net_paise, t.platform_track, t.allowance_paise
    INTO t_rate, t_days, t_gross, t_pct, t_net, t_track, t_allow
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
    FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued';

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
    'deliverables', coalesce(v_deliverables, '[]'::jsonb), 'videos', v_videos, 'affiliate_count', coalesce(v_aff, 0),
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
    'invoice', v_invoice,
    'can_invoice', coalesce(v_invoice IS NULL AND v_status = 'agreed' AND v_outcome = 'done'
                   AND v_estatus IN ('shoot_scheduled', 'shoot_done', 'delivering')
                   AND experience_leg_work_complete(p_deal_id) IS TRUE AND t_net IS NOT NULL, false),
    'counters', v_counters, 'counters_left', CASE WHEN v_status = 'negotiating' THEN greatest(3 - coalesce(v_used, 0), 0) ELSE 0 END);
END;
$function$;

-- experience_console_payouts: the creator invoice per deal.
CREATE OR REPLACE FUNCTION experience_console_payouts(p_experience_id uuid)
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
                      FROM experience_creator_invoices i WHERE i.deal_id = t.deal_id AND i.status = 'issued'),
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


REVOKE EXECUTE ON FUNCTION guard_experience_creator_invoice()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION experience_creator_invoice_doc_json(uuid)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION creator_leg_invoice_raise(uuid, boolean, text, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION creator_leg_invoice_doc(uuid)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_creator_invoice_doc(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_creator_invoice_void(uuid, text)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION creator_leg_invoice_raise(uuid, boolean, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION creator_leg_invoice_doc(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_creator_invoice_doc(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_creator_invoice_void(uuid, text)        TO authenticated;
