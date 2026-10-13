-- 0561 (collab C2): the posting flow for a creator's videos.
--   After the brand approves an edited video Guapd shared (a live release),
--   Guapd sends it to the creator who shot it:
--   * kind 'collab': one of the creator's AD-RIGHTS videos. The creator posts
--     it as a collab with the brand and gives the post link (or Guapd records
--     it for them). The brand may add its affiliate link (seen by Guapd and the
--     creator), boosts it on its own terms, then marks the ad complete.
--     At most leg_ad_rights_count live collab posts per creator deal.
--   * kind 'share': any other approved video, for the creator to post on their
--     own account if they like. No link is asked for and nothing waits on it.
--   * The creator's main invoice (so their payout) waits until every ad-rights
--     video on their deal is posted (experience_leg_work_complete).
--   No money moves here; the affiliate commission is C3.
--   NULL means no on every gate; staff record on someone's behalf with a
--   channel, never 'portal'.

CREATE TABLE IF NOT EXISTS experience_collab_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id       uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  deal_id             uuid NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  creator_id          uuid NOT NULL REFERENCES creators (id),
  release_id          uuid NOT NULL REFERENCES experience_deliverable_releases (id) ON DELETE CASCADE,
  item_id             uuid NOT NULL REFERENCES deal_deliverable_items (id) ON DELETE CASCADE,
  label               text NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('collab', 'share')),
  status              text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'posted', 'ad_complete', 'cancelled')),
  sent_at             timestamptz NOT NULL DEFAULT now(),
  sent_by             uuid REFERENCES users (id) ON DELETE SET NULL,
  post_url            text CHECK (post_url IS NULL OR length(post_url) <= 500),
  posted_at           timestamptz,
  post_channel        text CHECK (post_channel IS NULL OR post_channel IN ('portal', 'whatsapp', 'email', 'call', 'in_person')),
  post_recorded_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  affiliate_url       text CHECK (affiliate_url IS NULL OR length(affiliate_url) <= 500),
  affiliate_at        timestamptz,
  affiliate_channel   text CHECK (affiliate_channel IS NULL OR affiliate_channel IN ('portal', 'whatsapp', 'email', 'call', 'in_person')),
  affiliate_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  ad_complete_at      timestamptz,
  ad_complete_channel text CHECK (ad_complete_channel IS NULL OR ad_complete_channel IN ('portal', 'whatsapp', 'email', 'call', 'in_person')),
  ad_complete_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  cancelled_at        timestamptz,
  cancelled_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  cancel_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- A share is only ever sent or cancelled: no link, no affiliate, no ad.
  CONSTRAINT ecp_share_shape CHECK (kind = 'collab' OR (status IN ('sent', 'cancelled') AND post_url IS NULL AND affiliate_url IS NULL AND ad_complete_at IS NULL)),
  CONSTRAINT ecp_posted_shape CHECK ((post_url IS NULL) = (posted_at IS NULL) AND (post_url IS NULL) = (post_channel IS NULL)
                                     AND (status NOT IN ('posted', 'ad_complete') OR post_url IS NOT NULL)),
  CONSTRAINT ecp_affiliate_shape CHECK ((affiliate_url IS NULL) = (affiliate_at IS NULL) AND (affiliate_url IS NULL) = (affiliate_channel IS NULL)
                                        AND (affiliate_url IS NULL OR post_url IS NOT NULL)),
  CONSTRAINT ecp_complete_shape CHECK ((status = 'ad_complete') = (ad_complete_at IS NOT NULL) AND (ad_complete_at IS NULL) = (ad_complete_channel IS NULL)),
  CONSTRAINT ecp_cancel_shape CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)
                                     AND (cancelled_at IS NULL OR length(btrim(coalesce(cancel_reason, ''))) BETWEEN 3 AND 300))
);
CREATE UNIQUE INDEX IF NOT EXISTS ecp_one_live_per_release ON experience_collab_posts (release_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS ecp_deal_idx ON experience_collab_posts (deal_id);
CREATE INDEX IF NOT EXISTS ecp_experience_idx ON experience_collab_posts (experience_id);
ALTER TABLE experience_collab_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_collab_posts FROM PUBLIC, anon, authenticated;

-- An Instagram post or reel link, https only.
CREATE OR REPLACE FUNCTION public.experience_post_url_valid(p_url text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT p_url IS NOT NULL AND length(p_url) <= 500
     AND p_url ~ '^https://(www\.)?instagram\.com/(p|reel|reels|tv)/[A-Za-z0-9_-]+/?(\?[^\s]*)?$'
$function$;

-- Any https link (the brand's affiliate link), no spaces.
CREATE OR REPLACE FUNCTION public.experience_https_url_valid(p_url text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT p_url IS NOT NULL AND length(p_url) BETWEEN 12 AND 500 AND p_url ~ '^https://[^\s/$.?#][^\s]*$'
$function$;

-- ── Guapd sends an approved video to its creator ─────────────────────────────
CREATE OR REPLACE FUNCTION public.experience_console_collab_send(p_release_id uuid, p_kind text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  x_exp uuid; x_deal uuid; x_item uuid; x_label text; x_status text; x_decision text;
  e_status text; d_status text; d_role text; d_creator uuid; v_ad int; v_live int; v_id uuid;
BEGIN
  PERFORM experience_console_require();
  IF p_kind IS NULL OR p_kind NOT IN ('collab', 'share') THEN RAISE EXCEPTION 'Send it to post as a collab, or share it'; END IF;
  SELECT x.experience_id, x.deal_id, x.item_id, x.label, x.status, x.brand_decision
    INTO x_exp, x_deal, x_item, x_label, x_status, x_decision
    FROM experience_deliverable_releases x WHERE x.id = p_release_id;
  IF x_exp IS NULL THEN RAISE EXCEPTION 'Video not found'; END IF;
  SELECT e.status INTO e_status FROM experiences e WHERE e.id = x_exp FOR UPDATE;
  IF e_status IS NULL OR e_status NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN
    RAISE EXCEPTION 'Videos go to creators while the Experience is delivering';
  END IF;
  IF x_status IS DISTINCT FROM 'shared' OR x_decision IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Only a video the brand approved can go to the creator';
  END IF;
  SELECT d.status::text, d.leg_role, d.creator_id INTO d_status, d_role, d_creator FROM deals d WHERE d.id = x_deal;
  IF d_role IS DISTINCT FROM 'creator_leg' OR d_status IS NULL OR d_status NOT IN ('agreed', 'paid') THEN
    RAISE EXCEPTION 'Only a creator with an accepted deal gets their video';
  END IF;
  IF EXISTS (SELECT 1 FROM experience_collab_posts p WHERE p.release_id = p_release_id AND p.status <> 'cancelled') THEN
    RAISE EXCEPTION 'This video is already with the creator';
  END IF;
  IF p_kind = 'collab' THEN
    SELECT r.leg_ad_rights_count INTO v_ad FROM experience_roster r WHERE r.leg_deal_id = x_deal FOR UPDATE;
    SELECT count(*) INTO v_live FROM experience_collab_posts p WHERE p.deal_id = x_deal AND p.kind = 'collab' AND p.status <> 'cancelled';
    IF coalesce(v_ad, 0) <= v_live THEN
      RAISE EXCEPTION 'This creator has % ad-rights video(s) and all are already sent to post as a collab', coalesce(v_ad, 0);
    END IF;
  END IF;
  INSERT INTO experience_collab_posts (experience_id, deal_id, creator_id, release_id, item_id, label, kind, sent_by)
  VALUES (x_exp, x_deal, d_creator, p_release_id, x_item, x_label, p_kind, my_user_id())
  RETURNING id INTO v_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (x_deal, my_user_id(), 'experience.collab_sent', jsonb_build_object('post_id', v_id, 'kind', p_kind, 'label', x_label));
  PERFORM experience_console_audit('experience.collab_sent', 'experience_collab_posts', v_id,
    jsonb_build_object('experience_id', x_exp, 'deal_id', x_deal, 'release_id', p_release_id, 'kind', p_kind, 'status_after', 'sent'));
  RETURN v_id;
END;
$function$;

-- Guapd takes a sent video back (before it is posted).
CREATE OR REPLACE FUNCTION public.experience_console_collab_cancel(p_post_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_exp uuid; v_deal uuid;
BEGIN
  PERFORM experience_console_require();
  SELECT p.status, p.experience_id, p.deal_id INTO v_status, v_exp, v_deal FROM experience_collab_posts p WHERE p.id = p_post_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;
  IF v_status IS DISTINCT FROM 'sent' THEN RAISE EXCEPTION 'Only a video not yet posted can be taken back'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Say why, in 3 to 300 characters'; END IF;
  UPDATE experience_collab_posts SET status = 'cancelled', cancelled_at = now(), cancelled_by = my_user_id(),
         cancel_reason = btrim(p_reason), updated_at = now() WHERE id = p_post_id;
  PERFORM experience_console_audit('experience.collab_cancelled', 'experience_collab_posts', p_post_id,
    jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'status_before', v_status, 'status_after', 'cancelled', 'reason', btrim(p_reason)));
END;
$function$;

-- The post link: internal, shared by the creator's and the console's entry points.
CREATE OR REPLACE FUNCTION public.experience_collab_set_post(p_post_id uuid, p_url text, p_channel text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_kind text; v_old text; v_exp uuid; v_deal uuid; e_status text;
BEGIN
  SELECT p.status, p.kind, p.post_url, p.experience_id, p.deal_id INTO v_status, v_kind, v_old, v_exp, v_deal
    FROM experience_collab_posts p WHERE p.id = p_post_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_kind IS DISTINCT FROM 'collab' THEN RAISE EXCEPTION 'No link is needed for a shared video'; END IF;
  IF v_status NOT IN ('sent', 'posted') THEN RAISE EXCEPTION 'The ad is complete: the post link is final'; END IF;
  SELECT e.status INTO e_status FROM experiences e WHERE e.id = v_exp;
  IF e_status IS DISTINCT FROM 'shoot_scheduled' AND e_status IS DISTINCT FROM 'shoot_done' AND e_status IS DISTINCT FROM 'delivering' THEN
    RAISE EXCEPTION 'This Experience is closed';
  END IF;
  IF experience_post_url_valid(btrim(coalesce(p_url, ''))) IS NOT TRUE THEN
    RAISE EXCEPTION 'Paste the Instagram post link (https://www.instagram.com/p/… or /reel/…)';
  END IF;
  UPDATE experience_collab_posts SET post_url = btrim(p_url), posted_at = now(), post_channel = p_channel,
         post_recorded_by = my_user_id(), status = 'posted', updated_at = now() WHERE id = p_post_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.collab_posted', jsonb_build_object('post_id', p_post_id, 'channel', p_channel, 'replaced', v_old IS NOT NULL));
  RETURN jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'status_before', v_status, 'had_link', v_old IS NOT NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_collab_set_post(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.creator_collab_post_link(p_post_id uuid, p_url text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF my_creator_id() IS NULL OR NOT EXISTS (SELECT 1 FROM experience_collab_posts p WHERE p.id = p_post_id AND p.creator_id = my_creator_id() AND p.status <> 'cancelled') THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  v := experience_collab_set_post(p_post_id, p_url, 'portal');
  PERFORM experience_console_audit('experience.collab_posted_by_creator', 'experience_collab_posts', p_post_id, v || jsonb_build_object('channel', 'portal'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_collab_post_link(p_post_id uuid, p_url text, p_channel text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM experience_console_require();
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'email', 'call', 'in_person') THEN
    RAISE EXCEPTION 'Say how the creator sent the link ("On Guapd" is only when they add it themselves)';
  END IF;
  v := experience_collab_set_post(p_post_id, p_url, p_channel);
  PERFORM experience_console_audit('experience.collab_post_recorded', 'experience_collab_posts', p_post_id, v || jsonb_build_object('channel', p_channel));
END;
$function$;

-- ── The brand: affiliate link and ad complete ────────────────────────────────
CREATE OR REPLACE FUNCTION public.experience_collab_brand_act(p_post_id uuid, p_action text, p_url text, p_channel text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_kind text; v_exp uuid; v_deal uuid; v_old text; e_status text;
BEGIN
  SELECT p.status, p.kind, p.experience_id, p.deal_id, p.affiliate_url INTO v_status, v_kind, v_exp, v_deal, v_old
    FROM experience_collab_posts p WHERE p.id = p_post_id FOR UPDATE;
  IF v_status IS NULL OR v_kind IS DISTINCT FROM 'collab' THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  SELECT e.status INTO e_status FROM experiences e WHERE e.id = v_exp;
  IF e_status IS DISTINCT FROM 'shoot_scheduled' AND e_status IS DISTINCT FROM 'shoot_done' AND e_status IS DISTINCT FROM 'delivering' THEN
    RAISE EXCEPTION 'This Experience is closed';
  END IF;
  IF v_status IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION '%', CASE WHEN v_status = 'ad_complete' THEN 'The ad is already marked complete' ELSE 'The creator has not posted it yet' END;
  END IF;
  IF p_action = 'affiliate' THEN
    IF experience_https_url_valid(btrim(coalesce(p_url, ''))) IS NOT TRUE THEN RAISE EXCEPTION 'Paste the affiliate link (https://…)'; END IF;
    UPDATE experience_collab_posts SET affiliate_url = btrim(p_url), affiliate_at = now(), affiliate_channel = p_channel,
           affiliate_by = my_user_id(), updated_at = now() WHERE id = p_post_id;
  ELSIF p_action = 'ad_complete' THEN
    UPDATE experience_collab_posts SET status = 'ad_complete', ad_complete_at = now(), ad_complete_channel = p_channel,
           ad_complete_by = my_user_id(), updated_at = now() WHERE id = p_post_id;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.collab_' || p_action, jsonb_build_object('post_id', p_post_id, 'channel', p_channel));
  RETURN jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'status_before', v_status,
    'status_after', CASE WHEN p_action = 'ad_complete' THEN 'ad_complete' ELSE v_status END, 'replaced_link', v_old IS NOT NULL AND p_action = 'affiliate');
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_collab_brand_act(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.brand_experience_collab_act(p_post_id uuid, p_action text, p_url text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_exp uuid; v jsonb;
BEGIN
  SELECT p.experience_id INTO v_exp FROM experience_collab_posts p WHERE p.id = p_post_id AND p.kind = 'collab';
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  PERFORM brand_experience_require(v_exp, false);
  v := experience_collab_brand_act(p_post_id, p_action, CASE WHEN p_action = 'affiliate' THEN p_url END, 'portal');
  PERFORM experience_console_audit('experience.collab_' || p_action || '_by_brand', 'experience_collab_posts', p_post_id, v || jsonb_build_object('channel', 'portal'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.experience_console_collab_act(p_post_id uuid, p_action text, p_url text, p_channel text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM experience_console_require();
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'email', 'call', 'in_person') THEN
    RAISE EXCEPTION 'Say how the brand told you ("On Guapd" is only when they do it themselves)';
  END IF;
  v := experience_collab_brand_act(p_post_id, p_action, CASE WHEN p_action = 'affiliate' THEN p_url END, p_channel);
  PERFORM experience_console_audit('experience.collab_' || p_action || '_recorded', 'experience_collab_posts', p_post_id, v || jsonb_build_object('channel', p_channel));
END;
$function$;

-- ── Reads ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.experience_console_collab_posts(p_experience_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM experience_console_require();
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'deal_id', p.deal_id, 'release_id', p.release_id, 'creator_name', c.full_name, 'label', p.label, 'kind', p.kind,
      'status', p.status, 'sent_at', p.sent_at, 'post_url', p.post_url, 'posted_at', p.posted_at, 'post_channel', p.post_channel,
      'affiliate_url', p.affiliate_url, 'affiliate_at', p.affiliate_at, 'affiliate_channel', p.affiliate_channel,
      'ad_complete_at', p.ad_complete_at, 'ad_complete_channel', p.ad_complete_channel,
      'cancelled_at', p.cancelled_at, 'cancel_reason', p.cancel_reason) ORDER BY c.full_name, p.label, p.sent_at), '[]'::jsonb)
    FROM experience_collab_posts p JOIN creators c ON c.id = p.creator_id
    WHERE p.experience_id = p_experience_id);
END;
$function$;

-- The brand sees its collab posts: no creator or deal ids, no shares, nothing cancelled.
CREATE OR REPLACE FUNCTION public.brand_experience_collab_posts(p_experience_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_open boolean;
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  SELECT e.status IN ('shoot_scheduled', 'shoot_done', 'delivering') INTO v_open FROM experiences e WHERE e.id = p_experience_id;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'creator_name', c.full_name, 'handle', c.handle, 'label', p.label, 'status', p.status,
      'sent_at', p.sent_at, 'post_url', p.post_url, 'posted_at', p.posted_at,
      'affiliate_url', p.affiliate_url, 'affiliate_at', p.affiliate_at, 'affiliate_on_guapd', p.affiliate_channel = 'portal',
      'ad_complete_at', p.ad_complete_at, 'ad_complete_on_guapd', p.ad_complete_channel = 'portal',
      'can_act', coalesce(v_open AND p.status = 'posted', false)) ORDER BY c.full_name, p.label), '[]'::jsonb)
    FROM experience_collab_posts p JOIN creators c ON c.id = p.creator_id
    WHERE p.experience_id = p_experience_id AND p.kind = 'collab' AND p.status <> 'cancelled');
END;
$function$;

-- The creator's file: the path only for a live post on their own deal, from a live release.
CREATE OR REPLACE FUNCTION public.creator_collab_file(p_post_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_path text; v_name text; v_url text;
BEGIN
  SELECT x.storage_path, x.file_name, x.external_url INTO v_path, v_name, v_url
    FROM experience_collab_posts p JOIN experience_deliverable_releases x ON x.id = p.release_id
    WHERE p.id = p_post_id AND p.status <> 'cancelled' AND x.status = 'shared'
      AND my_creator_id() IS NOT NULL AND p.creator_id = my_creator_id();
  IF v_path IS NULL AND v_url IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('storage_path', v_path, 'file_name', v_name, 'external_url', v_url);
END;
$function$;

-- ── The creator's own view: collab_posts in creator_leg_context ──────────────
CREATE OR REPLACE FUNCTION public.creator_collab_posts(p_deal_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_open boolean;
BEGIN
  IF my_creator_id() IS NULL OR NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg' AND d.creator_id = my_creator_id()) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  SELECT e.status IN ('shoot_scheduled', 'shoot_done', 'delivering') INTO v_open
    FROM deals d JOIN experiences e ON e.id = d.experience_id WHERE d.id = p_deal_id;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'label', p.label, 'kind', p.kind, 'status', p.status, 'sent_at', p.sent_at,
      'file_name', x.file_name, 'has_link', x.external_url IS NOT NULL,
      'post_url', p.post_url, 'posted_at', p.posted_at, 'affiliate_url', p.affiliate_url, 'ad_complete_at', p.ad_complete_at,
      'can_post', coalesce(v_open AND p.kind = 'collab' AND p.status IN ('sent', 'posted'), false)) ORDER BY p.kind, p.label), '[]'::jsonb)
    FROM experience_collab_posts p JOIN experience_deliverable_releases x ON x.id = p.release_id
    WHERE p.deal_id = p_deal_id AND p.status <> 'cancelled');
END;
$function$;

-- ── The main invoice waits for the collab posts ──────────────────────────────
CREATE OR REPLACE FUNCTION public.experience_leg_work_complete(p_deal_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_trigger text; v_outcome text; v_base boolean; v_ad int; v_posted int;
BEGIN
  SELECT d.status::text, coalesce(d.settings_snapshot ->> 'completion_trigger', 'on_shoot_done')
    INTO v_status, v_trigger FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg';
  SELECT r.leg_shoot_outcome, r.leg_ad_rights_count INTO v_outcome, v_ad FROM experience_roster r WHERE r.leg_deal_id = p_deal_id;
  IF v_status IS NULL OR v_status NOT IN ('agreed', 'paid') OR v_outcome IS DISTINCT FROM 'done' THEN
    RETURN false;
  END IF;
  IF experience_leg_owner(p_deal_id) = 'creator' OR v_trigger = 'on_delivery_accepted' THEN
    v_base := EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator)
       AND NOT EXISTS (SELECT 1 FROM deal_deliverable_items i WHERE i.deal_id = p_deal_id AND i.visible_to_creator AND i.item_status IS DISTINCT FROM 'approved');
  ELSE
    v_base := coalesce(v_trigger = 'on_shoot_done', false);
  END IF;
  IF v_base IS NOT TRUE THEN RETURN false; END IF;
  -- 0561: every ad-rights video is posted as a collab first (its link given).
  SELECT count(*) INTO v_posted FROM experience_collab_posts p
    WHERE p.deal_id = p_deal_id AND p.kind = 'collab' AND p.status IN ('posted', 'ad_complete');
  RETURN v_posted >= coalesce(v_ad, 0);
END;
$function$;

-- Collab posts still to post on a deal (for the creator's and console's "waiting" notes).
CREATE OR REPLACE FUNCTION public.experience_leg_collab_waiting(p_deal_id uuid)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT greatest(coalesce(r.leg_ad_rights_count, 0)
         - (SELECT count(*) FROM experience_collab_posts p WHERE p.deal_id = p_deal_id AND p.kind = 'collab' AND p.status IN ('posted', 'ad_complete'))::int, 0)
  FROM experience_roster r WHERE r.leg_deal_id = p_deal_id
$function$;
REVOKE ALL ON FUNCTION public.experience_leg_collab_waiting(uuid) FROM PUBLIC, anon, authenticated;

-- The creator sees how many ad-rights videos are still to post (their invoice waits on them).
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
    'collab_waiting', experience_leg_collab_waiting(p_deal_id),
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

REVOKE ALL ON FUNCTION public.experience_post_url_valid(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_https_url_valid(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_collab_send(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_collab_cancel(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.creator_collab_post_link(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_collab_post_link(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brand_experience_collab_act(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_collab_act(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.experience_console_collab_posts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brand_experience_collab_posts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.creator_collab_file(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.creator_collab_posts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_collab_send(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_collab_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_collab_post_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_collab_post_link(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_experience_collab_act(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_collab_act(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experience_console_collab_posts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_experience_collab_posts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_collab_file(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_collab_posts(uuid) TO authenticated;
