-- Block message inserts on terminal deals (complete, declined, cancelled).
-- The real lock — UI disable is just polish on top.

DROP POLICY IF EXISTS messages_insert ON messages;

CREATE POLICY messages_insert
  ON messages FOR INSERT
  WITH CHECK (
    can_access_deal(deal_id)
    AND EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_id
        AND deals.status NOT IN ('complete', 'declined', 'cancelled')
    )
  );
