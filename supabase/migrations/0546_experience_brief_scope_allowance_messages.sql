-- 0546: Experiences Phase 6.1 (approved 2026-10-09, staging only).
--
--   A. The campaign-style brief for creators (brief, guidelines, what to
--      avoid, attachments): one shared brief, or a creator's own. Editable
--      until the shoot is confirmed (status confirmed or earlier), then locked.
--   B. Per-creator scope: affiliate, ad rights and boost counts per creator,
--      frozen at send, checked against what the brand bought.
--   B'. A travel/other ALLOWANCE per creator: paid in full, OUTSIDE day rate x
--      days. The platform fee never touches it: gross, fee and net stay day
--      rate x days exactly as before (fee maths unchanged); the allowance rides
--      next to them on the terms, the payout and the P&L as its own line.
--   C. Guapd <-> creator messages on a sent leg. The creator writes through
--      creator_leg_message_send, staff through the console; direct writes stay
--      refused (the 0534 guard). The real brand is never a party to a leg
--      (brand_id is the house brand), and from here the house brand can never
--      gain a member, and RLS lets only the leg's own creator read its thread.
--
-- House rules: NULL means no (IS NOT TRUE / IS DISTINCT FROM), explicit field
-- lists, no SELECT *, every write audited (lengths, never text).

-- ═══ Columns ═══════════════════════════════════════════════════════════════

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS creator_brief_guidelines text,
  ADD COLUMN IF NOT EXISTS creator_brief_avoid text,
  ADD COLUMN IF NOT EXISTS creator_brief_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS creator_brief_updated_at timestamptz;

ALTER TABLE experience_roster
  -- NULL = this creator uses the shared brief. An override is a whole brief.
  ADD COLUMN IF NOT EXISTS brief_override jsonb,
  ADD COLUMN IF NOT EXISTS leg_ad_rights_count int CHECK (leg_ad_rights_count IS NULL OR leg_ad_rights_count >= 0),
  ADD COLUMN IF NOT EXISTS leg_boost_count int CHECK (leg_boost_count IS NULL OR leg_boost_count >= 0),
  ADD COLUMN IF NOT EXISTS leg_allowance_paise bigint
    CHECK (leg_allowance_paise IS NULL OR (leg_allowance_paise >= 0 AND leg_allowance_paise <= 100000000 AND leg_allowance_paise % 100 = 0));

-- The allowance is part of the locked terms, frozen with them (see the freeze
-- trigger below), and never part of gross/net (the formula checks are untouched).
ALTER TABLE experience_creator_terms
  ADD COLUMN IF NOT EXISTS allowance_paise bigint NOT NULL DEFAULT 0
    CHECK (allowance_paise >= 0 AND allowance_paise <= 100000000);

-- The payout carries it beside the fee statement: amount_paise is still
-- gross - fee (vp_statement unchanged); what leaves Guapd is amount +
-- allowance - TDS. Every existing row has allowance 0, so the new checks hold.
ALTER TABLE vendor_payouts
  ADD COLUMN IF NOT EXISTS allowance_paise bigint NOT NULL DEFAULT 0 CHECK (allowance_paise >= 0);
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_net;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_net CHECK (net_amount_paise = amount_paise + allowance_paise - tds_paise);
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_tds_within;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_tds_within CHECK (tds_paise <= amount_paise + allowance_paise);
ALTER TABLE vendor_payouts DROP CONSTRAINT IF EXISTS vp_allowance_creator_fee_only;
ALTER TABLE vendor_payouts ADD CONSTRAINT vp_allowance_creator_fee_only CHECK (allowance_paise = 0 OR reason = 'creator_fee');

-- ═══ Freeze: the allowance never changes once the terms are locked ═════════

CREATE OR REPLACE FUNCTION public.freeze_locked_creator_terms()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF (NEW.platform_pct, NEW.platform_track, NEW.locked_at, NEW.product_id, NEW.pricing_type, NEW.rate_source, NEW.deal_id, NEW.creator_id, NEW.experience_id, NEW.allowance_paise)
       IS DISTINCT FROM
       (OLD.platform_pct, OLD.platform_track, OLD.locked_at, OLD.product_id, OLD.pricing_type, OLD.rate_source, OLD.deal_id, OLD.creator_id, OLD.experience_id, OLD.allowance_paise) THEN
      RAISE EXCEPTION 'These creator terms are agreed and locked; change them with a new or extended leg';
    END IF;
    IF (NEW.day_rate_paise, NEW.days, NEW.creator_gross_paise, NEW.creator_net_paise)
       IS DISTINCT FROM (OLD.day_rate_paise, OLD.days, OLD.creator_gross_paise, OLD.creator_net_paise) THEN
      IF current_setting('guapd.leg_reprice', true) IS DISTINCT FROM OLD.deal_id::text
         OR NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = OLD.deal_id AND d.status = 'negotiating') THEN
        RAISE EXCEPTION 'These creator terms are agreed and locked; change them with a new or extended leg';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ═══ Payout guard: a creator payout is exactly the locked terms, allowance too

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

-- ═══ Cost lines: an allowance is not entered a second time as travel ══════

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
  IF p_creator_leg_deal_id IS NOT NULL AND p_category = 'travel' AND p_provided_by = 'guapd' AND EXISTS (
    SELECT 1 FROM experience_creator_terms t WHERE t.deal_id = p_creator_leg_deal_id AND t.allowance_paise > 0
  ) THEN
    RAISE EXCEPTION 'This creator''s travel is already paid as the allowance on their deal; it is in the P&L once, there';
  END IF;
  RETURN v_total;
END;
$function$;

-- ═══ Reconcile: affiliate, ad rights and boost against what the brand bought

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
    v_ad_placed := v_ad_placed + CASE WHEN v_ad_bought THEN coalesce(rec.ad, least(coalesce(v_ad_per, v_lv), v_lv)) ELSE coalesce(rec.ad, 0) END;
    v_boost_placed := v_boost_placed + CASE WHEN v_boost_bought THEN coalesce(rec.boost, least(coalesce(v_boost_per, v_lv), v_lv)) ELSE coalesce(rec.boost, 0) END;
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

  -- Ad rights / boost: a per-creator count was bought (x creators), or "all"
  -- (NULL per-creator), which is every video placed. Not bought: 0.
  v_ad_target := CASE WHEN v_ad_bought IS NOT TRUE THEN 0 WHEN v_ad_per IS NULL THEN v_videos ELSE least(v_ad_per * v_n, coalesce(v_sold, 0)) END;
  v_boost_target := CASE WHEN v_boost_bought IS NOT TRUE THEN 0 WHEN v_boost_per IS NULL THEN v_videos ELSE least(v_boost_per * v_n, coalesce(v_sold, 0)) END;

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

-- ═══ Leg draft: + ad rights, boost, allowance ══════════════════════════════

DROP FUNCTION IF EXISTS experience_console_leg_draft(uuid, uuid, numeric, jsonb, integer, bigint);
CREATE OR REPLACE FUNCTION public.experience_console_leg_draft(p_roster_id uuid, p_product_id uuid, p_days numeric, p_deliverables jsonb, p_affiliate_count integer,
  p_entered_rate_paise bigint DEFAULT NULL::bigint, p_ad_rights_count integer DEFAULT NULL::integer, p_boost_count integer DEFAULT NULL::integer,
  p_allowance_paise bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; v_aff_per int; v_ad_bought boolean; v_boost_bought boolean;
  v_creator uuid; v_locked boolean; v_decision text; v_sent uuid;
  v_before jsonb; v_videos int; v_rec jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  SELECT e.status, nullif(e.agreed_plan ->> 'affiliate_per_creator', '')::int, e.request_ad_rights IS TRUE, e.request_boost IS TRUE
    INTO v_status, v_aff_per, v_ad_bought, v_boost_bought
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
  -- Ad rights and boost: NULL = not set here (the agreed per-creator default
  -- applies at send). A count must fit this creator's videos and be bought.
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
         leg_ad_rights_count = p_ad_rights_count, leg_boost_count = p_boost_count,
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

-- ═══ Leg send: freeze the scope counts and the allowance ══════════════════

DROP FUNCTION IF EXISTS experience_console_leg_send(uuid, bigint, numeric, bigint);
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
  r_aff := coalesce(r_aff, least(coalesce(v_aff_per, 0), v_videos));
  r_ad := CASE WHEN v_ad_bought THEN coalesce(r_ad, least(coalesce(v_ad_per, v_videos), v_videos)) ELSE coalesce(r_ad, 0) END;
  r_boost := CASE WHEN v_boost_bought THEN coalesce(r_boost, least(coalesce(v_boost_per, v_videos), v_videos)) ELSE coalesce(r_boost, 0) END;
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

-- ═══ Console legs list: + scope counts, allowance ══════════════════════════

DROP FUNCTION IF EXISTS experience_console_legs(uuid);
CREATE OR REPLACE FUNCTION public.experience_console_legs(p_experience_id uuid)
 RETURNS TABLE(roster_id uuid, creator_id uuid, full_name text, handle text, profile_photo_url text, track text, planned_deliverables jsonb, leg_deliverables jsonb, leg_affiliate_count integer, leg_days numeric, leg_product_id uuid, day_rate_product_id uuid, day_rate_paise bigint, leg_deal_id uuid, leg_sent_at timestamp with time zone, deal_status text, deal_ref text, sent_day_rate_paise bigint, sent_days numeric, sent_gross_paise bigint, sent_platform_pct numeric, sent_net_paise bigint, leg_entered_rate_paise bigint, paused_rate_paise bigint, sent_rate_source text,
   leg_ad_rights_count integer, leg_boost_count integer, leg_allowance_paise bigint, sent_allowance_paise bigint, has_own_brief boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT r.id, r.creator_id, c.full_name, c.handle, c.profile_photo_url,
           experience_creator_track(r.creator_id),
           r.planned_deliverables, r.leg_deliverables, r.leg_affiliate_count, r.leg_days, r.leg_product_id,
           cp.id, cp.price_paise,
           r.leg_deal_id, r.leg_sent_at, d.status::text, d.deal_ref,
           t.day_rate_paise, t.days, t.creator_gross_paise, t.platform_pct, t.creator_net_paise,
           r.leg_entered_rate_paise,
           CASE WHEN cp.id IS NULL THEN (SELECT pp.price_paise FROM creator_products pp
                                          WHERE pp.creator_id = r.creator_id AND pp.pricing_type = 'per_day' AND pp.is_active IS FALSE
                                          ORDER BY pp.updated_at DESC LIMIT 1) END,
           t.rate_source,
           r.leg_ad_rights_count, r.leg_boost_count, r.leg_allowance_paise, t.allowance_paise, r.brief_override IS NOT NULL
    FROM experience_roster r
    JOIN creators c ON c.id = r.creator_id
    LEFT JOIN creator_products cp ON cp.creator_id = r.creator_id AND cp.pricing_type = 'per_day' AND cp.is_active
    LEFT JOIN deals d ON d.id = r.leg_deal_id
    LEFT JOIN experience_creator_terms t ON t.deal_id = r.leg_deal_id
    WHERE r.experience_id = p_experience_id AND r.locked AND r.brand_decision = 'accepted'
    ORDER BY r.locked_at, r.created_at;
END;
$function$;

-- ═══ Payouts: the allowance travels with the creator's payout ═════════════

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
  IF v_dstatus IS DISTINCT FROM 'agreed' OR v_outcome IS DISTINCT FROM 'done' THEN
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

CREATE OR REPLACE FUNCTION public.experience_console_payout_set_tds(p_payout_id uuid, p_tds_paise bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_pstatus text; v_amount bigint; v_allow bigint;
BEGIN
  PERFORM experience_console_require();
  SELECT p.experience_id INTO v_exp FROM vendor_payouts p WHERE p.id = p_payout_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  PERFORM 1 FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT p.status, p.amount_paise, p.allowance_paise INTO v_pstatus, v_amount, v_allow FROM vendor_payouts p WHERE p.id = p_payout_id FOR UPDATE;
  IF v_pstatus IS DISTINCT FROM 'requested' THEN RAISE EXCEPTION 'TDS is set before the payout is approved'; END IF;
  IF p_tds_paise IS NULL OR p_tds_paise < 0 OR p_tds_paise > v_amount + v_allow THEN RAISE EXCEPTION 'TDS must be between 0 and the amount due'; END IF;
  UPDATE vendor_payouts SET tds_paise = p_tds_paise, net_amount_paise = v_amount + v_allow - p_tds_paise, updated_at = now() WHERE id = p_payout_id;
  PERFORM experience_console_audit('experience.payout_tds_set', 'vendor_payouts', p_payout_id, jsonb_build_object('experience_id', v_exp));
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
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL AND d.status = 'agreed';
  RETURN jsonb_build_object('experience_id', p_experience_id, 'status', v_status, 'legs', v_legs, 'can_pay', has_experience_access('financial') IS TRUE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.creator_payouts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_creator uuid := my_creator_id(); v jsonb;
BEGIN
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Creators only' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'deal_id', d.id, 'title', d.title, 'brand_label', coalesce(d.experience_brand_name, 'A brand') || ' · Managed by Guapd',
           'status', p.status, 'net_paise', p.amount_paise, 'allowance_paise', p.allowance_paise, 'tds_paise', p.tds_paise, 'paid_paise', p.net_amount_paise,
           'paid_on', p.paid_on, 'paid_at', p.paid_at, 'reference', CASE WHEN p.status = 'paid' THEN p.external_ref END,
           'requested_at', p.created_at) ORDER BY coalesce(p.paid_at, p.created_at) DESC), '[]'::jsonb)
    INTO v
    FROM vendor_payouts p JOIN deals d ON d.id = p.deal_id
    WHERE d.creator_id = v_creator AND d.leg_role = 'creator_leg' AND p.reason = 'creator_fee' AND p.status NOT IN ('cancelled', 'failed');
  RETURN v;
END;
$function$;

-- ═══ P&L: the allowance is a cost of the shoot, once, never fee revenue ════
--   fee kept       = gross - net                       (unchanged: day rate x days only)
--   sub-total      = billed - gross - allowances - costs
--   margin         = billed - net   - allowances - costs
-- so sub-total + fee kept = margin still holds, and the allowance appears in
-- neither the fee base nor the fee kept. A 'travel' cost line linked to a leg
-- that carries an allowance is refused (experience_cost_validate), so it is
-- never counted twice.

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
  v_prospects int; v_prospects_est bigint;
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
    FROM vendor_payouts p WHERE p.experience_id = p_experience_id AND p.reason = 'creator_fee' AND p.status = 'paid';
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
    'creator_gross_total_paise', v_gross, 'creator_net_total_paise', v_net,
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

-- ═══ A. The brief ══════════════════════════════════════════════════════════

-- Editable until the shoot is confirmed; from shoot_scheduled on it is locked.
CREATE OR REPLACE FUNCTION public.experience_brief_editable(p_status text)
 RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_status IN ('draft', 'requested', 'rostering', 'confirmed'), false)
$$;

-- A brief's shape: lengths, and attachments only from this Experience's folder.
CREATE OR REPLACE FUNCTION public.experience_brief_check(p_experience_id uuid, p_pitch text, p_guidelines text, p_avoid text, p_attachments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  a jsonb; v_out jsonb := '[]'::jsonb; v_prefix text := 'experience-briefs/' || p_experience_id::text || '/';
BEGIN
  IF length(coalesce(p_pitch, '')) > 6000 OR length(coalesce(p_guidelines, '')) > 4000 OR length(coalesce(p_avoid, '')) > 4000 THEN
    RAISE EXCEPTION 'The brief is too long (brief 6,000, guidelines 4,000, what to avoid 4,000 characters)';
  END IF;
  IF jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Attachments must be a list'; END IF;
  IF jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 10 THEN RAISE EXCEPTION 'At most 10 attachments'; END IF;
  FOR a IN SELECT x FROM jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) x LOOP
    IF coalesce(a ->> 'storage_path', '') NOT LIKE v_prefix || '%' OR (a ->> 'storage_path') LIKE '%..%' THEN
      RAISE EXCEPTION 'An attachment is not in this Experience''s brief folder';
    END IF;
    IF length(btrim(coalesce(a ->> 'name', ''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Each attachment needs a name'; END IF;
    -- Only these four keys are kept, whatever else was sent.
    v_out := v_out || jsonb_build_object('name', btrim(a ->> 'name'), 'storage_path', a ->> 'storage_path',
                                         'size_bytes', CASE WHEN (a ->> 'size_bytes') ~ '^[0-9]{1,12}$' THEN (a ->> 'size_bytes')::bigint END,
                                         'content_type', left(coalesce(a ->> 'content_type', ''), 120));
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.experience_console_brief(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_status text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status, jsonb_build_object('pitch', e.creator_brief, 'guidelines', e.creator_brief_guidelines, 'avoid', e.creator_brief_avoid,
           'attachments', e.creator_brief_attachments, 'updated_at', e.creator_brief_updated_at)
    INTO v_status, v FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  RETURN jsonb_build_object('shared', v, 'editable', experience_brief_editable(v_status),
    'overrides', (SELECT coalesce(jsonb_object_agg(r.id::text, r.brief_override), '{}'::jsonb)
                  FROM experience_roster r WHERE r.experience_id = p_experience_id AND r.brief_override IS NOT NULL));
END;
$function$;

-- Sent, live legs that see a given brief: the ones to tell about a change.
CREATE OR REPLACE FUNCTION public.experience_brief_audience(p_experience_id uuid, p_roster_id uuid)
 RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(r.leg_deal_id), '[]'::jsonb)
  FROM experience_roster r JOIN deals d ON d.id = r.leg_deal_id
  WHERE r.experience_id = p_experience_id AND d.status NOT IN ('declined', 'cancelled')
    AND CASE WHEN p_roster_id IS NULL THEN r.brief_override IS NULL ELSE r.id = p_roster_id END
$$;

CREATE OR REPLACE FUNCTION public.experience_console_brief_save(p_experience_id uuid, p_pitch text, p_guidelines text, p_avoid text, p_attachments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_att jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF experience_brief_editable(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'The brief is locked once the shoot is confirmed'; END IF;
  v_att := experience_brief_check(p_experience_id, p_pitch, p_guidelines, p_avoid, p_attachments);
  UPDATE experiences SET creator_brief = nullif(btrim(coalesce(p_pitch, '')), ''), creator_brief_guidelines = nullif(btrim(coalesce(p_guidelines, '')), ''),
         creator_brief_avoid = nullif(btrim(coalesce(p_avoid, '')), ''), creator_brief_attachments = v_att,
         creator_brief_updated_at = now(), updated_at = now()
    WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.creator_brief_set', 'experiences', p_experience_id,
    jsonb_build_object('scope', 'shared', 'pitch_length', length(coalesce(p_pitch, '')), 'guidelines_length', length(coalesce(p_guidelines, '')),
                       'avoid_length', length(coalesce(p_avoid, '')), 'attachments', jsonb_array_length(v_att)));
  RETURN jsonb_build_object('notify_deal_ids', experience_brief_audience(p_experience_id, NULL));
END;
$function$;

-- p_own: true = this creator gets their own brief (the given one); false =
-- back to the shared brief. NULL is refused (NULL means no decision).
CREATE OR REPLACE FUNCTION public.experience_console_brief_override(p_roster_id uuid, p_own boolean, p_pitch text, p_guidelines text, p_avoid text, p_attachments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_exp uuid; v_status text; v_att jsonb; v_locked boolean; v_decision text;
BEGIN
  PERFORM experience_console_require();
  IF p_own IS NULL THEN RAISE EXCEPTION 'Say whether this creator has their own brief'; END IF;
  SELECT r.experience_id, r.locked, r.brand_decision INTO v_exp, v_locked, v_decision FROM experience_roster r WHERE r.id = p_roster_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Roster entry not found'; END IF;
  IF v_locked IS NOT TRUE OR v_decision IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Only a locked, accepted creator has a brief'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  IF experience_brief_editable(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'The brief is locked once the shoot is confirmed'; END IF;
  IF p_own THEN
    v_att := experience_brief_check(v_exp, p_pitch, p_guidelines, p_avoid, p_attachments);
    UPDATE experience_roster SET brief_override = jsonb_build_object('pitch', nullif(btrim(coalesce(p_pitch, '')), ''),
             'guidelines', nullif(btrim(coalesce(p_guidelines, '')), ''), 'avoid', nullif(btrim(coalesce(p_avoid, '')), ''),
             'attachments', v_att, 'updated_at', now()), updated_at = now()
      WHERE id = p_roster_id;
  ELSE
    UPDATE experience_roster SET brief_override = NULL, updated_at = now() WHERE id = p_roster_id;
  END IF;
  PERFORM experience_console_audit('experience.creator_brief_set', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'scope', CASE WHEN p_own THEN 'own' ELSE 'shared' END,
                       'pitch_length', length(coalesce(p_pitch, '')), 'attachments', coalesce(jsonb_array_length(v_att), 0)));
  RETURN jsonb_build_object('notify_deal_ids', experience_brief_audience(v_exp, p_roster_id));
END;
$function$;

-- Where a new attachment goes. The app uploads with the service key to exactly
-- this path; the save refuses any path outside the Experience's folder.
CREATE OR REPLACE FUNCTION public.experience_console_brief_slot(p_experience_id uuid, p_file_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_ext text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF experience_brief_editable(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'The brief is locked once the shoot is confirmed'; END IF;
  v_ext := lower(substring(coalesce(p_file_name, '') FROM '\.([A-Za-z0-9]{1,5})$'));
  IF v_ext IS NULL OR v_ext NOT IN ('pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'doc', 'docx', 'ppt', 'pptx', 'key', 'txt', 'mp4', 'mov') THEN
    RAISE EXCEPTION 'That file type cannot be attached (PDF, images, documents, slides or video)';
  END IF;
  RETURN 'experience-briefs/' || p_experience_id::text || '/' || gen_random_uuid()::text || '.' || v_ext;
END;
$function$;

-- The old one-box brief setter writes the pitch only, inside the same window.
CREATE OR REPLACE FUNCTION public.experience_console_set_creator_brief(p_experience_id uuid, p_brief text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text;
BEGIN
  PERFORM experience_console_require();
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF experience_brief_editable(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'The brief is locked once the shoot is confirmed'; END IF;
  IF length(coalesce(p_brief, '')) > 6000 THEN RAISE EXCEPTION 'The brief is too long'; END IF;
  UPDATE experiences SET creator_brief = nullif(btrim(coalesce(p_brief, '')), ''), creator_brief_updated_at = now(), updated_at = now()
    WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.creator_brief_set', 'experiences', p_experience_id,
    jsonb_build_object('scope', 'shared', 'pitch_length', length(coalesce(p_brief, ''))));
END;
$function$;

-- ═══ The creator's own leg: effective brief, scope, allowance ═════════════

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
    'ad_rights_videos', CASE WHEN v_ad_bought THEN coalesce(v_ad, least(coalesce(nullif(v_plan ->> 'ad_rights_per_creator', '')::int, v_videos), v_videos)) ELSE 0 END,
    'boost_months', CASE WHEN v_boost_bought THEN nullif(v_plan ->> 'boost_months', '')::int END,
    'boost_videos', CASE WHEN v_boost_bought THEN coalesce(v_boost, least(coalesce(nullif(v_plan ->> 'boost_per_creator', '')::int, v_videos), v_videos)) ELSE 0 END,
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

-- ═══ C. Guapd <-> creator messages ═════════════════════════════════════════

-- Who may READ a deal's messages under RLS. A marketplace deal: either party,
-- as before. An Experience leg: its own creator ONLY. Staff read through the
-- console functions below, never through RLS, and the real brand is not a
-- party to a leg at all.
CREATE OR REPLACE FUNCTION public.can_read_deal_messages(p_deal_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = p_deal_id
      AND CASE WHEN d.leg_role = 'creator_leg'
               THEN my_creator_id() IS NOT NULL AND d.creator_id = my_creator_id()
               ELSE (d.brand_id = my_brand_id() OR d.creator_id = my_creator_id())
          END
  )
$$;
REVOKE ALL ON FUNCTION can_read_deal_messages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_read_deal_messages(uuid) TO authenticated;

DROP POLICY IF EXISTS messages_read ON messages;
CREATE POLICY messages_read ON messages FOR SELECT USING (can_read_deal_messages(deal_id));

-- The house brand stays memberless, for good: membership is what RLS reads to
-- let a brand into a deal, and every leg's brand_id is the house brand.
CREATE OR REPLACE FUNCTION public.guard_house_brand_membership()
 RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.brand_id = guapd_brand_id() THEN
    RAISE EXCEPTION 'Nobody is a member of the Guapd house brand' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS t_brand_members_no_house ON brand_members;
CREATE TRIGGER t_brand_members_no_house BEFORE INSERT OR UPDATE OF brand_id ON brand_members
  FOR EACH ROW EXECUTE FUNCTION guard_house_brand_membership();

-- A message on a leg: open from the moment it is sent until it closes.
CREATE OR REPLACE FUNCTION public.experience_leg_message_check(p_deal_id uuid, p_body text)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT d.status::text INTO v_status FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  IF v_status IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_status IN ('complete', 'declined', 'cancelled') THEN RAISE EXCEPTION 'Messages on this deal are closed'; END IF;
  IF length(btrim(coalesce(p_body, ''))) = 0 THEN RAISE EXCEPTION 'Write a message first'; END IF;
  IF length(p_body) > 4000 THEN RAISE EXCEPTION 'A message is at most 4,000 characters'; END IF;
  RETURN btrim(p_body);
END;
$$;

CREATE OR REPLACE FUNCTION public.creator_leg_message_send(p_deal_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_body text; v_id uuid; v_at timestamptz;
BEGIN
  IF my_creator_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg' AND d.creator_id = my_creator_id()
  ) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  v_body := experience_leg_message_check(p_deal_id, p_body);
  INSERT INTO messages (deal_id, sender_id, sender_party, body) VALUES (p_deal_id, my_user_id(), 'creator', v_body)
    RETURNING id, created_at INTO v_id, v_at;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
    VALUES (p_deal_id, my_user_id(), 'experience.leg_message', jsonb_build_object('from', 'creator', 'length', length(v_body)));
  RETURN jsonb_build_object('id', v_id, 'body', v_body, 'sender_party', 'creator', 'created_at', v_at);
END;
$function$;

-- Guapd's side is stored as the deal's brand party, and the deal's brand IS
-- the house brand, so it can only ever read as Guapd.
CREATE OR REPLACE FUNCTION public.experience_console_leg_message_send(p_deal_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_body text; v_id uuid; v_at timestamptz; v_exp uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT d.experience_id INTO v_exp FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg' AND d.brand_id = guapd_brand_id();
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Creator deal not found'; END IF;
  v_body := experience_leg_message_check(p_deal_id, p_body);
  INSERT INTO messages (deal_id, sender_id, sender_party, body) VALUES (p_deal_id, my_user_id(), 'brand', v_body)
    RETURNING id, created_at INTO v_id, v_at;
  INSERT INTO message_reads (user_id, deal_id, last_read_at) VALUES (my_user_id(), p_deal_id, now())
    ON CONFLICT (user_id, deal_id) DO UPDATE SET last_read_at = now();
  INSERT INTO events (deal_id, actor_id, event_type, detail)
    VALUES (p_deal_id, my_user_id(), 'experience.leg_message', jsonb_build_object('from', 'guapd', 'length', length(v_body)));
  PERFORM experience_console_audit('experience.leg_message_sent', 'deals', p_deal_id,
    jsonb_build_object('experience_id', v_exp, 'length', length(v_body)));
  RETURN jsonb_build_object('id', v_id, 'body', v_body, 'sender_party', 'brand', 'created_at', v_at);
END;
$function$;

-- One leg's thread for staff, and opening it marks it read for this staff user.
CREATE OR REPLACE FUNCTION public.experience_console_leg_thread(p_deal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_head jsonb; v_msgs jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT jsonb_build_object('deal_id', d.id, 'deal_ref', d.deal_ref, 'status', d.status::text, 'experience_id', d.experience_id,
           'experience_title', e.title, 'creator_name', c.full_name, 'creator_handle', c.handle, 'creator_photo', c.profile_photo_url,
           'can_message', coalesce(d.status::text NOT IN ('complete', 'declined', 'cancelled'), false))
    INTO v_head
    FROM deals d JOIN experiences e ON e.id = d.experience_id JOIN creators c ON c.id = d.creator_id
    WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  IF v_head IS NULL THEN RAISE EXCEPTION 'Creator deal not found'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'from', CASE WHEN m.sender_party = 'creator' THEN 'creator' ELSE 'guapd' END,
           'body', m.body, 'created_at', m.created_at,
           'sender_name', CASE WHEN m.sender_party = 'creator' THEN c.full_name ELSE coalesce(u.full_name, 'Guapd') END) ORDER BY m.created_at), '[]'::jsonb)
    INTO v_msgs
    FROM messages m JOIN deals d ON d.id = m.deal_id JOIN creators c ON c.id = d.creator_id LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.deal_id = p_deal_id;
  INSERT INTO message_reads (user_id, deal_id, last_read_at) VALUES (my_user_id(), p_deal_id, now())
    ON CONFLICT (user_id, deal_id) DO UPDATE SET last_read_at = now();
  RETURN v_head || jsonb_build_object('messages', v_msgs);
END;
$function$;

-- Every SENT leg (one Experience, or all of them for the inbox): status, any
-- open counter, the last message and this staff user's unread count. No money.
CREATE OR REPLACE FUNCTION public.experience_console_leg_threads(p_experience_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
  SELECT coalesce(jsonb_agg(x.row ORDER BY x.sort_at DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
             'deal_id', d.id, 'deal_ref', d.deal_ref, 'status', d.status::text, 'experience_id', d.experience_id,
             'experience_title', e.title, 'brand_name', b.name, 'creator_name', c.full_name, 'creator_handle', c.handle,
             'creator_photo', c.profile_photo_url, 'sent_at', r.leg_sent_at, 'shoot_outcome', r.leg_shoot_outcome,
             'open_counter', (SELECT jsonb_build_object('round', k.round, 'proposed_by', k.proposed_by) FROM experience_leg_counters k
                              WHERE k.deal_id = d.id AND k.status = 'open' ORDER BY k.created_at DESC LIMIT 1),
             'message_count', (SELECT count(*) FROM messages m WHERE m.deal_id = d.id),
             'last_message', (SELECT jsonb_build_object('body', left(m.body, 160), 'from', CASE WHEN m.sender_party = 'creator' THEN 'creator' ELSE 'guapd' END,
                                                        'created_at', m.created_at)
                              FROM messages m WHERE m.deal_id = d.id ORDER BY m.created_at DESC LIMIT 1),
             'unread', (SELECT count(*) FROM messages m WHERE m.deal_id = d.id AND m.sender_party = 'creator'
                          AND m.created_at > coalesce((SELECT mr.last_read_at FROM message_reads mr WHERE mr.user_id = v_me AND mr.deal_id = d.id), '-infinity'::timestamptz)),
             'can_message', coalesce(d.status::text NOT IN ('complete', 'declined', 'cancelled'), false)
           ) AS row,
           greatest(r.leg_sent_at, (SELECT max(m.created_at) FROM messages m WHERE m.deal_id = d.id)) AS sort_at
    FROM experience_roster r
    JOIN deals d ON d.id = r.leg_deal_id AND d.leg_role = 'creator_leg'
    JOIN experiences e ON e.id = d.experience_id
    JOIN brands b ON b.id = e.brand_id
    JOIN creators c ON c.id = d.creator_id
    WHERE (p_experience_id IS NULL OR r.experience_id = p_experience_id)
  ) x;
  RETURN v;
END;
$function$;

-- Staff unread across all leg threads (the console header badge).
CREATE OR REPLACE FUNCTION public.experience_console_unread_messages()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v int; v_me uuid := my_user_id();
BEGIN
  PERFORM experience_console_require();
  SELECT count(*)::int INTO v
    FROM messages m JOIN deals d ON d.id = m.deal_id AND d.leg_role = 'creator_leg'
    LEFT JOIN message_reads mr ON mr.user_id = v_me AND mr.deal_id = m.deal_id
    WHERE m.sender_party = 'creator' AND (mr.last_read_at IS NULL OR m.created_at > mr.last_read_at);
  RETURN v;
END;
$function$;

-- ═══ Grants ════════════════════════════════════════════════════════════════

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'experience_brief_check(uuid, text, text, text, jsonb)', 'experience_brief_audience(uuid, uuid)',
    'experience_leg_message_check(uuid, text)', 'compute_experience_pnl(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'experience_console_leg_draft(uuid, uuid, numeric, jsonb, integer, bigint, integer, integer, bigint)',
    'experience_console_leg_send(uuid, bigint, numeric, bigint, bigint)',
    'experience_console_legs(uuid)', 'experience_console_brief(uuid)',
    'experience_console_brief_save(uuid, text, text, text, jsonb)',
    'experience_console_brief_override(uuid, boolean, text, text, text, jsonb)',
    'experience_console_brief_slot(uuid, text)', 'experience_console_set_creator_brief(uuid, text)',
    'creator_leg_context(uuid)', 'creator_leg_message_send(uuid, text)',
    'experience_console_leg_message_send(uuid, text)', 'experience_console_leg_thread(uuid)',
    'experience_console_leg_threads(uuid)', 'experience_console_unread_messages()',
    'experience_console_payout_request(uuid, bigint)', 'experience_console_payout_set_tds(uuid, bigint)',
    'experience_console_payouts(uuid)', 'creator_payouts()', 'experience_brief_editable(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
