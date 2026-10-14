-- 0554: Experiences. Add-ons to the agreed price (Palak, 2026-10-12, Phase A of
-- extra deliverables). After the brand has agreed the price, Guapd can offer
-- more: extra deliverables (e.g. +10 UGC videos at the per-video price) and
-- named extras lines (0553). The brand accepts or declines it on Guapd, or
-- finance records the answer with the channel it came through, as for quotes.
--
-- On accept the agreed plan grows: per-type totals, plan videos and videos
-- sold go up by the add-on, so every reconcile, the delivery progress and the
-- completion check now expect the extra work; the agreed total goes up by the
-- add-on total, so the invoices panel and the P&L see it. Rights (affiliate, ad
-- rights, boost) are unchanged by an add-on.
--
-- One open add-on per Experience. Sending a new one while one is open replaces
-- it (superseded), which is how Guapd revises an add-on. Finance only for the
-- price (0537); operational staff see what it adds and its status.
-- Function access only: no policies, no grants. Staging first.

-- What an add-on adds: known types, whole counts 1..1000, each type once, at most 10 lines.
CREATE OR REPLACE FUNCTION experience_addon_deliverables_valid(p jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_typeof(p) = 'array' AND jsonb_array_length(p) <= 10
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p) x
      WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
         OR (SELECT count(*) FROM jsonb_object_keys(x)) <> 2
         OR (x ->> 'type') IS NULL OR (x ->> 'type') NOT IN ('UGC video', 'Reel', 'Story', 'Static post', 'Photo set')
         OR jsonb_typeof(x -> 'count') IS DISTINCT FROM 'number'
         OR (x ->> 'count') !~ '^[1-9][0-9]{0,3}$' OR (x ->> 'count')::int > 1000)
    AND (SELECT count(DISTINCT x ->> 'type') FROM jsonb_array_elements(p) x) = jsonb_array_length(p)
$$;

CREATE TABLE IF NOT EXISTS experience_addons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id     uuid NOT NULL REFERENCES experiences (id),
  number            int  NOT NULL CHECK (number > 0),
  deliverables      jsonb NOT NULL DEFAULT '[]'::jsonb,
  videos            int  NOT NULL CHECK (videos >= 0),
  per_video_paise   bigint NOT NULL DEFAULT 0 CHECK (per_video_paise >= 0),
  extras            jsonb NOT NULL DEFAULT '[]'::jsonb,
  misc_paise        bigint NOT NULL DEFAULT 0 CHECK (misc_paise >= 0),
  total_paise       bigint NOT NULL CHECK (total_paise > 0),
  message           text CHECK (message IS NULL OR length(message) <= 2000),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'superseded', 'accepted', 'declined', 'withdrawn')),
  recorded_channel  text CHECK (recorded_channel IS NULL OR recorded_channel IN ('portal', 'whatsapp', 'email', 'call', 'in_person')),
  brand_note        text CHECK (brand_note IS NULL OR length(brand_note) <= 1000),
  created_by        uuid REFERENCES users (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,
  decided_by        uuid REFERENCES users (id),
  CONSTRAINT ea_number_unique UNIQUE (experience_id, number),
  CONSTRAINT ea_deliverables_shape CHECK (experience_addon_deliverables_valid(deliverables)),
  CONSTRAINT ea_videos CHECK (videos = experience_video_count(deliverables)),
  CONSTRAINT ea_extras CHECK (experience_extras_valid(extras) AND misc_paise = experience_extras_total(extras)),
  CONSTRAINT ea_total CHECK (total_paise = per_video_paise * videos + misc_paise),
  CONSTRAINT ea_priced_videos CHECK (videos = 0 OR per_video_paise > 0),
  CONSTRAINT ea_something CHECK (jsonb_array_length(deliverables) > 0 OR jsonb_array_length(extras) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ea_one_open ON experience_addons (experience_id) WHERE status = 'open';
COMMENT ON TABLE experience_addons IS '0554: add-ons to the agreed brand price. Function access only.';
ALTER TABLE experience_addons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_addons FROM anon, authenticated;

-- Accepted add-ons are their own amount on the Experience, so the agreed total
-- stays a checked sum: per video x count + quote extras + accepted add-ons.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS brand_addons_paise bigint NOT NULL DEFAULT 0 CHECK (brand_addons_paise >= 0);
ALTER TABLE experiences DROP CONSTRAINT IF EXISTS experiences_brand_total_formula;
ALTER TABLE experiences ADD CONSTRAINT experiences_brand_total_formula CHECK (
  brand_per_video_paise IS NULL OR brand_deliverable_count IS NULL
  OR brand_service_total_paise = brand_per_video_paise * brand_deliverable_count + brand_misc_paise + brand_addons_paise
);

-- The add-on grows the agreed plan: per-type totals, plan videos, videos sold.
CREATE OR REPLACE FUNCTION experience_plan_add(p_plan jsonb, p_add jsonb, p_addon_id uuid) RETURNS jsonb
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_plan
    || jsonb_build_object(
         'totals', (
           SELECT coalesce(jsonb_agg(jsonb_build_object('type', t.type, 'per_creator', t.per_creator, 'total', t.total) ORDER BY t.type), '[]'::jsonb)
           FROM (
             SELECT coalesce(a.type, b.type) AS type,
                    coalesce(a.per_creator, 0) AS per_creator,
                    coalesce(a.total, 0) + coalesce(b.n, 0) AS total
             FROM (SELECT x ->> 'type' AS type, (x ->> 'per_creator')::int AS per_creator, (x ->> 'total')::int AS total
                   FROM jsonb_array_elements(coalesce(p_plan -> 'totals', '[]'::jsonb)) x) a
             FULL JOIN (SELECT y ->> 'type' AS type, (y ->> 'count')::int AS n FROM jsonb_array_elements(p_add) y) b ON b.type = a.type
           ) t),
         'plan_videos', coalesce((p_plan ->> 'plan_videos')::int, 0) + experience_video_count(p_add),
         'videos_sold', coalesce((p_plan ->> 'videos_sold')::int, 0) + experience_video_count(p_add),
         'addons', coalesce(p_plan -> 'addons', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('addon_id', p_addon_id, 'deliverables', p_add)))
$$;

-- The Experience can take an add-on: price agreed, not complete or cancelled.
CREATE OR REPLACE FUNCTION experience_addon_window(p_status text) RETURNS boolean
  LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(p_status IN ('rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering'), false)
$$;

-- Guapd sends an add-on (finance). An open one is replaced (superseded): that is how it is revised.
CREATE OR REPLACE FUNCTION experience_console_addon_send(p_experience_id uuid, p_deliverables jsonb, p_per_video_paise bigint,
  p_extras jsonb, p_message text, p_expected_total_paise bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_add jsonb := coalesce(p_deliverables, '[]'::jsonb); v_extras jsonb := coalesce(p_extras, '[]'::jsonb);
  v_videos int; v_pv bigint := coalesce(p_per_video_paise, 0); v_misc bigint; v_total bigint; v_n int; v_prev uuid; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  SELECT e.status INTO v_status FROM experiences e WHERE e.id = p_experience_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Experience not found'; END IF;
  IF experience_addon_window(v_status) IS NOT TRUE THEN
    RAISE EXCEPTION 'An add-on is sent once the price is agreed and before Complete';
  END IF;
  IF experience_addon_deliverables_valid(v_add) IS NOT TRUE THEN
    RAISE EXCEPTION 'Each added deliverable needs a type and a count from 1 to 1,000, each type once';
  END IF;
  IF experience_extras_valid(v_extras) IS NOT TRUE THEN
    RAISE EXCEPTION 'Each extra needs a description (2 to 120 characters) and an amount above zero; at most 20';
  END IF;
  IF jsonb_array_length(v_add) = 0 AND jsonb_array_length(v_extras) = 0 THEN RAISE EXCEPTION 'Add deliverables or an extra'; END IF;
  v_videos := experience_video_count(v_add);
  IF v_videos > 0 AND v_pv <= 0 THEN RAISE EXCEPTION 'Price per video must be more than zero'; END IF;
  IF v_videos = 0 THEN v_pv := 0; END IF;
  v_misc := experience_extras_total(v_extras);
  v_total := v_pv * v_videos + v_misc;
  IF v_total <= 0 THEN RAISE EXCEPTION 'The add-on must cost something'; END IF;
  IF p_expected_total_paise IS NULL OR p_expected_total_paise IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'The total has changed. Check the figures and send again';
  END IF;
  UPDATE experience_addons SET status = 'superseded', decided_at = now(), decided_by = my_user_id()
    WHERE experience_id = p_experience_id AND status = 'open' RETURNING id INTO v_prev;
  SELECT coalesce(max(a.number), 0) + 1 INTO v_n FROM experience_addons a WHERE a.experience_id = p_experience_id;
  INSERT INTO experience_addons (experience_id, number, deliverables, videos, per_video_paise, extras, misc_paise, total_paise, message, created_by)
  VALUES (p_experience_id, v_n, v_add, v_videos, v_pv, v_extras, v_misc, v_total, nullif(left(btrim(coalesce(p_message, '')), 2000), ''), my_user_id())
  RETURNING id INTO v_id;
  PERFORM experience_console_audit('experience.addon_sent', 'experience_addons', v_id,
    jsonb_build_object('experience_id', p_experience_id, 'number', v_n, 'replaced_addon_id', v_prev, 'videos', v_videos, 'total_paise', v_total));
  RETURN v_id;
END;
$$;

-- Accepting: shared by the brand (portal) and finance (recording the answer of the brand).
CREATE OR REPLACE FUNCTION experience_addon_accept_apply(p_addon_id uuid, p_channel text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exp uuid; v_status text; v_astatus text; v_add jsonb; v_total bigint; v_number int; v_plan jsonb; v_agreed bigint;
BEGIN
  SELECT a.experience_id INTO v_exp FROM experience_addons a WHERE a.id = p_addon_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Add-on not found'; END IF;
  SELECT e.status, e.agreed_plan, e.brand_service_total_paise INTO v_status, v_plan, v_agreed FROM experiences e WHERE e.id = v_exp FOR UPDATE;
  SELECT a.status, a.deliverables, a.total_paise, a.number INTO v_astatus, v_add, v_total, v_number
    FROM experience_addons a WHERE a.id = p_addon_id FOR UPDATE;
  IF v_astatus IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'This add-on changed since you opened the page. Refresh to see the latest'; END IF;
  IF experience_addon_window(v_status) IS NOT TRUE THEN RAISE EXCEPTION 'This Experience can no longer take an add-on'; END IF;
  IF v_plan IS NULL OR v_agreed IS NULL THEN RAISE EXCEPTION 'The price is not agreed yet'; END IF;
  UPDATE experience_addons SET status = 'accepted', decided_at = now(), decided_by = my_user_id(), recorded_channel = p_channel WHERE id = p_addon_id;
  UPDATE experiences SET agreed_plan = experience_plan_add(v_plan, v_add, p_addon_id),
    brand_addons_paise = brand_addons_paise + v_total, brand_service_total_paise = v_agreed + v_total, updated_at = now()
    WHERE id = v_exp;
  RETURN jsonb_build_object('experience_id', v_exp, 'addon_id', p_addon_id, 'number', v_number, 'channel', p_channel,
    'total_paise', v_total, 'agreed_before_paise', v_agreed, 'agreed_after_paise', v_agreed + v_total,
    'videos_added', experience_video_count(v_add));
END;
$$;

-- Finance records the answer of the brand, with how it came (never On Guapd: the brand does that itself).
CREATE OR REPLACE FUNCTION experience_console_addon_answer(p_addon_id uuid, p_accept boolean, p_channel text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_exp uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  PERFORM experience_console_require();
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Accepted or declined'; END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'email', 'call', 'in_person') THEN RAISE EXCEPTION 'Say how the brand answered'; END IF;
  SELECT a.experience_id INTO v_exp FROM experience_addons a WHERE a.id = p_addon_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Add-on not found'; END IF;
  IF p_accept THEN
    v := experience_addon_accept_apply(p_addon_id, p_channel);
    PERFORM experience_console_audit('experience.addon_accepted', 'experiences', v_exp, v - 'experience_id');
  ELSE
    UPDATE experience_addons SET status = 'declined', decided_at = now(), decided_by = my_user_id(), recorded_channel = p_channel,
      brand_note = left(v_note, 1000)
      WHERE id = p_addon_id AND status = 'open';
    IF NOT FOUND THEN RAISE EXCEPTION 'This add-on changed since you opened the page. Refresh to see the latest'; END IF;
    PERFORM experience_console_audit('experience.addon_declined', 'experience_addons', p_addon_id, jsonb_build_object('experience_id', v_exp, 'channel', p_channel));
  END IF;
END;
$$;

-- Finance withdraws an open add-on.
CREATE OR REPLACE FUNCTION experience_console_addon_withdraw(p_addon_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exp uuid;
BEGIN
  PERFORM experience_console_require();
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required: the brand price is finance only' USING ERRCODE = '42501';
  END IF;
  UPDATE experience_addons SET status = 'withdrawn', decided_at = now(), decided_by = my_user_id()
    WHERE id = p_addon_id AND status = 'open' RETURNING experience_id INTO v_exp;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Only an open add-on can be withdrawn'; END IF;
  PERFORM experience_console_audit('experience.addon_withdrawn', 'experience_addons', p_addon_id, jsonb_build_object('experience_id', v_exp));
END;
$$;

-- The brand answers on Guapd (an admin on the brand account, as for the price).
CREATE OR REPLACE FUNCTION brand_experience_addon_answer(p_addon_id uuid, p_accept boolean, p_note text, p_expected_total_paise bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exp uuid; v_total bigint; v jsonb; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT a.experience_id, a.total_paise INTO v_exp, v_total FROM experience_addons a WHERE a.id = p_addon_id;
  PERFORM brand_experience_require(v_exp, true);
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Accept or decline'; END IF;
  IF p_expected_total_paise IS NULL OR p_expected_total_paise IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'This add-on changed since you opened the page. Refresh to see the latest';
  END IF;
  IF p_accept THEN
    v := experience_addon_accept_apply(p_addon_id, 'portal');
    PERFORM experience_console_audit('experience.addon_accepted_by_brand', 'experiences', v_exp, v - 'experience_id');
  ELSE
    IF length(coalesce(v_note, '')) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Tell Guapd what would work (3 to 1,000 characters)'; END IF;
    UPDATE experience_addons SET status = 'declined', decided_at = now(), decided_by = my_user_id(), recorded_channel = 'portal', brand_note = v_note
      WHERE id = p_addon_id AND status = 'open';
    IF NOT FOUND THEN RAISE EXCEPTION 'This add-on changed since you opened the page. Refresh to see the latest'; END IF;
    PERFORM experience_console_audit('experience.addon_declined_by_brand', 'experience_addons', p_addon_id,
      jsonb_build_object('experience_id', v_exp, 'note_length', length(v_note)));
  END IF;
END;
$$;

-- The console list: what each add-on adds and its status for operational staff; prices and notes for finance (0537).
CREATE OR REPLACE FUNCTION experience_console_addons(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fin boolean; v jsonb;
BEGIN
  PERFORM experience_console_require();
  v_fin := has_experience_access('financial') IS TRUE;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'number', a.number, 'status', a.status, 'deliverables', a.deliverables, 'videos', a.videos,
           'per_video_paise', CASE WHEN v_fin THEN a.per_video_paise END,
           'extras', CASE WHEN v_fin THEN a.extras END,
           'extras_count', jsonb_array_length(a.extras),
           'misc_paise', CASE WHEN v_fin THEN a.misc_paise END,
           'total_paise', CASE WHEN v_fin THEN a.total_paise END,
           'message', CASE WHEN v_fin THEN a.message END,
           'brand_note', CASE WHEN v_fin THEN a.brand_note END,
           'recorded_channel', a.recorded_channel, 'created_at', a.created_at, 'decided_at', a.decided_at,
           'created_by_name', coalesce(u.full_name, u.email)) ORDER BY a.number DESC), '[]'::jsonb)
    INTO v
    FROM experience_addons a LEFT JOIN users u ON u.id = a.created_by
    WHERE a.experience_id = p_experience_id;
  RETURN jsonb_build_object('addons', v, 'can_send', v_fin);
END;
$$;

-- The brand reads its own add-ons (not superseded ones).
CREATE OR REPLACE FUNCTION brand_experience_addons(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_agreed bigint;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.brand_service_total_paise INTO v_agreed FROM experiences e WHERE e.id = p_experience_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'number', a.number, 'status', a.status, 'deliverables', a.deliverables, 'videos', a.videos,
           'per_video_paise', a.per_video_paise, 'extras', a.extras, 'total_paise', a.total_paise, 'message', a.message,
           'brand_note', a.brand_note, 'decided_at', a.decided_at, 'on_guapd', a.recorded_channel = 'portal',
           'created_at', a.created_at) ORDER BY a.number DESC), '[]'::jsonb)
    INTO v
    FROM experience_addons a WHERE a.experience_id = p_experience_id AND a.status <> 'superseded';
  RETURN jsonb_build_object('addons', v, 'agreed_total_paise', v_agreed);
END;
$$;

REVOKE EXECUTE ON FUNCTION experience_plan_add(jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION experience_addon_accept_apply(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION experience_console_addon_send(uuid, jsonb, bigint, jsonb, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_addon_answer(uuid, boolean, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_addon_withdraw(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION brand_experience_addon_answer(uuid, boolean, text, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_addons(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION brand_experience_addons(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_addon_send(uuid, jsonb, bigint, jsonb, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION experience_console_addon_answer(uuid, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION experience_console_addon_withdraw(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION brand_experience_addon_answer(uuid, boolean, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION experience_console_addons(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION brand_experience_addons(uuid) TO authenticated, service_role;
