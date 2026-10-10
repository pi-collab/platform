-- 0551: a paid Experience creator leg reads as paid (6.1 status fix).
--
-- Before this, marking a Guapd payout paid left the creator leg at agreed, so
-- the creator inbox and every status chip said In production after the money
-- had gone out. Now:
--   1. experience_console_payout_paid moves the leg agreed -> paid in the same
--      transaction, for the creator_fee payout only. If the leg is not agreed
--      at that moment the whole payment is refused (deny, never half-record).
--   2. guard_creator_leg_no_money (0534 placeholder, written before payouts
--      existed) now allows paid on a leg ONLY from agreed and ONLY when a paid
--      creator_fee payout exists for that deal. Any other route stays refused.
--   3. Every leg gate that meant accepted (agreed) now means agreed or paid,
--      so nothing that worked on an agreed leg stops working once it is paid:
--      deliverables, release to the brand, shoot rollup, completion check, the
--      payouts list, broadcast to accepted creators. Behaviour is otherwise
--      unchanged; NULL still denies (IS NULL OR NOT IN).
--   4. Backfill: legs already paid out but still agreed move to paid (scoped
--      to creator legs with a paid creator_fee payout).
-- Money is untouched: no amount, fee or snapshot changes here.


CREATE OR REPLACE FUNCTION public.guard_creator_leg_no_money()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- 0551: paid only from agreed, and only once Guapd has paid the creator fee.
  IF OLD.status IS DISTINCT FROM 'agreed' OR NOT EXISTS (
       SELECT 1 FROM vendor_payouts p
       WHERE p.deal_id = NEW.id AND p.reason = 'creator_fee' AND p.status = 'paid') THEN
    RAISE EXCEPTION 'An Experience creator deal is marked paid only when Guapd pays the creator' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_payout_paid(p_payout_id uuid, p_paid_on date, p_method text, p_reference text, p_proof_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_pstatus text; v_deal uuid; v_approved timestamptz; v_reason text; v_moved int;
  v_ref text := btrim(coalesce(p_reference, ''));
BEGIN
  -- 0542: FINANCE pays (it is the role that sees the bank details).
  PERFORM experience_finance_require();
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.deal_id, p.approved_at, p.reason INTO v_pstatus, v_deal, v_approved, v_reason FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
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
  PERFORM experience_console_audit('experience.payout_paid', 'vendor_payouts', p_payout_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'method', p_method, 'reference', v_ref));
  -- On the creator's own deal timeline too (deal-scoped ops action).
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.payout_paid', jsonb_build_object('payout_id', p_payout_id, 'reference', v_ref));
END;
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
  t_rate bigint; t_days numeric; t_gross bigint; t_pct numeric; t_net bigint; t_track text; t_allow bigint;
  v_videos int; v_owner text; v_items jsonb; v_payout jsonb; v_counters jsonb; v_used int;
  v_ad_bought boolean; v_boost_bought boolean;
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
    'counters', v_counters, 'counters_left', CASE WHEN v_status = 'negotiating' THEN greatest(3 - coalesce(v_used, 0), 0) ELSE 0 END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_leg_shoot_outcome(p_roster_id uuid, p_outcome text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_date date; v_creator uuid; v_deal uuid; v_outcome text; v_dstatus text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, e.shoot_date INTO v_status, v_date FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.leg_deal_id, r.leg_shoot_outcome INTO v_creator, v_deal, v_outcome
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  SELECT d.status::text INTO v_dstatus FROM deals d WHERE d.id = v_deal;

  IF v_status IS DISTINCT FROM 'shoot_scheduled' THEN RAISE EXCEPTION 'Shoot outcomes are recorded while the shoot is scheduled'; END IF;
  IF v_dstatus IS NULL OR v_dstatus NOT IN ('agreed', 'paid') THEN RAISE EXCEPTION 'Only a creator who accepted their deal has a shoot outcome'; END IF;
  IF v_outcome IS NOT NULL THEN RAISE EXCEPTION 'Already recorded. Undo it first to change it'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('done', 'did_not_shoot') THEN RAISE EXCEPTION 'Say whether they shot or not'; END IF;
  IF p_outcome = 'did_not_shoot' AND length(coalesce(v_reason, '')) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'Say why they did not shoot (3 to 300 characters)';
  END IF;
  IF v_date IS NULL THEN RAISE EXCEPTION 'The shoot has no date'; END IF;  -- NULL > date would pass silently
  IF v_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'The shoot date (%) has not come yet', to_char(v_date, 'DD Mon YYYY');
  END IF;

  UPDATE experience_roster SET leg_shoot_outcome = p_outcome, leg_shoot_outcome_at = now(), leg_shoot_outcome_by = my_user_id(),
         leg_shoot_outcome_reason = CASE WHEN p_outcome = 'did_not_shoot' THEN left(v_reason, 300) END, updated_at = now()
    WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.leg_shoot_outcome', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', v_creator, 'deal_id', v_deal, 'outcome', p_outcome,
      'reason_length', coalesce(length(v_reason), 0)));
  RETURN experience_shoot_rollup(v_exp);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_leg_broadcast(p_experience_id uuid, p_body text, p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_body text := btrim(coalesce(p_body, '')); v_ids uuid[]; d uuid;
BEGIN
  PERFORM experience_console_require();
  IF NOT EXISTS (SELECT 1 FROM experiences e WHERE e.id = p_experience_id) THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('all', 'accepted') THEN RAISE EXCEPTION 'Say who it goes to'; END IF;
  IF length(v_body) = 0 THEN RAISE EXCEPTION 'Write a message first'; END IF;
  IF length(v_body) > 4000 THEN RAISE EXCEPTION 'A message is at most 4,000 characters'; END IF;
  SELECT coalesce(array_agg(dl.id ORDER BY dl.created_at), '{}') INTO v_ids
    FROM experience_roster r JOIN deals dl ON dl.id = r.leg_deal_id AND dl.leg_role = 'creator_leg' AND dl.brand_id = guapd_brand_id()
    WHERE r.experience_id = p_experience_id
      AND dl.status::text NOT IN ('complete', 'declined', 'cancelled')
      AND (p_scope = 'all' OR dl.status::text IN ('agreed', 'paid'));
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'No creator to send to'; END IF;
  FOREACH d IN ARRAY v_ids LOOP
    INSERT INTO messages (deal_id, sender_id, sender_party, body) VALUES (d, my_user_id(), 'brand', v_body);
    INSERT INTO events (deal_id, actor_id, event_type, detail)
      VALUES (d, my_user_id(), 'experience.leg_message', jsonb_build_object('from', 'guapd', 'length', length(v_body), 'broadcast', true));
    INSERT INTO message_reads (user_id, deal_id, last_read_at) VALUES (my_user_id(), d, now())
      ON CONFLICT (user_id, deal_id) DO UPDATE SET last_read_at = now();
  END LOOP;
  PERFORM experience_console_audit('experience.leg_broadcast', 'experiences', p_experience_id,
    jsonb_build_object('scope', p_scope, 'recipients', array_length(v_ids, 1), 'length', length(v_body)));
  RETURN jsonb_build_object('deal_ids', to_jsonb(v_ids));
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
  v_counted int; v_paid int; v_open int; v_no_outcome int;
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
  ok_pay := coalesce(v_counted = v_paid AND v_open = 0 AND v_no_outcome = 0, false);
  ok_brand := v_brand_at IS NOT NULL;

  IF NOT ok_deliv THEN v_blockers := array_append(v_blockers, 'The brand has not approved everything sold'); END IF;
  IF v_drafts > 0 THEN v_blockers := array_append(v_blockers, 'Issue or discard the draft invoices'); END IF;
  IF v_live = 0 THEN v_blockers := array_append(v_blockers, 'No invoice has been issued'); END IF;
  IF v_unpaid > 0 THEN v_blockers := array_append(v_blockers, format('%s invoice(s) not fully paid', v_unpaid)); END IF;
  IF v_open > 0 OR v_no_outcome > 0 THEN v_blockers := array_append(v_blockers, 'Some creators have no outcome yet'); END IF;
  IF coalesce(v_counted - v_paid, 0) > 0 THEN v_blockers := array_append(v_blockers, format('%s creator(s) not paid', v_counted - v_paid)); END IF;
  IF NOT ok_brand THEN v_blockers := array_append(v_blockers, 'The brand has not signed off'); END IF;
  IF v_status IS DISTINCT FROM 'delivering' THEN v_blockers := array_append(v_blockers, 'An Experience is completed from Delivering'); END IF;

  RETURN jsonb_build_object(
    'status', v_status, 'deliverables_ok', ok_deliv, 'invoices_ok', ok_inv, 'payouts_ok', ok_pay, 'brand_signed_off', ok_brand,
    'invoices_live', v_live, 'invoices_unpaid', v_unpaid, 'invoices_draft', v_drafts,
    'creators_to_pay', v_counted, 'creators_paid', v_paid,
    'can_complete', coalesce(v_status = 'delivering' AND ok_deliv AND ok_inv AND ok_pay AND ok_brand, false),
    'blockers', to_jsonb(v_blockers));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_item_gate(p_item_id uuid, p_who text)
 RETURNS TABLE(deal_id uuid, experience_id uuid, item_status text, item_version integer, next_version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deal uuid; v_exp uuid; v_creator uuid; v_visible boolean; v_istatus text; v_ver int;
  v_dstatus text; v_estatus text; v_outcome text; v_owner text;
BEGIN
  IF p_who IS NULL OR p_who NOT IN ('guapd', 'creator', 'review') THEN RAISE EXCEPTION 'Unknown actor'; END IF;
  SELECT i.deal_id, i.visible_to_creator, i.item_status, i.version INTO v_deal, v_visible, v_istatus, v_ver
    FROM deal_deliverable_items i WHERE i.id = p_item_id;
  SELECT d.experience_id, d.creator_id, d.status::text INTO v_exp, v_creator, v_dstatus
    FROM deals d WHERE d.id = v_deal AND d.leg_role = 'creator_leg';
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF p_who = 'creator' AND (my_creator_id() IS NULL OR v_creator IS DISTINCT FROM my_creator_id() OR v_visible IS NOT TRUE) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  -- Experience first, then the item: every write serialises on the Experience.
  SELECT e.status INTO v_estatus FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  PERFORM 1 FROM deal_deliverable_items i WHERE i.id = p_item_id FOR UPDATE;
  SELECT i.item_status, i.version INTO v_istatus, v_ver FROM deal_deliverable_items i WHERE i.id = p_item_id;

  IF v_estatus = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_estatus IS NULL OR v_estatus NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN RAISE EXCEPTION 'Deliverables come in after the shoot'; END IF;
  IF v_dstatus IS NULL OR v_dstatus NOT IN ('agreed', 'paid') THEN RAISE EXCEPTION 'Only a creator who accepted their deal has deliverables'; END IF;
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = v_deal;
  IF v_outcome IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Mark this creator''s shoot done first'; END IF;
  v_owner := experience_leg_owner(v_deal);
  IF p_who = 'guapd' AND v_owner IS DISTINCT FROM 'guapd' THEN RAISE EXCEPTION 'On this Experience the creator submits their own deliverables'; END IF;
  IF p_who = 'creator' AND v_owner IS DISTINCT FROM 'creator' THEN RAISE EXCEPTION 'Guapd delivers the content on this shoot; there is nothing for you to submit'; END IF;

  RETURN QUERY SELECT v_deal, v_exp, v_istatus, v_ver, CASE WHEN v_istatus = 'revision' THEN v_ver + 1 ELSE v_ver END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_release(p_experience_id uuid, p_item_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_item uuid; v_new uuid; v_n int := 0;
  i_deal uuid; i_status text; i_ver int; i_label text; i_url text; i_path text; i_file text;
  d_status text; d_creator uuid; v_outcome text;
  o_id uuid; o_ver int; o_decision text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_status IS NULL OR v_status NOT IN ('shoot_done', 'delivering') THEN RAISE EXCEPTION 'Share with the brand once every creator''s shoot is recorded'; END IF;
  IF coalesce(array_length(p_item_ids, 1), 0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Pick what to share'; END IF;

  FOREACH v_item IN ARRAY (SELECT array_agg(DISTINCT u) FROM unnest(p_item_ids) u) LOOP
    SELECT i.deal_id, i.item_status, i.version, i.label, i.external_url, i.storage_path, i.file_name
      INTO i_deal, i_status, i_ver, i_label, i_url, i_path, i_file
      FROM deal_deliverable_items i WHERE i.id = v_item FOR UPDATE;
    SELECT d.status::text, d.creator_id INTO d_status, d_creator FROM deals d
      WHERE d.id = i_deal AND d.leg_role = 'creator_leg' AND d.experience_id = p_experience_id;
    IF d_status IS NULL THEN RAISE EXCEPTION 'That deliverable is not on this Experience'; END IF;
    SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = i_deal;
    IF d_status IS NULL OR d_status NOT IN ('agreed', 'paid') OR v_outcome IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Only deliverables from creators who shot can be shared'; END IF;
    IF i_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION '"%" is not approved by Guapd yet', i_label; END IF;
    IF i_url IS NULL AND i_path IS NULL THEN RAISE EXCEPTION '"%" has no content', i_label; END IF;

    o_id := NULL;
    SELECT x.id, x.item_version, x.brand_decision INTO o_id, o_ver, o_decision
      FROM experience_deliverable_releases x WHERE x.item_id = v_item AND x.status = 'shared' FOR UPDATE;
    IF o_id IS NOT NULL THEN
      IF o_decision = 'approved' THEN RAISE EXCEPTION 'The brand already approved "%"', i_label; END IF;
      IF o_ver = i_ver THEN RAISE EXCEPTION '"%" (version %) is already shared', i_label, i_ver; END IF;
      UPDATE experience_deliverable_releases SET status = 'superseded', superseded_at = now() WHERE id = o_id;
    END IF;

    INSERT INTO experience_deliverable_releases (experience_id, deal_id, item_id, item_version, label, external_url,
                                                 storage_path, file_name, status, released_by)
    VALUES (p_experience_id, i_deal, v_item, i_ver, i_label, i_url, i_path, i_file, 'shared', my_user_id())
    RETURNING id INTO v_new;
    IF o_id IS NOT NULL THEN
      UPDATE experience_deliverable_releases SET superseded_by = v_new WHERE id = o_id;
    END IF;
    v_n := v_n + 1;
    PERFORM experience_console_audit('experience.deliverable_released', 'experience_deliverable_releases', v_new,
      jsonb_build_object('experience_id', p_experience_id, 'deal_id', i_deal, 'item_id', v_item, 'creator_id', d_creator,
        'version', i_ver, 'supersedes', o_id));
  END LOOP;

  IF v_status = 'shoot_done' THEN
    UPDATE experiences SET status = 'delivering', updated_at = now() WHERE id = p_experience_id;
    PERFORM experience_console_audit('experience.delivering', 'experiences', p_experience_id,
      jsonb_build_object('status_before', 'shoot_done', 'status_after', 'delivering'));
  END IF;
  RETURN jsonb_build_object('released', v_n, 'progress', experience_deliverables_progress(p_experience_id));
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

CREATE OR REPLACE FUNCTION public.experience_shoot_rollup(p_experience_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_open int; v_missing int; v_done int;
BEGIN
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS DISTINCT FROM 'shoot_scheduled' THEN RETURN v_status; END IF;
  SELECT count(*) FILTER (WHERE d.status = 'negotiating'),
         count(*) FILTER (WHERE d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome IS NULL),
         count(*) FILTER (WHERE d.status IN ('agreed', 'paid') AND r.leg_shoot_outcome = 'done')
    INTO v_open, v_missing, v_done
    FROM experience_roster r JOIN deals d ON d.id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id;
  IF v_open = 0 AND v_missing = 0 AND v_done > 0 THEN
    UPDATE experiences SET status = 'shoot_done', updated_at = now() WHERE id = p_experience_id;
    PERFORM experience_console_audit('experience.shoot_done', 'experiences', p_experience_id,
      jsonb_build_object('status_before', 'shoot_scheduled', 'status_after', 'shoot_done', 'creators_shot', v_done));
    RETURN 'shoot_done';
  END IF;
  RETURN v_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_leg_work_complete(p_deal_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_trigger text; v_outcome text;
BEGIN
  SELECT d.status::text, coalesce(d.settings_snapshot ->> 'completion_trigger', 'on_shoot_done')
    INTO v_status, v_trigger FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  IF v_status IS NULL OR v_status NOT IN ('agreed', 'paid') OR v_outcome IS DISTINCT FROM 'done' THEN
    RETURN false;
  END IF;
  IF experience_leg_owner(p_deal_id) = 'creator' OR v_trigger = 'on_delivery_accepted' THEN
    RETURN EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator)
       AND NOT EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator AND i.item_status IS DISTINCT FROM 'approved');
  END IF;
  RETURN coalesce(v_trigger = 'on_shoot_done', false);
END;
$function$;

-- 4. Backfill (scoped).
UPDATE deals d SET status = 'paid'
WHERE d.leg_role = 'creator_leg' AND d.status = 'agreed'
  AND EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.deal_id = d.id AND p.reason = 'creator_fee' AND p.status = 'paid');
