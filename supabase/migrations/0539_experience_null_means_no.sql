-- 0539: NULL means NO. A defensive sweep of every Experience access gate and
-- state-transition check, after three three-valued-logic slips (the 0528 CHECK,
-- an unscoped revoke, the 0538 can_submit flag). Nothing here changes what a
-- correct call does; it changes what an UNKNOWN does: it now refuses.
--
-- In SQL, `x <> 'y'`, `x NOT IN (...)`, `NOT x` and `a > b` are NULL (not true,
-- not false) when an input is NULL, and `IF NULL THEN RAISE` does not raise.
-- So every check of the form "IF <bad> THEN RAISE" failed OPEN on a NULL.
--
-- Rewritten (bodies otherwise byte-for-byte as on staging after 0538):
--   * gates:  IF has_experience_access(..) IS NOT TRUE (was IF NOT ..), in
--     experience_console_require and every finance gate.
--   * guards: IF x IS DISTINCT FROM 'y' THEN RAISE (was <>); IF x IS NULL OR
--     x NOT IN (..) THEN RAISE (was NOT IN), in every Experience function.
--   * experience_item_gate: unknown actor (incl. NULL) refused first; a NULL
--     visible_to_creator is "not visible".
--   * roster/legs reconcile + readiness: an agreed plan with no videos_sold
--     (or plan_videos) is "not ok / over / not ready", never ok by default;
--     roster_lock and leg draft/send refuse unless ok is TRUE / over is FALSE.
--   * a deliverable with no type is refused (was a NULL that passed NOT IN).
--   * cost categories: a NULL from the IN-list is a no.
--   * "locked" / "is_guapd" flags: anything but FALSE blocks.
--   * work complete (payment eligibility): an item whose status is unknown is
--     not approved.
--   * check_experience_leg: IS DISTINCT FROM on brand / creator / payment flow.
-- Plus one boundary tightening found in the creator audit: creators may no
-- longer upload straight into the deliverables bucket under an Experience
-- creator leg (0140 allowed any own deal). Leg files go only through the
-- database-named, service-role-minted upload slot.
--
-- Grants are unchanged (CREATE OR REPLACE keeps them).

CREATE OR REPLACE FUNCTION public.check_experience_leg()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  DECLARE
    exp_brand uuid;
  BEGIN
    IF NEW.experience_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT brand_id INTO exp_brand FROM experiences WHERE id = NEW.experience_id;
    IF exp_brand IS NULL THEN
      RAISE EXCEPTION 'Experience % does not exist', NEW.experience_id;
    END IF;
    IF NEW.payment_flow IS DISTINCT FROM 'guapd_principal_vendor_payout' THEN
      RAISE EXCEPTION 'Experience legs use payment_flow guapd_principal_vendor_payout';
    END IF;
    IF NEW.leg_role = 'brand_leg' THEN
      IF NEW.brand_id IS DISTINCT FROM exp_brand OR guapd_creator_id() IS NULL OR NEW.creator_id IS DISTINCT FROM guapd_creator_id() THEN
        RAISE EXCEPTION 'A brand leg is between the Experience brand and the Guapd house creator';
      END IF;
    ELSE
      IF guapd_brand_id() IS NULL OR NEW.brand_id IS DISTINCT FROM guapd_brand_id() THEN
        RAISE EXCEPTION 'A creator leg is between the Guapd house brand and a creator';
      END IF;
      IF NEW.creator_id = guapd_creator_id() THEN
        RAISE EXCEPTION 'A creator leg needs a real creator, not the Guapd house account';
      END IF;
    END IF;
    RETURN NEW;
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
  v_gross bigint; v_net bigint; v_per_leg jsonb;
  v_awaiting int; v_awaiting_net bigint; v_declined int; v_no_shoot int;
  v_costs bigint; v_by_cat jsonb;
  v_subtotal bigint; v_fee_kept bigint; v_margin bigint;
BEGIN
  SELECT coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status = 'paid'), 0)::bigint,
         count(*) FILTER (WHERE si.status IN ('issued', 'paid'))::int
    INTO v_billed, v_received, v_invoices
    FROM service_invoices si WHERE si.experience_id = p_experience_id;
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
    'per_leg', v_per_leg);
END;
$function$;

CREATE OR REPLACE FUNCTION public.creator_leg_respond(p_deal_id uuid, p_accept boolean, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_new text;
BEGIN
  SELECT d.status::text INTO v_status FROM deals d
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg'
      AND my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()
    FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_status IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'You have already answered this offer'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Accept or decline'; END IF;

  v_new := CASE WHEN p_accept THEN 'agreed' ELSE 'declined' END;
  IF p_accept THEN
    UPDATE deals SET status = 'agreed', agreed_at = now(), rights_confirmed_at = now() WHERE id = p_deal_id;
  ELSE
    UPDATE deals SET status = 'declined' WHERE id = p_deal_id;
    IF nullif(btrim(coalesce(p_reason, '')), '') IS NOT NULL THEN
      INSERT INTO events (deal_id, actor_id, event_type, detail)
      VALUES (p_deal_id, my_user_id(), 'experience.leg_declined_reason', jsonb_build_object('reason', left(btrim(p_reason), 500)));
    END IF;
  END IF;
  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_check_deliverables(p_deliverables jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  d jsonb;
  v_total int := 0;
BEGIN
  IF jsonb_typeof(coalesce(p_deliverables, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Deliverables must be a list';
  END IF;
  FOR d IN SELECT x FROM jsonb_array_elements(p_deliverables) x LOOP
    IF coalesce(d ->> 'type', '') NOT IN ('UGC video', 'Reel', 'Story', 'Static post', 'Photo set')
       OR NOT ((d ->> 'count') ~ '^[0-9]+$') OR (d ->> 'count')::int > 500 THEN
      RAISE EXCEPTION 'Each deliverable needs a known type and a whole-number count';
    END IF;
    v_total := v_total + (d ->> 'count')::int;
  END LOOP;
  IF v_total = 0 THEN RAISE EXCEPTION 'A creator needs at least one deliverable'; END IF;
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
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  SELECT id, experience_id, version, proposed_by, per_video_paise, deliverable_count, misc_paise, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by, created_at, decided_at, decided_by INTO q FROM experience_quotes WHERE id = p_quote_id FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  SELECT id, brand_id, title, status, template_id, template_version, settings_snapshot, brand_service_total_paise, shoot_date, shoot_city, created_by, created_at, updated_at, brand_per_video_paise, brand_deliverable_count, brand_misc_paise, request_deliverables, request_affiliate, request_ad_rights, request_ad_rights_months, request_boost, request_boost_months, request_location, request_date_from, request_date_to, request_brief, request_channel, requested_at, request_creator_count, request_affiliate_per_creator, request_ad_rights_per_creator, request_boost_per_creator, agreed_plan, creator_brief INTO e FROM experiences WHERE id = q.experience_id FOR UPDATE;
  IF e.status IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'The price is already agreed'; END IF;
  IF q.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'Only the current open quote can be accepted'; END IF;
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

CREATE OR REPLACE FUNCTION public.experience_console_complete(p_experience_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'delivering' THEN RAISE EXCEPTION 'An Experience is completed from Delivering'; END IF;
  UPDATE experiences SET status = 'complete', updated_at = now() WHERE id = p_experience_id;  -- freezes the P&L (trigger)
  PERFORM experience_console_audit('experience.completed', 'experiences', p_experience_id,
    jsonb_build_object('status_before', v_status, 'status_after', 'complete'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_cost_add(p_experience_id uuid, p_label text, p_category text, p_basis text, p_quantity numeric, p_unit_rate_paise bigint, p_total_paise bigint, p_provided_by text, p_creator_leg_deal_id uuid, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_total bigint; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete and its P&L is frozen. Reopen it first (finance)'; END IF;
  IF v_status IS NULL OR v_status NOT IN ('rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering') THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_cost_update(p_cost_id uuid, p_label text, p_category text, p_basis text, p_quantity numeric, p_unit_rate_paise bigint, p_total_paise bigint, p_provided_by text, p_creator_leg_deal_id uuid, p_note text, p_expected_updated_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_status IS NULL OR v_status NOT IN ('rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering') THEN RAISE EXCEPTION 'Costs cannot change at this stage'; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_create(p_brand_id uuid, p_title text, p_creator_count integer, p_deliverables jsonb, p_affiliate boolean, p_affiliate_per_creator integer, p_ad_rights boolean, p_ad_rights_per_creator integer, p_ad_rights_months integer, p_boost boolean, p_boost_per_creator integer, p_boost_months integer, p_location text, p_date_from date, p_date_to date, p_brief text, p_channel text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b_id uuid; b_is_guapd boolean; b_status text;
  t_id uuid; t_version int; t_settings jsonb;
  v_id uuid;
  v_videos int;
BEGIN
  PERFORM experience_console_require();
  SELECT b.id, b.is_guapd, b.brand_status INTO b_id, b_is_guapd, b_status FROM brands b WHERE b.id = p_brand_id;
  IF b_id IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  IF b_is_guapd IS NOT FALSE THEN RAISE EXCEPTION 'An Experience is for a real brand, not the Guapd house account'; END IF;
  IF b_status = 'rejected' THEN RAISE EXCEPTION 'That brand is rejected'; END IF;
  IF coalesce(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'Give the Experience a title'; END IF;
  IF p_channel IS NULL THEN RAISE EXCEPTION 'Say how the request arrived'; END IF;
  IF p_creator_count IS NULL OR p_creator_count <= 0 THEN RAISE EXCEPTION 'Say how many creators the brand wants'; END IF;
  IF jsonb_typeof(coalesce(p_deliverables, '[]'::jsonb)) <> 'array' OR experience_plan_count(p_deliverables, false) = 0 THEN
    RAISE EXCEPTION 'Add at least one deliverable per creator';
  END IF;
  v_videos := experience_plan_count(p_deliverables, true);
  IF p_affiliate AND (p_affiliate_per_creator IS NULL OR p_affiliate_per_creator <= 0) THEN
    RAISE EXCEPTION 'Say how many of each creators videos carry the affiliate link';
  END IF;
  IF p_affiliate AND p_affiliate_per_creator > v_videos THEN
    RAISE EXCEPTION 'More affiliate videos than videos per creator';
  END IF;
  IF p_ad_rights AND p_ad_rights_per_creator IS NOT NULL AND (p_ad_rights_per_creator <= 0 OR p_ad_rights_per_creator > v_videos) THEN
    RAISE EXCEPTION 'Ad rights cover more videos than each creator makes';
  END IF;
  IF p_boost AND p_boost_per_creator IS NOT NULL AND (p_boost_per_creator <= 0 OR p_boost_per_creator > v_videos) THEN
    RAISE EXCEPTION 'Boost covers more videos than each creator makes';
  END IF;
  SELECT t.id, t.version, t.settings INTO t_id, t_version, t_settings
    FROM deal_templates t WHERE t.slug = 'experience-ugc-day-shoot' AND t.is_active ORDER BY t.version DESC LIMIT 1;

  INSERT INTO experiences (brand_id, title, status, template_id, template_version, settings_snapshot,
    request_creator_count, request_deliverables,
    request_affiliate, request_affiliate_per_creator,
    request_ad_rights, request_ad_rights_per_creator, request_ad_rights_months,
    request_boost, request_boost_per_creator, request_boost_months,
    request_location, request_date_from, request_date_to, request_brief,
    request_channel, requested_at, created_by)
  VALUES (p_brand_id, btrim(p_title), 'requested', t_id, t_version, t_settings,
    p_creator_count, p_deliverables,
    coalesce(p_affiliate, false), CASE WHEN p_affiliate THEN p_affiliate_per_creator END,
    coalesce(p_ad_rights, false), CASE WHEN p_ad_rights THEN p_ad_rights_per_creator END, CASE WHEN p_ad_rights THEN p_ad_rights_months END,
    coalesce(p_boost, false), CASE WHEN p_boost THEN p_boost_per_creator END, CASE WHEN p_boost THEN p_boost_months END,
    nullif(btrim(p_location), ''), p_date_from, p_date_to, nullif(btrim(p_brief), ''),
    p_channel, now(), my_user_id())
  RETURNING id INTO v_id;

  PERFORM experience_console_audit('experience.request_recorded', 'experiences', v_id,
    jsonb_build_object('brand_id', p_brand_id, 'channel', p_channel, 'creators', p_creator_count,
      'videos_per_creator', v_videos, 'status_after', 'requested'));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_item_review(p_item_id uuid, p_decision text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g record; v_owner text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT x.deal_id, x.experience_id, x.item_status, x.item_version INTO g FROM experience_item_gate(p_item_id, 'review') x;
  v_owner := experience_leg_owner(g.deal_id);
  IF p_decision = 'approve' THEN
    IF g.item_status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Only a submitted deliverable can be approved'; END IF;
    UPDATE deal_deliverable_items SET item_status = 'approved', approved_at = now(), updated_at = now() WHERE id = p_item_id;
  ELSIF p_decision = 'revision' THEN
    IF g.item_status IS NULL OR g.item_status NOT IN ('submitted', 'approved') THEN RAISE EXCEPTION 'Changes are asked for on a submitted or approved deliverable'; END IF;
    IF EXISTS (SELECT 1 FROM experience_deliverable_releases x WHERE x.item_id = p_item_id AND x.status = 'shared' AND x.brand_decision = 'approved') THEN
      RAISE EXCEPTION 'The brand approved this deliverable; it is final';
    END IF;
    IF length(coalesce(v_note, '')) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Say what needs to change (3 to 1,000 characters)'; END IF;
    IF v_owner = 'creator' THEN
      UPDATE deal_deliverable_items SET item_status = 'revision', revision_note = v_note, approved_at = NULL, updated_at = now() WHERE id = p_item_id;
    ELSE
      UPDATE deal_deliverable_items SET item_status = 'revision', approved_at = NULL, updated_at = now() WHERE id = p_item_id;
      INSERT INTO experience_item_staff_notes (item_id, note, updated_at, updated_by) VALUES (p_item_id, v_note, now(), my_user_id())
      ON CONFLICT (item_id) DO UPDATE SET note = EXCLUDED.note, updated_at = now(), updated_by = EXCLUDED.updated_by;
    END IF;
  ELSE
    RAISE EXCEPTION 'Approve, or ask for changes';
  END IF;
  PERFORM experience_console_audit('experience.deliverable_reviewed', 'deal_deliverable_items', p_item_id,
    jsonb_build_object('experience_id', g.experience_id, 'deal_id', g.deal_id, 'version', g.item_version, 'decision', p_decision,
      'status_before', g.item_status, 'note_length', coalesce(length(v_note), 0)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_leg_draft(p_roster_id uuid, p_product_id uuid, p_days numeric, p_deliverables jsonb, p_affiliate_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid;
  v_status text;
  v_aff_per int;
  v_creator uuid;
  v_locked boolean;
  v_decision text;
  v_sent uuid;
  v_before jsonb;
  v_videos int;
  v_rec jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  -- Experience first, then the roster row: every leg write serialises on the
  -- Experience, so two drafts cannot both pass the ceiling.
  SELECT e.status, nullif(e.agreed_plan ->> 'affiliate_per_creator', '')::int INTO v_status, v_aff_per
    FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.locked, r.brand_decision, r.leg_deal_id,
         jsonb_build_object('product_id', r.leg_product_id, 'days', r.leg_days, 'deliverables', r.leg_deliverables, 'affiliate_count', r.leg_affiliate_count)
    INTO v_creator, v_locked, v_decision, v_sent, v_before
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;

  IF v_status IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Creator deals are prepared once the roster is locked and the Experience is Confirmed'; END IF;
  IF v_locked IS NOT TRUE OR v_decision IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator gets a deal'; END IF;
  IF v_sent IS NOT NULL THEN RAISE EXCEPTION 'This creator''s deal is already sent; its terms are frozen'; END IF;

  IF p_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM creator_products cp
    WHERE cp.id = p_product_id AND cp.creator_id = v_creator AND cp.pricing_type = 'per_day' AND cp.is_active
  ) THEN
    RAISE EXCEPTION 'Pick this creator''s own active shoot day rate';
  END IF;
  IF p_days IS NOT NULL AND (p_days <= 0 OR p_days > 365 OR p_days * 100 <> round(p_days * 100)) THEN
    RAISE EXCEPTION 'Days must be more than 0, at most 365, with at most two decimals';
  END IF;
  PERFORM experience_check_deliverables(p_deliverables);
  v_videos := experience_video_count(p_deliverables);
  IF p_affiliate_count IS NULL OR p_affiliate_count < 0 THEN
    RAISE EXCEPTION 'Say how many of this creator''s videos carry the affiliate link (0 for none)';
  END IF;
  IF p_affiliate_count > v_videos THEN
    RAISE EXCEPTION 'More videos with the affiliate link (%) than videos (%)', p_affiliate_count, v_videos;
  END IF;
  IF p_affiliate_count > 0 AND v_aff_per IS NULL THEN
    RAISE EXCEPTION 'The brand did not buy affiliate links on this Experience';
  END IF;

  UPDATE experience_roster SET leg_product_id = p_product_id, leg_days = p_days,
         leg_deliverables = p_deliverables, leg_affiliate_count = p_affiliate_count, updated_at = now()
    WHERE id = p_roster_id;

  v_rec := experience_legs_reconcile(v_exp);
  IF (v_rec ->> 'over')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'That would place more than the brand bought: % of % videos, % of % with the affiliate link',
      v_rec ->> 'videos_placed', v_rec ->> 'videos_sold', v_rec ->> 'affiliate_placed', v_rec ->> 'affiliate_target';
  END IF;

  PERFORM experience_console_audit('experience.leg_drafted', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', v_creator, 'before', v_before,
      'after', jsonb_build_object('product_id', p_product_id, 'days', p_days, 'deliverables', p_deliverables, 'affiliate_count', p_affiliate_count)));
  RETURN v_rec;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_leg_send(p_roster_id uuid, p_expected_gross_paise bigint, p_expected_platform_pct numeric, p_expected_net_paise bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid;
  e_status text; e_title text; e_brand uuid; e_template uuid; e_template_version int; e_settings jsonb;
  v_aff_per int;
  r_creator uuid; r_locked boolean; r_decision text; r_sent uuid;
  r_product uuid; r_days numeric; r_deliverables jsonb; r_aff int;
  v_rate bigint;
  v_track text;
  v_pct numeric;
  v_gross bigint;
  v_net bigint;
  v_brand_name text;
  v_deal uuid;
  v_rec jsonb;
  d jsonb;
  i int;
  v_aff_left int;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, e.title, e.brand_id, e.template_id, e.template_version, e.settings_snapshot,
         nullif(e.agreed_plan ->> 'affiliate_per_creator', '')::int
    INTO e_status, e_title, e_brand, e_template, e_template_version, e_settings, v_aff_per
    FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.locked, r.brand_decision, r.leg_deal_id, r.leg_product_id, r.leg_days,
         coalesce(r.leg_deliverables, r.planned_deliverables), r.leg_affiliate_count
    INTO r_creator, r_locked, r_decision, r_sent, r_product, r_days, r_deliverables, r_aff
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;

  IF e_status IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Creator deals are sent once the roster is locked and the Experience is Confirmed'; END IF;
  IF r_locked IS NOT TRUE OR r_decision IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator gets a deal'; END IF;
  IF r_sent IS NOT NULL THEN RAISE EXCEPTION 'This creator''s deal is already sent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = r_creator AND c.is_bookable AND NOT c.is_guapd) THEN
    RAISE EXCEPTION 'This creator is no longer bookable';
  END IF;
  IF r_product IS NULL OR r_days IS NULL THEN RAISE EXCEPTION 'Pick the shoot day rate and the number of days first'; END IF;
  PERFORM experience_check_deliverables(r_deliverables);
  r_aff := coalesce(r_aff, least(coalesce(v_aff_per, 0), experience_video_count(r_deliverables)));

  -- Money, re-derived here from the package row and the creator's own track.
  SELECT cp.price_paise INTO v_rate FROM creator_products cp
    WHERE cp.id = r_product AND cp.creator_id = r_creator AND cp.pricing_type = 'per_day' AND cp.is_active;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'This creator''s shoot day rate is no longer active; pick it again'; END IF;
  v_track := experience_creator_track(r_creator);
  v_pct := CASE v_track WHEN 'growth' THEN 30 ELSE 15 END;
  v_gross := round(v_rate::numeric * r_days)::bigint;
  v_net := v_gross - round(v_gross::numeric * v_pct / 100)::bigint;
  IF p_expected_gross_paise IS DISTINCT FROM v_gross OR p_expected_platform_pct IS DISTINCT FROM v_pct
     OR p_expected_net_paise IS DISTINCT FROM v_net THEN
    RAISE EXCEPTION 'The terms changed since this screen loaded (now % gross, % %%, % net). Reload and check before sending', v_gross, v_pct, v_net;
  END IF;

  -- Pin the draft as sent, then check the total cannot go past what was sold.
  UPDATE experience_roster SET leg_deliverables = r_deliverables, leg_affiliate_count = r_aff WHERE id = p_roster_id;
  v_rec := experience_legs_reconcile(v_exp);
  IF (v_rec ->> 'over')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Sending this would place more than the brand bought: % of % videos, % of % with the affiliate link',
      v_rec ->> 'videos_placed', v_rec ->> 'videos_sold', v_rec ->> 'affiliate_placed', v_rec ->> 'affiliate_target';
  END IF;

  SELECT b.name INTO v_brand_name FROM brands b WHERE b.id = e_brand;

  INSERT INTO deals (brand_id, creator_id, status, title, price_paise, experience_id, leg_role, payment_flow,
                     track, experience_brand_name, template_id, template_version, settings_snapshot)
  VALUES (guapd_brand_id(), r_creator, 'negotiating', e_title, NULL, v_exp, 'creator_leg', 'guapd_principal_vendor_payout',
          v_track, v_brand_name, e_template, e_template_version, e_settings)
  RETURNING id INTO v_deal;

  -- One item per unit, so each video can later be marked done on its own.
  -- The first N videos carry the affiliate link.
  v_aff_left := r_aff;
  FOR d IN SELECT x FROM jsonb_array_elements(r_deliverables) x LOOP
    FOR i IN 1 .. (d ->> 'count')::int LOOP
      INSERT INTO deal_deliverable_items (deal_id, label, platform, handle, price_paise, added_by, visible_to_creator,
                                          ig_match_status, affiliate_link)
      VALUES (v_deal, (d ->> 'type') || CASE WHEN (d ->> 'count')::int > 1 THEN ' ' || i ELSE '' END,
              'shoot', '', NULL, 'guapd', true, 'unsupported',
              (d ->> 'type') IN ('UGC video', 'Reel') AND v_aff_left > 0);
      IF (d ->> 'type') IN ('UGC video', 'Reel') AND v_aff_left > 0 THEN v_aff_left := v_aff_left - 1; END IF;
    END LOOP;
  END LOOP;

  INSERT INTO experience_creator_terms (deal_id, experience_id, creator_id, day_rate_paise, days, creator_gross_paise,
                                        platform_pct, creator_net_paise, platform_track, product_id, pricing_type, locked_at)
  VALUES (v_deal, v_exp, r_creator, v_rate, r_days, v_gross, v_pct, v_net, v_track, r_product, 'per_day', now());

  UPDATE experience_roster SET leg_deal_id = v_deal, leg_sent_at = now(), updated_at = now() WHERE id = p_roster_id;

  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_sent',
          jsonb_build_object('by', 'guapd', 'deliverables', r_deliverables, 'affiliate_count', r_aff,
                             'day_rate_paise', v_rate, 'days', r_days, 'gross_paise', v_gross,
                             'platform_pct', v_pct, 'net_paise', v_net));
  PERFORM experience_console_audit('experience.leg_sent', 'deals', v_deal,
    jsonb_build_object('experience_id', v_exp, 'roster_id', p_roster_id, 'creator_id', r_creator,
      'product_id', r_product, 'day_rate_paise', v_rate, 'days', r_days, 'track', v_track,
      'gross_paise_before', NULL, 'gross_paise_after', v_gross, 'platform_pct', v_pct,
      'net_paise_before', NULL, 'net_paise_after', v_net,
      'deliverables', r_deliverables, 'affiliate_count', r_aff, 'status_after', 'negotiating'));
  RETURN v_deal;
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
  IF v_dstatus IS DISTINCT FROM 'agreed' THEN RAISE EXCEPTION 'Only a creator who accepted their deal has a shoot outcome'; END IF;
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

CREATE OR REPLACE FUNCTION public.experience_console_leg_shoot_undo(p_roster_id uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_creator uuid; v_deal uuid; v_outcome text;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.leg_deal_id, r.leg_shoot_outcome INTO v_creator, v_deal, v_outcome
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('shoot_scheduled', 'shoot_done') THEN RAISE EXCEPTION 'A shoot outcome can only be undone before deliverables go to the brand'; END IF;
  IF v_outcome IS NULL THEN RAISE EXCEPTION 'Nothing recorded to undo'; END IF;
  IF EXISTS (SELECT 1 FROM experience_deliverable_releases x WHERE x.deal_id = v_deal AND x.status <> 'withdrawn') THEN
    RAISE EXCEPTION 'Something from this creator has been shared with the brand; the outcome stays';
  END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being undone (3 to 300 characters)'; END IF;
  UPDATE experience_roster SET leg_shoot_outcome = NULL, leg_shoot_outcome_at = NULL, leg_shoot_outcome_by = NULL,
         leg_shoot_outcome_reason = NULL, updated_at = now()
    WHERE id = p_roster_id;
  IF v_status = 'shoot_done' THEN
    UPDATE experiences SET status = 'shoot_scheduled', updated_at = now() WHERE id = v_exp;
  END IF;
  PERFORM experience_console_audit('experience.leg_shoot_outcome_undone', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', v_creator, 'deal_id', v_deal, 'outcome_before', v_outcome,
      'reason', v_reason, 'status_before', v_status, 'status_after', 'shoot_scheduled'));
  RETURN 'shoot_scheduled';
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_leg_withdraw(p_roster_id uuid, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_creator uuid; v_deal uuid; v_dstatus text;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.leg_deal_id INTO v_creator, v_deal FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  SELECT d.status::text INTO v_dstatus FROM deals d WHERE d.id = v_deal FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('confirmed', 'shoot_scheduled') THEN RAISE EXCEPTION 'Offers are withdrawn before the shoot is done'; END IF;
  IF v_dstatus IS DISTINCT FROM 'negotiating' THEN RAISE EXCEPTION 'Only an offer the creator has not answered can be withdrawn'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being withdrawn (3 to 300 characters)'; END IF;
  UPDATE deals SET status = 'cancelled' WHERE id = v_deal;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_withdrawn', jsonb_build_object('by', 'guapd'));
  PERFORM experience_console_audit('experience.leg_withdrawn', 'deals', v_deal,
    jsonb_build_object('experience_id', v_exp, 'roster_id', p_roster_id, 'creator_id', v_creator, 'reason', v_reason,
      'status_before', 'negotiating', 'status_after', 'cancelled'));
  RETURN experience_shoot_rollup(v_exp);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_list()
 RETURNS TABLE(id uuid, title text, status text, brand_name text, shoot_date date, shoot_city text, request_location text, request_date_from date, request_date_to date, requested_videos integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF has_experience_access('operational') IS NOT TRUE THEN
    RAISE EXCEPTION 'Operational access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT e.id, e.title, e.status, b.name, e.shoot_date, e.shoot_city,
           e.request_location, e.request_date_from, e.request_date_to,
           (experience_plan_count(e.request_deliverables, true) * coalesce(e.request_creator_count, 1))::int,
           e.created_at
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    ORDER BY e.created_at DESC
    LIMIT 500;
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
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM experiences WHERE id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'The price is already agreed; quotes are closed'; END IF;
  IF p_proposed_by IS NULL OR p_proposed_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A quote is from Guapd or the brand'; END IF;
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
    IF d_status IS DISTINCT FROM 'agreed' OR v_outcome IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Only deliverables from creators who shot can be shared'; END IF;
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

CREATE OR REPLACE FUNCTION public.experience_console_release_decide(p_release_id uuid, p_decision text, p_channel text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_rstatus text; v_before text; v_item uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  SELECT x.experience_id INTO v_exp FROM experience_deliverable_releases x WHERE x.id = p_release_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT x.status, x.brand_decision, x.item_id INTO v_rstatus, v_before, v_item
    FROM experience_deliverable_releases x WHERE x.id = p_release_id FOR UPDATE;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_rstatus IS DISTINCT FROM 'shared' THEN RAISE EXCEPTION 'This is not shared with the brand'; END IF;
  IF v_before = 'approved' THEN RAISE EXCEPTION 'The brand already approved it'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'changes_requested') THEN RAISE EXCEPTION 'Approved, or changes requested'; END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'email', 'call', 'in_person') THEN RAISE EXCEPTION 'Say how the brand told us'; END IF;
  IF p_decision = 'changes_requested' AND length(coalesce(v_note, '')) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Write down what the brand asked to change (3 to 1,000 characters)';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 1000 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  UPDATE experience_deliverable_releases SET brand_decision = p_decision, brand_decision_channel = p_channel,
         brand_decision_note = v_note, brand_decided_at = now(), brand_decided_by = my_user_id()
    WHERE id = p_release_id;
  PERFORM experience_console_audit('experience.brand_deliverable_decision_recorded', 'experience_deliverable_releases', p_release_id,
    jsonb_build_object('experience_id', v_exp, 'item_id', v_item, 'decision_before', v_before, 'decision_after', p_decision,
      'channel', p_channel, 'note_length', coalesce(length(v_note), 0)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_release_withdraw(p_release_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_rstatus text; v_decision text; v_item uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  PERFORM experience_console_require();
  SELECT x.experience_id INTO v_exp FROM experience_deliverable_releases x WHERE x.id = p_release_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT x.status, x.brand_decision, x.item_id INTO v_rstatus, v_decision, v_item
    FROM experience_deliverable_releases x WHERE x.id = p_release_id FOR UPDATE;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is Complete. Reopen it first (finance)'; END IF;
  IF v_rstatus IS DISTINCT FROM 'shared' THEN RAISE EXCEPTION 'This is not shared with the brand'; END IF;
  IF v_decision = 'approved' THEN RAISE EXCEPTION 'The brand approved it; it stays shared'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being withdrawn (3 to 300 characters)'; END IF;
  UPDATE experience_deliverable_releases SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = my_user_id(), withdrawn_reason = v_reason
    WHERE id = p_release_id;
  PERFORM experience_console_audit('experience.deliverable_withdrawn', 'experience_deliverable_releases', p_release_id,
    jsonb_build_object('experience_id', v_exp, 'item_id', v_item, 'reason', v_reason));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_reopen(p_experience_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  -- Reopening un-freezes a Complete Experience's P&L: finance only.
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required to reopen a Complete Experience' USING ERRCODE = '42501';
  END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'complete' THEN RAISE EXCEPTION 'Only a Complete Experience is reopened'; END IF;
  IF length(v_reason) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why it is being reopened (3 to 300 characters)'; END IF;
  UPDATE experiences SET status = 'delivering', updated_at = now() WHERE id = p_experience_id;  -- un-freezes (trigger)
  PERFORM experience_console_audit('experience.reopened', 'experiences', p_experience_id,
    jsonb_build_object('status_before', 'complete', 'status_after', 'delivering', 'reason', v_reason));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_require()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF has_experience_access('operational') IS NOT TRUE THEN
    RAISE EXCEPTION 'Operational access required' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_add(p_experience_id uuid, p_creator_ids uuid[], p_added_by text, p_channel text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e_id uuid; e_status text; e_plan_per_creator jsonb; e_request jsonb;
  v_template jsonb;
  v_added int := 0;
  v_id uuid;
  v_creator uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT e.id, e.status, e.agreed_plan -> 'per_creator', e.request_deliverables
    INTO e_id, e_status, e_plan_per_creator, e_request
    FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF e_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e_status IS NULL OR e_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'Creators are added once the price is agreed, and before the shoot is scheduled'; END IF;
  IF p_added_by IS NULL OR p_added_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A creator is added by Guapd or suggested by the brand'; END IF;
  IF p_added_by = 'brand' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand suggested them'; END IF;
  IF coalesce(array_length(p_creator_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one creator'; END IF;
  v_template := coalesce(e_plan_per_creator, e_request, '[]'::jsonb);

  FOREACH v_creator IN ARRAY p_creator_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = v_creator AND c.is_bookable AND NOT c.is_guapd) THEN
      RAISE EXCEPTION 'Only bookable creators can be added';
    END IF;
    INSERT INTO experience_roster (experience_id, creator_id, added_by, brand_decision, planned_deliverables, decision_channel, added_by_user)
    VALUES (p_experience_id, v_creator, p_added_by, 'pending', v_template, CASE WHEN p_added_by = 'brand' THEN p_channel END, my_user_id())
    ON CONFLICT (experience_id, creator_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_added := v_added + 1;
      PERFORM experience_console_audit('experience.roster_added', 'experience_roster', v_id,
        jsonb_build_object('experience_id', p_experience_id, 'creator_id', v_creator, 'added_by', p_added_by,
          'channel', p_channel, 'after_lock', e_status = 'confirmed'));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_added;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_decide(p_roster_id uuid, p_decision text, p_channel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_id uuid; r_experience uuid; r_creator uuid; r_locked boolean; r_decision text;
BEGIN
  PERFORM experience_console_require();
  SELECT r.id, r.experience_id, r.creator_id, r.locked, r.brand_decision
    INTO r_id, r_experience, r_creator, r_locked, r_decision
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF r_id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r_locked IS NOT FALSE THEN RAISE EXCEPTION 'This creator is locked on the roster'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected', 'pending') THEN RAISE EXCEPTION 'Unknown decision'; END IF;
  IF p_decision <> 'pending' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand told us'; END IF;
  UPDATE experience_roster SET brand_decision = p_decision,
    decision_channel = CASE WHEN p_decision = 'pending' THEN NULL ELSE p_channel END,
    decided_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE now() END, updated_at = now()
    WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_decision_recorded', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r_experience, 'creator_id', r_creator,
      'decision_before', r_decision, 'decision_after', p_decision, 'channel', p_channel));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_lock(p_experience_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e_id uuid; e_status text;
  v_rec jsonb;
  v_locked int;
BEGIN
  PERFORM experience_console_require();
  SELECT e.id, e.status INTO e_id, e_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF e_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e_status IS NULL OR e_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'The roster can only be locked while it is being built'; END IF;
  IF EXISTS (SELECT 1 FROM experience_roster WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'pending') THEN
    RAISE EXCEPTION 'Record the brand decision on every creator first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM experience_roster WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'accepted') THEN
    RAISE EXCEPTION 'No accepted creators to lock';
  END IF;
  v_rec := experience_roster_reconcile(p_experience_id);
  IF (v_rec ->> 'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'The roster does not add up to what the brand bought: % videos planned against % sold',
      v_rec ->> 'videos_planned', v_rec ->> 'videos_sold';
  END IF;

  UPDATE experience_roster SET locked = true, locked_at = now(), updated_at = now()
    WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'accepted';
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF e_status = 'rostering' THEN
    UPDATE experiences SET status = 'confirmed', updated_at = now() WHERE id = p_experience_id;
  END IF;

  PERFORM experience_console_audit('experience.roster_locked', 'experiences', p_experience_id,
    jsonb_build_object('locked_now', v_locked, 'videos_planned', v_rec -> 'videos_planned', 'videos_sold', v_rec -> 'videos_sold',
      'status_before', e_status, 'status_after', CASE WHEN e_status = 'rostering' THEN 'confirmed' ELSE e_status END));
  RETURN v_locked;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_plan(p_roster_id uuid, p_deliverables jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_id uuid; r_experience uuid; r_creator uuid; r_locked boolean; r_planned jsonb;
  d jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT r.id, r.experience_id, r.creator_id, r.locked, r.planned_deliverables
    INTO r_id, r_experience, r_creator, r_locked, r_planned
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF r_id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r_locked IS NOT FALSE THEN RAISE EXCEPTION 'This creator is locked on the roster'; END IF;
  IF jsonb_typeof(coalesce(p_deliverables, 'null'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Deliverables must be a list'; END IF;
  FOR d IN SELECT x FROM jsonb_array_elements(p_deliverables) x LOOP
    IF coalesce(d ->> 'type', '') NOT IN ('UGC video', 'Reel', 'Story', 'Static post', 'Photo set') OR NOT ((d ->> 'count') ~ '^[0-9]+$') THEN
      RAISE EXCEPTION 'Each deliverable needs a known type and a whole-number count';
    END IF;
  END LOOP;
  UPDATE experience_roster SET planned_deliverables = p_deliverables, updated_at = now() WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_plan_changed', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r_experience, 'creator_id', r_creator,
      'before', r_planned, 'after', p_deliverables));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_roster_remove(p_roster_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_id uuid; r_experience uuid; r_creator uuid; r_locked boolean; r_decision text;
BEGIN
  PERFORM experience_console_require();
  SELECT r.id, r.experience_id, r.creator_id, r.locked, r.brand_decision
    INTO r_id, r_experience, r_creator, r_locked, r_decision
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF r_id IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF r_locked IS NOT FALSE THEN RAISE EXCEPTION 'A locked creator cannot be removed'; END IF;
  DELETE FROM experience_roster WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_removed', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', r_experience, 'creator_id', r_creator, 'decision', r_decision));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_schedule_shoot(p_experience_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_date date; v_city text; v_agreed int;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status, e.shoot_date, e.shoot_city INTO v_status, v_date, v_city FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'The shoot is confirmed once the roster is locked and the deals are out'; END IF;
  IF v_date IS NULL OR v_city IS NULL THEN RAISE EXCEPTION 'The shoot needs a date and a city'; END IF;
  IF EXISTS (SELECT 1 FROM experience_roster r WHERE r.experience_id = p_experience_id AND NOT r.locked AND r.brand_decision IN ('pending', 'accepted')) THEN
    RAISE EXCEPTION 'Lock or remove the creators still on the roster first';
  END IF;
  IF EXISTS (SELECT 1 FROM experience_roster r WHERE r.experience_id = p_experience_id AND r.locked AND r.brand_decision = 'accepted' AND r.leg_deal_id IS NULL) THEN
    RAISE EXCEPTION 'Send every locked creator their deal first';
  END IF;
  SELECT count(*)::int INTO v_agreed FROM experience_roster r JOIN deals d ON d.id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id AND d.status = 'agreed';
  IF v_agreed = 0 THEN RAISE EXCEPTION 'At least one creator has to accept their deal first'; END IF;
  UPDATE experiences SET status = 'shoot_scheduled', updated_at = now() WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.shoot_scheduled', 'experiences', p_experience_id,
    jsonb_build_object('status_before', 'confirmed', 'status_after', 'shoot_scheduled', 'shoot_date', v_date,
      'shoot_city', v_city, 'creators_accepted', v_agreed));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_cost_category_ok(p_experience_id uuid, p_category text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(p_category IS NOT NULL
     AND p_category NOT IN ('per_video', 'day_rate', 'retainer')   -- creator pay lives on legs
     AND (
       p_category IN ('studio', 'misc')
       OR p_category IN (
         SELECT jsonb_array_elements_text(coalesce(e.settings_snapshot -> 'cost_line_categories', t.settings -> 'cost_line_categories', '[]'::jsonb))
         FROM experiences e LEFT JOIN deal_templates t ON t.id = e.template_id
         WHERE e.id = p_experience_id
       )
       OR p_category IN ('travel', 'food', 'editing', 'photography', 'styling', 'makeup')
     ), false)  -- a NULL from the IN-list is a no
$function$;

CREATE OR REPLACE FUNCTION public.experience_cost_validate(p_experience_id uuid, p_label text, p_category text, p_basis text, p_quantity numeric, p_unit_rate_paise bigint, p_total_paise bigint, p_provided_by text, p_creator_leg_deal_id uuid, p_note text)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint;
BEGIN
  IF length(btrim(coalesce(p_label, ''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Give the cost a label (up to 120 characters)'; END IF;
  IF experience_cost_category_ok(p_experience_id, p_category) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pick a cost category. Creator pay (per video, day rate, retainer) is on the creator deals, not a cost line';
  END IF;
  IF p_provided_by IS NULL OR p_provided_by NOT IN ('guapd', 'brand', 'creator') THEN RAISE EXCEPTION 'Say who provides it: Guapd, the brand or the creator'; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.experience_deliverables_progress(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan jsonb; v_sold int; v_per_type boolean;
  v_lines jsonb := '[]'::jsonb; v_gaps jsonb := '[]'::jsonb;
  v_vshared int := 0; v_vapproved int := 0;
  v_over boolean := false; v_ready boolean := true; v_waiting int;
  ln record;
BEGIN
  SELECT e.agreed_plan INTO v_plan FROM experiences e WHERE e.id = p_experience_id;
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('ready', false, 'over_shared', false, 'reason', 'no_agreed_plan', 'lines', '[]'::jsonb, 'gaps', '[]'::jsonb);
  END IF;
  v_sold := (v_plan ->> 'videos_sold')::int;
  v_per_type := coalesce(v_sold = (v_plan ->> 'plan_videos')::int, true);  -- unknown: check every line

  FOR ln IN
    WITH live AS (
      SELECT experience_item_type(r.label) AS type, r.brand_decision
      FROM experience_deliverable_releases r
      WHERE r.experience_id = p_experience_id AND r.status = 'shared'
    ), got AS (
      SELECT type, count(*)::int AS shared, count(*) FILTER (WHERE brand_decision = 'approved')::int AS approved
      FROM live GROUP BY type
    ), target AS (
      SELECT t ->> 'type' AS type, (t ->> 'total')::int AS n FROM jsonb_array_elements(coalesce(v_plan -> 'totals', '[]'::jsonb)) t
    )
    SELECT coalesce(t.type, g.type) AS type, coalesce(t.n, 0) AS sold, coalesce(g.shared, 0) AS shared,
           coalesce(g.approved, 0) AS approved, coalesce(t.type, g.type) IN ('UGC video', 'Reel') AS is_video
    FROM target t FULL JOIN got g ON g.type = t.type
    ORDER BY 1
  LOOP
    v_lines := v_lines || jsonb_build_object('type', ln.type, 'sold', ln.sold, 'shared', ln.shared, 'approved', ln.approved, 'is_video', ln.is_video);
    IF ln.is_video THEN
      v_vshared := v_vshared + ln.shared; v_vapproved := v_vapproved + ln.approved;
    END IF;
    IF ln.is_video IS NOT TRUE OR v_per_type THEN
      IF ln.shared > ln.sold THEN v_over := true; END IF;
      IF ln.approved < ln.sold THEN
        v_ready := false;
        v_gaps := v_gaps || jsonb_build_object('type', ln.type, 'sold', ln.sold, 'approved', ln.approved);
      END IF;
    END IF;
  END LOOP;
  IF v_sold IS NULL OR v_vshared > v_sold THEN v_over := true; END IF;
  IF v_sold IS NULL OR v_vapproved < v_sold THEN
    v_ready := false;
    IF v_per_type IS NOT TRUE THEN v_gaps := v_gaps || jsonb_build_object('type', 'videos', 'sold', v_sold, 'approved', v_vapproved); END IF;
  END IF;
  SELECT count(*)::int INTO v_waiting FROM experience_deliverable_releases r
    WHERE r.experience_id = p_experience_id AND r.status = 'shared' AND r.brand_decision IS DISTINCT FROM 'approved';

  RETURN jsonb_build_object('ready', v_ready, 'over_shared', v_over, 'per_type', v_per_type,
    'videos_sold', v_sold, 'videos_shared', v_vshared, 'videos_approved', v_vapproved,
    'awaiting_brand', v_waiting, 'lines', v_lines, 'gaps', v_gaps);
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
  IF v_dstatus IS DISTINCT FROM 'agreed' THEN RAISE EXCEPTION 'Only a creator who accepted their deal has deliverables'; END IF;
  SELECT r.leg_shoot_outcome INTO v_outcome FROM experience_roster r WHERE r.leg_deal_id = v_deal;
  IF v_outcome IS DISTINCT FROM 'done' THEN RAISE EXCEPTION 'Mark this creator''s shoot done first'; END IF;
  v_owner := experience_leg_owner(v_deal);
  IF p_who = 'guapd' AND v_owner IS DISTINCT FROM 'guapd' THEN RAISE EXCEPTION 'On this Experience the creator submits their own deliverables'; END IF;
  IF p_who = 'creator' AND v_owner IS DISTINCT FROM 'creator' THEN RAISE EXCEPTION 'Guapd delivers the content on this shoot; there is nothing for you to submit'; END IF;

  RETURN QUERY SELECT v_deal, v_exp, v_istatus, v_ver, CASE WHEN v_istatus = 'revision' THEN v_ver + 1 ELSE v_ver END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_item_put(p_item_id uuid, p_deal_id uuid, p_item_status text, p_next_version integer, p_url text, p_storage_path text, p_file_name text, p_via text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
BEGIN
  IF p_item_status = 'approved' THEN RAISE EXCEPTION 'Approved already. Ask for changes on it first'; END IF;
  IF p_item_status IS NULL OR p_item_status NOT IN ('pending', 'submitted', 'revision') THEN RAISE EXCEPTION 'This deliverable cannot take a new version now'; END IF;
  IF (v_url IS NULL) = (p_storage_path IS NULL) THEN RAISE EXCEPTION 'Add a link or a file (one of them)'; END IF;
  IF v_url IS NOT NULL AND (v_url !~* '^https?://[^\s]+$' OR length(v_url) > 2000) THEN
    RAISE EXCEPTION 'The link must start with https:// (or http://)';
  END IF;
  IF p_storage_path IS NOT NULL THEN
    IF p_storage_path IS DISTINCT FROM experience_item_path(p_deal_id, p_item_id, p_item_status, p_next_version, p_file_name) THEN
      RAISE EXCEPTION 'The upload does not match this deliverable. Upload it again';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'deliverables' AND o.name = p_storage_path) THEN
      RAISE EXCEPTION 'The file did not finish uploading. Upload it again';
    END IF;
  END IF;
  UPDATE deal_deliverable_items SET
    version = p_next_version, item_status = 'submitted',
    external_url = v_url, storage_path = p_storage_path,
    file_name = CASE WHEN p_storage_path IS NOT NULL THEN regexp_replace(btrim(p_file_name), '[^A-Za-z0-9._-]+', '_', 'g') END,
    submitted_at = now(), approved_at = NULL, submitted_via = p_via, submitted_by = my_user_id(), updated_at = now()
  WHERE id = p_item_id;
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
  IF v_status IS DISTINCT FROM 'agreed' OR v_outcome IS DISTINCT FROM 'done' THEN
    RETURN false;
  END IF;
  IF experience_leg_owner(p_deal_id) = 'creator' OR v_trigger = 'on_delivery_accepted' THEN
    RETURN EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator)
       AND NOT EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator AND i.item_status IS DISTINCT FROM 'approved');
  END IF;
  RETURN coalesce(v_trigger = 'on_shoot_done', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_legs_reconcile(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan jsonb;
  v_sold int;
  v_plan_videos int;
  v_per_type boolean;
  v_aff_per int;
  v_aff_target int;
  v_aff_placed int := 0;
  v_videos int := 0;
  v_over boolean := false;
  v_exact boolean := true;
  v_lines jsonb := '[]'::jsonb;
  v_creators int := 0;
  v_all jsonb := '[]'::jsonb;
  rec record;
  ln record;
BEGIN
  SELECT e.agreed_plan INTO v_plan FROM experiences e WHERE e.id = p_experience_id;
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'over', false, 'reason', 'no_agreed_plan');
  END IF;
  v_sold := (v_plan ->> 'videos_sold')::int;
  v_plan_videos := (v_plan ->> 'plan_videos')::int;
  v_per_type := coalesce(v_sold = v_plan_videos, true);  -- unknown: check every line
  v_aff_per := nullif(v_plan ->> 'affiliate_per_creator', '')::int;
  v_aff_target := coalesce(v_aff_per, 0) * coalesce(nullif(v_plan ->> 'creator_count', '')::int, 0);

  -- Who counts: locked, accepted, leg not declined or cancelled. Their
  -- deliverables are gathered into one list and summed per type below.
  FOR rec IN
    SELECT coalesce(r.leg_deliverables, r.planned_deliverables) AS dl, r.leg_affiliate_count AS aff
    FROM experience_roster r
    LEFT JOIN deals d ON d.id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id AND r.locked AND r.brand_decision = 'accepted'
      AND (d.id IS NULL OR d.status NOT IN ('declined', 'cancelled'))
  LOOP
    v_creators := v_creators + 1;
    v_all := v_all || coalesce(rec.dl, '[]'::jsonb);
    -- Undrafted: the agreed per-creator affiliate, capped at this creator's videos.
    v_aff_placed := v_aff_placed + coalesce(rec.aff, least(coalesce(v_aff_per, 0), experience_video_count(rec.dl)));
  END LOOP;

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

  IF v_sold IS NULL OR v_videos > v_sold THEN v_over := true; END IF;
  IF v_videos IS DISTINCT FROM v_sold THEN v_exact := false; END IF;
  IF v_aff_placed > v_aff_target THEN v_over := true; END IF;
  IF v_aff_placed <> v_aff_target THEN v_exact := false; END IF;

  RETURN jsonb_build_object(
    'ok', v_exact AND NOT v_over, 'over', v_over, 'per_type', v_per_type,
    'videos_sold', v_sold, 'videos_placed', v_videos,
    'affiliate_target', v_aff_target, 'affiliate_placed', v_aff_placed,
    'creators_counted', v_creators, 'lines', v_lines);
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_payouts(p_experience_id uuid)
 RETURNS TABLE(id uuid, vendor_name text, deal_id uuid, reason text, amount_paise bigint, tds_paise bigint, net_amount_paise bigint, status text, external_ref text, approved_at timestamp with time zone, paid_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF has_experience_access('operational') IS NOT TRUE THEN
    RAISE EXCEPTION 'Operational access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, v.display_name, p.deal_id, p.reason, p.amount_paise, p.tds_paise,
           p.net_amount_paise, p.status, p.external_ref, p.approved_at, p.paid_at
    FROM vendor_payouts p JOIN vendors v ON v.id = p.vendor_id
    WHERE p.experience_id = p_experience_id
    ORDER BY p.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_pnl(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pnl jsonb; v_at timestamptz; v_final boolean; v_stored bigint;
BEGIN
  IF has_experience_access('financial') IS NOT TRUE THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.experience_roster_reconcile(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan jsonb;
  v_sold int;
  v_plan_videos int;
  v_planned_videos int;
  v_lines jsonb;
  v_ok boolean;
  v_creators int;
BEGIN
  SELECT agreed_plan INTO v_plan FROM experiences WHERE id = p_experience_id;
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_agreed_plan');
  END IF;
  v_sold := (v_plan ->> 'videos_sold')::int;
  v_plan_videos := (v_plan ->> 'plan_videos')::int;

  WITH planned AS (
    SELECT d ->> 'type' AS type, sum((d ->> 'count')::int)::int AS n
    FROM experience_roster r, jsonb_array_elements(r.planned_deliverables) d
    WHERE r.experience_id = p_experience_id AND r.brand_decision <> 'rejected' AND (d ->> 'count') ~ '^[0-9]+$'
    GROUP BY d ->> 'type'
  ), target AS (
    SELECT t ->> 'type' AS type, (t ->> 'total')::int AS n
    FROM jsonb_array_elements(coalesce(v_plan -> 'totals', '[]'::jsonb)) t
  ), lines AS (
    SELECT coalesce(t.type, p.type) AS type, coalesce(t.n, 0) AS target, coalesce(p.n, 0) AS planned,
           coalesce(t.type, p.type) IN ('UGC video', 'Reel') AS is_video
    FROM target t FULL JOIN planned p ON p.type = t.type
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('type', type, 'target', target, 'planned', planned, 'is_video', is_video) ORDER BY type), '[]'::jsonb),
         coalesce(sum(planned) FILTER (WHERE is_video), 0)::int,
         bool_and(CASE WHEN is_video THEN (coalesce(v_sold <> v_plan_videos, false) OR target = planned) ELSE target = planned END)
    INTO v_lines, v_planned_videos, v_ok
  FROM lines;

  SELECT count(*) INTO v_creators FROM experience_roster
    WHERE experience_id = p_experience_id AND brand_decision <> 'rejected';

  RETURN jsonb_build_object(
    'ok', coalesce(coalesce(v_ok, true) AND v_planned_videos = v_sold, false),
    'videos_sold', v_sold, 'videos_planned', v_planned_videos,
    'creators_counted', v_creators, 'creators_planned', (v_plan ->> 'creator_count')::int,
    'lines', v_lines);
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
         count(*) FILTER (WHERE d.status = 'agreed' AND r.leg_shoot_outcome IS NULL),
         count(*) FILTER (WHERE d.status = 'agreed' AND r.leg_shoot_outcome = 'done')
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

DROP POLICY IF EXISTS storage_deliverables_insert ON storage.objects;
CREATE POLICY storage_deliverables_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'deliverables'
    AND EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = (string_to_array(name, '/'))[1]::uuid
        AND deals.creator_id = my_creator_id()
        AND deals.leg_role IS NULL   -- not an Experience leg (0539)
    )
  );
