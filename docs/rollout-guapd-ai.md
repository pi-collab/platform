# Guapd AI search: prod rollout checklist

Prepared 2026-11-06. **Nothing here has been applied to prod.** Each step needs PJ's go-ahead; "prod" approval for one step does not cover the next.

Scope: brief-based creator search (`/ai`, 0585), long briefs + creator languages (0586), and the tables for Instagram Creator Marketplace + invites (0587). Meta stays OFF throughout this checklist; it has its own checklist later.

## Flags (all unset on prod today)

| Variable | What it turns on | Prod |
|---|---|---|
| `CREATOR_SEARCH_OPTIN=1` | Creator side only: Settings switch "Show me in Guapd AI search" + optional city/state/languages/niches, and the creator home card | Phase A |
| `CREATOR_SEARCH=1` | Brand search: `/ai`, `POST /api/creators/search`, the Guapd AI nav icon (implies the creator side) | Phase C |
| `ANTHROPIC_API_KEY` | Reading briefs. **Not set on prod** (only Preview has one) | Phase C |
| `CREATOR_INVITES=1` | Creator invite pages without Meta (staging test only) | never, for now |
| `META_CREATOR_MARKETPLACE`, `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `META_SEARCH_QUERY_MODE` | Creator Marketplace | stays off |

Already on prod: `INSTAGRAM_TOKEN_KEY` (reused for brand tokens later), `NEXT_PUBLIC_SITE_URL`.

## Step 0: before anything (staging sign-off)

- [ ] `scripts/test-creator-search.ts`, `scripts/test-meta-marketplace.ts`, `scripts/test-invite-routes.ts` green
- [ ] `scripts/test-creator-search-staging.ts` green against the deployed staging site (real briefs + injection briefs through Claude). Pending PJ's `~/.guapd-staging-auth`
- [ ] `scripts/test-invite-signup-staging.ts` green with a fresh number (only matters before invites go to prod)
- [ ] PJ has run `/ai` on staging and is happy with results and copy
- [ ] Decide the Phase C threshold (proposal below)

## Step 1: database (prod SQL editor, by PJ)

- [ ] Confirm prod is at 0584: `SELECT max(version) FROM supabase_migrations.schema_migrations;`
- [ ] Run `supabase/prod-run-0585-0587.sql` top to bottom: 0585 → 0586 → 0587, in that order (0586 recreates 0585's function; 0587 references 0585's table)
- [ ] Checks at the end of that file: three tables with RLS on and no anon/authenticated rights; `creator_search_pool` executable by service_role only; 0 opted-in creators; 0 storefront slugs starting `i-`
- [ ] Ledger insert at the end of the file
- Safe before the code: nothing reads these until a flag is set. Rollback: not needed (no data changes besides new empty columns/tables).

## Step 2: code release with every flag off

- [ ] **Not a staging merge.** Staging is ~20 commits ahead of prod and carries other staging-only work. Release only the Guapd AI files, the way 2480085 went out (release worktree, `git checkout origin/staging -- <files>`), and review each shared file:
  - `lib/instagram.ts`: take ONLY the `parseSignedRequest(signed, secretName)` change. Do NOT bring `IgTokenInvalidError` / `lib/instagram-sync.ts`: that is the Instagram reconnect fix, which messages the 13 creators with dead tokens on the first nightly run and is waiting for PJ separately
  - `components/BrandSidebar.tsx`, `components/BrandNav.tsx`: prod has no Guapd AI icon today; bring the icon gated on `creatorSearchEnabled()` (hidden while off)
  - `lib/creator-location.ts` (age optional in Settings), `app/creator/settings/*`, `app/creator/dashboard/page.tsx`, `app/creator/storefront/actions.ts` (reserves `i-` slugs), `middleware.ts` (invite rewrite + Meta callback exemptions: harmless while off)
  - `lib/ai/*`, `app/ai/*`, `app/api/creators/search`, `lib/meta/*`, `app/api/meta/*`, `app/api/invites/*`, `app/creator-invite/*`, `components/creator/*Banner.tsx`, `content/playbook.ts`, `docs/test-cases.md`
  - NEVER touch `app/invite/[token]/*` (the brand team invite)
- [ ] Typecheck in the worktree; push to main; Vercel success
- [ ] On prod, with flags off, check: `/ai` 404; `/api/creators/search` 404; no Guapd AI icon; Settings has no switch; creator home has no card; Settings → Profile shows the optional "Languages you make content in"; a team invite link `/invite/<token>` still opens "Join <brand>"
- Rollback: revert the commit.

## Phase A: creator side first

- [ ] Set `CREATOR_SEARCH_OPTIN=1` on Vercel **Production**, redeploy
- [ ] Check on prod: Settings → Connected accounts shows the switch with "Brands see / Brands never see", the optional fields save (city + state without age), the creator home shows "Let brands find you with Guapd AI", `/ai` is still 404 for brands
- [ ] Switch on with a team creator account, confirm `creators.search_opt_in_at` is set; switch off, confirm it clears
- Rollback: unset `CREATOR_SEARCH_OPTIN`.

## Phase B: opt-in messages

- [ ] In-app only to start: the home card and the switch (live with Phase A)
- [ ] WhatsApp opt-in ask (`docs/whatsapp-templates-draft.md` template 1) only after: a separate, optional "product updates on WhatsApp" consent is built and recorded with a timestamp; PJ approves; the template is approved. Send only to creators who gave that consent. Creators today have agreed only to deal notifications (see the draft's consent check)
- [ ] Instagram reconnect: the 13 prod creators with dead tokens need reconnecting before their numbers count as verified. Either ship the reconnect fix (PJ's call, it messages them) or send the Utility template 2 by hand. Verified needs a connection synced in the last 10 days

## Phase C: brands, only after the threshold

Proposed threshold (PJ to confirm): **at least 30 opted-in, bookable creators with a fresh verified Instagram connection (synced in the last 10 days), and at least 5 such creators in each of 3 niches.** Below that, most briefs come back empty or thin and brands learn the feature does not work.

Check (prod SQL editor):
```sql
with c as (
  select c.id, c.niches, c.niche,
         (ic.status = 'connected' and ic.snapshot is not null and ic.last_synced_at > now() - interval '10 days') is true as fresh
  from creators c left join creator_instagram_connections ic on ic.creator_id = c.id
  where c.search_opt_in_at is not null and c.is_bookable and c.is_guapd is not true and c.is_rejected is not true
)
select count(*) as opted_in, count(*) filter (where fresh) as opted_in_verified_fresh from c;

-- by niche, fresh verified only
select n as niche, count(*) as creators
from creators c join creator_instagram_connections ic on ic.creator_id = c.id,
     lateral unnest(coalesce(c.niches, array[c.niche])) n
where c.search_opt_in_at is not null and c.is_bookable and c.is_guapd is not true
  and ic.status = 'connected' and ic.snapshot is not null and ic.last_synced_at > now() - interval '10 days'
group by 1 order by 2 desc;
```

- [ ] Threshold met
- [ ] Add `ANTHROPIC_API_KEY` to Vercel Production (PJ sets it; never pasted in chat)
- [ ] Set `CREATOR_SEARCH=1` on Production, redeploy
- [ ] Check on prod with a team brand: `/ai` works, a real brief returns results with reasons, a chip edit re-runs, Send offer opens the offer builder, results only include opted-in creators, PostHog events arrive (`search_run`, `filter_edited`, `result_clicked`, `offer_started_from_search`)
- [ ] Watch for a week: `[creator-search] parsed` log lines (tokens per search), 429s, empty-result rate
- Rollback: unset `CREATOR_SEARCH` (creators keep their opt-in).

## Not in this rollout

- Instagram Creator Marketplace and invites: need the Facebook Login app, Creator Marketplace API access and app review; PJ's Graph API Explorer checks (`reels_interaction_rate` values, `insights` shape, Telangana `IN-TG` vs `IN-TS`, query mode). Separate checklist then: Meta dashboard redirect URIs `<site>/api/meta/callback`, deauthorize `<site>/api/meta/deauthorize`, data deletion `<site>/api/meta/data-deletion`.
- Email invites: wait for the email provider and sending domain.
