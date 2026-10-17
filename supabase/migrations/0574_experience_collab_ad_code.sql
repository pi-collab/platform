-- 0574: the partnership ad code on a collab post.
--
-- To run a creator's collab post as an ad, the brand needs the creator's
-- Instagram partnership ad code. The creator adds it on their deal with the post
-- link or later (while the post is live and the ad is not complete); staff can
-- record it for them when it arrives another way (with the channel). The brand
-- sees it on its Experience page with Copy; Guapd sees it in the console.
-- Collab posts exist only on Experiences today (0561); marketplace deals have
-- no collab post object yet, so this lives here.

ALTER TABLE experience_collab_posts ADD COLUMN IF NOT EXISTS ad_code text;
ALTER TABLE experience_collab_posts ADD COLUMN IF NOT EXISTS ad_code_at timestamptz;
ALTER TABLE experience_collab_posts ADD COLUMN IF NOT EXISTS ad_code_channel text;
ALTER TABLE experience_collab_posts DROP CONSTRAINT IF EXISTS ecp_ad_code_shape;
ALTER TABLE experience_collab_posts ADD CONSTRAINT ecp_ad_code_shape CHECK (
  (ad_code IS NULL) = (ad_code_at IS NULL) AND (ad_code IS NULL) = (ad_code_channel IS NULL)
  AND (ad_code IS NULL OR (post_url IS NOT NULL AND length(ad_code) BETWEEN 3 AND 300 AND ad_code !~ '[[:space:]]'))
  AND (ad_code_channel IS NULL OR ad_code_channel IN ('portal', 'whatsapp', 'email', 'call', 'in_person')));

-- Internal: set the code. Not callable from the app.
CREATE OR REPLACE FUNCTION public.experience_collab_set_ad_code(p_post_id uuid, p_code text, p_channel text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_kind text;
  v_url text;
  v_old text;
  v_exp uuid;
  v_deal uuid;
  e_status text;
  v_code text;
BEGIN
  SELECT p.status, p.kind, p.post_url, p.ad_code, p.experience_id, p.deal_id INTO v_status, v_kind, v_url, v_old, v_exp, v_deal
    FROM experience_collab_posts p WHERE p.id = p_post_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_kind IS DISTINCT FROM 'collab' THEN RAISE EXCEPTION 'An ad code is only for a collab post'; END IF;
  IF v_url IS NULL OR v_status IS DISTINCT FROM 'posted' THEN
    RAISE EXCEPTION 'Add the post link first; the ad code can change until the ad is complete';
  END IF;
  SELECT e.status INTO e_status FROM experiences e WHERE e.id = v_exp;
  IF e_status IS NULL OR e_status NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN RAISE EXCEPTION 'This Experience is closed'; END IF;
  v_code := btrim(coalesce(p_code, ''));
  IF length(v_code) NOT BETWEEN 3 AND 300 OR v_code ~ '[[:space:]]' THEN
    RAISE EXCEPTION 'Paste the ad code from Instagram (no spaces)';
  END IF;
  UPDATE experience_collab_posts SET ad_code = v_code, ad_code_at = now(), ad_code_channel = p_channel, updated_at = now()
   WHERE id = p_post_id;
  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.collab_ad_code', jsonb_build_object('post_id', p_post_id, 'channel', p_channel, 'replaced', v_old IS NOT NULL));
  RETURN jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'replaced', v_old IS NOT NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_collab_set_ad_code(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- The creator, on their own post. Returns true the first time a code is added.
CREATE OR REPLACE FUNCTION public.creator_collab_ad_code(p_post_id uuid, p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF my_creator_id() IS NULL OR NOT EXISTS (SELECT 1 FROM experience_collab_posts p WHERE p.id = p_post_id AND p.creator_id = my_creator_id() AND p.status <> 'cancelled') THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  v := experience_collab_set_ad_code(p_post_id, p_code, 'portal');
  PERFORM experience_console_audit('experience.collab_ad_code_by_creator', 'experience_collab_posts', p_post_id, v || jsonb_build_object('channel', 'portal'));
  RETURN NOT (v ->> 'replaced')::boolean;
END;
$function$;
REVOKE ALL ON FUNCTION public.creator_collab_ad_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.creator_collab_ad_code(uuid, text) TO authenticated;

-- Staff, when the code reached Guapd another way.
CREATE OR REPLACE FUNCTION public.experience_console_collab_ad_code(p_post_id uuid, p_code text, p_channel text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  PERFORM experience_console_require();
  IF p_channel IS NULL OR p_channel NOT IN ('whatsapp', 'email', 'call', 'in_person') THEN
    RAISE EXCEPTION 'Say how the creator sent the ad code';
  END IF;
  v := experience_collab_set_ad_code(p_post_id, p_code, p_channel);
  PERFORM experience_console_audit('experience.collab_ad_code_recorded', 'experience_collab_posts', p_post_id, v || jsonb_build_object('channel', p_channel));
  RETURN NOT (v ->> 'replaced')::boolean;
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_collab_ad_code(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_collab_ad_code(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.experience_console_collab_posts(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM experience_console_require();
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'deal_id', p.deal_id, 'release_id', p.release_id, 'creator_name', c.full_name, 'label', p.label, 'kind', p.kind,
      'status', p.status, 'sent_at', p.sent_at, 'post_url', p.post_url, 'posted_at', p.posted_at, 'post_channel', p.post_channel,
      'affiliate_url', p.affiliate_url, 'affiliate_at', p.affiliate_at, 'affiliate_channel', p.affiliate_channel,
      'ad_complete_at', p.ad_complete_at, 'ad_complete_channel', p.ad_complete_channel,
      'cancelled_at', p.cancelled_at, 'cancel_reason', p.cancel_reason,
      'instructions', p.instructions, 'instructions_at', p.instructions_at,
      'ad_code', p.ad_code, 'ad_code_at', p.ad_code_at, 'ad_code_channel', p.ad_code_channel) ORDER BY c.full_name, p.label, p.sent_at), '[]'::jsonb)
    FROM experience_collab_posts p JOIN creators c ON c.id = p.creator_id
    WHERE p.experience_id = p_experience_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.creator_collab_posts(p_deal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_open boolean;
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
      'instructions', p.instructions, 'instructions_at', p.instructions_at,
      'ad_code', p.ad_code,
      'can_post', coalesce(v_open AND p.kind = 'collab' AND p.status IN ('sent', 'posted'), false)) ORDER BY p.kind, p.label), '[]'::jsonb)
    FROM experience_collab_posts p JOIN experience_deliverable_releases x ON x.id = p.release_id
    WHERE p.deal_id = p_deal_id AND p.status <> 'cancelled');
END;
$function$;

CREATE OR REPLACE FUNCTION public.brand_experience_collab_posts(p_experience_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
      'ad_code', p.ad_code, 'ad_code_at', p.ad_code_at,
      'can_act', coalesce(v_open AND p.status = 'posted', false)) ORDER BY c.full_name, p.label), '[]'::jsonb)
    FROM experience_collab_posts p JOIN creators c ON c.id = p.creator_id
    WHERE p.experience_id = p_experience_id AND p.kind = 'collab' AND p.status <> 'cancelled');
END;
$function$;
