-- Migration 019: RLS policy reconciliation
-- Cleans up orphaned policies from migrations that used different naming
-- conventions than rls.sql, then re-applies the authoritative policy set.
--
-- CONTEXT: migrations 004, 005, 009 created policies with names like
-- creator_products_insert, deal_deliverable_items_update_creator,
-- invoices_insert_creator. When rls.sql was later updated, it dropped
-- and recreated policies with DIFFERENT names (e.g. creator_products_insert_own),
-- leaving the migration-named ones alive in the DB. Postgres RLS is
-- permissive-OR, so the stale broader policies silently overrode the
-- intended granularity — especially on invoices (a money table).
--
-- ALSO: campaigns and campaign_drafts had policies only in their migration
-- files (015, 016), never consolidated into rls.sql. This migration
-- drops and recreates them from rls.sql's authoritative definitions.
--
-- After this migration, re-running rls.sql from scratch produces an
-- identical policy set (idempotent).

-- ── 1. Drop orphaned invoice policies from migration 009 ──────────
-- rls.sql now defines: invoices_read, invoices_insert_creator,
-- invoices_update_creator, invoices_update_brand, invoices_deny_delete.
-- Kill the old broad names that were never dropped:
DROP POLICY IF EXISTS invoices_insert ON invoices;
DROP POLICY IF EXISTS invoices_update ON invoices;

-- The migration-named ones are now the CANONICAL names in rls.sql,
-- so drop+recreate to ensure the definitions match rls.sql exactly:
DROP POLICY IF EXISTS invoices_read           ON invoices;
DROP POLICY IF EXISTS invoices_insert_creator ON invoices;
DROP POLICY IF EXISTS invoices_update_creator ON invoices;
DROP POLICY IF EXISTS invoices_update_brand   ON invoices;
DROP POLICY IF EXISTS invoices_deny_delete    ON invoices;

CREATE POLICY invoices_read
  ON invoices FOR SELECT
  USING (can_access_deal(deal_id));

CREATE POLICY invoices_insert_creator
  ON invoices FOR INSERT
  WITH CHECK (
    deal_id IN (SELECT id FROM deals WHERE creator_id = my_creator_id())
  );

CREATE POLICY invoices_update_creator
  ON invoices FOR UPDATE
  USING (
    deal_id IN (SELECT id FROM deals WHERE creator_id = my_creator_id())
  );

CREATE POLICY invoices_update_brand
  ON invoices FOR UPDATE
  USING (
    deal_id IN (SELECT id FROM deals WHERE brand_id = my_brand_id())
  );

CREATE POLICY invoices_deny_delete
  ON invoices FOR DELETE
  USING (false);


-- ── 2. Drop orphaned deal_deliverable_items policies from migration 005 ──
DROP POLICY IF EXISTS deal_deliverable_items_update_creator ON deal_deliverable_items;
DROP POLICY IF EXISTS deal_deliverable_items_update_brand   ON deal_deliverable_items;
DROP POLICY IF EXISTS deal_deliverable_items_insert_brand   ON deal_deliverable_items;

-- Recreate canonical set from rls.sql:
DROP POLICY IF EXISTS deal_deliverable_items_read   ON deal_deliverable_items;
DROP POLICY IF EXISTS deal_deliverable_items_insert ON deal_deliverable_items;
DROP POLICY IF EXISTS deal_deliverable_items_update ON deal_deliverable_items;

CREATE POLICY deal_deliverable_items_read
  ON deal_deliverable_items FOR SELECT
  USING (can_access_deal(deal_id));

CREATE POLICY deal_deliverable_items_insert
  ON deal_deliverable_items FOR INSERT
  WITH CHECK (can_access_deal(deal_id));

CREATE POLICY deal_deliverable_items_update
  ON deal_deliverable_items FOR UPDATE
  USING (can_access_deal(deal_id));


-- ── 3. Drop orphaned creator_products policies from migration 004 ──
DROP POLICY IF EXISTS creator_products_insert ON creator_products;
DROP POLICY IF EXISTS creator_products_update ON creator_products;

-- Recreate canonical set from rls.sql:
DROP POLICY IF EXISTS creator_products_read        ON creator_products;
DROP POLICY IF EXISTS creator_products_insert_own  ON creator_products;
DROP POLICY IF EXISTS creator_products_update_own  ON creator_products;
DROP POLICY IF EXISTS creator_products_deny_delete ON creator_products;

CREATE POLICY creator_products_read
  ON creator_products FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      creator_id = my_creator_id()
      OR (
        is_active = true
        AND EXISTS (
          SELECT 1 FROM creators
          WHERE creators.id = creator_products.creator_id
            AND creators.is_vetted = true
        )
      )
    )
  );

CREATE POLICY creator_products_insert_own
  ON creator_products FOR INSERT
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY creator_products_update_own
  ON creator_products FOR UPDATE
  USING (creator_id = my_creator_id());

CREATE POLICY creator_products_deny_delete
  ON creator_products FOR DELETE
  USING (false);


-- ── 4. Campaigns — consolidate from migration 015 ──────────────────
-- Policies already exist from the migration; drop+recreate to match rls.sql.
DROP POLICY IF EXISTS campaigns_read_brand   ON campaigns;
DROP POLICY IF EXISTS campaigns_insert_brand ON campaigns;
DROP POLICY IF EXISTS campaigns_update_brand ON campaigns;

CREATE POLICY campaigns_read_brand
  ON campaigns FOR SELECT TO authenticated
  USING (brand_id = my_brand_id());

CREATE POLICY campaigns_insert_brand
  ON campaigns FOR INSERT TO authenticated
  WITH CHECK (brand_id = my_brand_id());

CREATE POLICY campaigns_update_brand
  ON campaigns FOR UPDATE TO authenticated
  USING (brand_id = my_brand_id())
  WITH CHECK (brand_id = my_brand_id());


-- ── 5. Campaign drafts — consolidate from migration 016 ────────────
DROP POLICY IF EXISTS campaign_drafts_read   ON campaign_drafts;
DROP POLICY IF EXISTS campaign_drafts_insert ON campaign_drafts;
DROP POLICY IF EXISTS campaign_drafts_update ON campaign_drafts;
DROP POLICY IF EXISTS campaign_drafts_delete ON campaign_drafts;

CREATE POLICY campaign_drafts_read
  ON campaign_drafts FOR SELECT TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE brand_id = my_brand_id()));

CREATE POLICY campaign_drafts_insert
  ON campaign_drafts FOR INSERT TO authenticated
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE brand_id = my_brand_id()));

CREATE POLICY campaign_drafts_update
  ON campaign_drafts FOR UPDATE TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE brand_id = my_brand_id()));

CREATE POLICY campaign_drafts_delete
  ON campaign_drafts FOR DELETE TO authenticated
  USING (campaign_id IN (SELECT id FROM campaigns WHERE brand_id = my_brand_id()));


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
