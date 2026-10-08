-- Stage 2 follow-up: the request is a PER-CREATOR PLAN, not just a total.
-- RUN BY HAND, in the pieces given. Verify with docs/test-cases.md §101.
--
-- Uniform plan: "N creators, each doing the same thing".
--   request_creator_count          creators wanted (e.g. 10)
--   request_deliverables           now PER CREATOR (e.g. 2 UGC video + 1 Story each)
--   request_affiliate_per_creator  of each creator's VIDEOS, how many carry the affiliate link
--   request_ad_rights_per_creator  of each creator's videos, how many the ad rights cover (NULL = all)
--   request_boost_per_creator      same, for boost (NULL = all)
-- "Videos" are the video types (UGC video, Reel). Stories, static posts and
-- photo sets are in the plan and its totals, but are not priced per video.
--
-- On accept, the plan is copied into experiences.agreed_plan with its totals and
-- the number of videos actually sold (the accepted quote's count, which staff
-- may have negotiated away from the plan). That snapshot is the contract.
-- Stage 3 reconciles against it: the SUM of all creators' actual deliverables
-- must equal the agreed totals. Individual creators may differ from the
-- per-creator template; only the combined total is enforced.

-- ── 1. Columns ──────────────────────────────────────────────────────────────
ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS request_creator_count         int,
  ADD COLUMN IF NOT EXISTS request_affiliate_per_creator int,
  ADD COLUMN IF NOT EXISTS request_ad_rights_per_creator int,
  ADD COLUMN IF NOT EXISTS request_boost_per_creator     int,
  ADD COLUMN IF NOT EXISTS agreed_plan                   jsonb;
ALTER TABLE experiences DROP CONSTRAINT IF EXISTS experiences_plan_shape;
ALTER TABLE experiences ADD CONSTRAINT experiences_plan_shape CHECK (
  (request_creator_count IS NULL OR request_creator_count > 0)
  AND (request_affiliate_per_creator IS NULL OR (request_affiliate AND request_affiliate_per_creator > 0))
  AND (request_ad_rights_per_creator IS NULL OR (request_ad_rights AND request_ad_rights_per_creator > 0))
  AND (request_boost_per_creator IS NULL OR (request_boost AND request_boost_per_creator > 0))
  AND (agreed_plan IS NULL OR jsonb_typeof(agreed_plan) = 'object')
);
GRANT SELECT (request_creator_count, request_affiliate_per_creator, request_ad_rights_per_creator,
              request_boost_per_creator, agreed_plan)
  ON experiences TO authenticated;

-- ── 2. Plan arithmetic (one definition, used by every function below) ───────
CREATE OR REPLACE FUNCTION experience_plan_count(p_items jsonb, p_videos_only boolean)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(sum(CASE WHEN (d ->> 'count') ~ '^[0-9]+$' THEN (d ->> 'count')::int ELSE 0 END), 0)::int
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) d
  WHERE NOT p_videos_only OR d ->> 'type' IN ('UGC video', 'Reel')
$$;

CREATE OR REPLACE FUNCTION experience_plan_totals(p_items jsonb, p_creators int)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('type', t.type, 'per_creator', t.n, 'total', t.n * coalesce(p_creators, 1)) ORDER BY t.type), '[]'::jsonb)
  FROM (
    SELECT d ->> 'type' AS type, sum((d ->> 'count')::int)::int AS n
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) d
    WHERE (d ->> 'count') ~ '^[0-9]+$'
    GROUP BY d ->> 'type'
  ) t
$$;

-- ── 3. Record a request: the new signature (drop the 0530 one first) ────────
DROP FUNCTION IF EXISTS experience_console_create(uuid, text, jsonb, boolean, boolean, int, boolean, int, text, date, date, text, text);

CREATE OR REPLACE FUNCTION experience_console_create(
  p_brand_id uuid, p_title text, p_creator_count int, p_deliverables jsonb,
  p_affiliate boolean, p_affiliate_per_creator int,
  p_ad_rights boolean, p_ad_rights_per_creator int, p_ad_rights_months int,
  p_boost boolean, p_boost_per_creator int, p_boost_months int,
  p_location text, p_date_from date, p_date_to date, p_brief text, p_channel text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand brands%ROWTYPE;
  v_tpl deal_templates%ROWTYPE;
  v_id uuid;
  v_videos int;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO v_brand FROM brands WHERE id = p_brand_id;
  IF v_brand.id IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  IF v_brand.is_guapd THEN RAISE EXCEPTION 'An Experience is for a real brand, not the Guapd house account'; END IF;
  IF v_brand.brand_status = 'rejected' THEN RAISE EXCEPTION 'That brand is rejected'; END IF;
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
  SELECT * INTO v_tpl FROM deal_templates WHERE slug = 'experience-ugc-day-shoot' AND is_active ORDER BY version DESC LIMIT 1;

  INSERT INTO experiences (brand_id, title, status, template_id, template_version, settings_snapshot,
    request_creator_count, request_deliverables,
    request_affiliate, request_affiliate_per_creator,
    request_ad_rights, request_ad_rights_per_creator, request_ad_rights_months,
    request_boost, request_boost_per_creator, request_boost_months,
    request_location, request_date_from, request_date_to, request_brief,
    request_channel, requested_at, created_by)
  VALUES (p_brand_id, btrim(p_title), 'requested', v_tpl.id, v_tpl.version, v_tpl.settings,
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
$$;

-- ── 4. Reads carry the plan and its totals ──────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_get(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT jsonb_build_object(
    'id', e.id, 'title', e.title, 'status', e.status, 'brand_id', e.brand_id, 'brand_name', b.name,
    'request_creator_count', e.request_creator_count,
    'request_deliverables', e.request_deliverables,
    'plan_totals', experience_plan_totals(e.request_deliverables, e.request_creator_count),
    'plan_videos_per_creator', experience_plan_count(e.request_deliverables, true),
    'plan_videos_total', experience_plan_count(e.request_deliverables, true) * coalesce(e.request_creator_count, 1),
    'request_affiliate', e.request_affiliate, 'request_affiliate_per_creator', e.request_affiliate_per_creator,
    'request_ad_rights', e.request_ad_rights, 'request_ad_rights_per_creator', e.request_ad_rights_per_creator,
    'request_ad_rights_months', e.request_ad_rights_months,
    'request_boost', e.request_boost, 'request_boost_per_creator', e.request_boost_per_creator,
    'request_boost_months', e.request_boost_months,
    'request_location', e.request_location, 'request_date_from', e.request_date_from,
    'request_date_to', e.request_date_to, 'request_brief', e.request_brief,
    'request_channel', e.request_channel, 'requested_at', e.requested_at,
    'brand_per_video_paise', e.brand_per_video_paise, 'brand_deliverable_count', e.brand_deliverable_count,
    'brand_misc_paise', e.brand_misc_paise, 'brand_service_total_paise', e.brand_service_total_paise,
    'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city, 'agreed_plan', e.agreed_plan,
    'created_at', e.created_at, 'updated_at', e.updated_at
  ) INTO v
  FROM experiences e JOIN brands b ON b.id = e.brand_id
  WHERE e.id = p_experience_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_list()
RETURNS TABLE (id uuid, title text, status text, brand_name text, shoot_date date, shoot_city text,
               request_location text, request_date_from date, request_date_to date,
               requested_videos int, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_experience_access('operational') THEN
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
$$;

-- ── 5. Accept also locks the plan (the contract Stage 3 reconciles to) ──────
CREATE OR REPLACE FUNCTION experience_console_accept(p_quote_id uuid, p_channel text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q experience_quotes%ROWTYPE;
  e experiences%ROWTYPE;
  v_plan jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO q FROM experience_quotes WHERE id = p_quote_id FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  SELECT * INTO e FROM experiences WHERE id = q.experience_id FOR UPDATE;
  IF e.status <> 'requested' THEN RAISE EXCEPTION 'The price is already agreed'; END IF;
  IF q.status <> 'open' THEN RAISE EXCEPTION 'Only the current open quote can be accepted'; END IF;
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
$$;

-- ── 6. Grants ───────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION experience_plan_count(jsonb, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_plan_totals(jsonb, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_create(uuid, text, int, jsonb, boolean, int, boolean, int, int, boolean, int, int, text, date, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_create(uuid, text, int, jsonb, boolean, int, boolean, int, int, boolean, int, int, text, date, date, text, text) TO authenticated;
