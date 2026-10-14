-- 0555: Experiences. Extra deliverables for a creator after the shoot (Phase B;
-- Palak, 2026-10-12). When the brand has bought more (0554 add-on), Guapd sends a
-- creator an extra request on their existing deal: what it adds, priced at a rate
-- per item x count or a flat amount, less the Guapd platform fee at the % locked
-- on that creator deal. The creator accepts or declines (no counter). While it is
-- unanswered Guapd can revise it (sending again replaces it) or withdraw it.
--
-- Accepting adds the items to the creator deal (deal_deliverable_items.extra_id),
-- so review, sharing with the brand, delivery progress and completion count them.
-- Open and accepted extras count as placed in the creator-deal reconcile, so the
-- videos and per-type totals placed with creators never pass what the brand bought.
-- An accepted extra is invoiced and paid on its own: the creator raises an invoice
-- for it (experience_creator_invoices.extra_id) and Guapd pays it as a
-- creator_extra payout (vendor_payouts.extra_id), maker-checker as before. The P&L
-- and the completion check include accepted extras.
-- Operational access to send (creator pay is operational, as for creator deals).
-- Function access only. Staging first.

CREATE TABLE IF NOT EXISTS experience_leg_extras (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             uuid NOT NULL REFERENCES deals (id),
  experience_id       uuid NOT NULL REFERENCES experiences (id),
  creator_id          uuid NOT NULL REFERENCES creators (id),
  number              int  NOT NULL CHECK (number > 0),
  deliverables        jsonb NOT NULL,
  items               int  NOT NULL CHECK (items > 0),
  videos              int  NOT NULL CHECK (videos >= 0),
  pricing             text NOT NULL CHECK (pricing IN ('per_item', 'flat')),
  unit_paise          bigint CHECK (unit_paise IS NULL OR unit_paise > 0),
  gross_paise         bigint NOT NULL CHECK (gross_paise > 0),
  platform_pct        numeric NOT NULL CHECK (platform_pct >= 0 AND platform_pct < 100),
  platform_fee_paise  bigint NOT NULL CHECK (platform_fee_paise >= 0),
  net_paise           bigint NOT NULL CHECK (net_paise > 0),
  message             text CHECK (message IS NULL OR length(message) <= 2000),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'superseded', 'accepted', 'declined', 'withdrawn')),
  decline_reason      text CHECK (decline_reason IS NULL OR length(decline_reason) <= 500),
  created_by          uuid REFERENCES users (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz,
  decided_by          uuid REFERENCES users (id),
  CONSTRAINT ele_number_unique UNIQUE (deal_id, number),
  CONSTRAINT ele_deliverables CHECK (experience_addon_deliverables_valid(deliverables) AND jsonb_array_length(deliverables) > 0),
  CONSTRAINT ele_counts CHECK (videos = experience_video_count(deliverables) AND items = experience_plan_count(deliverables, false)),
  CONSTRAINT ele_price CHECK ((pricing = 'per_item' AND unit_paise IS NOT NULL AND gross_paise = unit_paise * items)
                           OR (pricing = 'flat' AND unit_paise IS NULL)),
  CONSTRAINT ele_fee CHECK (platform_fee_paise = round(gross_paise::numeric * platform_pct / 100)::bigint AND net_paise = gross_paise - platform_fee_paise)
);
CREATE UNIQUE INDEX IF NOT EXISTS ele_one_open ON experience_leg_extras (deal_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS ele_experience_idx ON experience_leg_extras (experience_id);
COMMENT ON TABLE experience_leg_extras IS '0555: extra deliverables offered to a creator on their Experience deal. Function access only.';
ALTER TABLE experience_leg_extras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_leg_extras FROM anon, authenticated;
DROP TRIGGER IF EXISTS t_ele_pnl_refresh ON experience_leg_extras;
CREATE TRIGGER t_ele_pnl_refresh AFTER INSERT OR UPDATE ON experience_leg_extras FOR EACH ROW EXECUTE FUNCTION experience_pnl_refresh_from_row();

-- The items an accepted extra adds to the creator deal.
ALTER TABLE deal_deliverable_items ADD COLUMN IF NOT EXISTS extra_id uuid REFERENCES experience_leg_extras (id);

-- An extra is invoiced on its own: one issued invoice per extra, and still one per creator deal for the main fee.
ALTER TABLE experience_creator_invoices ADD COLUMN IF NOT EXISTS extra_id uuid REFERENCES experience_leg_extras (id);
DROP INDEX IF EXISTS eci_one_issued;
CREATE UNIQUE INDEX IF NOT EXISTS eci_one_issued ON experience_creator_invoices (deal_id) WHERE status = 'issued' AND extra_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS eci_one_issued_extra ON experience_creator_invoices (extra_id) WHERE status = 'issued' AND extra_id IS NOT NULL;

-- An extra is paid on its own: reason creator_extra, one live payout per extra, exactly its accepted terms.
ALTER TABLE vendor_payouts ADD COLUMN IF NOT EXISTS extra_id uuid REFERENCES experience_leg_extras (id);
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_reason;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_reason CHECK (reason IN ('creator_fee', 'creator_extra', 'follow_on', 'cost_line'));
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_extra_statement;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_extra_statement CHECK ((reason = 'creator_extra') = (extra_id IS NOT NULL)
  AND (reason IS DISTINCT FROM 'creator_extra' OR (deal_id IS NOT NULL AND gross_paise IS NOT NULL AND platform_pct IS NOT NULL
       AND platform_fee_paise IS NOT NULL AND amount_paise = gross_paise - platform_fee_paise AND allowance_paise = 0)));
CREATE UNIQUE INDEX IF NOT EXISTS vp_one_live_creator_extra ON vendor_payouts (extra_id) WHERE reason = 'creator_extra' AND status NOT IN ('cancelled', 'failed');

-- The creator part of an extra is complete: accepted on an accepted, shot deal; on a creator-submit
-- shoot every item it added is approved by Guapd.
CREATE OR REPLACE FUNCTION experience_leg_extra_work_complete(p_extra_id uuid) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deal uuid; v_status text; v_dstatus text; v_outcome text;
BEGIN
  SELECT x.deal_id, x.status INTO v_deal, v_status FROM experience_leg_extras x WHERE x.id = p_extra_id;
  IF v_deal IS NULL OR v_status IS DISTINCT FROM 'accepted' THEN RETURN false; END IF;
  SELECT d.status::text INTO v_dstatus FROM deals d WHERE d.id = v_deal AND d.leg_role = 'creator_leg';
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = v_deal;
  IF v_dstatus IS NULL OR v_dstatus NOT IN ('agreed', 'paid') OR v_outcome IS DISTINCT FROM 'done' THEN RETURN false; END IF;
  IF experience_leg_owner(v_deal) = 'creator' THEN
    RETURN EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.extra_id = p_extra_id)
       AND NOT EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.extra_id = p_extra_id AND i.item_status IS DISTINCT FROM 'approved');
  END IF;
  RETURN true;
END;
$$;

-- Guapd sends (or revises) an extra request on a creator deal.
CREATE OR REPLACE FUNCTION experience_console_extra_send(p_deal_id uuid, p_deliverables jsonb, p_pricing text, p_unit_paise bigint,
  p_flat_paise bigint, p_message text, p_expected_gross_paise bigint, p_expected_net_paise bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_creator uuid; v_dstatus text; v_estatus text; v_pct numeric; v_locked timestamptz;
  v_add jsonb := coalesce(p_deliverables, '[]'::jsonb); v_items int; v_videos int; v_gross bigint; v_fee bigint; v_net bigint;
  v_unit bigint; v_prev uuid; v_n int; v_id uuid; v_rec jsonb; v_sold int; v_placed int; v_over_type text;
BEGIN
  PERFORM experience_console_require();
  SELECT d.experience_id, d.creator_id, d.status::text INTO v_exp, v_creator, v_dstatus
    FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg' FOR UPDATE;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Creator deal not found'; END IF;
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  IF v_estatus IS NULL OR v_estatus NOT IN ('confirmed', 'shoot_scheduled', 'shoot_done', 'delivering') THEN
    RAISE EXCEPTION 'Extras are sent once creators are confirmed and before Complete';
  END IF;
  IF v_dstatus IS NULL OR v_dstatus NOT IN ('agreed', 'paid') THEN RAISE EXCEPTION 'Extras go to a creator who accepted their deal'; END IF;
  SELECT t.platform_pct, t.locked_at INTO v_pct, v_locked FROM experience_creator_terms t WHERE t.deal_id = p_deal_id;
  IF v_locked IS NULL OR v_pct IS NULL THEN RAISE EXCEPTION 'This creator deal has no locked terms'; END IF;
  IF experience_addon_deliverables_valid(v_add) IS NOT TRUE OR jsonb_array_length(v_add) = 0 THEN
    RAISE EXCEPTION 'Each extra deliverable needs a type and a count from 1 to 1,000, each type once';
  END IF;
  v_items := experience_plan_count(v_add, false);
  v_videos := experience_video_count(v_add);
  IF p_pricing = 'per_item' THEN
    IF p_unit_paise IS NULL OR p_unit_paise <= 0 THEN RAISE EXCEPTION 'Enter the rate per item'; END IF;
    v_unit := p_unit_paise; v_gross := p_unit_paise * v_items;
  ELSIF p_pricing = 'flat' THEN
    IF p_flat_paise IS NULL OR p_flat_paise <= 0 THEN RAISE EXCEPTION 'Enter the flat amount'; END IF;
    v_unit := NULL; v_gross := p_flat_paise;
  ELSE
    RAISE EXCEPTION 'Price it per item or as a flat amount';
  END IF;
  v_fee := round(v_gross::numeric * v_pct / 100)::bigint;
  v_net := v_gross - v_fee;
  IF v_net <= 0 THEN RAISE EXCEPTION 'The creator must receive something'; END IF;
  IF p_expected_gross_paise IS DISTINCT FROM v_gross OR p_expected_net_paise IS DISTINCT FROM v_net THEN
    RAISE EXCEPTION 'The figures changed (now % gross, % net). Check them and send again', v_gross, v_net;
  END IF;

  -- Replace an open one (revise), then check the cap with this one counted.
  UPDATE experience_leg_extras SET status = 'superseded', decided_at = now(), decided_by = my_user_id()
    WHERE deal_id = p_deal_id AND status = 'open' RETURNING id INTO v_prev;
  SELECT coalesce(max(x.number), 0) + 1 INTO v_n FROM experience_leg_extras x WHERE x.deal_id = p_deal_id;
  INSERT INTO experience_leg_extras (deal_id, experience_id, creator_id, number, deliverables, items, videos, pricing, unit_paise,
    gross_paise, platform_pct, platform_fee_paise, net_paise, message, created_by)
  VALUES (p_deal_id, v_exp, v_creator, v_n, v_add, v_items, v_videos, p_pricing, v_unit, v_gross, v_pct, v_fee, v_net,
    nullif(left(btrim(coalesce(p_message, '')), 2000), ''), my_user_id())
  RETURNING id INTO v_id;
  v_rec := experience_legs_reconcile(v_exp);
  v_sold := (v_rec ->> 'videos_sold')::int; v_placed := (v_rec ->> 'videos_placed')::int;
  SELECT l ->> 'type' INTO v_over_type FROM jsonb_array_elements(coalesce(v_rec -> 'lines', '[]'::jsonb)) l
    WHERE (l ->> 'is_video')::boolean IS NOT TRUE AND (l ->> 'placed')::int > (l ->> 'target')::int LIMIT 1;
  IF v_sold IS NULL OR v_placed > v_sold THEN
    RAISE EXCEPTION 'This would place % videos with creators but the brand bought %. Send the brand an add-on first', v_placed, coalesce(v_sold, 0);
  END IF;
  IF v_over_type IS NOT NULL THEN
    RAISE EXCEPTION 'This would place more % items with creators than the brand bought. Send the brand an add-on first', v_over_type;
  END IF;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (p_deal_id, my_user_id(), 'experience.extra_offered', jsonb_build_object('extra_id', v_id, 'number', v_n, 'replaced_extra_id', v_prev, 'deliverables', v_add));
  PERFORM experience_console_audit('experience.extra_sent', 'experience_leg_extras', v_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', p_deal_id, 'number', v_n, 'replaced_extra_id', v_prev, 'gross_paise', v_gross, 'net_paise', v_net));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_extra_withdraw(p_extra_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deal uuid; v_exp uuid;
BEGIN
  PERFORM experience_console_require();
  UPDATE experience_leg_extras SET status = 'withdrawn', decided_at = now(), decided_by = my_user_id()
    WHERE id = p_extra_id AND status = 'open' RETURNING deal_id, experience_id INTO v_deal, v_exp;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Only an open extra can be withdrawn'; END IF;
  INSERT INTO events (deal_id, actor_id, event_type, detail) VALUES (v_deal, my_user_id(), 'experience.extra_withdrawn', jsonb_build_object('extra_id', p_extra_id));
  PERFORM experience_console_audit('experience.extra_withdrawn', 'experience_leg_extras', p_extra_id, jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal));
END;
$$;

-- The creator answers their own extra. Accepting adds its items to the deal.
CREATE OR REPLACE FUNCTION creator_leg_extra_respond(p_extra_id uuid, p_accept boolean, p_reason text, p_expected_net_paise bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_status text; v_net bigint; v_add jsonb; v_dstatus text; d jsonb; i int; v_have int; v_owner text;
BEGIN
  SELECT x.deal_id INTO v_deal FROM experience_leg_extras x
    JOIN deals dd ON dd.id = x.deal_id
    WHERE x.id = p_extra_id AND dd.leg_role = 'creator_leg' AND my_creator_id() IS NOT NULL AND dd.creator_id = my_creator_id();
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Accept or decline'; END IF;
  SELECT dd.status::text INTO v_dstatus FROM deals dd WHERE dd.id = v_deal FOR UPDATE;
  SELECT x.status, x.net_paise, x.deliverables INTO v_status, v_net, v_add FROM experience_leg_extras x WHERE x.id = p_extra_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'Guapd changed this offer. Refresh to see the latest'; END IF;
  IF p_expected_net_paise IS NULL OR p_expected_net_paise IS DISTINCT FROM v_net THEN RAISE EXCEPTION 'Guapd changed this offer. Refresh to see the latest'; END IF;
  IF p_accept THEN
    IF v_dstatus IS NULL OR v_dstatus NOT IN ('agreed', 'paid') THEN RAISE EXCEPTION 'This deal is closed'; END IF;
    UPDATE experience_leg_extras SET status = 'accepted', decided_at = now(), decided_by = my_user_id() WHERE id = p_extra_id;
    v_owner := experience_leg_owner(v_deal);
    FOR d IN SELECT x FROM jsonb_array_elements(v_add) x LOOP
      SELECT count(*)::int INTO v_have FROM deal_deliverable_items it WHERE it.deal_id = v_deal AND experience_item_type(it.label) = d ->> 'type';
      FOR i IN 1 .. (d ->> 'count')::int LOOP
        INSERT INTO deal_deliverable_items (deal_id, label, platform, handle, price_paise, added_by, visible_to_creator, ig_match_status, affiliate_link, extra_id)
        VALUES (v_deal, (d ->> 'type') || ' ' || (v_have + i), 'shoot', '', NULL, 'guapd', true, 'unsupported', false, p_extra_id);
      END LOOP;
    END LOOP;
    INSERT INTO events (deal_id, actor_id, event_type, detail) VALUES (v_deal, my_user_id(), 'experience.extra_accepted', jsonb_build_object('extra_id', p_extra_id));
    RETURN 'accepted';
  END IF;
  UPDATE experience_leg_extras SET status = 'declined', decided_at = now(), decided_by = my_user_id(),
    decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '') WHERE id = p_extra_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail) VALUES (v_deal, my_user_id(), 'experience.extra_declined', jsonb_build_object('extra_id', p_extra_id));
  RETURN 'declined';
END;
$$;

-- The creator raises the invoice for an accepted extra (own deal; figures from the extra, never typed).
CREATE OR REPLACE FUNCTION creator_leg_extra_invoice_raise(p_extra_id uuid, p_confirmed boolean, p_billing_name text, p_gstin text, p_expected_payable_paise bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_exp uuid; v_creator uuid; v_ref text; x record; v_name text; v_gstin text; v_n int; v_number text; v_id uuid; v_estatus text;
BEGIN
  SELECT dd.id, dd.experience_id, dd.creator_id, dd.deal_ref INTO v_deal, v_exp, v_creator, v_ref
    FROM experience_leg_extras le JOIN deals dd ON dd.id = le.deal_id
    WHERE le.id = p_extra_id AND dd.leg_role = 'creator_leg' AND my_creator_id() IS NOT NULL AND dd.creator_id = my_creator_id()
    FOR UPDATE OF le;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF p_confirmed IS NOT TRUE THEN RAISE EXCEPTION 'Confirm the extra work is agreed and your part is complete first'; END IF;
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp;
  IF v_estatus IS NULL OR v_estatus NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN RAISE EXCEPTION 'You can invoice this once your shoot is done'; END IF;
  IF experience_leg_extra_work_complete(p_extra_id) IS NOT TRUE THEN RAISE EXCEPTION 'You can invoice this extra once your part is complete'; END IF;
  IF EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.extra_id = p_extra_id AND i.status = 'issued') THEN
    RAISE EXCEPTION 'You have already raised the invoice for this extra';
  END IF;
  SELECT le.number, le.pricing, le.unit_paise, le.items, le.gross_paise, le.platform_pct, le.platform_fee_paise, le.net_paise INTO x
    FROM experience_leg_extras le WHERE le.id = p_extra_id;
  IF p_expected_payable_paise IS NULL OR p_expected_payable_paise IS DISTINCT FROM x.net_paise THEN
    RAISE EXCEPTION 'These figures have changed. Refresh the page and check them again';
  END IF;
  v_name := nullif(btrim(coalesce(p_billing_name, '')), '');
  IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Enter the name to invoice from'; END IF;
  v_gstin := nullif(upper(btrim(coalesce(p_gstin, ''))), '');
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN RAISE EXCEPTION 'That GSTIN is not valid'; END IF;
  SELECT count(*) + 1 INTO v_n FROM experience_creator_invoices i WHERE i.extra_id = p_extra_id;
  v_number := 'CI-' || coalesce(v_ref, left(v_deal::text, 8)) || '-X' || x.number || CASE WHEN v_n > 1 THEN '-' || v_n::text ELSE '' END;
  INSERT INTO experience_creator_invoices (deal_id, experience_id, creator_id, extra_id, number, shoot_confirmed_at, billing_name, gstin,
    day_rate_paise, days, gross_paise, platform_pct, platform_fee_paise, net_paise, allowance_paise, payable_paise, issued_by)
  VALUES (v_deal, v_exp, v_creator, p_extra_id, v_number, now(), v_name, v_gstin,
    CASE WHEN x.pricing = 'per_item' THEN x.unit_paise ELSE x.gross_paise END, CASE WHEN x.pricing = 'per_item' THEN x.items ELSE 1 END,
    x.gross_paise, x.platform_pct, x.platform_fee_paise, x.net_paise, 0, x.net_paise, my_user_id())
  RETURNING id INTO v_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.creator_invoice_raised', jsonb_build_object('invoice_id', v_id, 'number', v_number, 'extra_id', p_extra_id));
  RETURN jsonb_build_object('id', v_id, 'number', v_number);
END;
$$;

CREATE OR REPLACE FUNCTION creator_leg_extra_invoice_doc(p_extra_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM experience_leg_extras le JOIN deals dd ON dd.id = le.deal_id
                 WHERE le.id = p_extra_id AND dd.leg_role = 'creator_leg' AND my_creator_id() IS NOT NULL AND dd.creator_id = my_creator_id()) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT experience_creator_invoice_doc_json(i.id) INTO v FROM experience_creator_invoices i WHERE i.extra_id = p_extra_id AND i.status = 'issued';
  IF v IS NULL THEN RAISE EXCEPTION 'No invoice yet'; END IF;
  RETURN v;
END;
$$;

-- Guapd requests the payout for an accepted, invoiced extra (operational), maker-checker as for the main fee.
CREATE OR REPLACE FUNCTION experience_console_extra_payout_request(p_extra_id uuid, p_tds_paise bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal uuid; v_exp uuid; v_creator uuid; v_status text; x record; v_name text; v_vendor uuid; v_attempt int; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT le.deal_id, le.experience_id, le.creator_id INTO v_deal, v_exp, v_creator FROM experience_leg_extras le WHERE le.id = p_extra_id;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Extra not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN RAISE EXCEPTION 'Creators are paid after the shoot and before Complete'; END IF;
  SELECT le.status, le.gross_paise, le.platform_pct, le.platform_fee_paise, le.net_paise INTO x FROM experience_leg_extras le WHERE le.id = p_extra_id FOR UPDATE;
  IF experience_leg_extra_work_complete(p_extra_id) IS NOT TRUE THEN RAISE EXCEPTION 'This extra is not complete yet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.extra_id = p_extra_id AND i.status = 'issued') THEN
    RAISE EXCEPTION 'The creator has not raised the invoice for this extra yet';
  END IF;
  IF p_tds_paise IS NULL OR p_tds_paise < 0 OR p_tds_paise > x.net_paise THEN RAISE EXCEPTION 'TDS must be between 0 and the amount due'; END IF;
  IF EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.extra_id = p_extra_id AND p.reason = 'creator_extra' AND p.status NOT IN ('cancelled', 'failed')) THEN
    RAISE EXCEPTION 'This extra already has a payout. Cancel it to request again';
  END IF;
  SELECT c.full_name INTO v_name FROM creators c WHERE c.id = v_creator;
  INSERT INTO vendors (kind, creator_id, display_name) VALUES ('creator', v_creator, coalesce(v_name, 'Creator')) ON CONFLICT (creator_id) DO NOTHING;
  SELECT v.id INTO v_vendor FROM vendors v WHERE v.creator_id = v_creator;
  SELECT count(*) + 1 INTO v_attempt FROM vendor_payouts p WHERE p.extra_id = p_extra_id;
  INSERT INTO vendor_payouts (experience_id, deal_id, extra_id, vendor_id, reason, gross_paise, platform_pct, platform_fee_paise,
    amount_paise, allowance_paise, tds_paise, net_amount_paise, status, provider, idempotency_key, created_by)
  VALUES (v_exp, v_deal, p_extra_id, v_vendor, 'creator_extra', x.gross_paise, x.platform_pct, x.platform_fee_paise,
    x.net_paise, 0, p_tds_paise, x.net_paise - p_tds_paise, 'requested', 'manual', 'creator_extra:' || p_extra_id::text || ':' || v_attempt::text, my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.payout_requested', 'vendor_payouts', v_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'extra_id', p_extra_id, 'creator_id', v_creator, 'attempt', v_attempt));
  RETURN v_id;
END;
$$;

-- Staff list of extras on an Experience (operational: creator pay is operational).
CREATE OR REPLACE FUNCTION experience_console_leg_extras(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'deal_id', x.deal_id, 'creator_id', x.creator_id, 'full_name', c.full_name, 'number', x.number, 'status', x.status,
           'deliverables', x.deliverables, 'items', x.items, 'videos', x.videos, 'pricing', x.pricing, 'unit_paise', x.unit_paise,
           'gross_paise', x.gross_paise, 'platform_pct', x.platform_pct, 'platform_fee_paise', x.platform_fee_paise, 'net_paise', x.net_paise,
           'message', x.message, 'decline_reason', x.decline_reason, 'created_at', x.created_at, 'decided_at', x.decided_at,
           'created_by_name', coalesce(u.full_name, u.email)) ORDER BY c.full_name, x.number DESC), '[]'::jsonb)
    INTO v
    FROM experience_leg_extras x JOIN creators c ON c.id = x.creator_id LEFT JOIN users u ON u.id = x.created_by
    WHERE x.experience_id = p_experience_id;
  RETURN v;
END;
$$;

-- ── Live definitions, patched for extras ──

CREATE OR REPLACE FUNCTION experience_legs_reconcile(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan jsonb; v_ad_bought boolean; v_boost_bought boolean;
  v_sold int; v_plan_videos int; v_per_type boolean;
  v_aff_per int; v_ad_per int; v_boost_per int; v_n int;
  v_aff_target int; v_aff_placed int := 0;
  v_ad_target int; v_ad_placed int := 0;
  v_boost_target int; v_boost_placed int := 0;
  v_videos int := 0; v_over boolean := false; v_exact boolean := true;
  v_lines jsonb := '[]'::jsonb; v_creators int := 0; v_all jsonb := '[]'::jsonb;
  v_lv int;
  rec record; ln record;
BEGIN
  SELECT e.agreed_plan, e.request_ad_rights IS TRUE, e.request_boost IS TRUE
    INTO v_plan, v_ad_bought, v_boost_bought
    FROM experiences e WHERE e.id = p_experience_id;
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'over', false, 'reason', 'no_agreed_plan');
  END IF;
  v_sold := (v_plan ->> 'videos_sold')::int;
  v_plan_videos := (v_plan ->> 'plan_videos')::int;
  v_per_type := coalesce(v_sold = v_plan_videos, true);  -- unknown: check every line
  v_aff_per := nullif(v_plan ->> 'affiliate_per_creator', '')::int;
  v_ad_per := nullif(v_plan ->> 'ad_rights_per_creator', '')::int;      -- NULL with ad rights bought = all videos
  v_boost_per := nullif(v_plan ->> 'boost_per_creator', '')::int;       -- NULL with boost bought = all videos

  FOR rec IN
    SELECT coalesce(r.leg_deliverables, r.planned_deliverables) AS dl, r.leg_affiliate_count AS aff,
           r.leg_ad_rights_count AS ad, r.leg_boost_count AS boost
    FROM experience_roster r
    LEFT JOIN deals d ON d.id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id AND r.locked AND r.brand_decision = 'accepted'
      AND (d.id IS NULL OR d.status NOT IN ('declined', 'cancelled'))
  LOOP
    v_creators := v_creators + 1;
    v_all := v_all || coalesce(rec.dl, '[]'::jsonb);
    v_lv := experience_video_count(rec.dl);
    -- Undrafted: the agreed per-creator count, capped at this creator's videos.
    v_aff_placed := v_aff_placed + coalesce(rec.aff, least(coalesce(v_aff_per, 0), v_lv));
    -- 0547: an undrafted creator projects at the agreed per-creator count; with no
    -- agreed count, nothing (never "all").
    v_ad_placed := v_ad_placed + coalesce(rec.ad, CASE WHEN v_ad_bought THEN least(coalesce(v_ad_per, 0), v_lv) ELSE 0 END);
    v_boost_placed := v_boost_placed + coalesce(rec.boost, CASE WHEN v_boost_bought THEN least(coalesce(v_boost_per, 0), v_lv) ELSE 0 END);
  END LOOP;

  -- 0555: open and accepted extra requests are placed too (never past what the brand bought).
  SELECT v_all || coalesce(jsonb_agg(xd), '[]'::jsonb) INTO v_all
    FROM experience_leg_extras le JOIN deals dx ON dx.id = le.deal_id
    CROSS JOIN LATERAL jsonb_array_elements(le.deliverables) xd
    WHERE le.experience_id = p_experience_id AND le.status IN ('open', 'accepted') AND dx.status NOT IN ('declined', 'cancelled');

  -- Creators the brand bought. A plan locked without a count (pre-0531) priced
  -- its per-creator line as the WHOLE order (plan_videos = per x coalesce(count, 1)),
  -- so it counts as one here too. No target can exceed the videos sold.
  v_n := coalesce(nullif(v_plan ->> 'creator_count', '')::int, 1);
  v_aff_target := least(coalesce(v_aff_per, 0) * v_n, coalesce(v_sold, 0));

  FOR ln IN
    WITH placed AS (SELECT x ->> 'type' AS type, sum((x ->> 'count')::int)::int AS n
                    FROM jsonb_array_elements(v_all) x WHERE (x ->> 'count') ~ '^[0-9]+$' GROUP BY x ->> 'type'),
         target AS (SELECT t ->> 'type' AS type, (t ->> 'total')::int AS n FROM jsonb_array_elements(coalesce(v_plan -> 'totals', '[]'::jsonb)) t)
    SELECT coalesce(t.type, p.type) AS type, coalesce(t.n, 0) AS target, coalesce(p.n, 0) AS placed,
           coalesce(t.type, p.type) IN ('UGC video', 'Reel') AS is_video
    FROM target t FULL JOIN placed p ON p.type = t.type
    ORDER BY 1
  LOOP
    v_lines := v_lines || jsonb_build_object('type', ln.type, 'target', ln.target, 'placed', ln.placed, 'is_video', ln.is_video);
    IF ln.is_video THEN v_videos := v_videos + ln.placed; END IF;
    IF ln.is_video IS NOT TRUE OR v_per_type THEN
      IF ln.placed > ln.target THEN v_over := true; END IF;
      IF ln.placed <> ln.target THEN v_exact := false; END IF;
    END IF;
  END LOOP;

  -- Ad rights / boost: the bought per-creator count x creators, never past the
  -- videos sold. 0547: not bought, or bought with no count: 0 (NULL means no).
  v_ad_target := CASE WHEN v_ad_bought IS NOT TRUE OR v_ad_per IS NULL THEN 0 ELSE least(v_ad_per * v_n, coalesce(v_sold, 0)) END;
  v_boost_target := CASE WHEN v_boost_bought IS NOT TRUE OR v_boost_per IS NULL THEN 0 ELSE least(v_boost_per * v_n, coalesce(v_sold, 0)) END;

  IF v_sold IS NULL OR v_videos > v_sold THEN v_over := true; END IF;
  IF v_videos IS DISTINCT FROM v_sold THEN v_exact := false; END IF;
  IF v_aff_placed > v_aff_target THEN v_over := true; END IF;
  IF v_aff_placed <> v_aff_target THEN v_exact := false; END IF;
  IF v_ad_placed > v_ad_target OR v_boost_placed > v_boost_target THEN v_over := true; END IF;
  IF v_ad_placed <> v_ad_target OR v_boost_placed <> v_boost_target THEN v_exact := false; END IF;

  RETURN jsonb_build_object(
    'ok', v_exact AND NOT v_over, 'over', v_over, 'per_type', v_per_type,
    'videos_sold', v_sold, 'videos_placed', v_videos,
    'affiliate_target', v_aff_target, 'affiliate_placed', v_aff_placed,
    'ad_rights_target', v_ad_target, 'ad_rights_placed', v_ad_placed, 'ad_rights_months', nullif(v_plan ->> 'ad_rights_months', '')::int,
    'boost_target', v_boost_target, 'boost_placed', v_boost_placed, 'boost_months', nullif(v_plan ->> 'boost_months', '')::int,
    'creators_counted', v_creators, 'lines', v_lines);
END;
$function$;

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
    FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued' AND i.extra_id IS NULL;

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
    'invoice', v_invoice, 'extras', v_extras,
    'can_invoice', coalesce(v_invoice IS NULL AND v_status = 'agreed' AND v_outcome = 'done'
                   AND v_estatus IN ('shoot_scheduled', 'shoot_done', 'delivering')
                   AND experience_leg_work_complete(p_deal_id) IS TRUE AND t_net IS NOT NULL, false),
    'counters', v_counters, 'counters_left', CASE WHEN v_status = 'negotiating' THEN greatest(3 - coalesce(v_used, 0), 0) ELSE 0 END);
END;
$function$;

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
                      FROM experience_creator_invoices i WHERE i.deal_id = t.deal_id AND i.status = 'issued' AND i.extra_id IS NULL),
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

CREATE OR REPLACE FUNCTION experience_completion_check(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_brand_at timestamptz; v_prog jsonb;
  v_live int; v_unpaid int; v_drafts int;
  v_counted int; v_paid int; v_open int; v_no_outcome int; v_x_due int; v_x_paid int; v_x_open int;
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
  ok_pay := coalesce(v_counted = v_paid AND v_open = 0 AND v_no_outcome = 0 AND v_x_due = v_x_paid AND v_x_open = 0, false);
  ok_brand := v_brand_at IS NOT NULL;

  IF NOT ok_deliv THEN v_blockers := array_append(v_blockers, 'The brand has not approved everything sold'); END IF;
  IF v_drafts > 0 THEN v_blockers := array_append(v_blockers, 'Issue or discard the draft invoices'); END IF;
  IF v_live = 0 THEN v_blockers := array_append(v_blockers, 'No invoice has been issued'); END IF;
  IF v_unpaid > 0 THEN v_blockers := array_append(v_blockers, format('%s invoice(s) not fully paid', v_unpaid)); END IF;
  IF v_open > 0 OR v_no_outcome > 0 THEN v_blockers := array_append(v_blockers, 'Some creators have no outcome yet'); END IF;
  IF coalesce(v_counted - v_paid, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s creator(s) not paid', v_counted - v_paid)); END IF;
  IF coalesce(v_x_due - v_x_paid, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s creator extra(s) not paid', v_x_due - v_x_paid)); END IF;
  IF coalesce(v_x_open, 0) > 0 THEN v_blockers := array_append(v_blockers, 'An extra request to a creator is unanswered'); END IF;
  IF NOT ok_brand THEN v_blockers := array_append(v_blockers, 'The brand has not signed off'); END IF;
  IF v_status IS DISTINCT FROM 'delivering' THEN v_blockers := array_append(v_blockers, 'An Experience is completed from Delivering'); END IF;

  RETURN jsonb_build_object(
    'status', v_status, 'deliverables_ok', ok_deliv, 'invoices_ok', ok_inv, 'payouts_ok', ok_pay, 'brand_signed_off', ok_brand,
    'invoices_live', v_live, 'invoices_unpaid', v_unpaid, 'invoices_draft', v_drafts,
    'creators_to_pay', v_counted, 'creators_paid', v_paid, 'extras_to_pay', v_x_due, 'extras_paid', v_x_paid, 'extras_open', v_x_open,
    'can_complete', coalesce(v_status = 'delivering' AND ok_deliv AND ok_inv AND ok_pay AND ok_brand, false),
    'blockers', to_jsonb(v_blockers));
END;
$function$;

CREATE OR REPLACE FUNCTION compute_experience_pnl(p_experience_id uuid)
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
  v_prospects int; v_prospects_est bigint; v_x_gross bigint; v_x_net bigint;
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
    FROM vendor_payouts p WHERE p.experience_id = p_experience_id AND p.reason IN ('creator_fee', 'creator_extra') AND p.status = 'paid';
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

CREATE OR REPLACE FUNCTION guard_vendor_payout()
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

CREATE OR REPLACE FUNCTION experience_console_payout_approve(p_payout_id uuid, p_confirm_details_changed boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_pstatus text; v_by uuid; v_deal uuid; v_me uuid := my_user_id(); v_changed boolean; v_reason text; v_extra uuid;
BEGIN
  -- 0542: operational staff request; FINANCE approves (and is not the requester) and pays.
  PERFORM experience_finance_require();
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.created_by, p.deal_id, p.reason, p.extra_id INTO v_pstatus, v_by, v_deal, v_reason, v_extra FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
  IF v_status IS NULL OR v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete'; END IF;
  IF v_pstatus IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'Only a requested payout is approved'; END IF;
  IF v_by IS NOT DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'A different person approves a payout than the one who requested it';
  END IF;
  IF v_reason = 'creator_extra' THEN
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

CREATE OR REPLACE FUNCTION guard_experience_creator_invoice()
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
      NEW.payable_paise, NEW.issued_at, NEW.issued_by, NEW.extra_id)
     IS DISTINCT FROM
     (OLD.id, OLD.deal_id, OLD.experience_id, OLD.creator_id, OLD.number, OLD.shoot_confirmed_at, OLD.billing_name, OLD.gstin,
      OLD.day_rate_paise, OLD.days, OLD.gross_paise, OLD.platform_pct, OLD.platform_fee_paise, OLD.net_paise, OLD.allowance_paise,
      OLD.payable_paise, OLD.issued_at, OLD.issued_by, OLD.extra_id)
     OR NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'An issued creator invoice can only be voided' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION experience_creator_invoice_doc_json(p_invoice_id uuid)
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
    'day_rate_paise', i.day_rate_paise, 'days', i.days, 'gross_paise', i.gross_paise, 'platform_pct', i.platform_pct,
    'platform_fee_paise', i.platform_fee_paise, 'net_paise', i.net_paise, 'allowance_paise', i.allowance_paise, 'payable_paise', i.payable_paise,
    'deal_ref', d.deal_ref, 'experience_title', e.title, 'brand_name', d.experience_brand_name, 'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
    'bill_to', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('legal_name', g.legal_name, 'address', g.address, 'state', g.state,
                 'gstin', g.gstin, 'pan', g.pan) END)
  FROM experience_creator_invoices i
  JOIN deals d ON d.id = i.deal_id
  JOIN experiences e ON e.id = i.experience_id
  LEFT JOIN experience_leg_extras x ON x.id = i.extra_id
  LEFT JOIN guapd_billing_settings g ON g.id = true
  WHERE i.id = p_invoice_id;
$function$;

CREATE OR REPLACE FUNCTION creator_leg_invoice_raise(p_deal_id uuid, p_shoot_confirmed boolean, p_billing_name text, p_gstin text, p_expected_payable_paise bigint)
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
  IF EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued' AND i.extra_id IS NULL) THEN
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
  SELECT count(*) + 1 INTO v_n FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.extra_id IS NULL;
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

CREATE OR REPLACE FUNCTION creator_leg_invoice_doc(p_deal_id uuid)
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
    FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued' AND i.extra_id IS NULL;
  IF v IS NULL THEN RAISE EXCEPTION 'No invoice yet'; END IF;
  RETURN v;
END;
$function$;

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
  IF NOT EXISTS (SELECT 1 FROM experience_creator_invoices i WHERE i.deal_id = p_deal_id AND i.status = 'issued' AND i.extra_id IS NULL) THEN
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

-- experience_console_creator_invoice_void: an extra invoice is protected by its own payout.
CREATE OR REPLACE FUNCTION experience_console_creator_invoice_void(p_invoice_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_deal uuid; v_exp uuid; v_status text; v_extra uuid; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT i.deal_id, i.experience_id, i.status, i.extra_id INTO v_deal, v_exp, v_status, v_extra FROM experience_creator_invoices i WHERE i.id = p_invoice_id FOR UPDATE;
  IF v_deal IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_status IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'This invoice is already void'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN RAISE EXCEPTION 'Give a reason'; END IF;
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

REVOKE EXECUTE ON FUNCTION experience_leg_extra_work_complete(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION experience_console_extra_send(uuid, jsonb, text, bigint, bigint, text, bigint, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_extra_withdraw(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION creator_leg_extra_respond(uuid, boolean, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION creator_leg_extra_invoice_raise(uuid, boolean, text, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION creator_leg_extra_invoice_doc(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_extra_payout_request(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_leg_extras(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_extra_send(uuid, jsonb, text, bigint, bigint, text, bigint, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION experience_console_extra_withdraw(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION creator_leg_extra_respond(uuid, boolean, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION creator_leg_extra_invoice_raise(uuid, boolean, text, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION creator_leg_extra_invoice_doc(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION experience_console_extra_payout_request(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION experience_console_leg_extras(uuid) TO authenticated, service_role;
