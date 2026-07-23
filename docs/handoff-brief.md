# Project Handoff Brief

*Paste this into the first chat of the new account's project (and/or add it as a knowledge file). It's written so a fresh Claude instance has full context with no prior memory.*

---

## What this project is

A **creator-first workflow platform** for brand–creator deals in India. It replaces the WhatsApp/DM/email/Drive/bank-transfer mess that a single brand-creator collaboration currently splinters across, collapsing it into one clean, structured flow. The brand name is **not yet locked** (treat this as a near-term task — see Open Items).

**Founders:** Utkarsh Verma (marketing / creator relationships), Palak Jain (product).

---

## The locked strategy

- **Creator-first. Host transactions, don't manufacture matches.** The platform runs deals between a brand and a creator who already found each other. It is **not** a discovery/search marketplace in v1 — that avoids the two-sided cold-start problem.
- **Disintermediate agencies.** Remove the opaque middleman so brand and creator deal directly and transparently. Agencies are *not* in the main model, but the architecture should let them (and influencer-managers) use the workflow later for a fee — as a delegated-access role, not a rewrite.
- **Build for ALL creator types — the platform/tooling is niche-agnostic.** Whether to LAUNCH finance-first (or any niche) is a go-to-market decision made AT LAUNCH, not a build-time constraint. Do not scope features to a single niche.
- **The wedge is recurring deals.** An agency earns its cut on the first match and nothing on the fourth repeat deal, yet still takes it and still runs it through DMs. Make the repeat deal one tap. Recurring is where you win.
- **Win on "easier than DMs," not just "safer than DMs."** If running deal #2 on-platform is even slightly more friction than a WhatsApp message, users leak back off-platform. Easier-than-the-alternative is the actual product requirement.

---

## The core abstraction: the Deal

A **Deal = one collaboration between one brand and one creator**, as a single record holding everything from first offer to final payment: the structured terms (deliverables, price, timeline, revision count, usage rights, payment terms), the negotiation/chat thread, the deliverable files + versions, the payment status, and a timestamped audit log of every change.

It moves through a lifecycle: `negotiating → agreed → delivered → (revision) → approved → paid → complete`.

Everything else hangs off the Deal. The brand app and creator app are two windows onto the same Deal. Consolidating the scattered workflow into this one object **is** the product; the accumulated Deal history (rates, response times, reliability) **is** the moat.

---

## The three surfaces (the build)

| Surface | Who | Platform |
|---|---|---|
| Marketing site | Brands + creators | Web (Next.js) |
| Brand workflow | Brand managers | Web, desktop (Next.js) |
| Creator app | Creators | **Native** (Expo / React Native) |

Plus a **thin web accept-page** so a creator's *first* offer opens without a download. **Decision locked:** the creator gets a native app (better perceived value + push), but the download must never sit between a creator and their first deal — first offer opens on web, app becomes the home after they accept.

---

## Tech stack

- **Supabase** (Postgres) — database, auth, storage, realtime. One portable source of truth; scales far past the 10k-creator / 1k-brand target; clean future dev handoff. **Keep all data here and decoupled from the frontends — this protects the moat data.**
- **Next.js on Vercel** — marketing site + brand workflow + web accept-page.
- **Expo (React Native)** — creator app. Same JS/React + same backend as the web = one team, one language, two clients.
- **WhatsApp Business API via a BSP (Interakt)** — the real notification channel (~90% open rate).
- **Razorpay Payment Links** — v1 payments are *tracked*, not held in escrow.
- **Expo push** — in-app creator notifications.
- **Cursor / Claude Code** for real AI-assisted code; **v0** for UI scaffolds.
- **TestFlight + Play internal testing** — pilot distribution to known creators, no public store review on the critical path.

---

## Feature list

**v1 — build:** marketing site (brand + creator pages, web accept-page); brand workflow (signup, structured offer builder, select creator from onboarded list, send offer, negotiation thread, review/approve/revision, payment link + status, one-tap re-engage past creator, deal timeline); creator app (onboarding + self-entered rate card, deal inbox, offer card with accept/counter/decline, chat, deliverable upload with versions, status pipeline, payment status, push).

**Explicitly NOT v1 (defer — each is a multi-week sinkhole):** discovery/search engine · Instagram Graph API auto-stats · fake-follower scoring · **held escrow + KYC/Route** · Aadhaar eSign · GST auto-invoicing · frame-by-frame video review · analytics dashboards · agency portal · influencer-manager role · multi-influencer campaigns.

---

## End-to-end workflow (happy path)

1. Brand creates a structured offer → selects an onboarded creator.
2. Creator gets a WhatsApp ping with a link.
3. Link opens the web accept-card: Accept / Counter / Decline.
4. On Accept → terms recorded + audit entry → "download the app to manage everything."
5. In the app: brand sends Razorpay payment link (status flips); creator uploads deliverable.
6. Brand reviews → approves or requests revision (counts against agreed limit).
7. Approved → creator goes live → payment marked released → deal complete, lands in history.
8. Next deal, same creator: brand re-engages in one tap, terms pre-filled. ← the recurring loop.

---

## Hard-won "do NOT do this" list (easy to lose, expensive to relearn)

- **Held escrow is not "instant compliance."** Holding a brand's money and releasing on approval is RBI payment-aggregator territory (PSS Act; funds must sit in a regulated escrow/nodal account). Razorpay's Route is the legitimate path but needs per-creator KYC onboarding and deliberate setup — **not a 30-day toggle.** v1 = payment-tracked + payment links. Held escrow is v1.5/v2. **This is the #1 timeline-killer.**
- **Instagram-DM outreach doesn't work.** The IG Messaging API only lets you message users who messaged you first (24h window); unsolicited cold-DMs aren't possible and violate policy. **WhatsApp is the notification channel, not IG DM.**
- **Don't treat a click-accept text block as definitively "legally binding."** Have a lawyer validate enforceability and draft base terms.
- **Scaling risk is product correctness + payments/disputes, not the database.** Postgres handles your target scale trivially. Don't over-engineer infra.
- **Don't build a discovery engine, AI matching, or analytics first.** Workflow + the deal record come first.
- **Don't hard-code "one deal = one creator = one login."** Include a nullable `managed_by` / delegated-access field now so agencies and managers slot in later as a permission layer.
- **Defer-list is law.** If a deferred feature creeps into v1, something real falls off the 30-day truck.

---

## Current status (as of handoff)

- **Phase:** Day 1 of the 30-day build — account setup.
- **Email/identity:** using a dedicated Google account + "Sign in with Google" everywhere as the single login. Brand name not locked, so dev tools are on a stopgap Gmail (easy to migrate); domain email + verified accounts wait for the name.
- **Started today (no name needed):** GitHub, Supabase, Vercel, Expo, Cursor; Apple Developer (Individual) + Google Play Console.
- **Waiting on the name:** domain + Google Workspace email; WhatsApp BSP / Interakt verification (the slowest queue — this is why the name is now near-critical-path); Razorpay (can start as individual but cleaner after).

---

## Open action items / parallel tracks

1. **Lock the brand name within ~48 hours** — it's now the dependency holding the slowest queue (WhatsApp verification). Time-box it; don't make it a branding project.
2. **Switching-trigger interviews:** 10–15 finance creators — what is the *one* reason they'd leave WhatsApp? Let the answer sharpen offer-card vs payment vs reminders emphasis.
3. **Lawyer:** validate enforceability of the agreed-terms screen and draft base terms.
4. **Confirm the first ~20 creators are committed**, not just reachable.
5. **Next concrete build step:** the Supabase schema for the Deal object (incl. the `managed_by` stub).

---

## Ops portal (`/ops`)

Internal-only console for founders to manage creators, brands, deals, and fee settings. Not a product surface — it's the admin tool.

- **Access**: gated by `OPS_ALLOWED_EMAILS` environment variable (comma-separated emails). Checked at the layout level (via `verifyOpsAccess()`) and again at every server action. No database-stored roles — env var is the single control.
- **Data access**: uses the Supabase **service-role key** (`createAdminClient()`) for all reads and writes. This **bypasses RLS entirely**. The security boundary is the email allowlist, not RLS.
- **Capabilities**: add/edit/vet/reject/delete creators; add/edit products; approve/reject brands; edit brand fee settings; set per-deal fee overrides; generate offer links. Can read creator phone numbers, deal terms, messages, and events. Cannot read invoices or uploaded deliverables.
- **Audit**: every ops write is logged to the `ops_events` table with the acting user's email and auth ID, the action, the target row, and before/after values for status and money fields. Deal-specific ops actions (fee overrides) also write to the `events` table so they appear in the deal timeline.
- **Route**: `/ops` (layout-gated), with sub-routes for `/ops/creators`, `/ops/brands`, `/ops/deals`, `/ops/offers`, `/ops/access`.

---

## Pilot success metric (the v1 bar)

One real deal goes **brief → accept → deliver → approve → paid, entirely on-platform**, with a WhatsApp ping and a native-app upload, from one of Utkarsh's creators on TestFlight. And: **would they run deal #2 on it?** (the retention/leakage signal that matters most).

---

*Companion file: `30-day-v1-build-plan.md` (full week-by-week schedule). Original research: `ICOP_Research.pdf`.*
