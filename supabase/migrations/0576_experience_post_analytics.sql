-- 0576: Experience collab posts feed the existing post-analytics pipeline.
--
-- No new analytics engine. A normal deal's post numbers live on its
-- deal_deliverable_items row (posted_url / posted_at + the 0494 ig_* columns),
-- resolved against the CREATOR'S OWN Instagram account and refreshed by the
-- nightly cron. An Experience collab post already points at the creator leg's
-- item (experience_collab_posts.item_id), so recording its link now also
-- stamps that item, and the same resolver, refresh, creator analytics and
-- creator dashboard pick it up unchanged.
--
-- Scope: only kind = 'collab' posts carry a link (a 'share' never does, by
-- 0561 constraint). Those are posted on the creator's own handle, so they are
-- the creator's analytics. Content the brand posts on its own channels has no
-- link on Guapd and is NOT read here; it would need a brand-account source.
--
-- Brand side: two definer reads return performance only (reach, views,
-- interactions, likes, comments, saves, shares), per post and per creator
-- name. They never read deals money, experience_creator_terms, roster pay,
-- costs or margin, and never return deal or creator ids. Brand gate as every
-- brand Experience read (brand_experience_require / my_brand_id), NULL denies.

-- ── 1. Recording a collab post link stamps the creator leg's item ───────────
CREATE OR REPLACE FUNCTION public.experience_collab_set_post(p_post_id uuid, p_url text, p_channel text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_kind text;
  v_old text;
  v_exp uuid;
  v_deal uuid;
  v_item uuid;
  e_status text;
BEGIN
  SELECT p.status, p.kind, p.post_url, p.experience_id, p.deal_id, p.item_id INTO v_status, v_kind, v_old, v_exp, v_deal, v_item
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

  -- The leg item carries the link the analytics pipeline reads. A NEW link is
  -- a different post: its old numbers are cleared and it resolves afresh
  -- (pending until the resolver runs). The same link again changes nothing.
  UPDATE deal_deliverable_items i
     SET posted_url = btrim(p_url), posted_at = now(),
         ig_match_status = 'pending', ig_media_id = NULL, ig_insights = NULL,
         ig_insight_history = '[]'::jsonb, ig_thumbnail_url = NULL, ig_last_synced_at = NULL,
         updated_at = now()
   WHERE i.id = v_item AND i.deal_id = v_deal
     AND i.posted_url IS DISTINCT FROM btrim(p_url);

  INSERT INTO events (deal_id, actor_id, event_type, detail)
  VALUES (v_deal, my_user_id(), 'experience.collab_posted', jsonb_build_object('post_id', p_post_id, 'channel', p_channel, 'replaced', v_old IS NOT NULL));
  RETURN jsonb_build_object('experience_id', v_exp, 'deal_id', v_deal, 'status_before', v_status, 'had_link', v_old IS NOT NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.experience_collab_set_post(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ── 2. Backfill: collab posts already posted before this migration ─────────
UPDATE deal_deliverable_items i
   SET posted_url = p.post_url, posted_at = p.posted_at, ig_match_status = 'pending', updated_at = now()
  FROM experience_collab_posts p
 WHERE p.item_id = i.id AND p.deal_id = i.deal_id
   AND p.kind = 'collab' AND p.status IN ('posted', 'ad_complete')
   AND p.post_url IS NOT NULL AND p.posted_at IS NOT NULL
   AND i.posted_url IS NULL;

-- ── 3. Brand reads: performance only ────────────────────────────────────────
-- One post's public numbers, from the item the resolver writes. Only the known
-- metric keys are passed through; a missing metric stays missing.
CREATE OR REPLACE FUNCTION public.experience_post_metrics(p_insights jsonb)
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_insights) IS DISTINCT FROM 'object' THEN NULL
         ELSE jsonb_strip_nulls(jsonb_build_object(
           'reach', p_insights -> 'reach', 'views', p_insights -> 'views',
           'likes', p_insights -> 'likes', 'comments', p_insights -> 'comments',
           'saved', p_insights -> 'saved', 'shares', p_insights -> 'shares',
           'totalInteractions', p_insights -> 'totalInteractions')) END
$function$;
REVOKE ALL ON FUNCTION public.experience_post_metrics(jsonb) FROM PUBLIC, anon, authenticated;

-- Per Experience: every collab post with a link, and its numbers.
CREATE OR REPLACE FUNCTION public.brand_experience_post_performance(p_experience_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM brand_experience_require(p_experience_id, false);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'post_id', p.id, 'creator_name', c.full_name, 'handle', c.handle, 'label', p.label,
      'post_url', p.post_url, 'posted_at', p.posted_at,
      'match_status', CASE WHEN i.posted_url IS NOT DISTINCT FROM p.post_url THEN i.ig_match_status ELSE 'pending' END,
      'metrics', CASE WHEN i.posted_url IS NOT DISTINCT FROM p.post_url AND i.ig_match_status = 'resolved'
                      THEN experience_post_metrics(i.ig_insights) END,
      'thumbnail_url', CASE WHEN i.posted_url IS NOT DISTINCT FROM p.post_url AND i.ig_match_status = 'resolved'
                            THEN i.ig_thumbnail_url END,
      'synced_at', CASE WHEN i.posted_url IS NOT DISTINCT FROM p.post_url THEN i.ig_last_synced_at END
    ) ORDER BY c.full_name, p.label), '[]'::jsonb)
    FROM experience_collab_posts p
    JOIN creators c ON c.id = p.creator_id
    JOIN deal_deliverable_items i ON i.id = p.item_id AND i.deal_id = p.deal_id
   WHERE p.experience_id = p_experience_id AND p.kind = 'collab'
     AND p.status IN ('posted', 'ad_complete') AND p.post_url IS NOT NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_post_performance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_post_performance(uuid) TO authenticated;

-- Across the brand's Experiences, posted inside a window: for the brand-wide
-- dashboard's reach / engagement / top posts. Only RESOLVED posts (verified
-- numbers), like the dashboard's own rule for deals.
CREATE OR REPLACE FUNCTION public.brand_experience_posts_overview(p_from timestamptz, p_to timestamptz)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid := my_brand_id();
BEGIN
  IF v_brand IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'experience_id', e.id, 'experience_title', e.title, 'creator_name', c.full_name, 'label', p.label,
      'posted_at', p.posted_at, 'metrics', experience_post_metrics(i.ig_insights), 'thumbnail_url', i.ig_thumbnail_url
    ) ORDER BY p.posted_at DESC), '[]'::jsonb)
    FROM experience_collab_posts p
    JOIN experiences e ON e.id = p.experience_id
    JOIN brands b ON b.id = e.brand_id
    JOIN creators c ON c.id = p.creator_id
    JOIN deal_deliverable_items i ON i.id = p.item_id AND i.deal_id = p.deal_id
   WHERE e.brand_id = v_brand AND b.is_guapd IS FALSE AND e.status IS DISTINCT FROM 'draft'
     AND p.kind = 'collab' AND p.status IN ('posted', 'ad_complete') AND p.post_url IS NOT NULL
     AND i.posted_url IS NOT DISTINCT FROM p.post_url AND i.ig_match_status = 'resolved'
     AND p.posted_at >= p_from AND p.posted_at <= p_to);
END;
$function$;
REVOKE ALL ON FUNCTION public.brand_experience_posts_overview(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_experience_posts_overview(timestamptz, timestamptz) TO authenticated;
