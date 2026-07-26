# Migration Run Order

## How to set up a fresh database from scratch

Run in this exact order:

1. `schema.sql` (creates base tables, enums, triggers, functions)
2. All migration files in the order listed below
3. `rls.sql` (enables RLS on all tables, creates all policies, redefines audit_deal as SECURITY DEFINER)

**rls.sql MUST run last** — it depends on all tables existing, and it redefines `audit_deal()` with SECURITY DEFINER (schema.sql defines it without).

## Migration run order (exact sequence)

The numbered migrations must run in this order. Three pairs share a number (010, 011, 012) — within each pair the order doesn't matter (they touch different tables), but both files must run.

```
000_external_url_deliverables.sql
000a_rls_helpers.sql
001_brands_onboarding_columns.sql
002_enrich_creators_campaign_hook_brand_status.sql
003_creators_niches_array.sql
004_creator_products.sql
005_deal_deliverable_items.sql
006_revision_pricing.sql
007_revision_note.sql
008_platform_fee.sql
009_invoices.sql
010_brands_read_for_creators.sql
010_robustness_functions.sql
011_deliverable_uploads.sql
011_messages_block_terminal.sql
012_phone_verifications.sql
012_shipment_posted.sql
013_rights_fields.sql
014_boosting_per_item.sql
015_campaigns.sql
016_campaign_workspace.sql
017_deal_internal_note.sql
018_campaign_brief.sql
019_rls_reconcile.sql
020_brand_invites.sql
021_deal_ref.sql
022_creator_storefronts.sql
023_fee_pct_override.sql
024_ops_events.sql
025_brand_creator_rates.sql
026_terms_acceptance.sql
027_deal_brief.sql
028_notifications.sql
029_invoices_paid_at.sql
030_prod_parity.sql
```

## Numbering collisions (do not renumber)

| Number | File A | File B | Safe to run in either order? |
|--------|--------|--------|------------------------------|
| 010 | brands_read_for_creators | robustness_functions | Yes (different tables) |
| 011 | deliverable_uploads | messages_block_terminal | Yes (different tables) |
| 012 | phone_verifications | shipment_posted | Yes (different tables) |

## Non-idempotent migrations (do not re-run)

These migrations use bare `CREATE TABLE` or `ADD COLUMN` without `IF NOT EXISTS` guards. They work for a single fresh run but will fail if re-run on an existing database:

- 002, 003, 004, 005, 012 (phone_verifications), 015, 016, 018, 020

## Post-migration steps (not in SQL files)

After all migrations + rls.sql:

1. **Realtime publication** — add 5 tables:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE deals, messages, notifications, deal_deliverable_items, invoices;
   ```

2. **Storage bucket** — `deliverables` (private, 500MB file limit, MIME allowlist for video/image/pdf/audio/zip). Created by migration 011_deliverable_uploads.sql; verify it exists after migration run.

## Known schema debt

- **`deals.campaign_id` FK missing** — both prod and staging lack the FK to `campaigns(id)`. Migration 002 added the column as bare uuid; migration 015's `ADD COLUMN IF NOT EXISTS` with FK silently skipped because column existed. Add FK to both environments together after verifying no dangling campaign_id values.
- **`users.terms_accepted_at` + `terms_version`** — migration 026 adds these, but has not been run on prod yet. Run on prod before launch.
