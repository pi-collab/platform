-- Allow creators to see the brand name/info for deals they are part of.
-- Without this, the brands join on deals returns null for creators (RLS blocks it).

CREATE POLICY brands_read_via_deal
  ON brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.brand_id = brands.id
        AND deals.creator_id = my_creator_id()
    )
  );
