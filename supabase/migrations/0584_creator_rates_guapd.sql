-- 0584: a creator on a Guapd Experience rates Guapd once they are paid.
--
-- On an Experience the creator works with Guapd, not the brand: Guapd sends
-- the offer, runs the shoot, edits the videos and pays them. So the rating on
-- a creator leg is about Guapd. It reuses deal_reviews (0430): one creator
-- review per deal, 1 to 5 stars plus an optional note, private.
--
--   A. creator_leg_rate_guapd: the creator's own leg, only once a payout on
--      it is PAID. Changing the rating later is allowed (same row).
--   B. The direct-table creator policies no longer cover creator legs, so the
--      function above is the only way in, and its paid gate cannot be skipped.
--   C. experience_console_guapd_ratings: the ratings on one Experience, for
--      Experiences staff (operational or financial). No money in it.

-- ═════ A. Rate Guapd ═════
CREATE OR REPLACE FUNCTION creator_leg_rate_guapd(p_deal_id uuid, p_rating integer, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator uuid := my_creator_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  r record;
BEGIN
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Creators only' USING ERRCODE = '42501'; END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Pick 1 to 5 stars'; END IF;
  IF length(v_note) > 1000 THEN RAISE EXCEPTION 'Keep the note under 1000 characters'; END IF;
  IF NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = p_deal_id AND d.leg_role = 'creator_leg' AND d.creator_id = v_creator) THEN
    RAISE EXCEPTION 'Deal not found' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vendor_payouts p WHERE p.deal_id = p_deal_id AND p.status = 'paid') THEN
    RAISE EXCEPTION 'You can rate Guapd once you are paid';
  END IF;
  INSERT INTO deal_reviews (deal_id, reviewer_role, rating, note)
  VALUES (p_deal_id, 'creator', p_rating, v_note)
  ON CONFLICT (deal_id, reviewer_role) DO UPDATE SET rating = EXCLUDED.rating, note = EXCLUDED.note, updated_at = now()
  RETURNING rating, note, updated_at INTO r;
  RETURN jsonb_build_object('rating', r.rating, 'note', r.note, 'rated_at', r.updated_at);
END;
$$;
REVOKE EXECUTE ON FUNCTION creator_leg_rate_guapd(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION creator_leg_rate_guapd(uuid, integer, text) TO authenticated;

-- ═════ B. The table's creator policies: not on creator legs ═════
DROP POLICY IF EXISTS creator_insert_review ON deal_reviews;
CREATE POLICY creator_insert_review ON deal_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_role = 'creator'
    AND deal_id IN (
      SELECT d.id FROM deals d
      WHERE d.leg_role IS DISTINCT FROM 'creator_leg'  -- 0584: legs go through creator_leg_rate_guapd
        AND d.creator_id = (
        SELECT c.id FROM creators c
        JOIN users u ON u.id = c.user_id
        WHERE u.auth_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS creator_update_review ON deal_reviews;
CREATE POLICY creator_update_review ON deal_reviews
  FOR UPDATE TO authenticated
  USING (
    reviewer_role = 'creator'
    AND deal_id IN (
      SELECT d.id FROM deals d
      WHERE d.leg_role IS DISTINCT FROM 'creator_leg'  -- 0584: legs go through creator_leg_rate_guapd
        AND d.creator_id = (
        SELECT c.id FROM creators c
        JOIN users u ON u.id = c.user_id
        WHERE u.auth_id = auth.uid()
      )
    )
  );

-- ═════ C. The console: ratings on one Experience ═════
CREATE OR REPLACE FUNCTION experience_console_guapd_ratings(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF has_experience_access('operational') IS NOT TRUE THEN
    RAISE EXCEPTION 'Experiences access needed' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'paid_creators', (SELECT count(DISTINCT d.id) FROM deals d JOIN vendor_payouts p ON p.deal_id = d.id AND p.status = 'paid'
                       WHERE d.experience_id = p_experience_id AND d.leg_role = 'creator_leg'),
    'ratings', coalesce((
      SELECT jsonb_agg(jsonb_build_object('deal_id', d.id, 'creator', c.full_name, 'rating', r.rating, 'note', r.note, 'rated_at', r.updated_at)
                       ORDER BY r.updated_at DESC)
        FROM deals d
        JOIN deal_reviews r ON r.deal_id = d.id AND r.reviewer_role = 'creator'
        JOIN creators c ON c.id = d.creator_id
       WHERE d.experience_id = p_experience_id AND d.leg_role = 'creator_leg'), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION experience_console_guapd_ratings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_guapd_ratings(uuid) TO authenticated;
