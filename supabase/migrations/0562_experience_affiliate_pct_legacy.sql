-- 0562: affiliate % on Experiences agreed BEFORE 0560.
--   Their agreed_plan has no 'affiliate_pct' key. Sending a creator deal on one
--   no longer refuses: it goes out with no commission, as before 0560.
--   Finance can record the % the brand agreed (experience_console_affiliate_pct_set)
--   while creators are being chosen or confirmed; deals sent after that lock it,
--   deals already sent keep none (their creator accepted terms without it).
--   A price agreed from 0560 on always carries the key (0560 refuses to accept
--   an affiliate quote without a %), so this path never applies to it.

CREATE OR REPLACE FUNCTION public.experience_console_leg_send(p_roster_id uuid, p_expected_gross_paise bigint, p_expected_platform_pct numeric, p_expected_net_paise bigint, p_expected_allowance_paise bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid;
  e_status text; e_title text; e_brand uuid; e_template uuid; e_template_version int; e_settings jsonb;
  v_aff_per int; v_aff_pct numeric; v_aff_bought boolean; v_aff_legacy boolean; v_ad_per int; v_boost_per int; v_ad_bought boolean; v_boost_bought boolean;
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
         nullif(e.agreed_plan ->> 'affiliate_pct', '')::numeric, e.request_affiliate IS TRUE,
         coalesce(NOT (e.agreed_plan ? 'affiliate_pct'), false)
    INTO e_status, e_title, e_brand, e_template, e_template_version, e_settings, v_aff_per, v_ad_per, v_boost_per, v_ad_bought, v_boost_bought,
         v_aff_pct, v_aff_bought, v_aff_legacy
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
  -- 0562: a price agreed before 0560 carries no affiliate_pct key at all: its deals go out with no
  -- commission (as before), unless finance has since recorded the % the brand agreed.
  IF v_aff_bought AND v_aff_pct IS NULL AND v_aff_legacy IS NOT TRUE THEN
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

CREATE OR REPLACE FUNCTION public.experience_console_affiliate_pct_set(p_experience_id uuid, p_pct numeric, p_channel text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_aff boolean; v_plan jsonb;
BEGIN
  PERFORM experience_finance_require();
  SELECT e.status, e.request_affiliate IS TRUE, e.agreed_plan INTO v_status, v_aff, v_plan FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'The affiliate %% is recorded while creators are being chosen or confirmed'; END IF;
  IF v_aff IS NOT TRUE THEN RAISE EXCEPTION 'The brand did not ask for affiliate links'; END IF;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'The price is not agreed yet: put the %% on the quote'; END IF;
  IF nullif(v_plan ->> 'affiliate_pct', '') IS NOT NULL THEN RAISE EXCEPTION 'The affiliate commission is already agreed'; END IF;
  IF p_pct IS NULL OR p_pct <= 0 OR p_pct > 100 OR p_pct <> round(p_pct, 2) THEN
    RAISE EXCEPTION 'Set the affiliate commission: a %% of sales above 0 and at most 100, two decimals at most';
  END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'email', 'call', 'in_person') THEN RAISE EXCEPTION 'Say how the brand agreed it'; END IF;
  UPDATE experiences SET agreed_plan = agreed_plan || jsonb_build_object('affiliate_pct', p_pct, 'affiliate_pct_channel', p_channel,
         'affiliate_pct_recorded_at', now()), updated_at = now() WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.affiliate_pct_recorded', 'experiences', p_experience_id,
    jsonb_build_object('affiliate_pct_before', NULL, 'affiliate_pct_after', p_pct, 'channel', p_channel,
      'legs_sent_without', (SELECT count(*) FROM experience_roster r WHERE r.experience_id = p_experience_id AND r.leg_deal_id IS NOT NULL)));
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_affiliate_pct_set(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_affiliate_pct_set(uuid, numeric, text) TO authenticated;
