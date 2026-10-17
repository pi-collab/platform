-- 0573: posting instructions on a video Guapd sends a creator (0561).
--
-- Free text from Guapd: the caption, tags, music, when to post, anything the
-- creator must do while posting. Set when the video is sent, or added and
-- changed afterwards while it is still live (sent or posted). The creator sees
-- it on their deal; the brand does not (it is Guapd's note to the creator).
-- Operational access, audited. Blank clears it. At most 2,000 characters.

ALTER TABLE experience_collab_posts ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE experience_collab_posts ADD COLUMN IF NOT EXISTS instructions_at timestamptz;
ALTER TABLE experience_collab_posts DROP CONSTRAINT IF EXISTS ecp_instructions_shape;
ALTER TABLE experience_collab_posts ADD CONSTRAINT ecp_instructions_shape CHECK (
  (instructions IS NULL) = (instructions_at IS NULL)
  AND (instructions IS NULL OR length(btrim(instructions)) BETWEEN 1 AND 2000));

CREATE OR REPLACE FUNCTION public.experience_console_collab_instructions(p_post_id uuid, p_text text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid; v_status text; e_status text; v_text text; v_had boolean;
BEGIN
  PERFORM experience_console_require();
  SELECT p.experience_id, p.status, p.instructions IS NOT NULL INTO v_exp, v_status, v_had
    FROM experience_collab_posts p WHERE p.id = p_post_id FOR UPDATE;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Video not found'; END IF;
  SELECT e.status INTO e_status FROM experiences e WHERE e.id = v_exp;
  IF e_status IS NULL OR e_status NOT IN ('shoot_scheduled', 'shoot_done', 'delivering') THEN
    RAISE EXCEPTION 'Instructions can change only while the Experience is delivering';
  END IF;
  IF v_status IS NULL OR v_status NOT IN ('sent', 'posted') THEN
    RAISE EXCEPTION 'This video is no longer with the creator';
  END IF;
  v_text := nullif(btrim(coalesce(p_text, '')), '');
  IF v_text IS NOT NULL AND length(v_text) > 2000 THEN RAISE EXCEPTION 'Instructions are at most 2,000 characters'; END IF;
  UPDATE experience_collab_posts
     SET instructions = v_text, instructions_at = CASE WHEN v_text IS NULL THEN NULL ELSE now() END, updated_at = now()
   WHERE id = p_post_id;
  PERFORM experience_console_audit('experience.collab_instructions', 'experience_collab_posts', p_post_id,
    jsonb_build_object('experience_id', v_exp, 'had_before', v_had, 'cleared', v_text IS NULL, 'length', coalesce(length(v_text), 0)));
  -- True when the creator now has instructions to read (the app tells them).
  RETURN v_text IS NOT NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_collab_instructions(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_collab_instructions(uuid, text) TO authenticated;

-- Send and set the instructions in one transaction: never a sent video whose
-- instructions failed to save.
CREATE OR REPLACE FUNCTION public.experience_console_collab_send_with_instructions(p_release_id uuid, p_kind text, p_instructions text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  v_id := experience_console_collab_send(p_release_id, p_kind);
  IF nullif(btrim(coalesce(p_instructions, '')), '') IS NOT NULL THEN
    PERFORM experience_console_collab_instructions(v_id, p_instructions);
  END IF;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_collab_send_with_instructions(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_collab_send_with_instructions(uuid, text, text) TO authenticated;

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
      'instructions', p.instructions, 'instructions_at', p.instructions_at) ORDER BY c.full_name, p.label, p.sent_at), '[]'::jsonb)
    FROM experience_collab_posts p JOIN creators c ON c.id = p.creator_id
    WHERE p.experience_id = p_experience_id);
END;
$function$

;

CREATE OR REPLACE FUNCTION public.creator_collab_posts(p_deal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
      'instructions', p.instructions, 'instructions_at', p.instructions_at,
      'can_post', coalesce(v_open AND p.kind = 'collab' AND p.status IN ('sent', 'posted'), false)) ORDER BY p.kind, p.label), '[]'::jsonb)
    FROM experience_collab_posts p JOIN experience_deliverable_releases x ON x.id = p.release_id
    WHERE p.deal_id = p_deal_id AND p.status <> 'cancelled');
END;
$function$

;
