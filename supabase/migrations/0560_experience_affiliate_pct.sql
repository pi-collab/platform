-- 0560 (collab C1): the affiliate commission %.
--   * experience_quotes.affiliate_pct: Guapd's quote (or the brand's counter)
--     states the % of sales paid on the creator's affiliate link. Required when
--     the brand asked for affiliate links, refused when it did not; > 0, <= 100,
--     two decimals. A quote from before 0560 cannot be accepted on an affiliate
--     Experience: send a new one.
--   * Accepting puts it in agreed_plan.affiliate_pct (the brand agreed it).
--   * experience_creator_terms.affiliate_pct: locked onto every creator deal
--     sent on an affiliate Experience, like the fee %. The creator invoices this
--     % of the sales they drove; Guapd keeps the creator's fee % of it (C3).
--   * Shown on the brand quote, the console quotes list and the creator offer.
--   No money moves here and the fee baseline is untouched.

ALTER TABLE experience_quotes ADD COLUMN IF NOT EXISTS affiliate_pct numeric(5,2);
ALTER TABLE experience_quotes DROP CONSTRAINT IF EXISTS eq_affiliate_pct_range;
ALTER TABLE experience_quotes ADD CONSTRAINT eq_affiliate_pct_range CHECK (affiliate_pct IS NULL OR (affiliate_pct > 0 AND affiliate_pct <= 100));
ALTER TABLE experience_creator_terms ADD COLUMN IF NOT EXISTS affiliate_pct numeric(5,2);
ALTER TABLE experience_creator_terms DROP CONSTRAINT IF EXISTS ect_affiliate_pct_range;
ALTER TABLE experience_creator_terms ADD CONSTRAINT ect_affiliate_pct_range CHECK (affiliate_pct IS NULL OR (affiliate_pct > 0 AND affiliate_pct <= 100));

DROP FUNCTION IF EXISTS public.experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.experience_console_quotes(uuid);

CREATE OR REPLACE FUNCTION public.experience_console_quote(p_experience_id uuid, p_proposed_by text, p_per_video_paise bigint, p_deliverable_count integer, p_misc_paise bigint, p_deliverables jsonb, p_shoot_date date, p_shoot_city text, p_message text, p_channel text, p_extras jsonb DEFAULT NULL::jsonb, p_affiliate_pct numeric DEFAULT NULL::numeric)
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

  UPDATE experience_quotes SET status = 'superseded', decided_at = now(), decided_by = my_user_id()
    WHERE experience_id = p_experience_id AND status = 'open'
    RETURNING id INTO v_prev;
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM experience_quotes WHERE experience_id = p_experience_id;

  INSERT INTO experience_quotes (experience_id, version, proposed_by, per_video_paise, deliverable_count,
    misc_paise, extras, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by, affiliate_pct)
  VALUES (p_experience_id, v_version, p_proposed_by, p_per_video_paise, p_deliverable_count, v_misc, v_extras,
    p_per_video_paise * p_deliverable_count + v_misc, coalesce(p_deliverables, '[]'::jsonb), p_shoot_date,
    nullif(btrim(p_shoot_city), ''), nullif(btrim(p_message), ''), 'open', p_channel, my_user_id(), p_affiliate_pct)
  RETURNING id INTO v_id;

  PERFORM experience_console_audit(
    CASE WHEN p_proposed_by = 'guapd' THEN 'experience.quote_sent' ELSE 'experience.brand_counter_recorded' END,
    'experience_quotes', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'version', v_version, 'replaced_quote_id', v_prev,
      'total_paise', p_per_video_paise * p_deliverable_count + v_misc, 'extras_lines', jsonb_array_length(v_extras), 'affiliate_pct', p_affiliate_pct, 'channel', p_channel));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_quote_accept_apply(p_quote_id uuid, p_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q experience_quotes%ROWTYPE;
  e experiences%ROWTYPE;
  v_plan jsonb;
BEGIN
  SELECT id, experience_id, version, proposed_by, per_video_paise, deliverable_count, misc_paise, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by, created_at, decided_at, decided_by, brand_note, extras, affiliate_pct INTO q FROM experience_quotes WHERE id = p_quote_id FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  SELECT id, brand_id, title, status, template_id, template_version, settings_snapshot, brand_service_total_paise, shoot_date, shoot_city, created_by, created_at, updated_at, brand_per_video_paise, brand_deliverable_count, brand_misc_paise, request_deliverables, request_affiliate, request_ad_rights, request_ad_rights_months, request_boost, request_boost_months, request_location, request_date_from, request_date_to, request_brief, request_channel, requested_at, request_creator_count, request_affiliate_per_creator, request_ad_rights_per_creator, request_boost_per_creator, agreed_plan, creator_brief INTO e FROM experiences WHERE id = q.experience_id FOR UPDATE;
  IF e.status IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'The price is already agreed'; END IF;
  IF q.status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'Only the current open quote can be accepted'; END IF;
  IF q.proposed_by = 'guapd' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand accepted'; END IF;
  IF q.shoot_date IS NULL OR q.shoot_city IS NULL THEN RAISE EXCEPTION 'The quote needs a shoot date and city before it can be accepted'; END IF;

  -- 0560: an affiliate Experience is agreed only with its commission %; a quote from before 0560 has none.
  IF e.request_affiliate IS TRUE AND q.affiliate_pct IS NULL THEN
    RAISE EXCEPTION 'This quote has no affiliate commission %%: send a new quote with it';
  END IF;
  v_plan := jsonb_build_object(
    'creator_count', e.request_creator_count,
    'per_creator', e.request_deliverables,
    'totals', experience_plan_totals(e.request_deliverables, e.request_creator_count),
    'plan_videos', experience_plan_count(e.request_deliverables, true) * coalesce(e.request_creator_count, 1),
    'videos_sold', q.deliverable_count,
    'affiliate_per_creator', e.request_affiliate_per_creator, 'affiliate_pct', q.affiliate_pct,
    'ad_rights_per_creator', e.request_ad_rights_per_creator, 'ad_rights_months', e.request_ad_rights_months,
    'boost_per_creator', e.request_boost_per_creator, 'boost_months', e.request_boost_months,
    'quote_id', q.id, 'locked_at', now());

  UPDATE experience_quotes SET status = 'accepted', decided_at = now(), decided_by = my_user_id(),
    recorded_channel = coalesce(p_channel, recorded_channel)
    WHERE id = q.id;
  UPDATE experiences SET
    brand_per_video_paise = q.per_video_paise, brand_deliverable_count = q.deliverable_count,
    brand_misc_paise = q.misc_paise, brand_extras = q.extras, brand_service_total_paise = q.total_paise,
    shoot_date = q.shoot_date, shoot_city = q.shoot_city, agreed_plan = v_plan,
    status = 'rostering', updated_at = now()
    WHERE id = q.experience_id;

  RETURN jsonb_build_object('experience_id', q.experience_id, 'quote_id', q.id, 'version', q.version,
      'accepted_by', CASE WHEN q.proposed_by = 'guapd' THEN 'brand' ELSE 'guapd' END,
      'channel', p_channel, 'total_paise', q.total_paise, 'shoot_date', q.shoot_date, 'shoot_city', q.shoot_city,
      'videos_sold', q.deliverable_count, 'plan_videos', v_plan -> 'plan_videos',
      'status_before', 'requested', 'status_after', 'rostering');
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_quotes(p_experience_id uuid)
 RETURNS TABLE(id uuid, version integer, proposed_by text, per_video_paise bigint, deliverable_count integer, misc_paise bigint, extras jsonb, total_paise bigint, deliverables jsonb, shoot_date date, shoot_city text, message text, status text, recorded_channel text, created_at timestamp with time zone, decided_at timestamp with time zone, created_by_name text, brand_note text, affiliate_pct numeric)
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
           CASE WHEN v_fin THEN q.misc_paise END, CASE WHEN v_fin THEN q.extras END, CASE WHEN v_fin THEN q.total_paise END,
           q.deliverables, q.shoot_date, q.shoot_city, CASE WHEN v_fin THEN q.message END, q.status, q.recorded_channel,
           q.created_at, q.decided_at, coalesce(u.full_name, u.email), CASE WHEN v_fin THEN q.brand_note END, q.affiliate_pct
    FROM experience_quotes q LEFT JOIN users u ON u.id = q.created_by
    WHERE q.experience_id = p_experience_id
    ORDER BY q.version DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.brand_experience(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid; v_admin boolean; v jsonb; v_quote jsonb;
BEGIN
  v_brand := brand_experience_require(p_experience_id, false);
  SELECT bm.is_admin INTO v_admin FROM brand_members bm WHERE bm.brand_id = v_brand AND bm.user_id = my_user_id();
  -- The quote to show: the open one, else the accepted one, else the latest.
  SELECT jsonb_build_object('quote_id', q.id, 'version', q.version, 'proposed_by', q.proposed_by,
           'per_video_paise', q.per_video_paise, 'deliverable_count', q.deliverable_count, 'misc_paise', q.misc_paise, 'extras', q.extras,
           'total_paise', q.total_paise, 'deliverables', q.deliverables, 'shoot_date', q.shoot_date, 'shoot_city', q.shoot_city,
           'message', q.message, 'status', q.status, 'brand_note', q.brand_note, 'decided_at', q.decided_at,
           'on_guapd', q.recorded_channel = 'portal', 'affiliate_pct', q.affiliate_pct)
    INTO v_quote
    FROM experience_quotes q WHERE q.experience_id = p_experience_id AND q.status <> 'superseded'
    ORDER BY q.status = 'open' DESC, q.status = 'accepted' DESC, q.version DESC LIMIT 1;
  SELECT jsonb_build_object(
      'id', e.id, 'title', e.title, 'brand_name', b.name, 'status', e.status, 'requested_at', e.requested_at,
      'request_on_guapd', e.request_channel = 'portal',
      'request', jsonb_build_object('creator_count', e.request_creator_count, 'deliverables', e.request_deliverables,
          'affiliate', e.request_affiliate, 'affiliate_per_creator', e.request_affiliate_per_creator,
          'ad_rights', e.request_ad_rights, 'ad_rights_per_creator', e.request_ad_rights_per_creator, 'ad_rights_months', e.request_ad_rights_months,
          'boost', e.request_boost, 'boost_per_creator', e.request_boost_per_creator, 'boost_months', e.request_boost_months,
          'location', e.request_location, 'date_from', e.request_date_from, 'date_to', e.request_date_to, 'brief', e.request_brief),
      'quote', v_quote, 'affiliate_pct', nullif(e.agreed_plan ->> 'affiliate_pct', '')::numeric,
      'agreed_total_paise', e.brand_service_total_paise,
      'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
      'signoff_at', e.brand_signoff_at, 'signoff_on_guapd', e.brand_signoff_channel = 'portal',
      'completed_at', e.guapd_signoff_at,
      'is_admin', v_admin IS TRUE)
    INTO v FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = p_experience_id;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_leg_send(p_roster_id uuid, p_expected_gross_paise bigint, p_expected_platform_pct numeric, p_expected_net_paise bigint, p_expected_allowance_paise bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid;
  e_status text; e_title text; e_brand uuid; e_template uuid; e_template_version int; e_settings jsonb;
  v_aff_per int; v_aff_pct numeric; v_aff_bought boolean; v_ad_per int; v_boost_per int; v_ad_bought boolean; v_boost_bought boolean;
  r_creator uuid; r_locked boolean; r_decision text; r_sent uuid;
  r_product uuid; r_days numeric; r_deliverables jsonb; r_aff int; r_entered bigint;
  r_ad int; r_boost int; r_allow bigint; v_videos int;
  v_rate bigint; v_track text; v_pct numeric; v_gross bigint; v_net bigint;
  v_brand_name text; v_deal uuid; v_rec jsonb; d jsonb; i int; v_aff_left int;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, e.title, e.brand_id, e.template_id, e.template_version, e.settings_snapshot,
         nullif(e.agreed_plan ->> 'affiliate_per_creator', '')::int,
         nullif(e.agreed_plan ->> 'ad_rights_per_creator', '')::int, nullif(e.agreed_plan ->> 'boost_per_creator', '')::int,
         e.request_ad_rights IS TRUE, e.request_boost IS TRUE,
         nullif(e.agreed_plan ->> 'affiliate_pct', '')::numeric, e.request_affiliate IS TRUE
    INTO e_status, e_title, e_brand, e_template, e_template_version, e_settings, v_aff_per, v_ad_per, v_boost_per, v_ad_bought, v_boost_bought,
         v_aff_pct, v_aff_bought
    FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.locked, r.brand_decision, r.leg_deal_id, r.leg_product_id, r.leg_days,
         coalesce(r.leg_deliverables, r.planned_deliverables), r.leg_affiliate_count, r.leg_entered_rate_paise,
         r.leg_ad_rights_count, r.leg_boost_count, r.leg_allowance_paise
    INTO r_creator, r_locked, r_decision, r_sent, r_product, r_days, r_deliverables, r_aff, r_entered, r_ad, r_boost, r_allow
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;

  IF e_status IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Creator deals are sent once the roster is locked and the Experience is Confirmed'; END IF;
  IF r_locked IS NOT TRUE OR r_decision IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator gets a deal'; END IF;
  IF r_sent IS NOT NULL THEN RAISE EXCEPTION 'This creator''s deal is already sent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = r_creator AND c.is_bookable AND NOT c.is_guapd) THEN
    RAISE EXCEPTION 'This creator is no longer bookable';
  END IF;
  IF (r_product IS NULL AND r_entered IS NULL) OR r_days IS NULL THEN RAISE EXCEPTION 'Pick the shoot day rate (or enter one) and the number of days first'; END IF;
  PERFORM experience_check_deliverables(r_deliverables);
  v_videos := experience_video_count(r_deliverables);
  -- 0547: every count is stated on the draft before it can be sent: a missing
  -- count refuses the send, never defaults to "all" or to 0.
  IF r_aff IS NULL OR (v_ad_bought AND r_ad IS NULL) OR (v_boost_bought AND r_boost IS NULL) THEN
    RAISE EXCEPTION 'Prepare this creator''s affiliate, ad-rights and boost counts first';
  END IF;
  -- 0560: the affiliate commission % the brand agreed is locked onto the creator's terms.
  IF v_aff_bought AND v_aff_pct IS NULL THEN
    RAISE EXCEPTION 'The agreed price has no affiliate commission %%: Guapd must agree it with the brand first';
  END IF;
  r_ad := coalesce(r_ad, 0); r_boost := coalesce(r_boost, 0);
  r_allow := coalesce(r_allow, 0);

  -- Money, re-derived here from the package row and the creator's own track.
  -- The allowance is NOT part of it: gross, fee % and net are day rate x days.
  IF r_product IS NOT NULL THEN
    SELECT cp.price_paise INTO v_rate FROM creator_products cp
      WHERE cp.id = r_product AND cp.creator_id = r_creator AND cp.pricing_type = 'per_day' AND cp.is_active;
    IF v_rate IS NULL THEN RAISE EXCEPTION 'This creator''s shoot day rate is no longer active; pick it again'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM creator_products cp WHERE cp.creator_id = r_creator AND cp.pricing_type = 'per_day' AND cp.is_active) THEN
      RAISE EXCEPTION 'This creator now has an active day rate: use it';
    END IF;
    v_rate := r_entered;
  END IF;
  v_track := experience_creator_track(r_creator);
  v_pct := CASE v_track WHEN 'growth' THEN 30 ELSE 15 END;
  v_gross := round(v_rate::numeric * r_days)::bigint;
  v_net := v_gross - round(v_gross::numeric * v_pct / 100)::bigint;
  IF p_expected_gross_paise IS DISTINCT FROM v_gross OR p_expected_platform_pct IS DISTINCT FROM v_pct
     OR p_expected_net_paise IS DISTINCT FROM v_net
     -- The allowance the screen showed. Omitted is accepted only when there is none.
     OR (p_expected_allowance_paise IS DISTINCT FROM r_allow AND NOT (p_expected_allowance_paise IS NULL AND r_allow = 0)) THEN
    RAISE EXCEPTION 'The terms changed since this screen loaded (now % gross, % %%, % net, % allowance). Reload and check before sending', v_gross, v_pct, v_net, r_allow;
  END IF;

  UPDATE experience_roster SET leg_deliverables = r_deliverables, leg_affiliate_count = r_aff,
         leg_ad_rights_count = r_ad, leg_boost_count = r_boost WHERE id = p_roster_id;
  v_rec := experience_legs_reconcile(v_exp);
  IF (v_rec ->> 'over')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Sending this would place more than the brand bought: % of % videos, % of % with the affiliate link, % of % with ad rights, % of % boosted',
      v_rec ->> 'videos_placed', v_rec ->> 'videos_sold', v_rec ->> 'affiliate_placed', v_rec ->> 'affiliate_target',
      v_rec ->> 'ad_rights_placed', v_rec ->> 'ad_rights_target', v_rec ->> 'boost_placed', v_rec ->> 'boost_target';
  END IF;

  SELECT b.name INTO v_brand_name FROM brands b WHERE b.id = e_brand;

  INSERT INTO deals (brand_id, creator_id, status, title, price_paise, experience_id, leg_role, payment_flow,
                     track, experience_brand_name, template_id, template_version, settings_snapshot)
  VALUES (guapd_brand_id(), r_creator, 'negotiating', e_title, NULL, v_exp, 'creator_leg', 'guapd_principal_vendor_payout',
          v_track, v_brand_name, e_template, e_template_version, e_settings)
  RETURNING id INTO v_deal;

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
                                        platform_pct, creator_net_paise, platform_track, product_id, pricing_type, locked_at, rate_source, allowance_paise, affiliate_pct)
  VALUES (v_deal, v_exp, r_creator, v_rate, r_days, v_gross, v_pct, v_net, v_track, r_product, 'per_day', now(),
          CASE WHEN r_product IS NULL THEN 'entered' ELSE 'package' END, r_allow, CASE WHEN v_aff_bought THEN v_aff_pct END);

  UPDATE experience_roster SET leg_deal_id = v_deal, leg_sent_at = now(), updated_at = now() WHERE id = p_roster_id;

  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_sent',
          jsonb_build_object('by', 'guapd', 'deliverables', r_deliverables, 'affiliate_count', r_aff,
                             'ad_rights_count', r_ad, 'boost_count', r_boost,
                             'day_rate_paise', v_rate, 'days', r_days, 'gross_paise', v_gross,
                             'platform_pct', v_pct, 'net_paise', v_net, 'allowance_paise', r_allow,
                             'affiliate_pct', CASE WHEN v_aff_bought THEN v_aff_pct END));
  PERFORM experience_console_audit('experience.leg_sent', 'deals', v_deal,
    jsonb_build_object('experience_id', v_exp, 'roster_id', p_roster_id, 'creator_id', r_creator,
      'product_id', r_product, 'day_rate_paise', v_rate, 'days', r_days, 'track', v_track,
      'gross_paise_before', NULL, 'gross_paise_after', v_gross, 'platform_pct', v_pct,
      'net_paise_before', NULL, 'net_paise_after', v_net, 'allowance_paise_after', r_allow, 'affiliate_pct', CASE WHEN v_aff_bought THEN v_aff_pct END,
      'deliverables', r_deliverables, 'affiliate_count', r_aff, 'ad_rights_count', r_ad, 'boost_count', r_boost,
      'status_after', 'negotiating'));
  RETURN v_deal;
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
    'deliverables', coalesce(v_deliverables, '[]'::jsonb), 'videos', v_videos, 'affiliate_count', coalesce(v_aff, 0), 'affiliate_pct', t_aff_pct,
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

REVOKE ALL ON FUNCTION public.experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.experience_console_quotes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_quotes(uuid) TO authenticated;
