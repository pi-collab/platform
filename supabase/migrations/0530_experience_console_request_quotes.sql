-- Phase 3, stage 2: request intake and the quote negotiation, for the Guapd
-- Experiences STAFF console (/experiences-admin). RUN BY HAND, in the pieces
-- given. Verify with docs/test-cases.md §100.
--
-- Every read AND write goes through a SECURITY DEFINER function that checks the
-- CALLER's operational access (staff_access, 0526) first. Called with a brand,
-- creator, outreach or anonymous session, or the service role, they refuse.
-- Writes are atomic and write their own ops_events row in the same transaction,
-- so a change can never land without its audit entry.
--
-- The rules live here, not in the app:
--   * status only moves FORWARD, one step at a time: a request starts
--     'requested'; accepting a quote moves it to 'rostering'. Nothing here can
--     reach 'complete' or 'cancelled'.
--   * quotes are only taken while the Experience is 'requested' (once a quote is
--     accepted, the price is locked).
--   * a new quote or a recorded brand counter REPLACES the open one
--     (superseded); there is at most one open quote (eq_one_open, 0528).
--   * the total is computed here (per video x count + misc), never trusted from
--     the caller, and checked again by eq_total_formula.
--   * accepting needs a shoot date and city on the quote, and locks the brand
--     price, date and city onto the Experience.
-- No creator rate, cost, payout or margin is read or returned by anything here.

-- ── 1. Internal helpers (not callable by anyone) ────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_require() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_experience_access('operational') THEN
    RAISE EXCEPTION 'Operational access required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_audit(p_action text, p_target_table text, p_target_id uuid, p_detail jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF auth.uid() IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'No signed-in user to audit';
  END IF;
  INSERT INTO ops_events (actor_email, actor_auth_id, action, target_table, target_id, detail)
  VALUES (v_email, auth.uid(), p_action, p_target_table, p_target_id, coalesce(p_detail, '{}'::jsonb));
END;
$$;

-- ── 2. Reads ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_brands()
RETURNS TABLE (id uuid, name text, brand_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT b.id, b.name, b.brand_status FROM brands b
    WHERE NOT b.is_guapd AND b.brand_status <> 'rejected'
    ORDER BY lower(b.name);
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_get(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_console_require();
  SELECT jsonb_build_object(
    'id', e.id, 'title', e.title, 'status', e.status, 'brand_id', e.brand_id, 'brand_name', b.name,
    'request_deliverables', e.request_deliverables, 'request_affiliate', e.request_affiliate,
    'request_ad_rights', e.request_ad_rights, 'request_ad_rights_months', e.request_ad_rights_months,
    'request_boost', e.request_boost, 'request_boost_months', e.request_boost_months,
    'request_location', e.request_location, 'request_date_from', e.request_date_from,
    'request_date_to', e.request_date_to, 'request_brief', e.request_brief,
    'request_channel', e.request_channel, 'requested_at', e.requested_at,
    'brand_per_video_paise', e.brand_per_video_paise, 'brand_deliverable_count', e.brand_deliverable_count,
    'brand_misc_paise', e.brand_misc_paise, 'brand_service_total_paise', e.brand_service_total_paise,
    'shoot_date', e.shoot_date, 'shoot_city', e.shoot_city,
    'created_at', e.created_at, 'updated_at', e.updated_at
  ) INTO v
  FROM experiences e JOIN brands b ON b.id = e.brand_id
  WHERE e.id = p_experience_id;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION experience_console_quotes(p_experience_id uuid)
RETURNS TABLE (id uuid, version int, proposed_by text, per_video_paise bigint, deliverable_count int,
               misc_paise bigint, total_paise bigint, deliverables jsonb, shoot_date date, shoot_city text,
               message text, status text, recorded_channel text, created_at timestamptz,
               decided_at timestamptz, created_by_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM experience_console_require();
  RETURN QUERY
    SELECT q.id, q.version, q.proposed_by, q.per_video_paise, q.deliverable_count, q.misc_paise, q.total_paise,
           q.deliverables, q.shoot_date, q.shoot_city, q.message, q.status, q.recorded_channel,
           q.created_at, q.decided_at, coalesce(u.full_name, u.email)
    FROM experience_quotes q LEFT JOIN users u ON u.id = q.created_by
    WHERE q.experience_id = p_experience_id
    ORDER BY q.version DESC;
END;
$$;

-- ── 3. Write: record a brand's request ──────────────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_create(
  p_brand_id uuid, p_title text, p_deliverables jsonb,
  p_affiliate boolean, p_ad_rights boolean, p_ad_rights_months int, p_boost boolean, p_boost_months int,
  p_location text, p_date_from date, p_date_to date, p_brief text, p_channel text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand brands%ROWTYPE;
  v_tpl deal_templates%ROWTYPE;
  v_id uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO v_brand FROM brands WHERE id = p_brand_id;
  IF v_brand.id IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  IF v_brand.is_guapd THEN RAISE EXCEPTION 'An Experience is for a real brand, not the Guapd house account'; END IF;
  IF v_brand.brand_status = 'rejected' THEN RAISE EXCEPTION 'That brand is rejected'; END IF;
  IF coalesce(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'Give the Experience a title'; END IF;
  IF p_channel IS NULL THEN RAISE EXCEPTION 'Say how the request arrived'; END IF;
  IF jsonb_typeof(coalesce(p_deliverables, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_deliverables, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Add at least one deliverable';
  END IF;
  SELECT * INTO v_tpl FROM deal_templates WHERE slug = 'experience-ugc-day-shoot' AND is_active ORDER BY version DESC LIMIT 1;

  INSERT INTO experiences (brand_id, title, status, template_id, template_version, settings_snapshot,
    request_deliverables, request_affiliate, request_ad_rights, request_ad_rights_months, request_boost,
    request_boost_months, request_location, request_date_from, request_date_to, request_brief,
    request_channel, requested_at, created_by)
  VALUES (p_brand_id, btrim(p_title), 'requested', v_tpl.id, v_tpl.version, v_tpl.settings,
    p_deliverables, coalesce(p_affiliate, false), coalesce(p_ad_rights, false),
    CASE WHEN p_ad_rights THEN p_ad_rights_months END, coalesce(p_boost, false),
    CASE WHEN p_boost THEN p_boost_months END, nullif(btrim(p_location), ''), p_date_from, p_date_to,
    nullif(btrim(p_brief), ''), p_channel, now(), my_user_id())
  RETURNING id INTO v_id;

  PERFORM experience_console_audit('experience.request_recorded', 'experiences', v_id,
    jsonb_build_object('brand_id', p_brand_id, 'channel', p_channel, 'status_after', 'requested'));
  RETURN v_id;
END;
$$;

-- ── 4. Write: a Guapd quote, or the brand's counter recorded by staff ───────
CREATE OR REPLACE FUNCTION experience_console_quote(
  p_experience_id uuid, p_proposed_by text, p_per_video_paise bigint, p_deliverable_count int,
  p_misc_paise bigint, p_deliverables jsonb, p_shoot_date date, p_shoot_city text, p_message text,
  p_channel text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_prev uuid;
  v_version int;
  v_id uuid;
  v_misc bigint := coalesce(p_misc_paise, 0);
BEGIN
  PERFORM experience_console_require();
  SELECT status INTO v_status FROM experiences WHERE id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF v_status <> 'requested' THEN RAISE EXCEPTION 'The price is already agreed; quotes are closed'; END IF;
  IF p_proposed_by NOT IN ('guapd', 'brand') THEN RAISE EXCEPTION 'A quote is from Guapd or the brand'; END IF;
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
$$;

-- ── 5. Write: the open quote is accepted; lock the agreed terms ─────────────
-- A Guapd quote is accepted BY THE BRAND (staff record it, with the channel).
-- A brand counter is accepted BY GUAPD (staff accept it here).
CREATE OR REPLACE FUNCTION experience_console_accept(p_quote_id uuid, p_channel text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q experience_quotes%ROWTYPE;
  v_status text;
BEGIN
  PERFORM experience_console_require();
  SELECT * INTO q FROM experience_quotes WHERE id = p_quote_id FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Quote not found'; END IF;
  SELECT status INTO v_status FROM experiences WHERE id = q.experience_id FOR UPDATE;
  IF v_status <> 'requested' THEN RAISE EXCEPTION 'The price is already agreed'; END IF;
  IF q.status <> 'open' THEN RAISE EXCEPTION 'Only the current open quote can be accepted'; END IF;
  IF q.proposed_by = 'guapd' AND p_channel IS NULL THEN RAISE EXCEPTION 'Say how the brand accepted'; END IF;
  IF q.shoot_date IS NULL OR q.shoot_city IS NULL THEN RAISE EXCEPTION 'The quote needs a shoot date and city before it can be accepted'; END IF;

  UPDATE experience_quotes SET status = 'accepted', decided_at = now(), decided_by = my_user_id(),
    recorded_channel = coalesce(p_channel, recorded_channel)
    WHERE id = q.id;
  UPDATE experiences SET
    brand_per_video_paise = q.per_video_paise, brand_deliverable_count = q.deliverable_count,
    brand_misc_paise = q.misc_paise, brand_service_total_paise = q.total_paise,
    shoot_date = q.shoot_date, shoot_city = q.shoot_city,
    status = 'rostering', updated_at = now()
    WHERE id = q.experience_id;

  PERFORM experience_console_audit('experience.quote_accepted', 'experiences', q.experience_id,
    jsonb_build_object('quote_id', q.id, 'version', q.version, 'accepted_by', CASE WHEN q.proposed_by = 'guapd' THEN 'brand' ELSE 'guapd' END,
      'channel', p_channel, 'total_paise', q.total_paise, 'shoot_date', q.shoot_date, 'shoot_city', q.shoot_city,
      'status_before', 'requested', 'status_after', 'rostering'));
END;
$$;

-- ── 6. Who may call what ────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION experience_console_require()                            FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_console_audit(text, text, uuid, jsonb)       FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_console_brands()                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_get(uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_quotes(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_create(uuid, text, jsonb, boolean, boolean, int, boolean, int, text, date, date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_quote(uuid, text, bigint, int, bigint, jsonb, date, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_accept(uuid, text)                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_brands()                             TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_get(uuid)                            TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_quotes(uuid)                         TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_create(uuid, text, jsonb, boolean, boolean, int, boolean, int, text, date, date, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_quote(uuid, text, bigint, int, bigint, jsonb, date, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_accept(uuid, text)                   TO authenticated;
