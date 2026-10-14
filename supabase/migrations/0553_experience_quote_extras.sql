-- 0553: quote extras as named lines (Palak, 2026-10-12). A quote can carry
-- several extras, each with a description and an amount (travel, styling,
-- express edit ...). misc_paise stays the extras total (their sum), so the
-- quote total, the agreed price, invoices and the P&L are unchanged. Old quotes
-- keep a bare amount and no lines. The brand sees the lines on its quote;
-- console amounts stay financial only (0537). Staging first.

CREATE OR REPLACE FUNCTION experience_extras_valid(p jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_typeof(p) = 'array' AND jsonb_array_length(p) <= 20 AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p) x
    WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(x)) <> 2
       OR NOT (x ? 'label' AND x ? 'amount_paise')
       OR jsonb_typeof(x -> 'label') IS DISTINCT FROM 'string'
       OR length(btrim(x ->> 'label')) NOT BETWEEN 2 AND 120
       OR jsonb_typeof(x -> 'amount_paise') IS DISTINCT FROM 'number'
       OR (x ->> 'amount_paise') !~ '^[1-9][0-9]{0,13}$')
$$;

CREATE OR REPLACE FUNCTION experience_extras_total(p jsonb) RETURNS bigint
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(sum((x ->> 'amount_paise')::bigint), 0)::bigint FROM jsonb_array_elements(coalesce(p, '[]'::jsonb)) x
$$;

ALTER TABLE experience_quotes ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE experience_quotes DROP CONSTRAINT IF EXISTS eq_extras_lines;
ALTER TABLE experience_quotes ADD CONSTRAINT eq_extras_lines CHECK (experience_extras_valid(extras)
  AND (jsonb_array_length(extras) = 0 OR misc_paise = experience_extras_total(extras)));
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS brand_extras jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE experiences DROP CONSTRAINT IF EXISTS e_brand_extras_lines;
ALTER TABLE experiences ADD CONSTRAINT e_brand_extras_lines CHECK (experience_extras_valid(brand_extras));
-- The brand reads its own quotes (column grants, 0528): the lines are part of the price it is shown.
GRANT SELECT (extras) ON experience_quotes TO authenticated;

-- The quote, with lines. The old ten-argument version is replaced.
DROP FUNCTION IF EXISTS experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text);
CREATE OR REPLACE FUNCTION experience_console_quote(p_experience_id uuid, p_proposed_by text, p_per_video_paise bigint, p_deliverable_count integer, p_misc_paise bigint, p_deliverables jsonb, p_shoot_date date, p_shoot_city text, p_message text, p_channel text, p_extras jsonb DEFAULT NULL)
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
  v_extras jsonb := coalesce(p_extras, '[]'::jsonb);
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
    misc_paise, extras, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by)
  VALUES (p_experience_id, v_version, p_proposed_by, p_per_video_paise, p_deliverable_count, v_misc, v_extras,
    p_per_video_paise * p_deliverable_count + v_misc, coalesce(p_deliverables, '[]'::jsonb), p_shoot_date,
    nullif(btrim(p_shoot_city), ''), nullif(btrim(p_message), ''), 'open', p_channel, my_user_id())
  RETURNING id INTO v_id;

  PERFORM experience_console_audit(
    CASE WHEN p_proposed_by = 'guapd' THEN 'experience.quote_sent' ELSE 'experience.brand_counter_recorded' END,
    'experience_quotes', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'version', v_version, 'replaced_quote_id', v_prev,
      'total_paise', p_per_video_paise * p_deliverable_count + v_misc, 'extras_lines', jsonb_array_length(v_extras), 'channel', p_channel));
  RETURN v_id;
END;
$function$;

-- The brand sees the lines on its quote.
CREATE OR REPLACE FUNCTION brand_experience(p_experience_id uuid)
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
$function$;

-- Console quote history with lines (amounts financial only). Return type changes, so drop first.
DROP FUNCTION IF EXISTS experience_console_quotes(uuid);
CREATE OR REPLACE FUNCTION experience_console_quotes(p_experience_id uuid)
 RETURNS TABLE(id uuid, version integer, proposed_by text, per_video_paise bigint, deliverable_count integer, misc_paise bigint, extras jsonb, total_paise bigint, deliverables jsonb, shoot_date date, shoot_city text, message text, status text, recorded_channel text, created_at timestamp with time zone, decided_at timestamp with time zone, created_by_name text, brand_note text)
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
           q.created_at, q.decided_at, coalesce(u.full_name, u.email), CASE WHEN v_fin THEN q.brand_note END
    FROM experience_quotes q LEFT JOIN users u ON u.id = q.created_by
    WHERE q.experience_id = p_experience_id
    ORDER BY q.version DESC;
END;
$function$;

-- Accepting copies the lines onto the Experience.
CREATE OR REPLACE FUNCTION experience_quote_accept_apply(p_quote_id uuid, p_channel text)
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
  SELECT id, experience_id, version, proposed_by, per_video_paise, deliverable_count, misc_paise, total_paise, deliverables, shoot_date, shoot_city, message, status, recorded_channel, created_by, created_at, decided_at, decided_by, brand_note, extras INTO q FROM experience_quotes WHERE id = p_quote_id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION experience_console_get(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
  v_fin boolean;
BEGIN
  PERFORM experience_console_require();
  v_fin := has_experience_access('financial');
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
    -- The brand's price: financial access only (0537), so operational staff cannot derive the margin.
    'can_see_brand_price', v_fin,
    'brand_per_video_paise', CASE WHEN v_fin THEN e.brand_per_video_paise END,
    'brand_deliverable_count', e.brand_deliverable_count,
    'brand_misc_paise', CASE WHEN v_fin THEN e.brand_misc_paise END,
    'brand_extras', CASE WHEN v_fin THEN e.brand_extras END,
    'brand_service_total_paise', CASE WHEN v_fin THEN e.brand_service_total_paise END,
    'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city, 'agreed_plan', e.agreed_plan,
    'created_at', e.created_at, 'updated_at', e.updated_at
  ) INTO v
  FROM experiences e JOIN brands b ON b.id = e.brand_id
  WHERE e.id = p_experience_id;
  RETURN v;
END;
$function$;

REVOKE EXECUTE ON FUNCTION experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION experience_console_quotes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_quotes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_quote(uuid, text, bigint, integer, bigint, jsonb, date, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION experience_console_quotes(uuid) TO service_role;
