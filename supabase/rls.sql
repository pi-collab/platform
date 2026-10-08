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
ALTER TABLE brand_onboarding_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_search_queries            ENABLE ROW LEVEL SECURITY;
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

-- Creators can see brands they have deals with (for brand name and logo display)
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
--   1. Any authenticated user can see BOOKABLE creators (is_bookable=true,
--      i.e. deals_approved OR growth) — the "pick a creator" list for brands.
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
      -- is_bookable, NOT is_vetted: true for deals_approved AND growth, which
      -- is the whole of how Growth creators reach brands (migration 0507).
      -- is_vetted still means "approved for Deals" and still gates storefronts
      -- and the verified badge.
      is_bookable = true
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
-- INSERT: none for signed-in users. createDeal inserts with the service role
--         after computing the fee and the send gate itself (migration 0520).
-- UPDATE: a party may update only their own deal (policy below), and only the
--         columns / status moves the guard_deal_write trigger allows (0520).

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

CREATE POLICY deals_update
  ON deals FOR UPDATE
  USING (
    brand_id = my_brand_id()
    OR (creator_id = my_creator_id() AND held_at IS NULL)
  );

CREATE POLICY deals_deny_delete
  ON deals FOR DELETE
  USING (false);

-- Column / status guard for signed-in users (0520). Kept here so a fresh
-- database built from schema + migrations + rls.sql ends with it in place.
CREATE OR REPLACE FUNCTION guard_deal_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_brand      boolean;
  is_creator    boolean;
  accepting     boolean;
  ok_status     boolean;
  posted_change boolean;
  allowed       text[];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  is_brand   := coalesce(OLD.brand_id = my_brand_id(), false);
  is_creator := coalesce(OLD.creator_id = my_creator_id(), false);
  accepting  := (OLD.status = 'negotiating' AND NEW.status = 'agreed');

  IF is_brand THEN
    allowed := ARRAY['updated_at', 'agreed_at', 'completed_at',
                     'title', 'internal_note', 'campaign_id',
                     'shipment_status', 'tracking_link', 'carrier_note', 'shipped_at',
                     'status', 'price_paise', 'rights_confirmed_at'];
  ELSIF is_creator THEN
    allowed := ARRAY['updated_at', 'agreed_at', 'completed_at',
                     'shipping_address', 'is_posted', 'posted_url', 'posted_at',
                     'status', 'price_paise', 'rights_confirmed_at'];
  ELSE
    RAISE EXCEPTION 'Not a party to this deal' USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'This change is not allowed on a deal' USING ERRCODE = '42501';
  END IF;

  -- Status: only the moves the app makes
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF is_brand THEN
      ok_status := accepting
                OR (OLD.status = 'negotiating' AND NEW.status = 'cancelled')
                OR (OLD.status IN ('delivered', 'revision') AND NEW.status = 'approved');
    ELSE
      ok_status := accepting
                OR (OLD.status = 'negotiating' AND NEW.status = 'declined')
                OR (OLD.status IN ('agreed', 'revision') AND NEW.status = 'delivered');
    END IF;
    IF NOT ok_status THEN
      RAISE EXCEPTION 'A deal cannot move from % to % this way', OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Price and rights: only by accepting
  IF NEW.price_paise IS DISTINCT FROM OLD.price_paise AND NOT accepting THEN
    RAISE EXCEPTION 'The price changes only by accepting a counter offer' USING ERRCODE = '42501';
  END IF;
  IF NEW.rights_confirmed_at IS DISTINCT FROM OLD.rights_confirmed_at AND NOT accepting THEN
    RAISE EXCEPTION 'Rights are confirmed only when the deal is agreed' USING ERRCODE = '42501';
  END IF;

  -- Posted: once the work is approved, never before
  posted_change := NEW.is_posted IS DISTINCT FROM OLD.is_posted
                OR NEW.posted_url IS DISTINCT FROM OLD.posted_url
                OR NEW.posted_at IS DISTINCT FROM OLD.posted_at;
  IF posted_change AND OLD.status NOT IN ('approved', 'paid', 'complete') THEN
    RAISE EXCEPTION 'Mark as posted only after the content is approved' USING ERRCODE = '42501';
  END IF;

  -- Campaign: only one of the brand's own
  IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id AND NEW.campaign_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM campaigns c WHERE c.id = NEW.campaign_id AND c.brand_id = OLD.brand_id) THEN
      RAISE EXCEPTION 'That campaign does not belong to this brand' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION guard_deal_write() IS
  'BEFORE UPDATE guard on deals for signed-in users: per-party column allowlist, '
  'allowed status transitions, price only on counter acceptance. Service role and '
  'SECURITY DEFINER functions bypass it. See migration 0520.';

DROP TRIGGER IF EXISTS t_deals_00_guard ON deals;
CREATE TRIGGER t_deals_00_guard
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION guard_deal_write();



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
-- MONEY TABLE.
-- Both parties can READ invoices for their deals.
-- NO insert or update for signed-in users (migration 0521): generateInvoice,
-- issueInvoice and acceptInvoice write with the service role after checking
-- the caller is the deal's own creator / brand and the status is right.
-- Paying is the SECURITY DEFINER function mark_deal_paid.
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

-- visible_to_creator (0522): a creator does not see items marked hidden;
-- the brand sees all of its own. Default true leaves existing deals unchanged.
CREATE POLICY deal_deliverable_items_read
  ON deal_deliverable_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_id
        AND (d.brand_id = my_brand_id()
             OR (d.creator_id = my_creator_id() AND visible_to_creator))
    )
  );

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
        -- 0533: a non-owner sees marketplace packages only. A shoot day rate
        -- (per_day) prices an Experience creator leg and is never shown to a
        -- brand; any future pricing type is hidden until listed here.
        AND pricing_type = 'per_deliverable'
        AND EXISTS (
          SELECT 1 FROM creators
          WHERE creators.id = creator_products.creator_id
            AND creators.is_bookable = true
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

-- ── brand_onboarding_responses ──────────────────────────────────────
-- The one-time questionnaire asked on a brand's first dashboard visit.
-- One row per brand, shared by its members.
-- SELECT/INSERT: the member's own brand only. Ops reads via the service role.
-- No UPDATE, no DELETE: the answers are a point-in-time snapshot.

DROP POLICY IF EXISTS brand_onboarding_select_own  ON brand_onboarding_responses;
DROP POLICY IF EXISTS brand_onboarding_insert_own  ON brand_onboarding_responses;
DROP POLICY IF EXISTS brand_onboarding_deny_update ON brand_onboarding_responses;
DROP POLICY IF EXISTS brand_onboarding_deny_delete ON brand_onboarding_responses;

CREATE POLICY brand_onboarding_select_own
  ON brand_onboarding_responses FOR SELECT
  USING (brand_id = my_brand_id());

CREATE POLICY brand_onboarding_insert_own
  ON brand_onboarding_responses FOR INSERT
  WITH CHECK (brand_id = my_brand_id());

CREATE POLICY brand_onboarding_deny_update
  ON brand_onboarding_responses FOR UPDATE
  USING (false);

CREATE POLICY brand_onboarding_deny_delete
  ON brand_onboarding_responses FOR DELETE
  USING (false);

-- ── ai_search_queries ───────────────────────────────────────────────
-- The AI creator search log, parse cache and rate cap.
-- SELECT: the member's own brand only. What a brand searches for is theirs.
-- No client writes at all: the row records what the server did, including the
-- token counts the rate cap reads, so a forged row could reset a brand's cap.

DROP POLICY IF EXISTS ai_search_select_own  ON ai_search_queries;
DROP POLICY IF EXISTS ai_search_deny_insert ON ai_search_queries;
DROP POLICY IF EXISTS ai_search_deny_update ON ai_search_queries;
DROP POLICY IF EXISTS ai_search_deny_delete ON ai_search_queries;

CREATE POLICY ai_search_select_own
  ON ai_search_queries FOR SELECT
  USING (brand_id = my_brand_id());

CREATE POLICY ai_search_deny_insert
  ON ai_search_queries FOR INSERT
  WITH CHECK (false);

CREATE POLICY ai_search_deny_update
  ON ai_search_queries FOR UPDATE
  USING (false);

CREATE POLICY ai_search_deny_delete
  ON ai_search_queries FOR DELETE
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
--
-- The own-row SELECT policy means a creator CANNOT see whether another
-- creator holds a slug, which is correct and is why the two questions the
-- product asks about a slug are both answered by SECURITY DEFINER functions
-- rather than by a SELECT:
--
--   get_public_storefront(slug)                 → the published page, anon
--   is_storefront_slug_taken(slug, creator_id)  → a BOOLEAN, authenticated
--
-- is_storefront_slug_taken is REVOKED from anon explicitly (migration 0511).
-- Revoking from PUBLIC alone leaves Supabase's direct grant to anon in place,
-- and an open version of it enumerates slugs including unpublished drafts.

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


-- ── pipeline_leads / pipeline_feedback (0497) ────────────────────
-- Outreach pipeline. Deny-all, service-role only — same posture as ops_events.
-- These hold internal commentary about named companies and people, including
-- prospects who never became customers and never consented to a profile. There
-- is no reader outside /ops, and the scoped outreach role reaches them through
-- the same admin client every other ops read already uses.

DROP POLICY IF EXISTS pipeline_leads_deny_all ON pipeline_leads;
CREATE POLICY pipeline_leads_deny_all
  ON pipeline_leads FOR ALL
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS pipeline_feedback_deny_all ON pipeline_feedback;
CREATE POLICY pipeline_feedback_deny_all
  ON pipeline_feedback FOR ALL
  USING (false)
  WITH CHECK (false);

-- The REVOKE is part of the posture, not an afterthought (see 0498). Supabase's
-- default privileges GRANT ALL on every new public table to anon and
-- authenticated, so a deny-all policy with no revoke is a SINGLE layer, not
-- two. Re-runnable, and included here because rls.sql is the source of truth
-- for how these tables are protected.
REVOKE ALL ON TABLE pipeline_leads    FROM anon, authenticated;
REVOKE ALL ON TABLE pipeline_feedback FROM anon, authenticated;


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

-- COLUMN-LEVEL ALLOWLIST. Every column added to creators must be listed here
-- or a query naming it fails with "permission denied for table creators" — the
-- whole query, not just that column. vetting_status was added and not granted,
-- and the creator layout stopped being able to read its own row at all.
GRANT SELECT (
  id, user_id, full_name, niche, niches, handle, bio, profile_photo_url,
  worked_with, portfolio_links, social_accounts, location, primary_platform,
  is_vetted, is_rejected, vetting_status, is_bookable,
  revisions_enabled, included_revisions, price_per_extra_revision_paise,
  created_at, updated_at
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
        AND c.is_bookable = true
    )
  );

-- ── creator_growth_quiz_responses ───────────────────────────────────────────
-- The Guapd Growth quiz (migration 0488). A snapshot: a creator writes their
-- answers once and reads them back. UPDATE and DELETE are denied outright, so
-- an answer cannot be revised after the fact and the aggregate the Growth
-- product will be built on stays trustworthy.

ALTER TABLE creator_growth_quiz_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS growth_quiz_select_own  ON creator_growth_quiz_responses;
DROP POLICY IF EXISTS growth_quiz_insert_own  ON creator_growth_quiz_responses;
DROP POLICY IF EXISTS growth_quiz_deny_update ON creator_growth_quiz_responses;
DROP POLICY IF EXISTS growth_quiz_deny_delete ON creator_growth_quiz_responses;

CREATE POLICY growth_quiz_select_own
  ON creator_growth_quiz_responses FOR SELECT
  USING (creator_id = my_creator_id());

CREATE POLICY growth_quiz_insert_own
  ON creator_growth_quiz_responses FOR INSERT
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY growth_quiz_deny_update
  ON creator_growth_quiz_responses FOR UPDATE
  USING (false);

CREATE POLICY growth_quiz_deny_delete
  ON creator_growth_quiz_responses FOR DELETE
  USING (false);

-- ── message_reads (0496) ────────────────────────────────────────────────────
-- Per-user, per-deal read marker behind the header unread badge. Per USER and
-- not per party on purpose: a brand team does not read as one person, and
-- marking a thread read for a colleague hides a message rather than miscounting
-- it. Own rows only — "has the brand read my message yet" is a question this
-- table would answer if it were readable across the boundary.
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_reads_select_own ON message_reads;
DROP POLICY IF EXISTS message_reads_insert_own ON message_reads;
DROP POLICY IF EXISTS message_reads_update_own ON message_reads;

CREATE POLICY message_reads_select_own ON message_reads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY message_reads_insert_own ON message_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY message_reads_update_own ON message_reads
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ── brand_entitlements ──────────────────────────────────────────────────────
-- What a brand may do, independent of HOW it was granted (migration 0508).
-- A brand reads its own; nobody writes from a client role, because an
-- entitlement a brand can grant itself is not an entitlement.

ALTER TABLE brand_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_entitlements_read_own ON brand_entitlements;

CREATE POLICY brand_entitlements_read_own
  ON brand_entitlements FOR SELECT
  TO authenticated
  USING (brand_id = my_brand_id());

-- No INSERT/UPDATE/DELETE policy: all three are denied to every client role.


-- ── platform_settings ───────────────────────────────────────────────────────
-- Global settings ops tunes without a deploy (migration 0509).
-- Readable by any signed-in user: the campaign builder must SHOW the Growth
-- minimum before it can enforce it. A brand reading a threshold about to be
-- applied to them is the point, not a leak. Writes are service-role only.

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_read ON platform_settings;

CREATE POLICY platform_settings_read
  ON platform_settings FOR SELECT
  TO authenticated
  USING (true);


-- ── usage_events ────────────────────────────────────────────────────────────
-- The immutable billing ledger (migration 0510). One row per billable unit:
-- one per DEAL on the deals track, ONE PER CAMPAIGN on the growth track.
-- A brand reads its own usage. Nothing writes from a client role — a ledger a
-- brand can write is not a ledger.

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_read_own ON usage_events;

CREATE POLICY usage_events_read_own
  ON usage_events FOR SELECT
  TO authenticated
  USING (brand_id = my_brand_id());

-- ════════════════════════════════════════════════════════════════════════
-- EXPERIENCES (migrations 0522–0524)
-- Portal boundary at the data layer:
--   * brand reads ONLY its own experiences (granted columns), roster (no money
--     columns exist there) and service invoices. Never creator terms, margin,
--     cost lines, vendors, payouts, follow-ons or internal notes.
--   * creator reads ONLY their own leg's terms, payouts to themselves, and
--     their own follow-ons. Margin is not stored anywhere (0525): it is
--     derived for the ops P&L in apps/web/lib/experience-money.ts.
--   * Leg rows themselves are deals: deals_read already scopes them, because
--     Leg 1's creator is the Guapd house creator and Leg 2's brand is the Guapd
--     house brand.
--   * Every write is service role only (ops / server actions with explicit
--     column lists). No INSERT/UPDATE/DELETE policy exists on any table here.
-- Supabase grants ALL on new tables to anon/authenticated by default, so each
-- table is REVOKEd first and only specific columns are granted back.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guapd_brand_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM brands WHERE is_guapd LIMIT 1
$$;

CREATE OR REPLACE FUNCTION guapd_creator_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM creators WHERE is_guapd LIMIT 1
$$;

CREATE OR REPLACE FUNCTION is_my_vendor(p_vendor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM vendors
    WHERE id = p_vendor_id AND creator_id IS NOT NULL AND creator_id = my_creator_id()
  )
$$;

ALTER TABLE deal_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences              ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_finance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_creator_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_roster        ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_cost_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payout_details    ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_private          ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payouts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_follow_ons          ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON deal_templates, experiences, experience_finance, experience_creator_terms,
              experience_roster, experience_cost_lines, vendors, vendor_payout_details,
              creator_private, service_invoices, vendor_payouts, deal_follow_ons
  FROM anon, authenticated;

GRANT SELECT (id, brand_id, title, status, brand_service_total_paise, shoot_date, shoot_city, created_at, updated_at)
  ON experiences TO authenticated;
GRANT SELECT (deal_id, experience_id, creator_id, day_rate_paise, days, creator_gross_paise, platform_pct, creator_net_paise,
              platform_track, locked_at, created_at, updated_at)
  ON experience_creator_terms TO authenticated;
GRANT SELECT (id, experience_id, creator_id, added_by, brand_decision, locked, decided_at, created_at, updated_at)
  ON experience_roster TO authenticated;
GRANT SELECT (id, experience_id, brand_id, kind, number, status, issue_date, due_date, lines, subtotal_paise,
              gst_rate_pct, cgst_paise, sgst_paise, igst_paise, tds_paise, total_paise,
              supplier_gstin, supplier_gstin_provisional, supplier_arn,
              recipient_legal_name, recipient_gstin, recipient_state, place_of_supply,
              payment_reference, paid_at, created_at, updated_at,
              per_video_paise, deliverable_count, misc_paise, source)
  ON service_invoices TO authenticated;
GRANT SELECT (id, experience_id, deal_id, reason, amount_paise, tds_paise, net_amount_paise, status, external_ref, paid_at, created_at, updated_at)
  ON vendor_payouts TO authenticated;
GRANT SELECT (id, experience_id, deal_id, creator_id, type, trigger, basis, invoicer, pct, fixed_paise, trigger_date,
              sales_figure_paise, sales_verified_at, creator_gross_paise, platform_pct, creator_net_paise, status, created_at, updated_at)
  ON deal_follow_ons TO authenticated;

DROP POLICY IF EXISTS experiences_read_brand ON experiences;
CREATE POLICY experiences_read_brand ON experiences FOR SELECT
  USING (brand_id = my_brand_id() AND brand_id IS DISTINCT FROM guapd_brand_id());

DROP POLICY IF EXISTS ect_read_own_creator ON experience_creator_terms;
CREATE POLICY ect_read_own_creator ON experience_creator_terms FOR SELECT
  USING (creator_id = my_creator_id() AND creator_id IS DISTINCT FROM guapd_creator_id());

DROP POLICY IF EXISTS roster_read_brand ON experience_roster;
CREATE POLICY roster_read_brand ON experience_roster FOR SELECT
  USING (EXISTS (SELECT 1 FROM experiences e WHERE e.id = experience_id AND e.brand_id = my_brand_id()));

-- si_read_brand (service_invoices) and vp_read_own_creator (vendor_payouts)
-- were removed in 0540: see "Experience money loop (0540)" below.

DROP POLICY IF EXISTS dfo_read_own_creator ON deal_follow_ons;
CREATE POLICY dfo_read_own_creator ON deal_follow_ons FOR SELECT
  USING (creator_id = my_creator_id() AND creator_id IS DISTINCT FROM guapd_creator_id());

-- ── Experience P&L access (0526): operational vs financial, opt-in per person ──
-- The P&L is reachable only through experience_pnl(), which checks the CALLER's
-- staff_access.experiences_financial. The service role has no caller and is
-- refused. Raw tables have no user access.
ALTER TABLE staff_access             ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_pnl_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON staff_access, experience_pnl_snapshots FROM anon, authenticated;

CREATE OR REPLACE FUNCTION has_experience_access(p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT coalesce((
    SELECT CASE p_kind
             WHEN 'financial'   THEN experiences_financial
             WHEN 'operational' THEN experiences_operational OR experiences_financial
             ELSE false
           END
    FROM staff_access WHERE user_id = my_user_id()
  ), false)
$$;

-- 0537: accepted legs only, revenue = invoiced, reconciliation enforced.
-- 0538: a creator recorded as not shooting is not counted.
CREATE OR REPLACE FUNCTION compute_experience_pnl(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_billed bigint; v_received bigint; v_invoices int; v_agreed bigint;
  v_gross bigint; v_net bigint; v_per_leg jsonb;
  v_awaiting int; v_awaiting_net bigint; v_declined int; v_no_shoot int;
  v_costs bigint; v_by_cat jsonb;
  v_subtotal bigint; v_fee_kept bigint; v_margin bigint;
BEGIN
  SELECT coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status IN ('issued', 'paid')), 0)::bigint,
         coalesce(sum(si.subtotal_paise) FILTER (WHERE si.status = 'paid'), 0)::bigint,
         count(*) FILTER (WHERE si.status IN ('issued', 'paid'))::int
    INTO v_billed, v_received, v_invoices
    FROM service_invoices si WHERE si.experience_id = p_experience_id;
  SELECT e.brand_service_total_paise INTO v_agreed FROM experiences e WHERE e.id = p_experience_id;

  -- Accepted legs only (agreed onward), minus any creator recorded as not shooting.
  SELECT coalesce(sum(t.creator_gross_paise), 0)::bigint, coalesce(sum(t.creator_net_paise), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
           'deal_id', t.deal_id, 'creator_id', t.creator_id, 'full_name', c.full_name, 'deal_status', d.status::text,
           'platform_track', t.platform_track, 'platform_pct', t.platform_pct,
           'day_rate_paise', t.day_rate_paise, 'days', t.days,
           'creator_gross_paise', t.creator_gross_paise, 'platform_fee_paise', t.creator_gross_paise - t.creator_net_paise,
           'creator_net_paise', t.creator_net_paise) ORDER BY t.created_at), '[]'::jsonb)
    INTO v_gross, v_net, v_per_leg
    FROM experience_creator_terms t
    JOIN deals d ON d.id = t.deal_id
    JOIN creators c ON c.id = t.creator_id
    WHERE t.experience_id = p_experience_id AND t.locked_at IS NOT NULL
      AND d.status IN ('agreed', 'delivered', 'revision', 'approved', 'paid', 'complete')
      AND NOT EXISTS (SELECT 1 FROM experience_roster r WHERE r.leg_deal_id = t.deal_id AND r.leg_shoot_outcome = 'did_not_shoot');

  SELECT count(*) FILTER (WHERE d.status = 'negotiating')::int,
         coalesce(sum(t.creator_net_paise) FILTER (WHERE d.status = 'negotiating'), 0)::bigint,
         count(*) FILTER (WHERE d.status IN ('declined', 'cancelled'))::int,
         count(*) FILTER (WHERE r.leg_shoot_outcome = 'did_not_shoot')::int
    INTO v_awaiting, v_awaiting_net, v_declined, v_no_shoot
    FROM experience_creator_terms t JOIN deals d ON d.id = t.deal_id
    LEFT JOIN experience_roster r ON r.leg_deal_id = t.deal_id
    WHERE t.experience_id = p_experience_id;

  v_costs := experience_cost_total(p_experience_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'total_paise', x.total) ORDER BY x.category), '[]'::jsonb)
    INTO v_by_cat
    FROM (SELECT cl.category, sum(cl.total_paise)::bigint AS total FROM experience_cost_lines cl
          WHERE cl.experience_id = p_experience_id AND cl.provided_by = 'guapd' AND cl.removed_at IS NULL
          GROUP BY cl.category) x;

  v_subtotal := v_billed - v_gross - v_costs;
  v_fee_kept := v_gross - v_net;
  v_margin := v_billed - v_net - v_costs;
  IF v_subtotal + v_fee_kept IS DISTINCT FROM v_margin THEN
    RAISE EXCEPTION 'P&L does not reconcile: sub-total % + fee kept % <> margin %', v_subtotal, v_fee_kept, v_margin;
  END IF;

  RETURN jsonb_build_object(
    'experience_id', p_experience_id,
    'brand_revenue_paise', v_billed, 'revenue_basis', 'invoiced', 'revenue_pending_invoice', v_invoices = 0,
    'invoices_counted', v_invoices, 'brand_received_paise', v_received, 'brand_agreed_paise', v_agreed,
    'creator_gross_total_paise', v_gross, 'creator_net_total_paise', v_net,
    'guapd_costs_total_paise', v_costs, 'costs_by_category', v_by_cat,
    'subtotal_paise', v_subtotal, 'platform_fee_kept_paise', v_fee_kept, 'guapd_margin_paise', v_margin,
    'legs_counted', jsonb_array_length(v_per_leg), 'legs_awaiting', v_awaiting, 'awaiting_net_paise', v_awaiting_net,
    'legs_declined', v_declined, 'legs_pending', v_awaiting, 'legs_did_not_shoot', v_no_shoot,
    'per_leg', v_per_leg);
END;
$$;

CREATE OR REPLACE FUNCTION experience_pnl(p_experience_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pnl jsonb; v_at timestamptz; v_final boolean; v_stored bigint;
BEGIN
  IF has_experience_access('financial') IS NOT TRUE THEN
    RAISE EXCEPTION 'Financial access required' USING ERRCODE = '42501';
  END IF;
  SELECT s.pnl, s.captured_at, s.is_final, s.guapd_margin_paise INTO v_pnl, v_at, v_final, v_stored
    FROM experience_pnl_snapshots s WHERE s.experience_id = p_experience_id;
  IF v_final THEN
    RETURN v_pnl || jsonb_build_object('source', 'snapshot', 'captured_at', v_at);
  END IF;
  RETURN compute_experience_pnl(p_experience_id)
         || jsonb_build_object('source', 'live', 'stored_at', v_at, 'stored_margin_paise', v_stored);
END;
$$;

CREATE OR REPLACE FUNCTION experience_payouts(p_experience_id uuid)
RETURNS TABLE (id uuid, vendor_name text, deal_id uuid, reason text, amount_paise bigint, tds_paise bigint,
               net_amount_paise bigint, status text, external_ref text, approved_at timestamptz, paid_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF has_experience_access('operational') IS NOT TRUE THEN
    RAISE EXCEPTION 'Operational access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, v.display_name, p.deal_id, p.reason, p.amount_paise, p.tds_paise,
           p.net_amount_paise, p.status, p.external_ref, p.approved_at, p.paid_at
    FROM vendor_payouts p JOIN vendors v ON v.id = p.vendor_id
    WHERE p.experience_id = p_experience_id
    ORDER BY p.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION compute_experience_pnl(uuid)  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION snapshot_experience_pnl()     FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_pnl(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_payouts(uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION has_experience_access(text)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_pnl(uuid)          TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_payouts(uuid)      TO authenticated;
GRANT  EXECUTE ON FUNCTION has_experience_access(text)   TO authenticated;

-- ── deal_brand_notes (0527): the brand's private deal note ──────────────────
-- Moved off deals, where the creator on the deal could read it. Brand-only
-- read; writes are server-only (updateDealInternalNote, createDeal).
REVOKE ALL ON deal_brand_notes FROM anon, authenticated;
GRANT SELECT ON deal_brand_notes TO authenticated;
DROP POLICY IF EXISTS deal_brand_notes_read_brand ON deal_brand_notes;
CREATE POLICY deal_brand_notes_read_brand ON deal_brand_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_brand_notes.deal_id AND d.brand_id = my_brand_id()));

-- ── 0528: Experience request columns, quote history ─────────────────────────
GRANT SELECT (request_deliverables, request_affiliate, request_ad_rights, request_ad_rights_months,
              request_boost, request_boost_months, request_location, request_date_from, request_date_to,
              request_brief, request_channel, requested_at)
  ON experiences TO authenticated;
REVOKE ALL ON experience_quotes FROM anon, authenticated;
GRANT SELECT (id, experience_id, version, proposed_by, per_video_paise, deliverable_count, misc_paise,
              total_paise, deliverables, shoot_date, shoot_city, message, status, created_at, decided_at)
  ON experience_quotes TO authenticated;
DROP POLICY IF EXISTS experience_quotes_read_brand ON experience_quotes;
CREATE POLICY experience_quotes_read_brand ON experience_quotes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM experiences e WHERE e.id = experience_quotes.experience_id
                 AND e.brand_id = my_brand_id() AND e.brand_id IS DISTINCT FROM guapd_brand_id()));

-- ── 0529: Guapd Experiences staff console list ──────────────────────────────
CREATE OR REPLACE FUNCTION experience_console_list()
RETURNS TABLE (id uuid, title text, status text, brand_name text, shoot_date date, shoot_city text,
               request_location text, request_date_from date, request_date_to date,
               requested_videos int, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF has_experience_access('operational') IS NOT TRUE THEN
    RAISE EXCEPTION 'Operational access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT e.id, e.title, e.status, b.name, e.shoot_date, e.shoot_city,
           e.request_location, e.request_date_from, e.request_date_to,
           coalesce((SELECT sum(CASE WHEN (d ->> 'count') ~ '^[0-9]+$' THEN (d ->> 'count')::int ELSE 0 END)
                     FROM jsonb_array_elements(e.request_deliverables) d), 0)::int,
           e.created_at
    FROM experiences e JOIN brands b ON b.id = e.brand_id
    ORDER BY e.created_at DESC
    LIMIT 500;
END;
$$;
REVOKE EXECUTE ON FUNCTION experience_console_list() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_list() TO authenticated;

-- ── 0530: staff console request intake + quotes ─────────────────────────────
-- The functions themselves live in migration 0530 (definer, operational check
-- first, ops_events written in the same transaction). Grants, mirrored here:
REVOKE EXECUTE ON FUNCTION experience_console_require()                            FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_console_audit(text, text, uuid, jsonb)       FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_console_brands()                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_get(uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_quotes(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_create(uuid, text, jsonb, boolean, boolean, int, boolean, int, text, date, date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_quote(uuid, text, bigint, int, bigint, jsonb, date, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_accept(uuid, text)                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_brands()                             TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_get(uuid)                            TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_quotes(uuid)                         TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_create(uuid, text, jsonb, boolean, boolean, int, boolean, int, text, date, date, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_quote(uuid, text, bigint, int, bigint, jsonb, date, text, text, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION experience_console_accept(uuid, text)                   TO authenticated;

-- ── 0531: the per-creator request plan ──────────────────────────────────────
GRANT SELECT (request_creator_count, request_affiliate_per_creator, request_ad_rights_per_creator,
              request_boost_per_creator, agreed_plan)
  ON experiences TO authenticated;
REVOKE EXECUTE ON FUNCTION experience_plan_count(jsonb, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_plan_totals(jsonb, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_create(uuid, text, int, jsonb, boolean, int, boolean, int, int, boolean, int, int, text, date, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_create(uuid, text, int, jsonb, boolean, int, boolean, int, int, boolean, int, int, text, date, date, text, text) TO authenticated;

-- ── 0532: Experience roster (staff console) ─────────────────────────────────
-- Guapd's per-creator notes: no session may read or write them; only the
-- definer console functions. The brand reads its roster only through the 0523
-- column grant, which includes none of the 0532 columns.
ALTER TABLE experience_roster_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_roster_notes FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION experience_roster_reconcile(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION experience_console_creators() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_reconcile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_add(uuid, uuid[], text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_decide(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_plan(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_note(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_remove(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION experience_console_roster_lock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION experience_console_creators() TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_reconcile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_add(uuid, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_decide(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_plan(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION experience_console_roster_lock(uuid) TO authenticated;


-- ── package_pricing_types (0533) ───────────────────────────────────
-- Lookup of how a creator_products row is priced. Server-only: no session
-- reads it; app code knows the types it handles.
ALTER TABLE package_pricing_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON package_pricing_types FROM anon, authenticated;


-- ── Experience creator legs (0534) ─────────────────────────────────
-- No new policies. The new columns on experience_roster (leg_*) and
-- experiences (creator_brief) are outside the 0523 column grants, so no
-- session reads them; staff read them through experience_console_legs /
-- experience_console_creator_brief, a creator reads their own leg through
-- creator_leg_context. Session writes to a creator leg (deals, items,
-- uploads, messages) are refused by trigger, invoices on a creator leg are
-- refused for every role, and a creator leg cannot be marked paid
-- (guard_creator_leg_*). See supabase/migrations/0534_experience_creator_legs.sql.


-- ── Experience cost sheet + P&L (0537) ─────────────────────────────────
-- experience_cost_lines and experience_pnl_snapshots have NO policies by design:
-- REVOKEd from anon/authenticated, reached only through staff-gated definer
-- functions (experience_console_costs / _cost_add / _cost_update / _cost_remove
-- for operational staff; experience_pnl for financial staff). The stored margin
-- refreshes by trigger while an Experience is open and freezes at Complete;
-- reopening is financial-only and audited. The brand price is masked from
-- operational staff in experience_console_get / experience_console_quotes, and
-- quoting requires financial access. See supabase/migrations/0537_experience_costs_pnl.sql.


-- ── Experience shoot + deliverables (0538) ──────────────────────────────
-- experience_deliverable_releases (what Guapd has given the brand, versioned)
-- and experience_item_staff_notes (Guapd's notes on its own content) have NO
-- policies by design: REVOKEd from anon/authenticated. Staff reach them
-- through experience_console_* functions (operational); the brand ONLY
-- through brand_experience_deliverables / brand_experience_release_file,
-- which check brand membership in Postgres and return live releases with the
-- creator's name only. A creator reads their own leg's items through the
-- existing deal_deliverable_items_read policy and creator_leg_context; their
-- writes go through creator_leg_item_submit (creator-submit legs only), as the
-- 0534 trigger still refuses direct session writes to a creator leg. The new
-- experience_roster shoot-outcome columns are outside the 0523 brand column
-- grant. See supabase/migrations/0538_experience_deliverables.sql.
ALTER TABLE experience_deliverable_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_deliverable_releases FROM anon, authenticated;
ALTER TABLE experience_item_staff_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON experience_item_staff_notes FROM anon, authenticated;


-- ── NULL means no (0539) ────────────────────────────────────────────────
-- Every Experience gate and transition check refuses on an UNKNOWN: gates read
-- `has_experience_access(..) IS NOT TRUE`, guards use IS DISTINCT FROM and
-- `x IS NULL OR x NOT IN (..)`, reconcile/readiness treat a missing number as
-- "not ok". Creators can no longer upload straight into the deliverables
-- bucket under an Experience leg (only through the service-role upload slot):
DROP POLICY IF EXISTS storage_deliverables_insert ON storage.objects;
CREATE POLICY storage_deliverables_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'deliverables'
    AND EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = (string_to_array(name, '/'))[1]::uuid
        AND deals.creator_id = my_creator_id()
        AND deals.leg_role IS NULL
    )
  );
-- See supabase/migrations/0539_experience_null_means_no.sql.


-- ── Experience money loop (0540) ────────────────────────────────────────
-- service_invoices, service_invoice_payments, service_invoice_counters,
-- vendor_payouts, vendors, vendor_payout_details, brand_billing_profiles and
-- guapd_billing_settings have NO policies and NO grants for users: REVOKEd
-- from anon/authenticated. The 0524 brand read of service_invoices
-- (si_read_brand + column grants) and the creator read of vendor_payouts
-- (vp_read_own_creator + column grants) were DROPPED. Staff reach invoices,
-- payments and billing details only through experience_console_invoice* /
-- _finance_settings / _brand_billing (FINANCIAL access), payouts through
-- experience_console_payout* (OPERATIONAL, maker-checker in Postgres). The
-- brand reads its ISSUED and PAID invoices through brand_experience_invoices /
-- brand_experience_invoice_file (membership checked); the creator reads their
-- own payout statement through creator_leg_context. The finance-docs bucket is
-- private with no user policies (service-role signed links only, after a
-- database function authorises the path). See
-- supabase/migrations/0540_experience_invoices_payouts.sql.
DROP POLICY IF EXISTS si_read_brand ON service_invoices;
DROP POLICY IF EXISTS vp_read_own_creator ON vendor_payouts;
REVOKE ALL ON service_invoices FROM anon, authenticated;
REVOKE ALL ON vendor_payouts FROM anon, authenticated;
ALTER TABLE service_invoice_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_invoice_payments FROM anon, authenticated;
ALTER TABLE service_invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON service_invoice_counters FROM anon, authenticated;
ALTER TABLE brand_billing_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_billing_profiles FROM anon, authenticated;
ALTER TABLE guapd_billing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON guapd_billing_settings FROM anon, authenticated;
