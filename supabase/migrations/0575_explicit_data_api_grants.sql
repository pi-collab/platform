-- 0575: explicit Data API grants on every public table.
--
-- From 30 Oct 2026 Supabase stops auto-granting anon / authenticated /
-- service_role on NEW tables in public. Until now every table here got its
-- grants from that default (pg_default_acl), and no migration ever granted
-- service_role anything. A rebuild (db reset, preview branch, new project)
-- after that date would leave every table ungranted: the server could not
-- read or write any of them.
--
-- This states each table's access explicitly, at the level it is actually
-- reachable today. Nothing is widened. What is removed was never reachable
-- through RLS: anon on tables whose policies all need a signed-in user, and
-- the commands no policy allows (plus TRUNCATE / REFERENCES / TRIGGER, which
-- nothing uses). Reachability before/after is in docs/test-cases.md §151.
--
-- The same block is repeated at the end of rls.sql, because a rebuild runs
-- rls.sql last. Any NEW table must carry its own GRANT in its migration and
-- in rls.sql (see the migration checklist in supabase/migrations/README.md).
--
-- Column-level grants are untouched: creators (SELECT allowlist, 0470/0474/
-- 0489/0476), users (UPDATE allowlist, 0472), deal_follow_ons,
-- experience_creator_terms, experience_quotes, service_invoices. A table-level
-- REVOKE of a privilege also drops that privilege's column grants, so those
-- tables only lose the specific table-level privileges named below.

-- ── 1. Server only: reached through gated functions / the server, never
--      directly by a signed-in user or a visitor. ────────────────────────────
REVOKE ALL ON
  brand_billing_profiles, creator_private, vendors, vendor_payouts, vendor_payout_details,
  vendor_payout_detail_changes, guapd_billing_settings, service_invoice_counters,
  service_invoice_payments, service_invoice_payment_reports,
  experience_item_staff_notes, experience_roster_notes, staff_access, pipeline_leads, pipeline_feedback,
  experiences, experience_roster, experience_roster_prospects, experience_addons,
  experience_brand_messages, experience_brand_message_reads, experience_brand_suggestions,
  experience_collab_posts, experience_cost_lines, experience_creator_invoices,
  experience_deliverable_releases, experience_finance, experience_leg_counters, experience_leg_extras,
  experience_pnl_snapshots, experience_shoot_date_changes,
  creator_instagram_connections, deal_templates, package_pricing_types,
  -- Open by the old default, but every policy denies (or there is none):
  ops_events, brand_creator_origin, brand_creator_rates, phone_verifications
FROM PUBLIC, anon, authenticated;

-- Server-only tables that keep a NARROW signed-in read, granted in earlier
-- migrations and restated here: only the table-level extras are revoked, so
-- their column grants survive.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  deal_brand_notes, deal_follow_ons, experience_creator_terms, experience_quotes, service_invoices
FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON deal_follow_ons, experience_creator_terms, experience_quotes, service_invoices FROM PUBLIC, anon;
REVOKE SELECT ON deal_brand_notes FROM PUBLIC, anon;
GRANT SELECT ON deal_brand_notes TO authenticated;
GRANT SELECT (basis, created_at, creator_gross_paise, creator_id, creator_net_paise, deal_id, experience_id,
              fixed_paise, id, invoicer, pct, platform_pct, sales_figure_paise, sales_verified_at, status,
              trigger, trigger_date, type, updated_at)
  ON deal_follow_ons TO authenticated;
GRANT SELECT (created_at, creator_gross_paise, creator_id, creator_net_paise, day_rate_paise, days, deal_id,
              experience_id, locked_at, platform_pct, platform_track, updated_at)
  ON experience_creator_terms TO authenticated;
GRANT SELECT (extras) ON experience_quotes TO authenticated;

-- ── 2. App tables: signed-in users get exactly the commands RLS allows. ───
REVOKE ALL ON
  ai_search_queries, brand_entitlements, brand_invites, brand_members, brand_onboarding_responses, brands,
  campaign_drafts, campaigns, creator_addon_rates, creator_growth_quiz_responses,
  creator_onboarding_responses, creator_products, creator_storefronts, deal_deliverable_items,
  deal_reviews, deals, deliverables, events, invoices, job_roles, message_reads, messages,
  notifications, payments, platform_settings, usage_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON
  ai_search_queries, brand_entitlements, brand_invites, brand_members, brands, events, invoices,
  platform_settings, usage_events, job_roles
TO authenticated;
GRANT SELECT, INSERT ON
  brand_onboarding_responses, creator_growth_quiz_responses, creator_onboarding_responses, deliverables, messages
TO authenticated;
GRANT SELECT, UPDATE ON deals, notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON
  campaigns, creator_products, creator_storefronts, deal_deliverable_items, deal_reviews, message_reads, payments
TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_drafts, creator_addon_rates TO authenticated;

-- The careers page is the one thing a signed-out visitor reads.
GRANT SELECT ON job_roles TO anon;

-- creators: SELECT is a column allowlist (0470 et al.); signed-in users update
-- their own row (creators_update_own). Visitors get nothing (creators_read
-- requires a signed-in user).
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON creators FROM PUBLIC, anon, authenticated;
REVOKE SELECT, UPDATE ON creators FROM PUBLIC, anon;
GRANT UPDATE ON creators TO authenticated;

-- users: read and insert your own row; UPDATE is a column allowlist (0472).
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON users FROM PUBLIC, anon, authenticated;
REVOKE SELECT, INSERT, UPDATE ON users FROM PUBLIC, anon;
GRANT SELECT, INSERT ON users TO authenticated;

-- ── 3. The server role: plain DML on every table (it bypasses RLS). ───────
DO $grant$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM service_role', t.relname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t.relname);
  END LOOP;
END
$grant$;

-- ── 4. Sequences: deal refs are assigned on server / definer inserts only. ─
REVOKE ALL ON SEQUENCE deal_ref_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE deal_ref_seq TO service_role;
