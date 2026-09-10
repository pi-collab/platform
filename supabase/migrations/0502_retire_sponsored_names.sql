-- Migration 0502: drop "Sponsored" from product names
--
-- ── What this changes ──────────────────────────────────────────────────────
-- creator_products.product_type only. Eleven rows, all on instagram:
--   Sponsored Reel  -> Instagram Reel
--   Sponsored Post  -> Instagram Static/Carousel
--   Sponsored Story -> Instagram Story
--
-- These are the retired vocabulary. New packages have not been able to use
-- them for some time - lib/product-types.ts offers Instagram Reel, Instagram
-- Static/Carousel and Instagram Story - and they survived only on packages
-- created before the rename. A creator's rate card is a live document, so
-- bringing it onto the current names is a correction, not a rewrite.
--
-- ── What this deliberately does NOT touch ──────────────────────────────────
-- deal_deliverable_items.label. Sixty-eight of those carry "Sponsored Reel" or
-- "Sponsored Post", and they are not a vocabulary: they are the description of
-- work on deals that were agreed, delivered and in most cases paid. Renaming
-- them would change what a completed deal says it was for, which is the same
-- reason fee_percent and the rights terms are snapshotted rather than read
-- live. New deals take the new name from the product they are built from, so
-- this fades on its own.
--
-- Mapping note: "Sponsored Post" becomes Instagram Static/Carousel because
-- that is what a feed post is in the current vocabulary; there is no plain
-- "Instagram Post" to move it to.

UPDATE creator_products SET product_type = 'Instagram Reel'
 WHERE product_type = 'Sponsored Reel';

UPDATE creator_products SET product_type = 'Instagram Static/Carousel'
 WHERE product_type = 'Sponsored Post';

UPDATE creator_products SET product_type = 'Instagram Story'
 WHERE product_type = 'Sponsored Story';

-- Should return no rows.
SELECT product_type, count(*)
  FROM creator_products
 WHERE product_type LIKE 'Sponsored%'
 GROUP BY product_type;
