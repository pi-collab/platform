-- 0567: lock and send a PARTIAL roster; place the rest of what was bought later.
--
-- Experiences are offline shoots and the plan moves: a brand buys 80 videos,
-- Guapd books 7 creators x 10 now and holds 10 for later. Until now the roster
-- locked only when it added up EXACTLY to what was bought.
--
-- Forgiving below the line, strict at it:
--   * The roster locks with fewer videos than bought. The ceiling is checked
--     after locking, on everything actually placed (experience_legs_reconcile:
--     locked creators' drafted or sent terms, else their plan, plus open and
--     accepted extras). Over, or unknown, refuses. No agreed plan refuses.
--   * The rest is placed later without touching sent deals: a new creator is
--     added, locked, prepared and sent while the Experience is confirmed OR the
--     shoot is scheduled (sending already refuses anything past what was bought);
--     an existing creator gets an extra (0555, unchanged, already capped).
--   * A creator's deliverables stay editable until their own deal is sent (the
--     plan before lock, the deal draft after). Sent terms stay frozen.
--   * Past what was bought is still a new brand invoice (add-on, 0554) first.
--
-- experience_roster_reconcile gains 'over' (unknown = over); 'ok' still means
-- "adds up exactly" for the screens. CREATE OR REPLACE keeps every grant.

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
  v_over boolean;
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
    -- 0548: in play = accepted, or shared and awaiting the brand. An internal
    -- shortlist, on-hold and rejected creators are not counted.
    WHERE r.experience_id = p_experience_id AND (r.brand_decision = 'accepted' OR (r.brand_decision = 'pending' AND r.shared_with_brand_at IS NOT NULL))
      AND (d ->> 'count') ~ '^[0-9]+$'
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
         bool_and(CASE WHEN is_video THEN (coalesce(v_sold <> v_plan_videos, false) OR target = planned) ELSE target = planned END),
         -- 0567: over = any line past what the brand bought (unknown counts as over).
         bool_or(CASE WHEN is_video THEN (coalesce(v_sold = v_plan_videos, true) AND planned > target) ELSE planned > target END)
    INTO v_lines, v_planned_videos, v_ok, v_over
  FROM lines;

  SELECT count(*) INTO v_creators FROM experience_roster
    WHERE experience_id = p_experience_id AND (brand_decision = 'accepted' OR (brand_decision = 'pending' AND shared_with_brand_at IS NOT NULL));

  RETURN jsonb_build_object(
    'ok', coalesce(coalesce(v_ok, true) AND v_planned_videos = v_sold, false),
    'over', coalesce(coalesce(v_over, false) OR v_planned_videos > v_sold, true),
    'videos_sold', v_sold, 'videos_planned', v_planned_videos,
    'creators_counted', v_creators, 'creators_planned', (v_plan ->> 'creator_count')::int,
    'lines', v_lines);
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
  v_legs jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT e.id, e.status INTO e_id, e_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF e_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e_status IS NULL OR e_status NOT IN ('rostering', 'confirmed', 'shoot_scheduled') THEN RAISE EXCEPTION 'The roster can only be locked until the shoot is done'; END IF;
  -- 0548: every creator SHARED with the brand needs their answer first. An
  -- unshared shortlist stays internal and does not block; on hold does not lock.
  IF EXISTS (SELECT 1 FROM experience_roster WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'pending' AND shared_with_brand_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Record the brand decision on every creator shared with them first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM experience_roster WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'accepted') THEN
    RAISE EXCEPTION 'No accepted creators to lock';
  END IF;
  -- 0567: a roster may be locked BELOW what the brand bought (the rest stays in
  -- the pool for later); never above it, and never without an agreed plan.
  v_rec := experience_roster_reconcile(p_experience_id);
  IF v_rec ->> 'reason' = 'no_agreed_plan' OR (v_rec ->> 'videos_sold') IS NULL THEN
    RAISE EXCEPTION 'No agreed plan to lock against';
  END IF;

  UPDATE experience_roster SET locked = true, locked_at = now(), updated_at = now()
    WHERE experience_id = p_experience_id AND NOT locked AND brand_decision = 'accepted';
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  -- The ceiling, on what is actually placed once these are locked: every locked
  -- creator (drafted or sent terms, else their plan) plus open/accepted extras.
  -- Over, or unknown, refuses and the whole lock rolls back.
  v_legs := experience_legs_reconcile(p_experience_id);
  IF (v_legs ->> 'over')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Locking these creators would place more than the brand bought: % of % videos. More scope is a new brand invoice',
      coalesce(v_legs ->> 'videos_placed', '?'), coalesce(v_legs ->> 'videos_sold', '?');
  END IF;
  IF e_status = 'rostering' THEN
    UPDATE experiences SET status = 'confirmed', updated_at = now() WHERE id = p_experience_id;
  END IF;

  PERFORM experience_console_audit('experience.roster_locked', 'experiences', p_experience_id,
    jsonb_build_object('locked_now', v_locked, 'videos_planned', v_rec -> 'videos_planned', 'videos_sold', v_rec -> 'videos_sold',
      'videos_placed', v_legs -> 'videos_placed', 'partial', (v_legs ->> 'ok')::boolean IS NOT TRUE,
      'status_before', e_status, 'status_after', CASE WHEN e_status = 'rostering' THEN 'confirmed' ELSE e_status END));
  RETURN v_locked;
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
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
  SELECT e.id, e.status, e.agreed_plan -> 'per_creator', e.request_deliverables
    INTO e_id, e_status, e_plan_per_creator, e_request
    FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF e_id IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF e_status IS NULL OR e_status NOT IN ('rostering', 'confirmed', 'shoot_scheduled') THEN RAISE EXCEPTION 'Creators are added once the price is agreed, and before the shoot is done'; END IF;
  IF p_added_by IS NULL OR p_added_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A creator is added by Guapd or suggested by the brand'; END IF;
  IF p_added_by = 'brand' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand suggested them'; END IF;
  IF coalesce(array_length(p_creator_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one creator'; END IF;
  v_template := coalesce(e_plan_per_creator, e_request, '[]'::jsonb);

  FOREACH v_creator IN ARRAY p_creator_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = v_creator AND c.is_bookable AND NOT c.is_guapd) THEN
      RAISE EXCEPTION 'Only bookable creators can be added';
    END IF;
    -- 0548: Guapd's own picks start INTERNAL (a shortlist); the brand's own
    -- suggestions are shared from the start (the brand named them).
    INSERT INTO experience_roster (experience_id, creator_id, added_by, brand_decision, planned_deliverables, decision_channel, added_by_user, shared_with_brand_at, shared_by)
    VALUES (p_experience_id, v_creator, p_added_by, 'pending', v_template, CASE WHEN p_added_by = 'brand' THEN p_channel END, my_user_id(),
            CASE WHEN p_added_by = 'brand' THEN now() END, CASE WHEN p_added_by = 'brand' THEN my_user_id() END)
    ON CONFLICT (experience_id, creator_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_added := v_added + 1;
      PERFORM experience_console_audit('experience.roster_added', 'experience_roster', v_id,
        jsonb_build_object('experience_id', p_experience_id, 'creator_id', v_creator, 'added_by', p_added_by,
          'channel', p_channel, 'after_lock', e_status IN ('confirmed', 'shoot_scheduled')));
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_added;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_leg_draft(p_roster_id uuid, p_product_id uuid, p_days numeric, p_deliverables jsonb, p_affiliate_count integer, p_entered_rate_paise bigint DEFAULT NULL::bigint, p_ad_rights_count integer DEFAULT NULL::integer, p_boost_count integer DEFAULT NULL::integer, p_allowance_paise bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_aff_per int; v_ad_bought boolean; v_boost_bought boolean; v_ad_per int; v_boost_per int;
  v_creator uuid; v_locked boolean; v_decision text; v_sent uuid;
  v_before jsonb; v_videos int; v_rec jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, nullif(e.agreed_plan ->> 'affiliate_per_creator', '')::int, e.request_ad_rights IS TRUE, e.request_boost IS TRUE,
         nullif(e.agreed_plan ->> 'ad_rights_per_creator', '')::int, nullif(e.agreed_plan ->> 'boost_per_creator', '')::int
    INTO v_status, v_aff_per, v_ad_bought, v_boost_bought, v_ad_per, v_boost_per
    FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.creator_id, r.locked, r.brand_decision, r.leg_deal_id,
         jsonb_build_object('product_id', r.leg_product_id, 'entered_rate', r.leg_entered_rate_paise IS NOT NULL, 'days', r.leg_days,
                            'deliverables', r.leg_deliverables, 'affiliate_count', r.leg_affiliate_count,
                            'ad_rights_count', r.leg_ad_rights_count, 'boost_count', r.leg_boost_count, 'allowance_paise', r.leg_allowance_paise)
    INTO v_creator, v_locked, v_decision, v_sent, v_before
    FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;

  IF v_status IS NULL OR v_status NOT IN ('confirmed', 'shoot_scheduled') THEN RAISE EXCEPTION 'Creator deals are prepared once the roster is locked, until the shoot is done'; END IF;
  IF v_locked IS NOT TRUE OR v_decision IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator gets a deal'; END IF;
  IF v_sent IS NOT NULL THEN RAISE EXCEPTION 'This creator''s deal is already sent; its terms are frozen'; END IF;
  IF p_product_id IS NOT NULL AND p_entered_rate_paise IS NOT NULL THEN RAISE EXCEPTION 'Use their day rate or enter one, not both'; END IF;

  IF p_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM creator_products cp
    WHERE cp.id = p_product_id AND cp.creator_id = v_creator AND cp.pricing_type = 'per_day' AND cp.is_active
  ) THEN
    RAISE EXCEPTION 'Pick this creator''s own active shoot day rate';
  END IF;
  IF p_entered_rate_paise IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM creator_products cp WHERE cp.creator_id = v_creator AND cp.pricing_type = 'per_day' AND cp.is_active) THEN
      RAISE EXCEPTION 'This creator has an active day rate: use it';
    END IF;
    IF p_entered_rate_paise < 100 OR p_entered_rate_paise > 1000000000 OR p_entered_rate_paise % 100 <> 0 THEN
      RAISE EXCEPTION 'A day rate is a whole number of rupees between ₹1 and ₹1,00,00,000';
    END IF;
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
  -- 0547: ad rights and boost, when bought, are stated per creator on every
  -- save (NULL is refused, never "as agreed" or "all"); the agreed plan must
  -- itself carry a per-creator count. Not bought: none (NULL or 0).
  IF v_ad_bought AND v_ad_per IS NULL THEN RAISE EXCEPTION 'The agreed plan has no per-creator ad-rights count'; END IF;
  IF v_boost_bought AND v_boost_per IS NULL THEN RAISE EXCEPTION 'The agreed plan has no per-creator boost count'; END IF;
  IF v_ad_bought AND p_ad_rights_count IS NULL THEN RAISE EXCEPTION 'Say how many of this creator''s videos carry ad rights (0 for none)'; END IF;
  IF v_boost_bought AND p_boost_count IS NULL THEN RAISE EXCEPTION 'Say how many of this creator''s videos are boosted (0 for none)'; END IF;
  IF p_ad_rights_count IS NOT NULL THEN
    IF p_ad_rights_count < 0 OR p_ad_rights_count > v_videos THEN
      RAISE EXCEPTION 'Videos with ad rights must be between 0 and this creator''s % videos', v_videos;
    END IF;
    IF p_ad_rights_count > 0 AND v_ad_bought IS NOT TRUE THEN RAISE EXCEPTION 'The brand did not buy ad rights on this Experience'; END IF;
  END IF;
  IF p_boost_count IS NOT NULL THEN
    IF p_boost_count < 0 OR p_boost_count > v_videos THEN
      RAISE EXCEPTION 'Boosted videos must be between 0 and this creator''s % videos', v_videos;
    END IF;
    IF p_boost_count > 0 AND v_boost_bought IS NOT TRUE THEN RAISE EXCEPTION 'The brand did not buy boosting on this Experience'; END IF;
  END IF;
  IF p_allowance_paise IS NOT NULL AND (p_allowance_paise < 0 OR p_allowance_paise > 100000000 OR p_allowance_paise % 100 <> 0) THEN
    RAISE EXCEPTION 'An allowance is a whole number of rupees, at most ₹10,00,000';
  END IF;

  UPDATE experience_roster SET leg_product_id = p_product_id, leg_entered_rate_paise = p_entered_rate_paise, leg_days = p_days,
         leg_deliverables = p_deliverables, leg_affiliate_count = p_affiliate_count,
         leg_ad_rights_count = coalesce(p_ad_rights_count, 0), leg_boost_count = coalesce(p_boost_count, 0),
         leg_allowance_paise = nullif(p_allowance_paise, 0), updated_at = now()
    WHERE id = p_roster_id;

  v_rec := experience_legs_reconcile(v_exp);
  IF (v_rec ->> 'over')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'That would place more than the brand bought: % of % videos, % of % with the affiliate link, % of % with ad rights, % of % boosted',
      v_rec ->> 'videos_placed', v_rec ->> 'videos_sold', v_rec ->> 'affiliate_placed', v_rec ->> 'affiliate_target',
      v_rec ->> 'ad_rights_placed', v_rec ->> 'ad_rights_target', v_rec ->> 'boost_placed', v_rec ->> 'boost_target';
  END IF;

  PERFORM experience_console_audit('experience.leg_drafted', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', v_creator, 'before', v_before,
      'after', jsonb_build_object('product_id', p_product_id, 'entered_rate', p_entered_rate_paise IS NOT NULL, 'days', p_days,
                                  'deliverables', p_deliverables, 'affiliate_count', p_affiliate_count,
                                  'ad_rights_count', p_ad_rights_count, 'boost_count', p_boost_count,
                                  'allowance_paise', nullif(p_allowance_paise, 0))));
  RETURN v_rec;
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

  IF e_status IS NULL OR e_status NOT IN ('confirmed', 'shoot_scheduled') THEN RAISE EXCEPTION 'Creator deals are sent once the roster is locked, until the shoot is done'; END IF;
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
