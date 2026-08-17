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
0010_external_url_deliverables.sql
0020_rls_helpers.sql
0030_brands_onboarding_columns.sql
0040_enrich_creators_campaign_hook_brand_status.sql
0050_creators_niches_array.sql
0060_creator_products.sql
0070_deal_deliverable_items.sql
0080_revision_pricing.sql
0090_revision_note.sql
0100_platform_fee.sql
0110_invoices.sql
0120_brands_read_for_creators.sql
0130_robustness_functions.sql
0140_deliverable_uploads.sql
0150_messages_block_terminal.sql
0160_phone_verifications.sql
0170_shipment_posted.sql
0180_rights_fields.sql
0190_boosting_per_item.sql
0200_campaigns.sql
0210_campaign_workspace.sql
0220_deal_internal_note.sql
0230_campaign_brief.sql
0240_rls_reconcile.sql
0250_brand_invites.sql
0260_deal_ref.sql
0270_creator_storefronts.sql
0280_fee_pct_override.sql
0290_ops_events.sql
0300_brand_creator_rates.sql
0310_terms_acceptance.sql
0320_deal_brief.sql
0330_notifications.sql
0340_invoices_paid_at.sql
0350_prod_parity.sql
0360_storefront_portrait_fallback.sql
0370_brief_avoid_attachments.sql
0380_shipping_address.sql
0390_item_posted.sql
0400_campaign_brief_avoid_attachments.sql
0410_brand_profile_columns.sql
0420_creator_profile_settings.sql
0430_deal_reviews.sql
0440_brand_approval_gate.sql
0450_brand_creator_origin.sql
```

## Numbering: 4-digit, step 10 (renumbered 2026-08-17)

Every migration carries a UNIQUE 4-digit version. This is not cosmetic — the
Supabase CLI parses the version with `/^([0-9]+)_(.*)\.sql$/` and stores it as
the PRIMARY KEY of `supabase_migrations.schema_migrations`. The old scheme broke
that in two ways, both proven against a local throwaway database:

- `000a_rls_helpers.sql` did not match the regex at all, so `db push` skipped it
  silently — schema applied by hand, invisible to tracking.
- `010`, `011` and `012` were each used TWICE. Only one row per version can
  exist, so the second file of each pair was reported as forever-pending, and
  `db push --include-all` died with
  `duplicate key value violates unique constraint "schema_migrations_pkey"`.
  Every push was blocked, with no CLI-level workaround.

A four-file fix was impossible: there is no free integer between 010 and 011,
and mixing widths REORDERS the chain ('5' < '_' and '0' < '9' in a plain string
sort), so `0105_x.sql` would sort before `010_x.sql`. One uniform width across
the whole chain is the only correct fix.

The renumber was filename-only — 45 renames, 0 insertions, 0 deletions — and the
resulting apply order is identical to the previous one. Step 10 leaves gaps so a
migration can be inserted between two others without renumbering again.

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

## Building a fresh database (proven locally, 2026-08-17)

`supabase db push` ALONE CANNOT BUILD AN EMPTY DATABASE. The migrations are
almost all `ALTER TABLE` against tables `schema.sql` creates, and neither
`schema.sql` nor `rls.sql` lives in `migrations/`. The sequence is:

1. `schema.sql`                      (psql / --db-url, not db push)
2. every migration in order          (0010 → 0450)
3. `rls.sql`                         LAST
4. `ALTER PUBLICATION supabase_realtime ADD TABLE ...` (5 tables, below)
5. `supabase migration repair --status applied <all 45 versions>`

Step 5 is what gives the database migration tracking; without it the schema is
correct but `schema_migrations` is empty. After it, `db push` reports
"Local database is up to date" and stays usable for future migrations.

## Known schema debt

- **`deals.campaign_id` FK missing** — both prod and staging lack the FK to `campaigns(id)`. Migration 002 added the column as bare uuid; migration 015's `ADD COLUMN IF NOT EXISTS` with FK silently skipped because column existed. Add FK to both environments together after verifying no dangling campaign_id values.
- **`users.terms_accepted_at` + `terms_version`** — migration 026 adds these, but has not been run on prod yet. Run on prod before launch.
