# Test-account teardown

Removes a named test account and everything hanging off it, leaving no orphans.

**Scoped by design.** You name the exact phone numbers and/or emails to remove.
There is no "delete everything unverified" mode and no wildcard — a script that
could wipe real data if run at the wrong moment should not exist on a production
database.

---

## Running it

```bash
# 1. Confirm the link. The script refuses if it disagrees with --project.
cat supabase/.temp/project-ref

# 2. Dry run — reports what WOULD be deleted, changes nothing.
python3 supabase/teardown/teardown.py --project staging --phone +919876543210

# 3. Delete for real, once the dry run looks right.
python3 supabase/teardown/teardown.py --project staging --phone +919876543210 --confirm
```

`--project` takes `prod` or `staging`, and defaults to `prod`. Naming it is not
optional in spirit: the CLI link is ambient state that changes without this
script knowing, and the flag is only what someone typed. Requiring BOTH to
agree means a stale link cannot silently point a deletion at production.

Sydney (`yltclrnjurgzyaylzcli`) is deliberately not a valid target. It is the
retired production project, kept so its data can be read and nothing else.

Several accounts at once:

```bash
python3 supabase/teardown/teardown.py \
  --phone +919876543210 --phone +919812345678 \
  --email tester@example.com --confirm
```

`--phone` matches `creators.phone` and `users.phone`.
`--email` matches `users.email`, `brands.contact_email` and the auth user.

---

## Why the order matters

Not every foreign key cascades. Four relationships actively **block** a delete
(`RESTRICT` / `NO ACTION`), so a naive `DELETE FROM creators` fails rather than
tidying up:

| child | parent | rule |
|---|---|---|
| `deals.creator_id` | creators | **RESTRICT** |
| `deals.brand_id` | brands | **RESTRICT** |
| `notifications.deal_id` | deals | **NO ACTION** |
| `notifications.user_id` | users | **NO ACTION** |
| `campaigns.brand_id` | brands | **NO ACTION** |
| `campaign_drafts.creator_id` | creators | **NO ACTION** |
| `brand_invites.invited_by` / `accepted_by` | users | **NO ACTION** |

So the script deletes inward-out, in this order:

1. `notifications` — blocks both deals and users
2. `campaign_drafts`, then `campaigns`
3. `brand_invites`
4. `deals` — cascades to `deal_deliverable_items`, `deal_reviews`,
   `deliverables`, `events`, `invoices`, `messages`, `payments`
5. `creators` / `brands` — cascade to `brand_creator_origin`,
   `brand_creator_rates`, `brand_members`, `creator_products`,
   `creator_storefronts`
6. `users`
7. `auth.users` — never cascaded from `public.users`; `creators.user_id` is
   `SET NULL`, so deleting the profile leaves the auth user behind as an orphan
   that can still log in
8. storage objects

## The two things a plain SQL cascade leaves behind

**Orphaned auth users.** `public.users` → `auth.users` has no cascade at all.
Delete the profile row and the login still exists — the account can sign in and
land in a half-built state. Step 7 removes it explicitly.

**Orphaned storage files.** Nothing in Postgres knows about uploaded bytes.
Two buckets hold them, on different path conventions:

- `storefronts` → `avatars/{creator_id}/…` (avatars, public bucket)
- `deliverables` → `{deal_id}/{item_id}/…` (deal files, private bucket)

Both are deleted by prefix from the ids collected in step 0, **before** the rows
that name those ids are gone. Delete the rows first and the paths are
unrecoverable — the files stay, paid for, forever unreferenced.

**Events with no deal.** `events.deal_id` cascades, but rows written with
`deal_id = NULL` do not — `account.welcome_sent`, `notification.sms_sent`,
`demo.requested`, `contact.submitted`. Those are matched on their `detail`
payload instead, so a torn-down tester leaves no trace in the audit log.

## What it will not do

- No wildcard, no "delete all test-looking accounts", no date range.
- It refuses unless the linked ref is `nxdxxkdlzjyxxgtppopb`.
- It refuses if a named account resolves to **more than one** creator or brand,
  rather than guessing which was meant.
- Dry run is the default. Deletion requires `--confirm`.
- It prints every id it is about to touch, so the dry run is auditable before
  anything is destroyed.
