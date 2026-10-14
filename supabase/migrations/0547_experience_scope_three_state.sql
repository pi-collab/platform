-- 0547: Experiences Phase 6.1 follow-up (Palak, 2026-10-09).
--   * deny-on-NULL for scope: a bought right (affiliate, ad rights, boost) must
--     carry its per-creator count on the request; every leg draft and send states
--     each count; nothing defaults to "all" or to 0-as-ok.
--   * the three-state scope rule (see experience_console_leg_rescope below).
-- Labels only: no money column, fee, terms row, payout or P&L input changes here.

CREATE OR REPLACE FUNCTION public.experience_request_insert(p_brand_id uuid, p_title text, p_creator_count integer, p_deliverables jsonb, p_affiliate boolean, p_affiliate_per_creator integer, p_ad_rights boolean, p_ad_rights_per_creator integer, p_ad_rights_months integer, p_boost boolean, p_boost_per_creator integer, p_boost_months integer, p_location text, p_date_from date, p_date_to date, p_brief text, p_channel text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t_id uuid; t_version int; t_settings jsonb; v_id uuid; v_videos int;
BEGIN
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
  -- 0547: a bought right names its per-creator count. Blank is never "all".
  IF p_ad_rights AND p_ad_rights_per_creator IS NULL THEN RAISE EXCEPTION 'Say how many of each creator''s videos the ad rights cover'; END IF;
  IF p_boost AND p_boost_per_creator IS NULL THEN RAISE EXCEPTION 'Say how many of each creator''s videos the boost covers'; END IF;
  IF p_ad_rights AND (p_ad_rights_per_creator <= 0 OR p_ad_rights_per_creator > v_videos) THEN
    RAISE EXCEPTION 'Ad rights cover more videos than each creator makes';
  END IF;
  IF p_boost AND (p_boost_per_creator <= 0 OR p_boost_per_creator > v_videos) THEN
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
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_legs_reconcile(p_experience_id uuid)
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

CREATE OR REPLACE FUNCTION public.experience_console_leg_draft(p_roster_id uuid, p_product_id uuid, p_days numeric, p_deliverables jsonb, p_affiliate_count integer,
  p_entered_rate_paise bigint DEFAULT NULL::bigint, p_ad_rights_count integer DEFAULT NULL::integer, p_boost_count integer DEFAULT NULL::integer,
  p_allowance_paise bigint DEFAULT NULL::bigint)
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

  IF v_status IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Creator deals are prepared once the roster is locked and the Experience is Confirmed'; END IF;
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

CREATE OR REPLACE FUNCTION public.experience_console_leg_send(p_roster_id uuid, p_expected_gross_paise bigint, p_expected_platform_pct numeric, p_expected_net_paise bigint,
  p_expected_allowance_paise bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid;
  e_status text; e_title text; e_brand uuid; e_template uuid; e_template_version int; e_settings jsonb;
  v_aff_per int; v_ad_per int; v_boost_per int; v_ad_bought boolean; v_boost_bought boolean;
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
         e.request_ad_rights IS TRUE, e.request_boost IS TRUE
    INTO e_status, e_title, e_brand, e_template, e_template_version, e_settings, v_aff_per, v_ad_per, v_boost_per, v_ad_bought, v_boost_bought
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
                                        platform_pct, creator_net_paise, platform_track, product_id, pricing_type, locked_at, rate_source, allowance_paise)
  VALUES (v_deal, v_exp, r_creator, v_rate, r_days, v_gross, v_pct, v_net, v_track, r_product, 'per_day', now(),
          CASE WHEN r_product IS NULL THEN 'entered' ELSE 'package' END, r_allow);

  UPDATE experience_roster SET leg_deal_id = v_deal, leg_sent_at = now(), updated_at = now() WHERE id = p_roster_id;

  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.leg_sent',
          jsonb_build_object('by', 'guapd', 'deliverables', r_deliverables, 'affiliate_count', r_aff,
                             'ad_rights_count', r_ad, 'boost_count', r_boost,
                             'day_rate_paise', v_rate, 'days', r_days, 'gross_paise', v_gross,
                             'platform_pct', v_pct, 'net_paise', v_net, 'allowance_paise', r_allow));
  PERFORM experience_console_audit('experience.leg_sent', 'deals', v_deal,
    jsonb_build_object('experience_id', v_exp, 'roster_id', p_roster_id, 'creator_id', r_creator,
      'product_id', r_product, 'day_rate_paise', v_rate, 'days', r_days, 'track', v_track,
      'gross_paise_before', NULL, 'gross_paise_after', v_gross, 'platform_pct', v_pct,
      'net_paise_before', NULL, 'net_paise_after', v_net, 'allowance_paise_after', r_allow,
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
    'can_submit', coalesce(v_owner = 'creator' AND v_status = 'agreed' AND v_outcome = 'done'
                  AND v_estatus IN ('shoot_scheduled', 'shoot_done', 'delivering'), false),
    'can_message', coalesce(v_status NOT IN ('complete', 'declined', 'cancelled'), false),
    'items', v_items, 'payout', v_payout,
    'counters', v_counters, 'counters_left', CASE WHEN v_status = 'negotiating' THEN greatest(3 - coalesce(v_used, 0), 0) ELSE 0 END);
END;
$function$;

-- ═══ The three-state scope rule ═══════════════════════════════════════════
--   1. Before send:            fully editable (experience_console_leg_draft).
--   2. Sent, shoot not confirmed (Experience still Confirmed): a RE-SPLIT only.
--      Move videos between plain UGC / affiliate / ad rights / boost, or reduce
--      a count; never above what the brand bought per creator, never above this
--      the creator own videos, and the Experience total never past what was sold.
--      Labels only: day rate, days, gross, fee %, net, allowance and the payout
--      are not touched (the terms row is not written). The creator is told.
--   3. From shoot confirmed on, or any increase past what was bought: refused.
--      More scope is a new brand invoice (Leg 1) and, for extra creator work, a
--      new or topped-up creator leg (Leg 2). A frozen leg is never bumped.
-- Every count is stated (NULL refused); the screens counts are checked (stale).
CREATE OR REPLACE FUNCTION public.experience_console_leg_rescope(p_roster_id uuid, p_affiliate_count integer, p_ad_rights_count integer,
  p_boost_count integer, p_expected jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_plan jsonb; v_ad_bought boolean; v_boost_bought boolean;
  v_aff_per int; v_ad_per int; v_boost_per int;
  r_deal uuid; r_dl jsonb; r_aff int; r_ad int; r_boost int; r_locked boolean; r_decision text;
  v_dstatus text; v_videos int; v_rec jsonb; v_left int; it record; v_ad_cap int; v_boost_cap int;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, e.agreed_plan, e.request_ad_rights IS TRUE, e.request_boost IS TRUE
    INTO v_status, v_plan, v_ad_bought, v_boost_bought FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.leg_deal_id, r.leg_deliverables, r.leg_affiliate_count, r.leg_ad_rights_count, r.leg_boost_count, r.locked, r.brand_decision
    INTO r_deal, r_dl, r_aff, r_ad, r_boost, r_locked, r_decision FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF r_locked IS NOT TRUE OR r_decision IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator has a deal'; END IF;
  IF r_deal IS NULL THEN RAISE EXCEPTION 'Not sent yet: prepare the deal instead'; END IF;
  SELECT d.status::text INTO v_dstatus FROM deals d WHERE d.id = r_deal FOR UPDATE;
  IF v_dstatus IS NULL OR v_dstatus NOT IN ('negotiating', 'agreed') THEN RAISE EXCEPTION 'This creator''s deal is closed'; END IF;
  IF v_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'Scope is frozen once the shoot is confirmed. More scope is a new brand invoice, and extra creator work a new or topped-up creator deal';
  END IF;
  IF p_affiliate_count IS NULL OR p_ad_rights_count IS NULL OR p_boost_count IS NULL THEN RAISE EXCEPTION 'Give every count (0 for none)'; END IF;
  IF p_expected IS NULL OR (p_expected ->> 'affiliate')::int IS DISTINCT FROM r_aff OR (p_expected ->> 'ad_rights')::int IS DISTINCT FROM r_ad
     OR (p_expected ->> 'boost')::int IS DISTINCT FROM r_boost THEN
    RAISE EXCEPTION 'The split changed since this screen loaded. Reload and check';
  END IF;
  v_aff_per := nullif(v_plan ->> 'affiliate_per_creator', '')::int;
  v_ad_per := nullif(v_plan ->> 'ad_rights_per_creator', '')::int;
  v_boost_per := nullif(v_plan ->> 'boost_per_creator', '')::int;
  v_videos := experience_video_count(r_dl);
  IF least(p_affiliate_count, p_ad_rights_count, p_boost_count) < 0 OR greatest(p_affiliate_count, p_ad_rights_count, p_boost_count) > v_videos THEN
    RAISE EXCEPTION 'Each count is between 0 and this creator''s % videos', v_videos;
  END IF;
  -- Never above what the brand bought for a creator; not bought (or no count): 0.
  IF p_affiliate_count > coalesce(v_aff_per, 0) THEN RAISE EXCEPTION 'The brand bought the affiliate link on % of each creator''s videos', coalesce(v_aff_per, 0); END IF;
  v_ad_cap := CASE WHEN v_ad_bought THEN coalesce(v_ad_per, 0) ELSE 0 END;
  v_boost_cap := CASE WHEN v_boost_bought THEN coalesce(v_boost_per, 0) ELSE 0 END;
  IF p_ad_rights_count > v_ad_cap THEN RAISE EXCEPTION 'The brand bought ad rights on % of each creator''s videos', v_ad_cap; END IF;
  IF p_boost_count > v_boost_cap THEN RAISE EXCEPTION 'The brand bought boosting on % of each creator''s videos', v_boost_cap; END IF;

  UPDATE experience_roster SET leg_affiliate_count = p_affiliate_count, leg_ad_rights_count = p_ad_rights_count,
         leg_boost_count = p_boost_count, updated_at = now() WHERE id = p_roster_id;
  v_rec := experience_legs_reconcile(v_exp);
  IF (v_rec ->> 'over')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'That would place more than the brand bought: % of % with the affiliate link, % of % with ad rights, % of % boosted',
      v_rec ->> 'affiliate_placed', v_rec ->> 'affiliate_target', v_rec ->> 'ad_rights_placed', v_rec ->> 'ad_rights_target', v_rec ->> 'boost_placed', v_rec ->> 'boost_target';
  END IF;

  -- The affiliate label on the deal's items follows the count: the first N videos.
  v_left := p_affiliate_count;
  FOR it IN SELECT i.id, experience_item_type(i.label) AS t FROM deal_deliverable_items i WHERE i.deal_id = r_deal
            ORDER BY array_position(ARRAY['UGC video', 'Reel', 'Story', 'Static post', 'Photo set'], experience_item_type(i.label)), i.label LOOP
    UPDATE deal_deliverable_items SET affiliate_link = (it.t IN ('UGC video', 'Reel') AND v_left > 0) WHERE id = it.id;
    IF it.t IN ('UGC video', 'Reel') AND v_left > 0 THEN v_left := v_left - 1; END IF;
  END LOOP;

  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (r_deal, my_user_id(), 'experience.leg_rescoped', jsonb_build_object('by', 'guapd',
    'before', jsonb_build_object('affiliate', r_aff, 'ad_rights', r_ad, 'boost', r_boost),
    'after', jsonb_build_object('affiliate', p_affiliate_count, 'ad_rights', p_ad_rights_count, 'boost', p_boost_count)));
  PERFORM experience_console_audit('experience.leg_rescoped', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', r_deal,
      'before', jsonb_build_object('affiliate', r_aff, 'ad_rights', r_ad, 'boost', r_boost),
      'after', jsonb_build_object('affiliate', p_affiliate_count, 'ad_rights', p_ad_rights_count, 'boost', p_boost_count)));
  RETURN jsonb_build_object('deal_id', r_deal, 'reconcile', v_rec);
END;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'experience_console_leg_rescope(uuid, integer, integer, integer, jsonb)',
    'experience_console_leg_draft(uuid, uuid, numeric, jsonb, integer, bigint, integer, integer, bigint)',
    'experience_console_leg_send(uuid, bigint, numeric, bigint, bigint)', 'creator_leg_context(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
  REVOKE ALL ON FUNCTION experience_request_insert(uuid, text, integer, jsonb, boolean, integer, boolean, integer, integer, boolean, integer, integer, text, date, date, text, text) FROM PUBLIC, anon, authenticated;
END $$;
