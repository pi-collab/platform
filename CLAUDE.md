# CLAUDE.md

> Persistent project context for Claude Code. Loaded automatically at the start of every session.
> Keep this file lean (well under 200 lines). Deep context lives in `/docs` and is imported at the bottom.

## What we're building

A **creator-first workflow platform** for brand–creator deals in India (working name TBD). It replaces the WhatsApp / Instagram-DM / email / Drive / bank-transfer mess that a single brand–creator collaboration currently splinters across, collapsing the whole thing — offer, negotiation, deliverables, approval, payment — into one structured flow. Founders: Palak Jain (product), Utkarsh Verma (creator + distribution), Chandreyee Majumder (UX/UI + research).

## Core model: the Deal

The `Deal` is the central object — **one collaboration between one brand and one creator** — and everything hangs off it.

A Deal holds: structured terms (`deliverables`, `price`, `timeline`, `revision_count`, `usage_rights`, `payment_terms`), the negotiation/chat thread, deliverable files + versions, payment status, and an append-only audit log of every state change.

Lifecycle: `negotiating → agreed → delivered → revision → approved → paid → complete`.

- **The `events` audit log is written automatically by a Postgres trigger on the `deals` table** — every status change already produces an event row at the DB level. App code does NOT need to write events manually for status changes. Do not remove or bypass this trigger; the event history is the product's moat.
- `messages`, `deliverables`, and `payments` all belong to a Deal. The brand web app and the creator app are two clients over the *same* Deal.

## Tech stack (do not substitute without flagging)

- **Supabase (Postgres)** — DB, auth, storage, realtime. Single source of truth. **The schema already exists and is deployed** (see `supabase/schema.sql`).
- **Next.js (React) on Vercel** — marketing site + brand workflow + the thin web accept-page.
- **Expo (React Native)** — creator app. Same JS/React, same Supabase backend.
- **WhatsApp Business API via Interakt** + **Expo push** — notifications.
- **Razorpay Payment Links** — payment status tracking only.
- **TypeScript everywhere.** Define the `Deal` type once in `packages/shared` and import it in both clients — never redefine it.

## Hard rules (WHAT / WHY)

- **No held escrow in v1.** Payments are *tracked* via Razorpay Payment Links — we never hold/release funds. WHY: holding funds is RBI payment-aggregator territory, out of scope, and the #1 timeline risk.
- **Notifications over WhatsApp, never Instagram DM.** WHY: the IG API can't send unsolicited DMs; only WhatsApp outbound works.
- **No discovery/search engine.** Brands act on creators from an onboarded list. WHY: we host transactions between people who already know each other; matching is a cold-start trap.
- **Money is stored as integer paise (`bigint`), never float.** WHY: floating-point currency silently corrupts totals. The schema already follows this — keep it.
- **`managed_by` (nullable) is already modelled on the `users` table.** WHY: lets agencies / influencer-managers be added later as a delegated-access permission layer, not a rewrite. Never hard-code one-creator-one-login.
- **Row-Level Security (RLS) is enabled, enforced, and tested on all tables.** Policies are defined in `supabase/rls.sql` and deployed. A brand can only see its own deals/brand row; a creator can only see their own deals/profile; vetted creators are visible to all authenticated users (the "pick a creator" list). The audit trigger (`audit_deal`) is `SECURITY DEFINER` so it can write events regardless of caller context. Adversarially tested: Brand B confirmed unable to see Brand A's deal. The service-role key bypasses RLS — keep it server-side only.
- **Stay inside the v1 scope below.** If a task drifts into the defer-list, stop and flag it — don't build it.

## v1 scope vs deferred

**Build (v1):**
- Marketing site — brand page, creator page, web accept-page.
- Brand workflow — signup, structured offer builder, select onboarded creator, send offer, negotiation thread, review/approve/revision, payment link + status, one-tap re-engage past creator, deal timeline.
- Creator app — onboarding + self-entered rate card, deal inbox, offer card (accept/counter/decline), chat, deliverable upload with versions, status pipeline, payment status, push.

**Do NOT build (deferred):** discovery/search · Instagram Graph API auto-stats · fake-follower scoring · held escrow + KYC/Route · Aadhaar eSign · GST invoicing · frame-by-frame video review · analytics dashboards · agency portal · influencer-manager role · multi-creator campaigns.

## Intended repo structure (adjust if you scaffold differently)

Monorepo (pnpm workspaces):

- `apps/web` — Next.js (marketing + brand workflow + web accept-page)
- `apps/creator` — Expo (creator app)
- `packages/shared` — shared TS types incl. the `Deal` model + generated Supabase types
- `supabase/` — migrations, schema (`schema.sql` is the deployed source of truth), seed data
- `docs/` — project context (imported below)

## Working conventions (HOW)

- Small, focused commits with clear messages.
- Don't add a new dependency, external service, or API without flagging why first.
- Generate Supabase types from the live schema and commit them to `packages/shared`; import shared types — don't duplicate model definitions.
- Status changes auto-log via the DB trigger. For non-status events worth auditing (e.g. a revision request, a payment link sent), write an explicit `events` row.
- When a decision is ambiguous or risks scope creep, **flag it and propose options rather than guessing.**
- Prefer boring, standard patterns over clever ones.
- **RLS policies: `supabase/rls.sql` is the single source of truth.** Every new table's policies MUST go into `rls.sql` at creation time — not only in the migration file. Use `DROP POLICY IF EXISTS` before each `CREATE POLICY` so the file is safely re-runnable. If a migration creates policies inline, consolidate them into `rls.sql` in the same commit. This rule exists because policy drift between migrations and `rls.sql` has caused orphaned/conflicting policies in the live DB (invoices, deal_deliverable_items, creator_products — all had stale migration-named duplicates).
- Secrets live in `.env` (gitignored), never in this file or any committed file. The Supabase **service-role key bypasses all RLS** — it stays server-side / local only, never in the Expo app or any client bundle.

## Deeper context (imported — these must exist as markdown in `/docs`)

- See @docs/handoff-brief.md for full project state and decision history.
- See @docs/build-plan.md for the 30-day week-by-week schedule.
- See @docs/strategy-memo.md for market sizing, competitor analysis, business model, and GTM.
- See @docs/roadmap.md for deliberate post-v1 ideas — do NOT build any of these in v1.

(For the marketing site's visual design, read `docs/design-patterns.pdf` — Chandreyee's landing-page pattern teardown — on demand; it's a binary, so it isn't auto-imported.)

## Test-case discipline (standing rule)

Every feature built or changed MUST have its test cases added/updated in `docs/test-cases.md` as part of the same work — not afterwards, not "later."
- New feature → add its functional checks AND any security/RLS checks it introduces.
- New table → its RLS checks go in the SECURITY section of `docs/test-cases.md` (and its policies in `rls.sql` — both, always).
- Changed behavior → update the affected existing cases rather than leaving stale ones.
- New environment gotcha (migration to run, publication table, config limit) → note it so re-testing elsewhere doesn't hit it blind.

Treat `docs/test-cases.md` like `rls.sql`: it's the tracked source of truth for "what must still work," and it goes stale silently if not updated with the change that affects it.

## Current status

Schema is built, deployed, and verified (audit trigger confirmed firing). Dev accounts: GitHub + Supabase project live; Vercel + Expo not yet connected. **Brand name not yet locked** (this blocks the WhatsApp BSP verification queue — top priority, 48-hour task; does not block the build).

**Next build task:** scaffold the pnpm monorepo (`apps/web`, `apps/creator`, `packages/shared`, `supabase/`), wire both clients to the existing Supabase project via env vars, generate + commit shared Supabase/Deal types, and deploy `apps/web` to Vercel. Do NOT rebuild the schema — it already exists.
