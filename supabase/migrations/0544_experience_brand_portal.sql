-- 0544: Experiences Phase 6, the brand's own screens (/experiences). Staging only.
--
-- The brand-facing version of everything staff have recorded on the brand's
-- behalf: request an Experience, answer Guapd's quote, accept/reject roster
-- creators, approve deliverables, sign off, and read the end-of-Experience
-- report. Staff paths stay: staff still act for a brand that isn't using the
-- portal.
--
--   * ONE brand gate, brand_experience_require(id, admin): a member of THIS
--     Experience's brand; never the house brand; NULL id, no session or no
--     membership = "Not found" (42501), the same answer either way so ids
--     cannot be probed. Admin-only steps (price, sign-off) refuse non-admins.
--   * Brand reads are SECURITY DEFINER functions returning NAMED fields, no
--     SELECT *. Brands lose their direct SELECT on experiences,
--     experience_roster and experience_quotes: the functions are the only way.
--   * Never returned to a brand: creator rates, gross, %, net, payouts,
--     counters, costs, P&L, margin, staff and roster notes, prospects, shoot
--     outcome reasons, the creator brief, bank details, creator ids, another
--     brand. The report reads creator NAMES through the roster (never deals or
--     any leg/terms table that carries money).
--   * Brand writes go to the SAME columns the staff paths write, with channel
--     'portal' = "the brand did it on Guapd". Only brand functions write
--     'portal'; every staff function refuses it. Whoever acts last stands
--     until the existing point of no return (lock, an approved item, the
--     sign-off); each brand write carries the state its screen showed, and a
--     stale screen is refused.
--   * NULL means no in every gate (IS NOT TRUE / IS DISTINCT FROM).

-- ═════ A. Columns and constraints ═════
ALTER TABLE experience_quotes ADD COLUMN IF NOT EXISTS brand_note text;
ALTER TABLE experience_quotes DROP CONSTRAINT IF EXISTS eq_brand_note_len;
ALTER TABLE experience_quotes ADD CONSTRAINT eq_brand_note_len CHECK (brand_note IS NULL OR length(brand_note) BETWEEN 3 AND 1000);

ALTER TABLE experience_deliverable_releases DROP CONSTRAINT IF EXISTS edr_decision;
ALTER TABLE experience_deliverable_releases ADD CONSTRAINT edr_decision CHECK ((brand_decision IS NULL) = (brand_decided_at IS NULL)
  AND (brand_decision IS NULL OR (brand_decision_channel IS NOT NULL
       AND brand_decision_channel IN ('whatsapp', 'email', 'call', 'in_person', 'portal')))
  AND (brand_decision_note IS NULL OR length(brand_decision_note) <= 1000));

ALTER TABLE experiences DROP CONSTRAINT IF EXISTS experiences_signoff_shape;
ALTER TABLE experiences ADD CONSTRAINT experiences_signoff_shape CHECK (
  (brand_signoff_at IS NULL) = (brand_signoff_channel IS NULL)
  AND (brand_signoff_channel IS NULL OR brand_signoff_channel IN ('whatsapp', 'email', 'call', 'in_person', 'portal'))
  AND (brand_signoff_note IS NULL OR length(brand_signoff_note) <= 500));

-- ═════ B. Brands read only through functions ═════
DROP POLICY IF EXISTS experiences_read_brand ON experiences;
DROP POLICY IF EXISTS roster_read_brand ON experience_roster;
DROP POLICY IF EXISTS experience_quotes_read_brand ON experience_quotes;
-- Revoking the table privilege also revokes every column grant on it.
REVOKE ALL ON experiences, experience_roster, experience_quotes FROM anon, authenticated;

-- ═════ C. The brand gate ═════
-- Returns the Experience's brand id. p_admin: TRUE = a brand admin only;
-- NULL is treated as TRUE (deny on NULL).
CREATE OR REPLACE FUNCTION brand_experience_require(p_experience_id uuid, p_admin boolean) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := my_user_id(); v_brand uuid; v_admin boolean;
BEGIN
  IF p_experience_id IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT e.brand_id, bm.is_admin INTO v_brand, v_admin
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    JOIN brand_members bm ON bm.brand_id = e.brand_id AND bm.user_id = v_user
    WHERE e.id = p_experience_id AND b.is_guapd IS FALSE AND e.status IS DISTINCT FROM 'draft';
  IF v_brand IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF p_admin IS NOT FALSE AND v_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Only an admin on your brand''s account can do this' USING ERRCODE = '42501';
  END IF;
  RETURN v_brand;
END;
$$;

-- ═════ D. Shared internals (staff and brand paths both call these) ═════
-- The request: validation + insert, as experience_console_create did it.
CREATE OR REPLACE FUNCTION experience_request_insert(p_brand_id uuid, p_title text, p_creator_count integer, p_deliverables jsonb,
  p_affiliate boolean, p_affiliate_per_creator integer, p_ad_rights boolean, p_ad_rights_per_creator integer, p_ad_rights_months integer,
  p_boost boolean, p_boost_per_creator integer, p_boost_months integer, p_location text, p_date_from date, p_date_to date,
  p_brief text, p_channel text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  RETURN v_id;
END;
$$;

-- Accepting a quote: the checks and writes experience_console_accept did,
-- returning the audit detail. Callers gate and audit.
CREATE OR REPLACE FUNCTION experience_quote_accept_apply(p_quote_id uuid, p_channel text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q experience_quotes%ROWTYPE;
  e experiences%ROWTYPE;
  v_plan jsonb;
BEGIN
  SELECT id, experience_id, version, proposed_by, per_video_paise, deliverable_count, misc_paise, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by, created_at, decided_at, decided_by, brand_note INTO q FROM experience_quotes WHERE id = p_quote_id FOR UPDATE;
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

  RETURN jsonb_build_object('experience_id', q.experience_id, 'quote_id', q.id, 'version', q.version,
      'accepted_by', CASE WHEN q.proposed_by = 'guapd' THEN 'brand' ELSE 'guapd' END,
      'channel', p_channel, 'total_paise', q.total_paise, 'shoot_date', q.shoot_date, 'shoot_city', q.shoot_city,
      'videos_sold', q.deliverable_count, 'plan_videos', v_plan -> 'plan_videos',
      'status_before', 'requested', 'status_after', 'rostering');
END;
$$;

-- ═════ E. Staff paths: unchanged, except they never write 'portal' ═════
CREATE OR REPLACE FUNCTION experience_console_create(p_brand_id uuid, p_title text, p_creator_count integer, p_deliverables jsonb,
  p_affiliate boolean, p_affiliate_per_creator integer, p_ad_rights boolean, p_ad_rights_per_creator integer, p_ad_rights_months integer,
  p_boost boolean, p_boost_per_creator integer, p_boost_months integer, p_location text, p_date_from date, p_date_to date,
  p_brief text, p_channel text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b_id uuid; b_is_guapd boolean; b_status text; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
  SELECT b.id, b.is_guapd, b.brand_status INTO b_id, b_is_guapd, b_status FROM brands b WHERE b.id = p_brand_id;
  IF b_id IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  IF b_is_guapd IS NOT FALSE THEN RAISE EXCEPTION 'An Experience is for a real brand, not the Guapd house account'; END IF;
  IF b_status = 'rejected' THEN RAISE EXCEPTION 'That brand is rejected'; END IF;
  v_id := experience_request_insert(p_brand_id, p_title, p_creator_count, p_deliverables, p_affiliate, p_affiliate_per_creator,
    p_ad_rights, p_ad_rights_per_creator, p_ad_rights_months, p_boost, p_boost_per_creator, p_boost_months,
    p_location, p_date_from, p_date_to, p_brief, p_channel);
  PERFORM experience_console_audit('experience.request_recorded', 'experiences', v_id,
    jsonb_build_object('brand_id', p_brand_id, 'channel', p_channel, 'creators', p_creator_count,
      'videos_per_creator', experience_plan_count(p_deliverables, true), 'status_after', 'requested'));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_accept(p_quote_id uuid, p_channel text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_console_require();
  -- Quoting IS the brand price: financial access only (0537).
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
  v := experience_quote_accept_apply(p_quote_id, p_channel);
  PERFORM experience_console_audit('experience.quote_accepted', 'experiences', (v ->> 'experience_id')::uuid, v - 'experience_id');
END;
$$;

-- quote, roster_add, roster_decide: the live definitions with the 'portal' refusal added.
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
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
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
  IF p_channel = 'portal' THEN RAISE EXCEPTION '"On Guapd" is recorded only when the brand acts in the portal themselves'; END IF;
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

-- The console's quote list also shows the brand's decline note (financial, like the message).
DROP FUNCTION IF EXISTS experience_console_quotes(uuid);
CREATE OR REPLACE FUNCTION public.experience_console_quotes(p_experience_id uuid)
 RETURNS TABLE(id uuid, version integer, proposed_by text, per_video_paise bigint, deliverable_count integer, misc_paise bigint, total_paise bigint, deliverables jsonb, shoot_date date, shoot_city text, message text, status text, recorded_channel text, created_at timestamp with time zone, decided_at timestamp with time zone, created_by_name text, brand_note text)
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
           CASE WHEN v_fin THEN q.misc_paise END, CASE WHEN v_fin THEN q.total_paise END,
           q.deliverables, q.shoot_date, q.shoot_city, CASE WHEN v_fin THEN q.message END, q.status, q.recorded_channel,
           q.created_at, q.decided_at, coalesce(u.full_name, u.email), CASE WHEN v_fin THEN q.brand_note END
    FROM experience_quotes q LEFT JOIN users u ON u.id = q.created_by
    WHERE q.experience_id = p_experience_id
    ORDER BY q.version DESC;
END;
$function$;
REVOKE ALL ON FUNCTION experience_console_quotes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_quotes(uuid) TO authenticated;

-- ═════ F. Brand reads ═════
-- The caller's Experiences across the brands they belong to, each with what is waiting on them.
CREATE OR REPLACE FUNCTION brand_experiences() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := my_user_id(); v_rows jsonb; v_brand uuid; v_can boolean; v_admin boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'brand_name', b.name, 'status', e.status,
      'requested_at', e.requested_at, 'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
      'creator_count', e.request_creator_count,
      'quote_to_answer', EXISTS (SELECT 1 FROM experience_quotes q WHERE q.experience_id = e.id AND q.status = 'open' AND q.proposed_by = 'guapd'),
      'roster_to_review', CASE WHEN e.status IN ('rostering', 'confirmed') THEN
          (SELECT count(*) FROM experience_roster r WHERE r.experience_id = e.id AND r.locked IS FALSE AND r.brand_decision = 'pending') ELSE 0 END,
      'items_to_review', (SELECT count(*) FROM experience_deliverable_releases x
          WHERE x.experience_id = e.id AND x.status = 'shared' AND x.brand_decision IS NULL),
      'invoices_due', (SELECT count(*) FROM service_invoices si WHERE si.experience_id = e.id AND si.status = 'issued'),
      'signoff_due', e.status = 'delivering' AND e.brand_signoff_at IS NULL
    ) ORDER BY e.status IN ('complete', 'cancelled'), coalesce(e.requested_at, e.created_at) DESC), '[]'::jsonb)
    INTO v_rows
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    WHERE b.is_guapd IS FALSE AND e.status IS DISTINCT FROM 'draft'
      AND EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brand_id = e.brand_id AND bm.user_id = v_user);
  -- Who may request: a member of an approved, real brand (their first brand, as my_brand_id).
  v_brand := my_brand_id();
  SELECT (b.brand_status = 'approved' AND b.is_guapd IS FALSE), bm.is_admin INTO v_can, v_admin
    FROM brands b JOIN brand_members bm ON bm.brand_id = b.id AND bm.user_id = v_user WHERE b.id = v_brand;
  RETURN jsonb_build_object('experiences', v_rows, 'can_request', v_can IS TRUE);
END;
$$;

-- One Experience as its brand sees it: the request, the price, where it stands.
CREATE OR REPLACE FUNCTION brand_experience(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand uuid; v_admin boolean; v jsonb; v_quote jsonb;
BEGIN
  v_brand := brand_experience_require(p_experience_id, false);
  SELECT bm.is_admin INTO v_admin FROM brand_members bm WHERE bm.brand_id = v_brand AND bm.user_id = my_user_id();
  -- The quote to show: the open one, else the accepted one, else the latest.
  SELECT jsonb_build_object('quote_id', q.id, 'version', q.version, 'proposed_by', q.proposed_by,
           'per_video_paise', q.per_video_paise, 'deliverable_count', q.deliverable_count, 'misc_paise', q.misc_paise,
           'total_paise', q.total_paise, 'deliverables', q.deliverables, 'shoot_date', q.shoot_date, 'shoot_city', q.shoot_city,
           'message', q.message, 'status', q.status, 'brand_note', q.brand_note, 'decided_at', q.decided_at,
           'on_guapd', q.recorded_channel = 'portal')
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
      'quote', v_quote,
      'agreed_total_paise', e.brand_service_total_paise,
      'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
      'signoff_at', e.brand_signoff_at, 'signoff_on_guapd', e.brand_signoff_channel = 'portal',
      'completed_at', e.guapd_signoff_at,
      'is_admin', v_admin IS TRUE)
    INTO v FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = p_experience_id;
  RETURN v;
END;
$$;

-- The roster as the brand reviews it: names, handles, profile links and each
-- creator's planned deliverables. No rate, leg, note, outcome or creator id.
CREATE OR REPLACE FUNCTION brand_experience_roster(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_rows jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IN ('requested', 'cancelled') THEN
    RETURN jsonb_build_object('can_decide', false, 'creators', '[]'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'roster_id', r.id, 'full_name', c.full_name, 'handle', experience_clean_handle(c.handle),
      'profile_url', CASE WHEN experience_clean_handle(c.handle) IS NOT NULL THEN 'https://instagram.com/' || experience_clean_handle(c.handle) END,
      'photo_url', c.profile_photo_url, 'planned_deliverables', r.planned_deliverables,
      'added_by', r.added_by, 'decision', r.brand_decision, 'decided_at', r.decided_at,
      'decided_on_guapd', r.decision_channel = 'portal', 'locked', r.locked
    ) ORDER BY r.locked DESC, r.created_at), '[]'::jsonb)
    INTO v_rows
    FROM experience_roster r JOIN creators c ON c.id = r.creator_id
    WHERE r.experience_id = p_experience_id;
  RETURN jsonb_build_object('can_decide', v_status IN ('rostering', 'confirmed'), 'creators', v_rows);
END;
$$;

-- Released deliverables (0538), now on the shared gate; the creator's name
-- comes through the roster, not deals.
CREATE OR REPLACE FUNCTION brand_experience_deliverables(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text; v_brand text; v_date date; v_city text; v_status text; v_items jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.title, b.name, e.shoot_date, e.shoot_city, e.status INTO v_title, v_brand, v_date, v_city, v_status
    FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = p_experience_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'release_id', x.id, 'creator_name', c.full_name, 'label', x.label,
           'kind', CASE WHEN x.external_url IS NOT NULL THEN 'link' ELSE 'file' END,
           'url', x.external_url, 'file_name', x.file_name, 'shared_at', x.released_at,
           'decision', x.brand_decision, 'decided_at', x.brand_decided_at,
           -- What the brand asked to change: only when the brand wrote it themselves
           -- on Guapd. A note staff recorded for them stays staff-side (0538 rule).
           'changes_asked', CASE WHEN x.brand_decision_channel = 'portal' THEN x.brand_decision_note END,
           'decided_on_guapd', x.brand_decision_channel = 'portal',
           'can_decide', v_status IS DISTINCT FROM 'complete' AND x.brand_decision IS DISTINCT FROM 'approved'
         ) ORDER BY c.full_name, array_position(ARRAY['UGC video', 'Reel', 'Story', 'Static post', 'Photo set'], experience_item_type(x.label)), x.label), '[]'::jsonb)
    INTO v_items
    FROM experience_deliverable_releases x
    LEFT JOIN experience_roster r ON r.experience_id = x.experience_id AND r.leg_deal_id = x.deal_id
    LEFT JOIN creators c ON c.id = r.creator_id
    WHERE x.experience_id = p_experience_id AND x.status = 'shared';
  RETURN jsonb_build_object('title', v_title, 'brand_name', v_brand, 'shoot_date', v_date, 'shoot_city', v_city, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION brand_experience_release_file(p_release_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_path text; v_name text;
BEGIN
  SELECT x.experience_id INTO v_exp FROM experience_deliverable_releases x WHERE x.id = p_release_id;
  PERFORM brand_experience_require(v_exp, false);
  SELECT x.storage_path, x.file_name INTO v_path, v_name
    FROM experience_deliverable_releases x WHERE x.id = p_release_id AND x.status = 'shared' AND x.storage_path IS NOT NULL;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('storage_path', v_path, 'file_name', v_name);
END;
$$;

-- The brand's own issued and paid invoices (0540), on the shared gate.
CREATE OR REPLACE FUNCTION brand_experience_invoices(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text; v_items jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.title INTO v_title FROM experiences e WHERE e.id = p_experience_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'invoice_id', si.id, 'number', si.number, 'issue_date', si.issue_date, 'due_date', si.due_date,
           'description', si.description, 'subtotal_paise', si.subtotal_paise,
           'gst_paise', coalesce(si.cgst_paise, 0) + coalesce(si.sgst_paise, 0) + coalesce(si.igst_paise, 0),
           'total_paise', si.total_paise,
           'paid_paise', experience_invoice_paid_paise(si.id),
           'status', CASE WHEN si.status = 'paid' THEN 'paid'
                          WHEN experience_invoice_paid_paise(si.id) > 0 THEN 'part_paid' ELSE 'due' END,
           'has_pdf', si.pdf_path IS NOT NULL
         ) ORDER BY si.issue_date, si.number), '[]'::jsonb)
    INTO v_items
    FROM service_invoices si WHERE si.experience_id = p_experience_id AND si.status IN ('issued', 'paid');
  RETURN jsonb_build_object('title', v_title, 'invoices', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION brand_experience_invoice_file(p_invoice_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_path text; v_number text;
BEGIN
  SELECT si.experience_id INTO v_exp FROM service_invoices si WHERE si.id = p_invoice_id;
  PERFORM brand_experience_require(v_exp, false);
  SELECT si.pdf_path, si.number INTO v_path, v_number
    FROM service_invoices si WHERE si.id = p_invoice_id AND si.status IN ('issued', 'paid') AND si.pdf_path IS NOT NULL;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('storage_path', v_path, 'file_name', replace(v_number, '/', '-') || '.pdf');
END;
$$;

-- The end-of-Experience report (Phase 2.5, folded in here). Complete only.
-- EXPLICIT fields: title, dates, city; the locked roster's names, handles and
-- profile links (creators who shot); the delivered items with the brand's
-- decision; the brand's own invoices. Creator names come through
-- experience_roster -> creators (full_name, handle) only. No join to deals,
-- experience_creator_terms, experience_finance, costs, payouts or counters;
-- no rate, payout, margin or cost field exists in what it returns.
CREATE OR REPLACE FUNCTION brand_experience_report(p_experience_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v jsonb; v_creators jsonb; v_items jsonb;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id;
  IF v_status IS DISTINCT FROM 'complete' THEN RAISE EXCEPTION 'The report is ready once the Experience is complete'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'full_name', c.full_name, 'handle', experience_clean_handle(c.handle),
      'profile_url', CASE WHEN experience_clean_handle(c.handle) IS NOT NULL THEN 'https://instagram.com/' || experience_clean_handle(c.handle) END
    ) ORDER BY c.full_name), '[]'::jsonb)
    INTO v_creators
    FROM experience_roster r JOIN creators c ON c.id = r.creator_id
    WHERE r.experience_id = p_experience_id AND r.locked IS TRUE AND r.leg_shoot_outcome IS DISTINCT FROM 'did_not_shoot';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'release_id', x.id, 'creator_name', c.full_name, 'label', x.label,
      'kind', CASE WHEN x.external_url IS NOT NULL THEN 'link' ELSE 'file' END,
      'url', x.external_url, 'file_name', x.file_name, 'shared_at', x.released_at,
      'decision', x.brand_decision, 'decided_at', x.brand_decided_at
    ) ORDER BY c.full_name, array_position(ARRAY['UGC video', 'Reel', 'Story', 'Static post', 'Photo set'], experience_item_type(x.label)), x.label), '[]'::jsonb)
    INTO v_items
    FROM experience_deliverable_releases x
    LEFT JOIN experience_roster r ON r.experience_id = x.experience_id AND r.leg_deal_id = x.deal_id
    LEFT JOIN creators c ON c.id = r.creator_id
    WHERE x.experience_id = p_experience_id AND x.status = 'shared';

  SELECT jsonb_build_object('title', e.title, 'brand_name', b.name, 'requested_at', e.requested_at,
      'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city, 'completed_at', e.guapd_signoff_at,
      'creators', v_creators, 'items', v_items,
      'invoices', brand_experience_invoices(p_experience_id) -> 'invoices')
    INTO v FROM experiences e JOIN brands b ON b.id = e.brand_id WHERE e.id = p_experience_id;
  RETURN v;
END;
$$;

-- ═════ G. Brand writes ═════
CREATE OR REPLACE FUNCTION brand_experience_request(p_title text, p_creator_count integer, p_deliverables jsonb,
  p_affiliate boolean, p_affiliate_per_creator integer, p_ad_rights boolean, p_ad_rights_per_creator integer, p_ad_rights_months integer,
  p_boost boolean, p_boost_per_creator integer, p_boost_months integer, p_location text, p_date_from date, p_date_to date,
  p_brief text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := my_user_id(); v_brand uuid := my_brand_id(); v_ok boolean; v_id uuid;
BEGIN
  IF v_user IS NULL OR v_brand IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT (b.brand_status = 'approved' AND b.is_guapd IS FALSE) INTO v_ok
    FROM brands b JOIN brand_members bm ON bm.brand_id = b.id AND bm.user_id = v_user WHERE b.id = v_brand;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Your brand account needs to be approved before you can request an Experience' USING ERRCODE = '42501';
  END IF;
  v_id := experience_request_insert(v_brand, p_title, p_creator_count, p_deliverables, p_affiliate, p_affiliate_per_creator,
    p_ad_rights, p_ad_rights_per_creator, p_ad_rights_months, p_boost, p_boost_per_creator, p_boost_months,
    p_location, p_date_from, p_date_to, p_brief, 'portal');
  PERFORM experience_console_audit('experience.request_submitted_by_brand', 'experiences', v_id,
    jsonb_build_object('brand_id', v_brand, 'channel', 'portal', 'creators', p_creator_count,
      'videos_per_creator', experience_plan_count(p_deliverables, true), 'status_after', 'requested'));
  RETURN v_id;
END;
$$;

-- Guapd's quote: a brand ADMIN accepts it, or declines with a note. No
-- counter-price on Guapd (staff record a brand's counter).
CREATE OR REPLACE FUNCTION brand_experience_quote_answer(p_quote_id uuid, p_accept boolean, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_by text; v_status text; v jsonb; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT q.experience_id INTO v_exp FROM experience_quotes q WHERE q.id = p_quote_id;
  PERFORM brand_experience_require(v_exp, true);
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Accept or decline'; END IF;
  SELECT q.proposed_by, q.status INTO v_by, v_status FROM experience_quotes q WHERE q.id = p_quote_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'This quote changed since you opened the page. Refresh to see the latest'; END IF;
  IF v_by IS DISTINCT FROM 'guapd' THEN RAISE EXCEPTION 'This is your counter: Guapd answers it'; END IF;
  IF p_accept THEN
    v := experience_quote_accept_apply(p_quote_id, 'portal');
    PERFORM experience_console_audit('experience.quote_accepted_by_brand', 'experiences', v_exp, v - 'experience_id');
  ELSE
    IF length(coalesce(v_note, '')) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Tell Guapd what would work (3 to 1,000 characters)'; END IF;
    UPDATE experience_quotes SET status = 'rejected', decided_at = now(), decided_by = my_user_id(),
      recorded_channel = 'portal', brand_note = v_note WHERE id = p_quote_id;
    PERFORM experience_console_audit('experience.quote_declined_by_brand', 'experience_quotes', p_quote_id,
      jsonb_build_object('experience_id', v_exp, 'note_length', length(v_note)));
  END IF;
END;
$$;

-- A roster creator: any member accepts or rejects, until the creator is locked.
-- p_expected is the decision the screen showed (stale screen refused).
CREATE OR REPLACE FUNCTION brand_experience_roster_decide(p_roster_id uuid, p_decision text, p_expected text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; r_locked boolean; r_decision text; r_creator uuid;
BEGIN
  SELECT r.experience_id INTO v_exp FROM experience_roster r WHERE r.id = p_roster_id;
  PERFORM brand_experience_require(v_exp, false);
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected') THEN RAISE EXCEPTION 'Accept or reject'; END IF;
  IF p_expected IS NULL THEN RAISE EXCEPTION 'Refresh the page and try again'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT r.locked, r.brand_decision, r.creator_id INTO r_locked, r_decision, r_creator FROM experience_roster r WHERE r.id = p_roster_id FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('rostering', 'confirmed') THEN RAISE EXCEPTION 'The roster is closed'; END IF;
  IF r_locked IS NOT FALSE THEN RAISE EXCEPTION 'This creator is confirmed on the roster and can no longer change'; END IF;
  IF r_decision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'This changed since you opened the page. Refresh to see the latest'; END IF;
  UPDATE experience_roster SET brand_decision = p_decision, decision_channel = 'portal', decided_at = now(), updated_at = now()
    WHERE id = p_roster_id;
  PERFORM experience_console_audit('experience.roster_decision_by_brand', 'experience_roster', p_roster_id,
    jsonb_build_object('experience_id', v_exp, 'creator_id', r_creator, 'decision_before', r_decision, 'decision_after', p_decision, 'channel', 'portal'));
END;
$$;

-- A shared deliverable: any member approves or asks for changes (with a
-- note). Approval is final, as on the staff path.
CREATE OR REPLACE FUNCTION brand_experience_release_decide(p_release_id uuid, p_decision text, p_note text, p_expected text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_rstatus text; v_before text; v_item uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT x.experience_id INTO v_exp FROM experience_deliverable_releases x WHERE x.id = p_release_id;
  PERFORM brand_experience_require(v_exp, false);
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'changes_requested') THEN RAISE EXCEPTION 'Approve, or ask for changes'; END IF;
  -- 'new' = no decision yet on the screen.
  IF p_expected IS NULL THEN RAISE EXCEPTION 'Refresh the page and try again'; END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT x.status, x.brand_decision, x.item_id INTO v_rstatus, v_before, v_item
    FROM experience_deliverable_releases x WHERE x.id = p_release_id FOR UPDATE;
  IF v_status = 'complete' THEN RAISE EXCEPTION 'This Experience is complete'; END IF;
  IF v_rstatus IS DISTINCT FROM 'shared' THEN RAISE EXCEPTION 'This is no longer shared with you. Refresh to see the latest'; END IF;
  IF v_before = 'approved' THEN RAISE EXCEPTION 'You already approved this'; END IF;
  IF coalesce(v_before, 'new') IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'This changed since you opened the page. Refresh to see the latest'; END IF;
  IF p_decision = 'changes_requested' AND length(coalesce(v_note, '')) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Say what to change (3 to 1,000 characters)';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 1000 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  UPDATE experience_deliverable_releases SET brand_decision = p_decision, brand_decision_channel = 'portal',
         brand_decision_note = v_note, brand_decided_at = now(), brand_decided_by = my_user_id()
    WHERE id = p_release_id;
  PERFORM experience_console_audit('experience.deliverable_decision_by_brand', 'experience_deliverable_releases', p_release_id,
    jsonb_build_object('experience_id', v_exp, 'item_id', v_item, 'decision_before', v_before, 'decision_after', p_decision,
      'channel', 'portal', 'note_length', coalesce(length(v_note), 0)));
END;
$$;

-- The brand's sign-off: an ADMIN, while deliverables are with them.
CREATE OR REPLACE FUNCTION brand_experience_signoff(p_experience_id uuid, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_at timestamptz; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM brand_experience_require(p_experience_id, true);
  SELECT e.status, e.brand_signoff_at INTO v_status, v_at FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'delivering' THEN RAISE EXCEPTION 'You sign off once the deliverables are with you'; END IF;
  IF v_at IS NOT NULL THEN RAISE EXCEPTION 'The sign-off is already recorded'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN RAISE EXCEPTION 'The note is too long'; END IF;
  UPDATE experiences SET brand_signoff_at = now(), brand_signoff_channel = 'portal', brand_signoff_note = v_note,
    brand_signoff_recorded_by = my_user_id(), updated_at = now() WHERE id = p_experience_id;
  PERFORM experience_console_audit('experience.signoff_by_brand', 'experiences', p_experience_id,
    jsonb_build_object('channel', 'portal', 'note_length', coalesce(length(v_note), 0)));
END;
$$;

-- ═════ H. Grants ═════
REVOKE ALL ON FUNCTION brand_experience_require(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION experience_request_insert(uuid, text, integer, jsonb, boolean, integer, boolean, integer, integer, boolean, integer, integer, text, date, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION experience_quote_accept_apply(uuid, text) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'brand_experiences()',
    'brand_experience(uuid)',
    'brand_experience_roster(uuid)',
    'brand_experience_deliverables(uuid)',
    'brand_experience_release_file(uuid)',
    'brand_experience_invoices(uuid)',
    'brand_experience_invoice_file(uuid)',
    'brand_experience_report(uuid)',
    'brand_experience_request(text, integer, jsonb, boolean, integer, boolean, integer, integer, boolean, integer, integer, text, date, date, text)',
    'brand_experience_quote_answer(uuid, boolean, text)',
    'brand_experience_roster_decide(uuid, text, text)',
    'brand_experience_release_decide(uuid, text, text, text)',
    'brand_experience_signoff(uuid, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END;
$$;
