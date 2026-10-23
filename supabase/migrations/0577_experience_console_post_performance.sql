-- 0577: the Experience console's Performance tab.
--
-- The same verified numbers the brand sees (0576), for Guapd ops: every collab
-- post with a link, its match status (so ops can see WHY a post has no numbers
-- and chase it), and the collab posts still waiting for a link. Performance
-- keys only: like the brand read, nothing here touches pay, cost or margin, so
-- the tab needs operational access only, not financial.
--
-- Re-check: ops can ask for a post's numbers to be read again (after a creator
-- connects Instagram, or a link is corrected). The database records the request
-- (experience_console_audit → ops_events); the app then runs the same resolver
-- a creator's save runs.

CREATE OR REPLACE FUNCTION public.experience_console_post_performance(p_experience_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_posts jsonb;
  v_waiting jsonb;
BEGIN
  PERFORM experience_console_require();
  IF p_experience_id IS NULL OR NOT EXISTS (SELECT 1 FROM experiences e WHERE e.id = p_experience_id) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'post_id', p.id, 'deal_id', p.deal_id, 'creator_name', c.full_name, 'handle', c.handle, 'label', p.label,
      'post_url', p.post_url, 'posted_at', p.posted_at, 'status', p.status,
      'match_status', CASE WHEN i.posted_url IS NOT DISTINCT FROM p.post_url THEN i.ig_match_status ELSE 'pending' END,
      'metrics', CASE WHEN i.posted_url IS NOT DISTINCT FROM p.post_url AND i.ig_match_status = 'resolved'
                      THEN experience_post_metrics(i.ig_insights) END,
      'thumbnail_url', CASE WHEN i.posted_url IS NOT DISTINCT FROM p.post_url AND i.ig_match_status = 'resolved'
                            THEN i.ig_thumbnail_url END,
      'synced_at', CASE WHEN i.posted_url IS NOT DISTINCT FROM p.post_url THEN i.ig_last_synced_at END
    ) ORDER BY c.full_name, p.label), '[]'::jsonb)
    INTO v_posts
    FROM experience_collab_posts p
    JOIN creators c ON c.id = p.creator_id
    JOIN deal_deliverable_items i ON i.id = p.item_id AND i.deal_id = p.deal_id
   WHERE p.experience_id = p_experience_id AND p.kind = 'collab'
     AND p.status IN ('posted', 'ad_complete') AND p.post_url IS NOT NULL;

  -- Collab videos sent but not posted yet, per deal (staff chase these).
  SELECT coalesce(jsonb_object_agg(w.deal_id, w.n), '{}'::jsonb) INTO v_waiting
    FROM (SELECT p.deal_id, count(*)::int AS n FROM experience_collab_posts p
           WHERE p.experience_id = p_experience_id AND p.kind = 'collab' AND p.status = 'sent'
           GROUP BY p.deal_id) w;

  RETURN jsonb_build_object('posts', v_posts, 'waiting_for_link', v_waiting);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_post_performance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_post_performance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.experience_console_post_recheck(p_post_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_exp uuid;
  v_kind text;
  v_url text;
BEGIN
  PERFORM experience_console_require();
  SELECT p.experience_id, p.kind, p.post_url INTO v_exp, v_kind, v_url
    FROM experience_collab_posts p WHERE p.id = p_post_id;
  IF v_exp IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
  IF v_kind IS DISTINCT FROM 'collab' OR v_url IS NULL THEN
    RAISE EXCEPTION 'This post has no link to read numbers for';
  END IF;
  PERFORM experience_console_audit('experience.post_insights_recheck', 'experience_collab_posts', p_post_id,
    jsonb_build_object('experience_id', v_exp));
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_console_post_recheck(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experience_console_post_recheck(uuid) TO authenticated;
