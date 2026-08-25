-- ================================================================
-- ROW LEVEL SECURITY — full policy set
-- Apply in one shot via the Supabase SQL editor (paste the whole file).
--
-- Prerequisites: schema.sql already deployed.
-- Safe to re-run: uses CREATE OR REPLACE for functions,
-- and DROP POLICY IF EXISTS before each CREATE POLICY.
--
-- RULE: every new table MUST have its RLS policies added here at
-- creation time. This file is the single source of truth — if a
-- policy is not here, it should not exist in the live DB.
-- ================================================================


-- ── HELPER FUNCTIONS ─────────────────────────────────────────────
-- SECURITY DEFINER: these run as postgres (bypasses RLS) so they can
-- safely query users/brand_members without recursion. search_path is
-- locked to 'public' to prevent schema-injection attacks.

CREATE OR REPLACE FUNCTION my_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()
$$;

-- ORDER BY + LIMIT are load bearing. brand_members is UNIQUE (brand_id,
-- user_id), so one user can hold rows for two brands; used as a scalar, a
-- two-row subquery raises "more than one row returned by a subquery used as an
-- expression" on every brand-side policy at once, locking that user out of
-- everything. Reachable via the invite accept path, which inserts a membership
-- with no one-brand check. See migration 0470.
CREATE OR REPLACE FUNCTION my_brand_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT brand_id
  FROM brand_members
  WHERE user_id = my_user_id()
  ORDER BY created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION my_creator_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM creators WHERE user_id = my_user_id()
$$;

-- Returns true if the current user is a party to the given deal.
-- Used by messages, deliverables, payments, events, invoices,
-- deal_deliverable_items policies.
CREATE OR REPLACE FUNCTION can_access_deal(p_deal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM deals
    WHERE id = p_deal_id
      AND (brand_id = my_brand_id() OR creator_id = my_creator_id())
  )
$$;


-- ── FIX audit_deal() TRIGGER ─────────────────────────────────────
-- Must be SECURITY DEFINER so the trigger can insert into events
-- regardless of the RLS context of whoever caused the deal change.
-- Body is identical to schema.sql — only SECURITY DEFINER is added.

CREATE OR REPLACE FUNCTION audit_deal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF (tg_op = 'INSERT') THEN
    INSERT INTO events (deal_id, actor_id, event_type, detail)
    VALUES (NEW.id, NEW.created_by, 'deal.created',
            jsonb_build_object('status', NEW.status));
    -- stamp agreed/completed timestamps if created already in those states
    RETURN NEW;

  ELSIF (tg_op = 'UPDATE') THEN
    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      INSERT INTO events (deal_id, actor_id, event_type, detail)
      VALUES (NEW.id, NEW.created_by, 'deal.status_changed',
              jsonb_build_object('from', OLD.status, 'to', NEW.status));

      IF (NEW.status = 'agreed' AND NEW.agreed_at IS NULL) THEN
        NEW.agreed_at = now();
      END IF;
      IF (NEW.status = 'complete' AND NEW.completed_at IS NULL) THEN
        NEW.completed_at = now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;


-- ── ENABLE RLS ON ALL TABLES ─────────────────────────────────────

ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands                ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE creators              ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_deliverable_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_onboarding_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_drafts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_storefronts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_creator_rates  ENABLE ROW LEVEL SECURITY;


-- ── users ─────────────────────────────────────────────────────────
-- Each user can only read/write their own row, matched by auth_id.
-- The auth callback INSERT and dashboard SELECT both rely on these.

DROP POLICY IF EXISTS users_read_own    ON users;
DROP POLICY IF EXISTS users_insert_own  ON users;
DROP POLICY IF EXISTS users_update_own  ON users;
DROP POLICY IF EXISTS users_deny_delete ON users;

CREATE POLICY users_read_own
  ON users FOR SELECT
  USING (auth_id = auth.uid());

CREATE POLICY users_insert_own
  ON users FOR INSERT
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY users_update_own
  ON users FOR UPDATE
  USING (auth_id = auth.uid());

CREATE POLICY users_deny_delete
  ON users FOR DELETE
  USING (false);


-- ── brands ────────────────────────────────────────────────────────
-- A brand member can see only their own brand.
-- Brands are created/modified via service role only.

DROP POLICY IF EXISTS brands_read_own      ON brands;
DROP POLICY IF EXISTS brands_read_via_deal ON brands;

CREATE POLICY brands_read_own
  ON brands FOR SELECT
  USING (id = my_brand_id());

-- Creators can see brands they have deals with (for brand name display)
CREATE POLICY brands_read_via_deal
  ON brands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.brand_id = brands.id
        AND deals.creator_id = my_creator_id()
    )
  );


-- ── brand_members ─────────────────────────────────────────────────
-- A member can see all membership rows for their brand (e.g. "who's
-- on my team"). Rows for other brands are invisible.
-- Membership is managed via service role only.

DROP POLICY IF EXISTS brand_members_read_own_brand ON brand_members;

CREATE POLICY brand_members_read_own_brand
  ON brand_members FOR SELECT
  USING (brand_id = my_brand_id());


-- ── creators ──────────────────────────────────────────────────────
-- SELECT: three cases allowed (AUTHENTICATED ONLY — anon cannot read):
--   1. Any authenticated user can see vetted creators (is_vetted=true)
--      — the "pick a creator" list for brands.
--   2. A creator can always see their own profile, even if not yet vetted.
--   3. A brand member can see any creator already in one of their deals,
--      even if unvetted — covers in-progress relationships.
-- UPDATE: creators can update their own profile only.
-- INSERT/DELETE: service role only (manual onboarding in v1).
--
-- NOTE: phone numbers are a column on this table. RLS cannot filter
-- columns, so the policy cannot hide phone. Protection is at two layers:
--   (a) This policy requires auth.role() = 'authenticated', blocking anon.
--   (b) App queries for public-facing pages (browse) omit phone from SELECT.
-- Phone is only selected in ops (service-role) and auth flows (service-role).

DROP POLICY IF EXISTS creators_read       ON creators;
DROP POLICY IF EXISTS creators_update_own ON creators;
DROP POLICY IF EXISTS creators_deny_delete ON creators;

CREATE POLICY creators_read
  ON creators FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      is_vetted = true
      OR user_id = my_user_id()
      OR EXISTS (
        SELECT 1 FROM deals
        WHERE deals.creator_id = creators.id
          AND deals.brand_id   = my_brand_id()
      )
    )
  );

CREATE POLICY creators_update_own
  ON creators FOR UPDATE
  USING (user_id = my_user_id());

CREATE POLICY creators_deny_delete
  ON creators FOR DELETE
  USING (false);


-- ── deals ─────────────────────────────────────────────────────────
-- SELECT: brand member sees deals for their brand; creator sees their deals.
-- INSERT: brand members only, for their own brand (brand_id must match).
-- UPDATE: both parties can update (status changes, offer counters).
--         Field-level restrictions enforced in app code for v1.

DROP POLICY IF EXISTS deals_read         ON deals;
DROP POLICY IF EXISTS deals_insert_brand ON deals;
DROP POLICY IF EXISTS deals_update       ON deals;
DROP POLICY IF EXISTS deals_deny_delete  ON deals;

-- Held deals (held_at IS NOT NULL) belong to a brand not yet approved to send.
-- They are invisible to the creator HERE, at the database, so no code path —
-- deal inbox, notifications, or anything written later — can leak one.
CREATE POLICY deals_read
  ON deals FOR SELECT
  USING (
    brand_id = my_brand_id()
    OR (creator_id = my_creator_id() AND held_at IS NULL)
  );

CREATE POLICY deals_insert_brand
  ON deals FOR INSERT
  WITH CHECK (brand_id = my_brand_id());

CREATE POLICY deals_update
  ON deals FOR UPDATE
  USING (
    brand_id = my_brand_id()
    OR (creator_id = my_creator_id() AND held_at IS NULL)
  );

CREATE POLICY deals_deny_delete
  ON deals FOR DELETE
  USING (false);


-- ── messages ──────────────────────────────────────────────────────
-- Readable and writable only if you are a party to the deal.
-- No UPDATE or DELETE — messages are append-only.

DROP POLICY IF EXISTS messages_read   ON messages;
DROP POLICY IF EXISTS messages_insert ON messages;

CREATE POLICY messages_read
  ON messages FOR SELECT
  USING (can_access_deal(deal_id));

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


-- ── deliverables ──────────────────────────────────────────────────
-- Readable and uploadable only if you are a party to the deal.
-- Files are versioned (new row per version), not edited in place.

DROP POLICY IF EXISTS deliverables_read   ON deliverables;
DROP POLICY IF EXISTS deliverables_insert ON deliverables;

CREATE POLICY deliverables_read
  ON deliverables FOR SELECT
  USING (can_access_deal(deal_id));

CREATE POLICY deliverables_insert
  ON deliverables FOR INSERT
  WITH CHECK (can_access_deal(deal_id));


-- ── payments ──────────────────────────────────────────────────────
-- Both parties can read payment status (creator needs to see when paid).
-- Only the brand can create or update a payment record.
-- Razorpay webhook status updates run via service role (bypasses RLS).

DROP POLICY IF EXISTS payments_read         ON payments;
DROP POLICY IF EXISTS payments_insert_brand ON payments;
DROP POLICY IF EXISTS payments_update_brand ON payments;
DROP POLICY IF EXISTS payments_deny_delete  ON payments;

CREATE POLICY payments_read
  ON payments FOR SELECT
  USING (can_access_deal(deal_id));

CREATE POLICY payments_insert_brand
  ON payments FOR INSERT
  WITH CHECK (
    deal_id IN (SELECT id FROM deals WHERE brand_id = my_brand_id())
  );

CREATE POLICY payments_update_brand
  ON payments FOR UPDATE
  USING (
    deal_id IN (SELECT id FROM deals WHERE brand_id = my_brand_id())
  );

CREATE POLICY payments_deny_delete
  ON payments FOR DELETE
  USING (false);


-- ── events ────────────────────────────────────────────────────────
-- SELECT only — both parties can see the full audit log for their deal.
-- No INSERT policy: the audit_deal() trigger is SECURITY DEFINER and
-- inserts directly. Any direct INSERT attempt via anon key is rejected.

DROP POLICY IF EXISTS events_read ON events;

CREATE POLICY events_read
  ON events FOR SELECT
  USING (can_access_deal(deal_id));


-- ── invoices ────────────────────────────────────────────────────────
-- MONEY TABLE — write policies are deliberately granular.
-- Both parties can READ invoices for their deals.
-- Only the CREATOR can INSERT (issue an invoice on an approved deal).
-- Both parties can UPDATE (creator: draft→issued; brand: issued→accepted).
-- No client-side delete ever.
--
-- NOTE: migration 009 created policies with _creator/_brand suffixes.
-- Drop both naming conventions to prevent stale duplicates.

DROP POLICY IF EXISTS invoices_read           ON invoices;
DROP POLICY IF EXISTS invoices_insert         ON invoices;
DROP POLICY IF EXISTS invoices_insert_creator ON invoices;
DROP POLICY IF EXISTS invoices_update         ON invoices;
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


-- ── deal_deliverable_items ──────────────────────────────────────────
-- Per-item deliverables within a deal. Same scoping as deliverables.
-- Both parties read; creator submits (insert/update); brand reviews (update).

DROP POLICY IF EXISTS deal_deliverable_items_read            ON deal_deliverable_items;
DROP POLICY IF EXISTS deal_deliverable_items_insert          ON deal_deliverable_items;
DROP POLICY IF EXISTS deal_deliverable_items_update          ON deal_deliverable_items;
-- Orphaned names from migration 005 (different naming convention):
DROP POLICY IF EXISTS deal_deliverable_items_update_creator  ON deal_deliverable_items;
DROP POLICY IF EXISTS deal_deliverable_items_update_brand    ON deal_deliverable_items;
DROP POLICY IF EXISTS deal_deliverable_items_insert_brand    ON deal_deliverable_items;

CREATE POLICY deal_deliverable_items_read
  ON deal_deliverable_items FOR SELECT
  USING (can_access_deal(deal_id));

CREATE POLICY deal_deliverable_items_insert
  ON deal_deliverable_items FOR INSERT
  WITH CHECK (can_access_deal(deal_id));

CREATE POLICY deal_deliverable_items_update
  ON deal_deliverable_items FOR UPDATE
  USING (can_access_deal(deal_id));


-- ── creator_products ────────────────────────────────────────────────
-- A creator's product catalog (rate card items).
-- SELECT: authenticated users can see active products of vetted creators
--         (for browse/deal-builder). Creator always sees their own.
-- INSERT/UPDATE: creator can manage their own products only.
-- No client-side delete.

DROP POLICY IF EXISTS creator_products_read        ON creator_products;
DROP POLICY IF EXISTS creator_products_insert_own  ON creator_products;
DROP POLICY IF EXISTS creator_products_update_own  ON creator_products;
DROP POLICY IF EXISTS creator_products_deny_delete ON creator_products;
-- Orphaned names from migration 004 (different naming convention):
DROP POLICY IF EXISTS creator_products_insert      ON creator_products;
DROP POLICY IF EXISTS creator_products_update      ON creator_products;

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


-- ── creator_onboarding_responses ────────────────────────────────────
-- The one-time post-approval questionnaire.
-- SELECT/INSERT: a creator's own row only. Ops reads via the service role.
-- No UPDATE, no DELETE: the answers are a point-in-time snapshot, and a
-- roster that can rewrite its own answers is not a dataset worth having.

DROP POLICY IF EXISTS creator_onboarding_select_own  ON creator_onboarding_responses;
DROP POLICY IF EXISTS creator_onboarding_insert_own  ON creator_onboarding_responses;
DROP POLICY IF EXISTS creator_onboarding_deny_update ON creator_onboarding_responses;
DROP POLICY IF EXISTS creator_onboarding_deny_delete ON creator_onboarding_responses;

CREATE POLICY creator_onboarding_select_own
  ON creator_onboarding_responses FOR SELECT
  USING (creator_id = my_creator_id());

CREATE POLICY creator_onboarding_insert_own
  ON creator_onboarding_responses FOR INSERT
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY creator_onboarding_deny_update
  ON creator_onboarding_responses FOR UPDATE
  USING (false);

CREATE POLICY creator_onboarding_deny_delete
  ON creator_onboarding_responses FOR DELETE
  USING (false);

-- ── phone_verifications ─────────────────────────────────────────────
-- Contains phone numbers + OTP codes. NO client access at all.
-- All operations go through service role (server actions only).
-- RLS enabled + zero policies = default-deny for all client access.

DROP POLICY IF EXISTS phone_verifications_deny_all ON phone_verifications;

-- No SELECT/INSERT/UPDATE/DELETE policies = default deny.
-- Explicit note: service-role bypasses RLS and is the only access path.


-- ── notifications ─────────────────────────────────────────────────
-- Per-user notification feed. Each user sees only their own.
-- INSERT: service-role only (server actions create notifications).
-- UPDATE: user can mark their own as read (read_at only).
-- No client-side delete.

DROP POLICY IF EXISTS notifications_read_own    ON notifications;
DROP POLICY IF EXISTS notifications_update_own  ON notifications;
DROP POLICY IF EXISTS notifications_deny_delete ON notifications;

CREATE POLICY notifications_read_own
  ON notifications FOR SELECT
  USING (user_id = my_user_id());

CREATE POLICY notifications_update_own
  ON notifications FOR UPDATE
  USING (user_id = my_user_id())
  WITH CHECK (user_id = my_user_id());

CREATE POLICY notifications_deny_delete
  ON notifications FOR DELETE
  USING (false);


-- ── campaigns ───────────────────────────────────────────────────────
-- Grouping container for multiple deals. Brand-scoped.
-- No DELETE policy — campaigns are archived, not deleted.
-- (Consolidated from migration 015_campaigns.sql)

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


-- ── campaign_drafts ─────────────────────────────────────────────────
-- Pre-send roster entries (one per campaign+creator). Brand-scoped
-- transitively via campaigns join.
-- (Consolidated from migration 016_campaign_workspace.sql)

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


-- ── brand_invites ───────────────────────────────────────────────────
-- Team invites. All brand members can read (admin-only filtering is UI-layer).
-- All writes are service-role only (server actions enforce isAdmin).

DROP POLICY IF EXISTS brand_invites_read ON brand_invites;

CREATE POLICY brand_invites_read
  ON brand_invites FOR SELECT TO authenticated
  USING (brand_id = my_brand_id());


-- ── creator_storefronts ───────────────────────────────────────────────
-- Public profile page. Own-only CRUD for the creator.
-- NO anon/public SELECT policy — all anonymous reads go through the
-- get_public_storefront() SECURITY DEFINER function (returns whitelisted
-- JSON only). This prevents broad anon policies from leaking data via
-- permissive-OR union with other policies.

DROP POLICY IF EXISTS creator_storefronts_read_own    ON creator_storefronts;
DROP POLICY IF EXISTS creator_storefronts_insert_own  ON creator_storefronts;
DROP POLICY IF EXISTS creator_storefronts_update_own  ON creator_storefronts;
DROP POLICY IF EXISTS creator_storefronts_deny_delete ON creator_storefronts;

CREATE POLICY creator_storefronts_read_own
  ON creator_storefronts FOR SELECT TO authenticated
  USING (creator_id = my_creator_id());

CREATE POLICY creator_storefronts_insert_own
  ON creator_storefronts FOR INSERT TO authenticated
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY creator_storefronts_update_own
  ON creator_storefronts FOR UPDATE TO authenticated
  USING (creator_id = my_creator_id())
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY creator_storefronts_deny_delete
  ON creator_storefronts FOR DELETE
  USING (false);


-- ── ops_events ──────────────────────────────────────────────────
-- /ops uses the service-role key for ALL data access and bypasses RLS entirely.
-- The security boundary is OPS_ALLOWED_EMAILS (env var checked server-side),
-- not RLS. ops_events is the audit log of all admin actions.
-- No user-facing read access; ops reads via service role.

-- ── brand_creator_rates ──────────────────────────────────────────
-- Ops-only via service-role. No brand or creator read access.
-- Same pattern as ops_events: deny-all, service-role bypasses.

DROP POLICY IF EXISTS brand_creator_rates_deny_all ON brand_creator_rates;
CREATE POLICY brand_creator_rates_deny_all
  ON brand_creator_rates FOR ALL
  USING (false)
  WITH CHECK (false);


DROP POLICY IF EXISTS ops_events_deny_all ON ops_events;
CREATE POLICY ops_events_deny_all
  ON ops_events FOR ALL
  USING (false)
  WITH CHECK (false);


-- ── deal_reviews ──────────────────────────────────────────────────
-- Post-deal ratings. Each side can only see/write their OWN review.
-- Ratings are PRIVATE — neither side sees the other's rating.

DROP POLICY IF EXISTS brand_insert_review   ON deal_reviews;
DROP POLICY IF EXISTS brand_update_review   ON deal_reviews;
DROP POLICY IF EXISTS creator_insert_review ON deal_reviews;
DROP POLICY IF EXISTS creator_update_review ON deal_reviews;
DROP POLICY IF EXISTS brand_read_own_review ON deal_reviews;
DROP POLICY IF EXISTS creator_read_own_review ON deal_reviews;

CREATE POLICY brand_insert_review ON deal_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_role = 'brand'
    AND deal_id IN (
      SELECT d.id FROM deals d
      JOIN brand_members bm ON bm.brand_id = d.brand_id
      WHERE bm.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY brand_update_review ON deal_reviews
  FOR UPDATE TO authenticated
  USING (
    reviewer_role = 'brand'
    AND deal_id IN (
      SELECT d.id FROM deals d
      JOIN brand_members bm ON bm.brand_id = d.brand_id
      WHERE bm.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY creator_insert_review ON deal_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_role = 'creator'
    AND deal_id IN (
      SELECT d.id FROM deals d
      WHERE d.creator_id = (
        SELECT c.id FROM creators c
        JOIN users u ON u.id = c.user_id
        WHERE u.auth_id = auth.uid()
      )
    )
  );

CREATE POLICY creator_update_review ON deal_reviews
  FOR UPDATE TO authenticated
  USING (
    reviewer_role = 'creator'
    AND deal_id IN (
      SELECT d.id FROM deals d
      WHERE d.creator_id = (
        SELECT c.id FROM creators c
        JOIN users u ON u.id = c.user_id
        WHERE u.auth_id = auth.uid()
      )
    )
  );

CREATE POLICY brand_read_own_review ON deal_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_role = 'brand'
    AND deal_id IN (
      SELECT d.id FROM deals d
      JOIN brand_members bm ON bm.brand_id = d.brand_id
      WHERE bm.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY creator_read_own_review ON deal_reviews
  FOR SELECT TO authenticated
  USING (
    reviewer_role = 'creator'
    AND deal_id IN (
      SELECT d.id FROM deals d
      WHERE d.creator_id = (
        SELECT c.id FROM creators c
        JOIN users u ON u.id = c.user_id
        WHERE u.auth_id = auth.uid()
      )
    )
  );


-- ================================================================
-- COLUMN PRIVILEGES
-- ================================================================
--
-- RLS decides WHICH ROWS. These decide WHICH COLUMNS, and the two are needed
-- together: creators_read grants row access to every vetted creator for any
-- authenticated user, and because RLS is row level that would otherwise hand
-- over phone, contact_email and rate_card as well. Signup is open, so
-- "authenticated" costs one OTP.
--
-- Every legitimate read of the three withheld columns uses the service role,
-- which bypasses this entirely — ops, the creator's own settings page, the
-- email and notification senders, the offer OTP lookup. Nothing in the app
-- reads them through the user-scoped client, and if something ever tries it
-- will fail with "permission denied for column" rather than leak.
--
-- Re-runnable: REVOKE then GRANT is idempotent.

-- users: identity columns are not the account holder's to rewrite.
--
-- users_update_own is FOR UPDATE USING (auth_id = auth.uid()) with no WITH
-- CHECK, so the clause defaults to USING. That constrains which ROW may be
-- updated and says nothing about which COLUMNS — leaving `role` writable by its
-- own owner, which made every application-side role check answerable by the
-- caller. See migration 0471.
-- Table-level first, then grant the columns back. Revoking only the column
-- grants is a no-op while a table-level UPDATE grant exists — that is what
-- migration 0471 got wrong, and 0472 corrected.
REVOKE UPDATE ON public.users FROM anon, authenticated;

GRANT UPDATE (
  id, full_name, phone, managed_by, created_at, updated_at,
  terms_accepted_at, terms_version, preferences
) ON public.users TO anon, authenticated;

REVOKE SELECT ON public.creators FROM anon, authenticated;

GRANT SELECT (
  id, user_id, full_name, niche, niches, handle, bio, profile_photo_url,
  worked_with, portfolio_links, social_accounts, location, primary_platform,
  is_vetted, is_rejected, created_at, updated_at
) ON public.creators TO anon, authenticated;


-- ================================================================
-- END OF RLS POLICIES
-- ================================================================

-- ── creator_addon_rates ─────────────────────────────────────────────────────
-- Per-channel Collab and Boosting rates (migration 0483).
--
-- Readable by any signed-in user for a VETTED creator: a brand has to price the
-- add-ons while building an offer, before any deal exists to scope access by.
-- These are asking prices, published for the same reason a rate card is.
-- Writable only by the creator who owns them.

ALTER TABLE creator_addon_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_addon_rates_own_all     ON creator_addon_rates;
DROP POLICY IF EXISTS creator_addon_rates_read_vetted ON creator_addon_rates;

CREATE POLICY creator_addon_rates_own_all
  ON creator_addon_rates FOR ALL
  USING (creator_id = my_creator_id())
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY creator_addon_rates_read_vetted
  ON creator_addon_rates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creators c
      WHERE c.id = creator_addon_rates.creator_id
        AND c.is_vetted = true
    )
  );
