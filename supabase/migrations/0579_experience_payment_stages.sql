-- 0579: payment stages on ONE invoice.
--
-- Guapd's quote carries how the brand pays: stages, each a % of the price and
-- the moment it falls due (on acceptance, once the shoot is done, after the
-- brand signs off). The brand accepts the stages with the price; the accepted
-- quote is then locked, so the stages are too.
--
-- Finance still issues ONE service invoice (kind 'initial') for the whole
-- amount. The stages decide how much of it is DUE NOW: the stages reached so
-- far, less what Guapd has received and what the brand marked paid. Online
-- payment (0578) charges exactly that, so the Pay button reads "Pay ₹70,000 ·
-- Advance" before the shoot and "Pay ₹10,000 · Shoot" after it.
--
-- No stages (every quote before 0579, and any quote sent without them) means
-- the whole invoice is due at once: the 0578 behaviour, unchanged. Additional
-- invoices (add-ons, extras) are always due in full.
--
-- Money in only. Nothing here reads or writes creator pay, payouts, costs or margin.

-- ═════ A. The stages, on the quote ═════
ALTER TABLE experience_quotes ADD COLUMN IF NOT EXISTS payment_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

-- A schedule: 0 stages (pay in full on acceptance) or 2 to 6, each
-- { label: 2-40 chars, pct: > 0 with at most 2 decimals, on: accepted | shoot_done | signoff },
-- the % adding up to exactly 100 and the moments in order.
CREATE OR REPLACE FUNCTION experience_schedule_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  s jsonb; v_sum numeric := 0; v_rank int := 0; v_r int; v_pct numeric; v_label text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p) = 0 THEN RETURN true; END IF;
  IF jsonb_array_length(p) < 2 OR jsonb_array_length(p) > 6 THEN RETURN false; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p) LOOP
    IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR jsonb_typeof(s->'pct') IS DISTINCT FROM 'number'
       OR jsonb_typeof(s->'label') IS DISTINCT FROM 'string' OR jsonb_typeof(s->'on') IS DISTINCT FROM 'string' THEN
      RETURN false;
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(s)) <> 3 THEN RETURN false; END IF;
    v_label := btrim(s->>'label');
    IF v_label IS NULL OR length(v_label) < 2 OR length(v_label) > 40 OR v_label IS DISTINCT FROM s->>'label' THEN RETURN false; END IF;
    v_pct := (s->>'pct')::numeric;
    IF v_pct IS NULL OR v_pct <= 0 OR v_pct >= 100 OR v_pct <> round(v_pct, 2) THEN RETURN false; END IF;
    v_r := CASE s->>'on' WHEN 'accepted' THEN 1 WHEN 'shoot_done' THEN 2 WHEN 'signoff' THEN 3 END;
    IF v_r IS NULL OR v_r < v_rank THEN RETURN false; END IF;
    v_rank := v_r;
    v_sum := v_sum + v_pct;
  END LOOP;
  RETURN v_sum = 100;
END;
$$;
REVOKE ALL ON FUNCTION experience_schedule_valid(jsonb) FROM PUBLIC, anon, authenticated;

ALTER TABLE experience_quotes DROP CONSTRAINT IF EXISTS eq_payment_schedule_valid;
ALTER TABLE experience_quotes ADD CONSTRAINT eq_payment_schedule_valid CHECK (experience_schedule_valid(payment_schedule) IS TRUE);

-- The schedule is fixed once the quote exists: a new schedule is a new quote
-- (version + 1), exactly like a new price. So an accepted quote's stages can
-- never move under an issued invoice.
CREATE OR REPLACE FUNCTION guard_experience_quote_schedule() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.payment_schedule IS DISTINCT FROM OLD.payment_schedule THEN
    RAISE EXCEPTION 'A quote''s payment stages cannot change. Send a new quote instead';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_guard_experience_quote_schedule ON experience_quotes;
CREATE TRIGGER t_guard_experience_quote_schedule BEFORE UPDATE OF payment_schedule ON experience_quotes
  FOR EACH ROW EXECUTE FUNCTION guard_experience_quote_schedule();

-- ═════ B. Quoting takes the stages ═════
-- 0560's signature plus p_payment_schedule (DEFAULT NULL = pay in full), so
-- every existing caller keeps working. The body is 0560's, with the schedule
-- validated and stored.
DROP FUNCTION IF EXISTS public.experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.experience_console_quote(p_experience_id uuid, p_proposed_by text, p_per_video_paise bigint, p_deliverable_count integer, p_misc_paise bigint, p_deliverables jsonb, p_shoot_date date, p_shoot_city text, p_message text, p_channel text, p_extras jsonb DEFAULT NULL::jsonb, p_affiliate_pct numeric DEFAULT NULL::numeric, p_payment_schedule jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_aff_bought boolean;
  v_prev uuid;
  v_version int;
  v_id uuid;
  v_misc bigint := coalesce(p_misc_paise, 0);
  v_extras jsonb := coalesce(p_extras, '[]'::jsonb);
  v_schedule jsonb := coalesce(p_payment_schedule, '[]'::jsonb);
BEGIN
  PERFORM experience_console_require();
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
  -- Quoting IS the brand price: financial access only (0537).
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  SELECT status, request_affiliate IS TRUE INTO v_status, v_aff_bought FROM experiences WHERE id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'The price is already agreed; quotes are closed'; END IF;
  IF p_proposed_by IS NULL OR p_proposed_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A quote is from Guapd or the brand'; END IF;
  -- 0556: a brand that is not yet approved can request, but Guapd quotes only once it is approved.
  IF p_proposed_by = 'guapd' AND NOT EXISTS (
       SELECT 1 FROM experiences e JOIN brands b ON b.id = e.brand_id
       WHERE e.id = p_experience_id AND (b.brand_status = 'approved' OR b.is_guapd IS TRUE)) THEN
    RAISE EXCEPTION 'Approve this brand in Ops, Brands before sending it a quote';
  END IF;
  IF p_proposed_by = 'brand' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand sent its counter'; END IF;
  IF p_per_video_paise IS NULL OR p_per_video_paise <= 0 THEN RAISE EXCEPTION 'Price per video must be more than zero'; END IF;
  IF p_deliverable_count IS NULL OR p_deliverable_count <= 0 THEN RAISE EXCEPTION 'Number of videos must be more than zero'; END IF;
  IF v_misc < 0 THEN RAISE EXCEPTION 'Extras cannot be negative'; END IF;
  -- 0560: affiliate commission, a % of the sales through the creator's link. Required when the
  -- brand asked for affiliate links, refused when it did not. The creator's offer carries the same %.
  IF v_aff_bought AND (p_affiliate_pct IS NULL OR p_affiliate_pct <= 0 OR p_affiliate_pct > 100) THEN
    RAISE EXCEPTION 'Set the affiliate commission: a %% of sales above 0 and at most 100';
  END IF;
  IF v_aff_bought IS NOT TRUE AND p_affiliate_pct IS NOT NULL THEN
    RAISE EXCEPTION 'The brand did not ask for affiliate links: leave the commission empty';
  END IF;
  IF p_affiliate_pct IS NOT NULL AND p_affiliate_pct <> round(p_affiliate_pct, 2) THEN
    RAISE EXCEPTION 'Affiliate commission: at most two decimals';
  END IF;
  -- 0553: extras as named lines; the extras amount is their sum.
  IF experience_extras_valid(v_extras) IS NOT TRUE THEN
    RAISE EXCEPTION 'Each extra needs a description (2 to 120 characters) and an amount above zero; at most 20';
  END IF;
  IF jsonb_array_length(v_extras) > 0 THEN
    IF p_misc_paise IS NOT NULL AND p_misc_paise IS DISTINCT FROM experience_extras_total(v_extras) THEN
      RAISE EXCEPTION 'The extras total does not match its lines';
    END IF;
    v_misc := experience_extras_total(v_extras);
  END IF;
  -- 0579: payment stages.
  IF experience_schedule_valid(v_schedule) IS NOT TRUE THEN
    RAISE EXCEPTION 'Payment stages: 2 to 6, each named (2 to 40 characters) with a %% above 0 (two decimals at most), in order (on acceptance, after the shoot, after sign-off), adding up to 100%%';
  END IF;

  UPDATE experience_quotes SET status = 'superseded', decided_at = now(), decided_by = my_user_id()
    WHERE experience_id = p_experience_id AND status = 'open'
    RETURNING id INTO v_prev;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM experience_quotes WHERE experience_id = p_experience_id;

  INSERT INTO experience_quotes (experience_id, version, proposed_by, per_video_paise, deliverable_count,
    misc_paise, extras, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by, affiliate_pct, payment_schedule)
  VALUES (p_experience_id, v_version, p_proposed_by, p_per_video_paise, p_deliverable_count, v_misc, v_extras,
    p_per_video_paise * p_deliverable_count + v_misc, coalesce(p_deliverables, '[]'::jsonb), p_shoot_date,
    nullif(btrim(p_shoot_city), ''), nullif(btrim(p_message), ''), 'open', p_channel, my_user_id(), p_affiliate_pct, v_schedule)
  RETURNING id INTO v_id;

  PERFORM experience_console_audit(
    CASE WHEN p_proposed_by = 'guapd' THEN 'experience.quote_sent' ELSE 'experience.brand_counter_recorded' END,
    'experience_quotes', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'version', v_version, 'replaced_quote_id', v_prev,
      'total_paise', p_per_video_paise * p_deliverable_count + v_misc, 'extras_lines', jsonb_array_length(v_extras), 'affiliate_pct', p_affiliate_pct, 'channel', p_channel,
      'payment_stages', jsonb_array_length(v_schedule)));
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb, numeric, jsonb) TO authenticated;

-- ═════ C. What is due on one invoice, stage by stage ═════
-- Internal. The ONE place the stage maths lives; everything else reads it.
-- Amounts are cumulative and rounded to the paisa, the last stage taking the
-- remainder, so the stages always add up to exactly the invoice total.
CREATE OR REPLACE FUNCTION experience_invoice_stages(p_invoice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  si record; v_estatus text; v_signed boolean; v_schedule jsonb;
  v_paid bigint; v_reported bigint; v_balance bigint;
  s jsonb; v_n int; v_i int := 0; v_cum_pct numeric := 0; v_cum bigint := 0; v_prev bigint := 0;
  v_reached boolean; v_target bigint := 0; v_stages jsonb := '[]'::jsonb; v_next text; v_due bigint;
BEGIN
  SELECT x.id, x.experience_id, x.kind, x.status, x.total_paise INTO si FROM service_invoices x WHERE x.id = p_invoice_id;
  IF si.id IS NULL THEN RETURN NULL; END IF;
  SELECT e.status, (e.brand_signoff_at IS NOT NULL) INTO v_estatus, v_signed FROM experiences e WHERE e.id = si.experience_id;
  v_paid := experience_invoice_paid_paise(si.id);
  v_reported := CASE WHEN si.status = 'paid' THEN 0 ELSE experience_invoice_reported_paise(si.id) END;
  v_balance := CASE WHEN si.status = 'paid' THEN 0 ELSE greatest(si.total_paise - v_paid - v_reported, 0) END;

  IF si.kind IS NOT DISTINCT FROM 'initial' THEN
    SELECT q.payment_schedule INTO v_schedule FROM experience_quotes q
      WHERE q.experience_id = si.experience_id AND q.status = 'accepted' LIMIT 1;
  END IF;
  IF v_schedule IS NULL OR jsonb_array_length(v_schedule) = 0 OR si.total_paise IS NULL OR si.total_paise <= 0 THEN
    RETURN jsonb_build_object('scheduled', false, 'due_now_paise', v_balance, 'balance_paise', v_balance, 'next_stage', NULL, 'stages', '[]'::jsonb);
  END IF;

  v_n := jsonb_array_length(v_schedule);
  FOR s IN SELECT value FROM jsonb_array_elements(v_schedule) LOOP
    v_i := v_i + 1;
    v_cum_pct := v_cum_pct + (s->>'pct')::numeric;
    v_cum := CASE WHEN v_i = v_n THEN si.total_paise ELSE round(si.total_paise * v_cum_pct / 100)::bigint END;
    v_reached := CASE s->>'on'
      WHEN 'accepted' THEN true
      WHEN 'shoot_done' THEN v_estatus IN ('shoot_done', 'delivering', 'complete')
      WHEN 'signoff' THEN v_signed IS TRUE OR v_estatus = 'complete'
      ELSE false END;
    IF v_reached THEN v_target := v_cum; ELSIF v_next IS NULL THEN v_next := s->>'label'; END IF;
    v_stages := v_stages || jsonb_build_array(jsonb_build_object(
      'label', s->>'label', 'pct', (s->>'pct')::numeric, 'on', s->>'on', 'amount_paise', v_cum - v_prev,
      'reached', v_reached,
      'state', CASE WHEN si.status = 'paid' OR v_paid >= v_cum THEN 'paid'
                    WHEN v_paid + v_reported >= v_cum THEN 'checking'
                    WHEN v_reached THEN 'due' ELSE 'upcoming' END));
    v_prev := v_cum;
  END LOOP;

  v_due := CASE WHEN si.status = 'paid' THEN 0 ELSE least(greatest(v_target - v_paid - v_reported, 0), v_balance) END;
  RETURN jsonb_build_object('scheduled', true, 'due_now_paise', v_due, 'balance_paise', v_balance, 'next_stage', v_next, 'stages', v_stages);
END;
$$;
REVOKE ALL ON FUNCTION experience_invoice_stages(uuid) FROM PUBLIC, anon, authenticated;

-- 0578's "what the brand owes right now" is now what is DUE now. The quote,
-- the order record and (through them) the online amount all follow it.
CREATE OR REPLACE FUNCTION experience_payin_due_paise(p_invoice_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (experience_invoice_stages(p_invoice_id)->>'due_now_paise')::bigint
$$;
REVOKE ALL ON FUNCTION experience_payin_due_paise(uuid) FROM PUBLIC, anon, authenticated;

-- 0578's brand quote, with one change: when the balance is not yet due, say so.
CREATE OR REPLACE FUNCTION public.brand_experience_payin_quote(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_brand uuid; v_estatus text; v_istatus text; v_total bigint; v_number text; v_due bigint; v_order text; v_st jsonb;
BEGIN
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  v_brand := brand_experience_require(v_exp, true);
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp;
  SELECT si.status, si.total_paise, si.number INTO v_istatus, v_total, v_number FROM service_invoices si WHERE si.id = p_invoice_id;
  IF v_estatus IS NULL OR v_estatus = 'complete' THEN RAISE EXCEPTION 'This Experience is closed. Contact Guapd to pay'; END IF;
  IF v_istatus IS DISTINCT FROM 'issued' THEN RAISE EXCEPTION 'This invoice is not open for payment'; END IF;
  IF v_total IS NULL OR v_total <= 0 OR v_number IS NULL THEN RAISE EXCEPTION 'This invoice has no amount due'; END IF;
  v_st := experience_invoice_stages(p_invoice_id);
  v_due := (v_st->>'due_now_paise')::bigint;
  IF v_due IS NULL OR v_due <= 0 THEN
    IF coalesce((v_st->>'balance_paise')::bigint, 0) > 0 THEN RAISE EXCEPTION 'Nothing is due on this invoice yet'; END IF;
    RAISE EXCEPTION 'Nothing is left to pay on this invoice';
  END IF;
  IF v_due < 100 THEN RAISE EXCEPTION 'The balance is too small to pay online. Contact Guapd'; END IF;
  SELECT o.razorpay_order_id INTO v_order FROM razorpay_payin_orders o
    WHERE o.invoice_id = p_invoice_id AND o.status = 'created' AND o.amount_paise = v_due
      AND o.created_at > now() - interval '12 hours'
    ORDER BY o.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'experience_id', v_exp, 'brand_id', v_brand,
    'number', v_number, 'amount_paise', v_due, 'currency', 'INR', 'order_id', v_order);
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_payin_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_payin_quote(uuid) TO authenticated;

-- ═════ D. Who sees the stages ═════
-- The brand (any member): the stages on its open or accepted quote, and per
-- issued invoice. Only this brand's own invoice figures; never creator pay.
CREATE OR REPLACE FUNCTION public.brand_experience_payment_stages(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quotes jsonb; v_invoices jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT coalesce(jsonb_object_agg(q.id::text, q.payment_schedule), '{}'::jsonb) INTO v_quotes
    FROM experience_quotes q WHERE q.experience_id = p_experience_id AND q.status IN ('open', 'accepted');
  SELECT coalesce(jsonb_object_agg(si.id::text, experience_invoice_stages(si.id)), '{}'::jsonb) INTO v_invoices
    FROM service_invoices si WHERE si.experience_id = p_experience_id AND si.status IN ('issued', 'paid');
  RETURN jsonb_build_object('quotes', v_quotes, 'invoices', v_invoices);
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_payment_stages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_payment_stages(uuid) TO authenticated;

-- Staff: the stages on every quote (percentages, not amounts: the console
-- shows each quote's terms to operational staff too), and per invoice for
-- finance only, as the invoice figures already are (0540).
CREATE OR REPLACE FUNCTION public.experience_console_payment_stages(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quotes jsonb; v_invoices jsonb := '{}'::jsonb;
BEGIN
  PERFORM experience_console_require();
  IF p_experience_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  SELECT coalesce(jsonb_object_agg(q.id::text, q.payment_schedule), '{}'::jsonb) INTO v_quotes
    FROM experience_quotes q WHERE q.experience_id = p_experience_id;
  IF has_experience_access('financial') IS TRUE THEN
    SELECT coalesce(jsonb_object_agg(si.id::text, experience_invoice_stages(si.id)), '{}'::jsonb) INTO v_invoices
      FROM service_invoices si WHERE si.experience_id = p_experience_id AND si.status IN ('issued', 'paid');
  END IF;
  RETURN jsonb_build_object('quotes', v_quotes, 'invoices', v_invoices);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_payment_stages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_payment_stages(uuid) TO authenticated;
