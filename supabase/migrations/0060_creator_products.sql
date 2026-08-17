-- Migration 004: Creator products (per-channel storefront)
-- Old rate_card on creators kept as legacy — CLEANUP TODO: remove once products replace it.

CREATE TABLE creator_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,

  -- References a specific social account by platform + handle
  -- (not a formal FK since social_accounts is JSONB; app enforces consistency)
  platform        text NOT NULL,
  handle          text NOT NULL,

  product_type    text NOT NULL,        -- from shared PRODUCT_TYPES constant
  description     text,
  price_paise     bigint NOT NULL CHECK (price_paise >= 0),  -- money as paise, never float
  display_price   boolean NOT NULL DEFAULT true,              -- whether price shows publicly
  is_active       boolean NOT NULL DEFAULT true,              -- soft disable, never hard-delete

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON creator_products (creator_id);
CREATE INDEX ON creator_products (platform, handle);

-- Auto-touch updated_at (reuses existing function from schema.sql)
CREATE TRIGGER t_creator_products_touch
  BEFORE UPDATE ON creator_products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE creator_products ENABLE ROW LEVEL SECURITY;

-- READ: creator sees own products; brands see products of vetted creators
-- or creators they have a deal with.
CREATE POLICY creator_products_read
  ON creator_products FOR SELECT
  USING (
    creator_id IN (SELECT id FROM creators WHERE user_id = my_user_id())
    OR creator_id IN (SELECT id FROM creators WHERE is_vetted = true)
    OR creator_id IN (SELECT creator_id FROM deals WHERE brand_id = my_brand_id())
  );

-- INSERT: only the creator themselves (once they have a user_id).
-- v1: ops uses service-role (bypasses RLS) for stub creators.
CREATE POLICY creator_products_insert
  ON creator_products FOR INSERT
  WITH CHECK (
    creator_id IN (SELECT id FROM creators WHERE user_id = my_user_id())
  );

-- UPDATE: only the creator themselves.
-- v1: ops uses service-role for stub creators.
CREATE POLICY creator_products_update
  ON creator_products FOR UPDATE
  USING (
    creator_id IN (SELECT id FROM creators WHERE user_id = my_user_id())
  );

-- No DELETE policy — soft-disable via is_active, never hard-delete.
