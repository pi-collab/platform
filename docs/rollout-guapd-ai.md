# Guapd AI search: prod rollout checklist

Updated 2026-11-06. **Nothing here has been applied to prod.** Each step needs PJ's go-ahead; approval for one step does not cover the next. Meta (Instagram Creator Marketplace, invites) stays OFF throughout.

What ships: brief-based creator search at `/ai` over exactly the creators `/browse` shows brands (no opt-in; creators can turn "Show me in Guapd AI search" off), long briefs, creator languages, the brand intro and sparkle-icon highlight, the creator notice, the "Your visibility" card (separate flag), and an optional WhatsApp product-updates consent that nothing sends on.

## Flags (all unset on prod today)

| Variable | Turns on | Step |
|---|---|---|
| `CREATOR_SEARCH_NOTICE=1` | Creator side only: one-time notice on the creator home; the "Show me in Guapd AI search" switch (on by default) and optional city/state/languages/niches | 3 |
| `CREATOR_SEARCH=1` | Brand search: `/ai`, its API, the sparkle icon and highlight, the intro (implies the creator side) | 4 |
| `CREATOR_SEARCH_BRAND_IDS=<id>,<id>,<id>` | Limits brand search to these brands (unset = every brand) | 4 |
| `ANTHROPIC_API_KEY` | Reading briefs. PJ adds it at release | 4 |
| `CREATOR_VISIBILITY_CARD=1` | Creators' "Your visibility" card | 5 |
| `META_CREATOR_MARKETPLACE`, `META_*`, `CREATOR_INVITES` | Meta / invites | off |

`CREATOR_SEARCH_OPTIN` no longer exists. Already on prod: `INSTAGRAM_TOKEN_KEY`, `NEXT_PUBLIC_SITE_URL`.

## Step 0: staging sign-off

- [ ] Green locally: `test-creator-search.ts`, `test-meta-marketplace.ts`, `test-invite-routes.ts`, `test-guapd-ai-onboarding.ts` (Meta off and on)
- [ ] Green on the deployed staging site: `test-creator-search-staging.ts` (real and injection briefs through Claude) and `test-invite-signup-staging.ts` (pending PJ's auth file and spare number)
- [ ] PJ has tried `/ai`, the intro, the creator switch and notice on staging

## Step 1: database (prod SQL editor, by PJ)

- [ ] Confirm prod is at 0584: `SELECT max(version) FROM supabase_migrations.schema_migrations;`
- [ ] Run `supabase/prod-run-0585-0591.sql` top to bottom. Order matters: 0585 → 0586 → 0587 → 0588 → 0589 → 0590 → 0591 (0591 adds the stored order for Load more; 0586/0588 recreate 0585's function; 0587/0589 reference 0585's table; 0588 drops 0585's unused opt-in column; 0590 adds the onboarding, Coming soon, Meta-state and consent tables)
- [ ] Checks at the end: 8 new tables with RLS on and no client rights; both functions service_role only; search pool count = `/browse` count; no `search_opt_in_at`; no `i-` storefront slugs
- [ ] Ledger insert at the end of the file
- Safe before the code: nothing reads these until a flag is set.

## Step 2: code release with every flag off (a reviewed pull request)

- [ ] Merge the release PR (branch `release/guapd-ai`, prepared from `origin/main` with only the files and hunks below). Not a staging merge: staging carries other staging-only work
  - `lib/instagram.ts`: ONLY `parseSignedRequest(signed, secretName)`. NOT `IgTokenInvalidError`, NOT `lib/instagram-sync.ts` (the Instagram reconnect fix, which messages the 13 creators with dead tokens on the first nightly run)
  - `components/BrandSidebar.tsx`, `components/BrandNav.tsx`: only the Guapd AI icon (gated on `creatorSearchEnabled(brandId)`) and its highlight
  - `lib/creator-location.ts` (age optional in Settings), `app/creator/settings/*`, `app/creator/dashboard/page.tsx`, `app/creator/storefront/actions.ts` (reserves `i-` slugs), `app/signup/creator/onboarding/*` (optional consent box), `app/settings/*` (Instagram section, hidden while Meta is off), `middleware.ts` (invite rewrite and Meta callback exemptions; inert while off)
  - New: `lib/ai/*`, `lib/meta/*`, `lib/creator-consent.ts`, `app/ai/*`, `app/api/ai/*`, `app/api/creators/search/**`, `app/api/meta/*`, `app/api/invites/*`, `app/creator-invite/*`, `components/AiHighlight.tsx`, `components/creator/{GuapdAiSearchNotice,SearchVisibilityCard,PendingInviteBanner}.tsx`
  - Docs and tests: `content/playbook.ts`, `docs/test-cases.md`, `supabase/rls.sql`, migrations, scripts
  - NEVER `app/invite/[token]/*` (the brand team invite)
- [ ] Before merging, the PR's "nothing sends, nothing runs" check (in the PR description) is re-run on the final diff
- [ ] Vercel success on main
- [ ] On prod, flags off: `/ai` and `/api/creators/search` 404; no sparkle icon or highlight; creator home has no notice or card; no switch in Settings; the onboarding form shows the optional unticked WhatsApp box; a team invite link `/invite/<token>` still opens "Join <brand>"
- Rollback: revert the merge.

## Go / no-go: data quality (prod SQL editor, before Step 4)

```sql
with v as (
  select c.*,
         (ic.status = 'connected' and ic.snapshot is not null and ic.last_synced_at > now() - interval '10 days') is true as fresh_verified
  from creators c left join creator_instagram_connections ic on ic.creator_id = c.id
  where c.is_bookable = true and c.is_guapd = false
)
select count(*) as visible,
       count(*) filter (where coalesce(array_length(niches, 1), 0) > 0 or nullif(btrim(niche), '') is not null) as with_niche,
       count(*) filter (where nullif(btrim(bio), '') is not null)                      as with_bio,
       count(*) filter (where nullif(btrim(coalesce(city, location)), '') is not null) as with_city,
       count(*) filter (where fresh_verified)                                          as verified_fresh,
       count(*) filter (where search_hidden_at is not null)                            as hidden
from v;
```

Proposed GO (PJ to set): at least 80% with a niche, 60% with a bio, 30% with a city, and 15 creators with a fresh verified Instagram connection. NO-GO is fixed on the creator side (the notice and fields, reconnecting the 13 dead tokens), not by giving brands access sooner.

## Step 3: creator notice

- [ ] `CREATOR_SEARCH_NOTICE=1` on Vercel Production, redeploy
- [ ] Check with a team creator: the notice once (× keeps it gone on every device); the switch ON with its line; turning it off shows the warning with Keep me visible / Turn off; the optional fields save; brands still get 404 on `/ai`
- [ ] Leave a few days; re-run the data-quality check
- Rollback: unset it.

## Step 4: CREATOR_SEARCH for 2 or 3 brands

- [ ] Data-quality GO
- [ ] PJ adds `ANTHROPIC_API_KEY` to Production
- [ ] `CREATOR_SEARCH_BRAND_IDS` = the 2–3 brand ids, then `CREATOR_SEARCH=1`; redeploy
- [ ] Pick 2–3 APPROVED brands: an unapproved brand gets restricted search (no city/language/engagement filters) and no invites or Instagram
- [ ] Check: those brands get the icon, the highlight on their home (once), the intro on first visit, then search; Load more pages to the end with no repeats; other brands get no icon and 404; hidden creators never appear; nothing about Instagram anywhere; PostHog events arrive
- [ ] Watch a week: `[abuse-alert]` lines (many different briefs, rate limits, invite bursts), `[creator-search] parsed` token lines, 429s, empty or thin results, creators turning search off
- [ ] Widen later (more ids, or unset the list), as its own go-ahead
- Rollback: unset `CREATOR_SEARCH` or remove a brand id.

## Step 5: "Your visibility" card, after brands have used search

- [ ] `CREATOR_VISIBILITY_CARD=1`; check counts are brand–days and never show a brand or brief
- Rollback: unset it.

## Not in this rollout

- WhatsApp: the opt-in template is dropped (no opt-in). The product-updates consent is collected but nothing sends on it. The reconnect template stays Utility and unsubmitted until PJ approves its text.
- Meta / Creator Marketplace / invites: off until PJ confirms Meta access and the Graph API Explorer checks.
