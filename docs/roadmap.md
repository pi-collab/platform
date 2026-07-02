# Roadmap (post-v1)

> Parking lot for **serious, deliberate ideas we intend to build later** — not the v1 defer-list (that's "don't build now" inside CLAUDE.md). Items here are directional, unscheduled, and to be revisited only after v1 proves the manual workflow works and is used.

## Change-order flow for extra revisions (post-v1)

**The idea:** When a brand exceeds the agreed revision limit, the current v1 behavior is warn-but-allow — the brand sees a warning ("this exceeds the agreed revision limit — extra revisions should be renegotiated with the creator") but can still request the revision. The real answer is a **change-order flow**: when the limit is hit, the brand can propose a paid amendment (extra revisions at a renegotiated price), the creator accepts/declines, and only then does the revision proceed. This turns revision overruns from a trust issue into a structured, auditable transaction.

**v1 reality:** Warn-but-allow. The warning text explicitly frames the overrun as exceeding agreed terms. Revision count is tracked per review round (deal `delivered → revision` transition), not per item, to prevent inflation.

**What the change-order flow needs:**
- A "propose amendment" action from the brand (extra revisions + price delta)
- Creator accept/decline on the amendment (reuses the offer-card pattern)
- Amendment recorded as an event in the audit log
- Updated `revision_limit` on the deal after acceptance
- Optional: payment for the amendment (ties into the payment-tracking flow)

**Gate:** Build after v1, once real pilot deals surface revision-limit friction. The warn-but-allow mechanism is sufficient for early deals with known creators.

---

## Revision overage pricing — creator default + per-deal override (the proper revision-limit answer)

Replaces v1's warn-but-allow. Model:
- DEFAULT (creator policy, product-level): each creator_product carries included_revisions + price_per_extra_revision (e.g. "₹60k, 2 revisions included, ₹5k per extra"). Set once by the creator, applies to all their deals. No negotiation needed by default.
- OFFER surfaces it: when the brand builds the offer, the creator's revision terms are shown and pre-filled into the deal.
- PER-DEAL OVERRIDE (negotiable): the brand can propose different revision terms for THIS deal (e.g. "3 free revisions"); the creator can agree/edit for that deal. → This requires the COUNTER-OFFER / negotiation capability (currently only accept/decline exists — counter is deferred). Revision-terms negotiation is a slice of the general counter-offer flow.
- ENFORCEMENT: when revisions exceed the agreed-for-this-deal included count, the pre-agreed per-extra price AUTO-ADDS to the amount owed — no later negotiation, just an updated total. → Touches the PAYMENT flow (also unbuilt).

DEPENDENCIES: needs (a) counter-offer/negotiation flow, (b) payment flow. Build in the payment+negotiation phase, NOT before the basic loop closes.

WHY IT'S GOOD: default = zero-friction (creator's standing terms); override = flexibility when either side wants different terms. Gets both no-negotiation-by-default AND per-deal flexibility. This is the real answer to revision scope-creep (protects creator) without trapping the brand.

v1 INTERIM: warn-but-allow + informal chat. This model replaces it later.

---

## Agentic AI: delegated agents for brands and creators

**The idea (PJ, captured Day 1):** Once the platform has replaced agencies and managers as the *workflow*, go a step further and replace them as the *labor* — AI agents that act on behalf of a brand or a creator to run deals end to end: negotiation, coordination, deliverable chasing, status management, and (where legally possible) payment. Brands and creators would configure an agent to act for them within set bounds. (Agent naming/branding TBD.)

**Why it fits the thesis (not a bolt-on):**
- An agency/manager is functionally a human who negotiates, chases deliverables, and manages payment for someone. An agent doing this is the logical end-state of "disintermediate the middleman."
- It sits directly on the asset we build from day one: the **Deal object + events audit log**. An agent can only reason and act well if it has structured deal history — which is exactly the moat being accumulated. The data is, in part, *for* this.
- The **`managed_by` delegated-access stub** (already in the `users` table) is the conceptual hook: an agent is just another kind of delegated actor on an account, like a manager. No rewrite needed to introduce the concept — it extends an existing permission layer.

**Hard considerations to respect when this is picked up (do not underestimate):**
1. **Payments-by-agent is the hardest, riskiest, last piece.** Autonomous payment initiation/release re-triggers the same RBI payment-aggregator problem we deliberately deferred (held escrow), *plus* liability questions ("who is responsible when the agent pays wrong?"). Expect this to ship well after the coordination/negotiation agent — possibly never fully autonomous.
2. **Autonomy must be graduated and guardrailed by design.** No brand lets an agent commit large spend unsupervised on day one. Realistic path: agent **drafts → human approves**, then expand autonomy only on low-stakes actions over time. Decide per-action what needs a human confirm.
3. **Strictly post-PMF and dependent on v1.** An agent automating the deal flow is only valuable once that flow exists, is used, and has accumulated enough history to act on. Cannot be evaluated until the manual workflow is proven.

**Status:** directional only. Not scheduled. Revisit after v1 + early traction.

---

## AI creator search / matching for brands

**The idea:** Let brands search for the right creators via an AI prompt — "find me a finance creator who does explainer Reels for a Gen-Z audience" — matched against the data we hold on creators (niche, content style, types of Reels they make, deal history, reliability, performance).

**CRITICAL guardrail — why this is NOT v1 and must not creep in:** This is *discovery*, which v1 deliberately excludes (see CLAUDE.md). v1 is a transactions platform between people who already know each other; matching reintroduces the two-sided cold-start trap we're avoiding. This feature is only allowed in **after** v1's transaction model is proven AND we have accumulated enough proprietary creator/deal data for the search to be defensible.

**Why it's strong *later*:** Search built on our proprietary behavioral data (real deal history, reliability, actual content patterns) is a genuine moat — data no competitor has. Search built on scraped follower counts is just another crowded discovery tool (exactly what the research warns against). The trigger for building this is **data accumulation**, not a date.

**Dependency:** Requires structured creator data (content style, Reel types, history) — shares this prerequisite with AI script generation below.

---

## AI content-assist for brands (scripts, hooks, competitor analysis)

**The idea:** A family of time-saving AI tools for brands at the briefing and strategy stage:
- **Script/brief drafting:** Auto-draft a content script or brief based on the brand's goal, the selected creator's profile and personality/style, and patterns from what's performed well — reducing the time a brand spends briefing.
- **Competitor and hook analysis:** Surface high-performing hooks, angles, and content formats in the brand's category, drawn from competitor content patterns — helping brands brief smarter without manual research.

**Why it fits the thesis:** "Faster than the alternative" is the core product requirement. Briefing a creator is real manual work; auto-drafting a strong starting point genuinely reduces it. Competitor/hook analysis is the same fit — a time-saving layer that makes the brand's side of the deal easier, without touching the transaction model.

**Honest caveats:**
- Depends on structured creator data (style, personality, past Reels) — same prerequisite as AI search above.
- Competitor analysis implies pulling and analyzing external content — a non-trivial sub-piece with external-data acquisition, ToS, and scraping considerations. Not a free add-on; the data pipeline is its own project.
- Both features are power tools, not core workflow — only after v1 is proven.

**Status:** directional, post-PMF, gated on creator-data accumulation.

---

## External agent discoverability (agent-to-agent distribution)

**The idea:** Make the platform discoverable and actionable by external AI agents (e.g. ChatGPT or other assistants) — so when a brand asks an external agent to "find finance influencers in India," our platform can be queried or handed the request, routing the invite/lead back to us (similar to how job platforms surface into other tools). Likely via emerging agent-interop standards (e.g. MCP).

**Why it fits:** A distribution channel that meets brands where they increasingly start (asking an AI agent), without us building discovery ourselves.

**Caveats / gate:** This is externally-driven discovery — only valuable once we have vetted creator supply worth surfacing AND the external-agent ecosystem is mature enough to drive real traffic. Shares the "needs supply + data first" gate. Directional, post-PMF.

---

## [OFF-CORE-THESIS — capture only, strategic risk noted] AI characters / AI influencers

**The idea:** Let brands create a character or choose from our AI influencers / AI-generated characters to produce content.

**STRATEGIC RISK — read before ever acting on this:** This contradicts the core thesis. Our defensibility rests on REAL creators trusting us (creator-first, anti-agency; Utkarsh's network is our supply bootstrap). AI influencers replace the creator entirely — competing with our own supply side. If it becomes known (roadmaps leak to investors/hires/creators) that we plan AI influencers, it undermines creator trust, which is the moat. This is arguably a DIFFERENT business with an adversarial relationship to our creators, not an extension of this product.

**Status:** captured at founder's request for possible far-future consideration. NOT to be built or signaled while creator trust is the core asset. Revisit only if/when the business model fundamentally changes. Keep OFF any external-facing roadmap.

---

## Full internal operations portal (post-v1)

v1 ships a THIN ops console only (add creators, vet creators, view brands/creators — internal, service-role, locked to founders). The full ops portal is deferred: support ticketing, payment-receipt management, analytics/reporting dashboards, automated IG-based vetting (gated on the same Instagram-API limits as auto-stats — manual vetting is the v1 reality), CRM, and ops-team role management. Build later when pilot volume actually demands it; for a handful of brands and ~20 creators, manual handling (email/WhatsApp for support, Razorpay dashboard for receipts) is sufficient.

---

## Brand-invites-trigger-vetting (Model C, post-v1)

Let brands send an offer to a creator NOT yet in our roster by entering their handle; the invite triggers vetting (manual first, automated later) before the offer proceeds. Keeps the vetting moat while letting brands drive supply growth. CAVEATS: automated IG vetting hits the same Instagram-API wall as auto-stats (manual review is the v1-and-near-term reality, not a quick automation); needs a "pending vetting" state + founder review queue; and the first-contact phone-number problem is unsolved (how to WhatsApp an invited creator whose number we don't have). Stays invite-a-specific-known-creator, NOT browse/search strangers (not discovery). v1 = vetted roster only; this is the next layer.

---

## Campaign layer — grouping over independent deals (post-v1)

A Campaign is a GROUPING container over multiple independent single-creator Deals — NOT a multi-creator deal. The Deal model stays one-brand-one-creator; Campaign sits on top as organization only. This keeps us clear of the "multi-creator campaigns" defer-list item (which meant the dangerous one-deal-many-creators version).

Features: (a) bulk-create — select multiple creators, create a separate deal for each at once from shared starting terms; (b) per-deal overrides — each deal independently adjustable (different script, price, deliverables per creator); (c) grouped dashboard view — see all a campaign's deals together; (d) campaign type as a display/organizational TAG (single / multi / collaboration) — "collaboration" (creators shooting together) is structurally identical to "multi" (separate deals, separate payments), just a creative-linkage label, not a structural difference.

PAYMENT — read carefully:
- "Pay each creator separately" = N individual Razorpay links = SAFE, consistent with v1 payment-tracking model.
- "Pay for all at once, we split to creators" = fund-splitting / payment-aggregator territory = GATED ON THE SAME regulated-payments work as held escrow (Razorpay Route + per-creator KYC). This is NOT a convenience checkbox; it's a regulated-money feature. Do not treat as easy.

Schema hook: add a nullable `campaign_id` to the `deals` table when we next touch the schema, so deals can be grouped later without a rewrite (same cheap-nullable-stub pattern as `managed_by`).

Timing: after the basic single-deal flow is proven (v1.5-ish).

---

## Listen to the draft / contract (text-to-speech) (post-v1)

Let creators (or brands) listen to a draft offer/contract instead of reading — people don't always want to read. Browser text-to-speech is cheap to add. Depends on the deal/contract screens existing. Small, easy, later.

---

## AI contract/offer summarization (post-v1)

AI-generated plain-language summary of an offer's terms. On-thesis (reduces friction). Folds into the AI-assist feature family. Depends on terms existing + an AI call. Roadmap.

---

## Expected-delivery-date visibility / shoot scheduling (post-v1)

Creator sets when they'll shoot/deliver (we already have a `timeline_date` field on deals); brand sees it / gets notified, to set expectations and reduce "when's it coming?" anxiety (a core pain from the research). LIGHT version (date + brand visibility/notification) could be a small future addition. RICH version (calendar integration, reminders, notification orchestration) is bigger — roadmap that.

---

## Ops/outreach automation & agents (post-v1) — folds with existing entries

Automate cold email, support ticketing, ticket handling, and calls via agentic workflows. Mostly overlaps the existing "full internal operations portal" and "agentic AI delegated agents" roadmap entries — see those. NEW/distinct piece: automated cold email for BRAND acquisition (note: creator outreach is WhatsApp/Utkarsh, not cold email). CAVEAT: cold email automation carries deliverability, spam-law (e.g. anti-spam regulations), and sender-reputation risks — "later, and carefully," not a quick add.

---

## Guapd-mediated payment terms / creator financing (post-v1, regulated)

**The idea:** Guapd sets the payment rule for all deals on the platform — e.g. brand pays Guapd upfront, Guapd pays the creator after X days. If the creator wants instant payout, Guapd advances it for an extra X% fee.

**WHY DEFERRED — this IS the #1 deferred problem in a new costume:** Holding a brand's money and releasing to the creator on a schedule = held escrow / fund-routing = RBI payment-aggregator / PSS-Act territory (needs Razorpay Route + per-creator KYC). The "instant payout for a fee" piece is a financing/factoring product — even more heavily regulated. This is potentially a strong revenue model later, but it's exactly what v1 avoids.

**v1 reality:** Payment TERMS are a recorded agreement only (e.g. "30 days after delivery"); the brand pays the creator directly via Razorpay payment link; Guapd tracks status but does NOT hold or route funds.

**Gate:** The same regulated-payments infrastructure work as held escrow. Decide deliberately later; do not let it creep into v1.

---

## Creator stub-claim mechanism (pre-launch, required before creator self-signup)

When a creator signs up, they must be able to LINK to their existing ops-created stub row (matched by phone and/or handle), populating `user_id`, rather than creating a duplicate creator profile. This is the bridge between ops-seeded profiles and creator self-management.

**Why critical:** Without this, a stub creator who signs up creates a second, separate profile — orphaning their products, deal history, and vetting status on the original stub. The claim flow must: (1) match the incoming signup to an existing stub (by phone or handle), (2) set `user_id` on the matched stub, (3) give the creator immediate ownership of their profile, products, and deal history. If no stub matches, create a new creator row as normal.

**Timing:** Must be built BEFORE creator self-signup goes live. Does not block ops-seeded pilot (all creators are stubs managed by ops). Build alongside or just before the Expo creator app onboarding flow.

---

## Global / multi-currency (roadmap; adopt hygiene NOW)

Ambition: operate globally → need country + currency selection per brand/creator/deal, localized formatting.

NOW (cheap, do as we build): keep money as integer minor-units; keep deals.currency populated (default 'INR'); route money formatting through a single currency-aware helper (INR-only today) so adding currencies later isn't surgery — don't scatter hard-coded "₹"/×100.

LATER: full multi-currency/country support. Minor-unit assumptions vary (e.g. JPY has none) — handle when building.

DISCIPLINE: don't BLOCK global, but don't BUILD global in v1 — India/finance wedge first.

---

## Ship physical products / product-as-payment (roadmap)

Brands often send product to creators to feature. Two valid framings: (a) a logistics/deliverable step in the deal (brand ships → creator receives → shoots); (b) an in-kind payment type (cash + product value). "Connect-your-own-commerce-API" so the brand's own stack (e.g. Shopify) places the order — we trigger, don't fulfill. Adds addresses, order APIs, in-kind accounting. Post-v1.

---

## Multi-person / team workflow + assignment + internal approval (roadmap — this is the deferred delegated-access layer)

Teams collaborate inside one brand/agency before content reaches the creator: e.g. writer drafts → manager reviews/approves internally → then shared to creator. Features: assign a stage to a person for approval, notify, reassign on approval to proceed, internal comments, and a "my pending tasks" board.

FRAMING: this is the fleshed-out deferred delegated-access / agency-portal / influencer-manager layer (managed_by stub is the hook). NOT v1.

PRINCIPLE (product value): the product must let ONE person run a deal end-to-end (never REQUIRE a team), while SUPPORTING teams where they exist. Build for the solo operator; teams opt in.

DIRECTION: AI agents + Slack integration to reduce coordination overhead over time (connects to deferred AI-assist roadmap).

GATE: validate with real pilot brands before building — do finance pilots actually have multi-person approval chains, or is that an enterprise assumption? Build only if pilot users ask. A task board is heavy build for unproven need.

---

## VISION: Guap'd as the creator's end-to-end work + deal management home

Long-term, Guap'd is ONE place where creators (all types, over time) manage deals and work end-to-end — and where brands run those deals. Rich features beyond the core loop (below) are part of this vision AND serve growth: they attract more creators and brands onto the platform. The roadmap below is expansive by intent.

SEQUENCING PRINCIPLE (non-negotiable): the expansive vision is reachable ONLY by first proving the core — one real brand–creator deal completing on-platform. Vision = broad; next BUILD = the one thin loop. Features below wait their turn behind a working, proven loop. Don't let vision-scope set build-priority.

WEDGE NOTE: product/tooling is creator-type-universal; GTM stays finance/BFSI-first until that niche is won. "All creators" is the vision, not the launch.

---

## Creator portfolio / media-kit page (roadmap — part of the vision)

A rich, shareable creator page (hero intro, brands-worked-with, categorized work samples/video portfolio, contact) — shown to brands on-platform AND shareable by the creator (bio/DM/email) to pull brands in. Two layers:

(a) Richer brand-facing profile: upgrade the existing /browse/[id] storefront toward this media-kit feel (work samples, polished visuals). Enhancement of an existing page.

(b) Creator-created shareable page: let creators build/customize their page and share it.

GROWTH RATIONALE: shareable creator pages drive brand acquisition (creator sends link → brand lands on Guap'd → deal happens on-platform). This is a real acquisition loop, part of the vision.

TETHER (important): keep the shareable page funneling INTO Guap'd's deal loop — its job is to bring brands onto the platform to transact, not to be a creator's standalone external website (avoid drifting into pure creator-website-builder / Beacons territory where brands aren't the customer). Build the version that feeds the transaction loop.

GATE: after the core loop works; validate demand with pilot creators.

---

## NORTH STAR (the big vision)

Guap'd becomes THE place every influencer deal happens — across all creator tiers, from finance micro-creators to A-list (athletes, actors, global celebrities).

- For brands: not just a workflow tool but an intelligence layer — who to work with, what to pay (benchmarks), expected and actual ROI/ROAS, performance attribution. Ease + richness that makes running deals here obviously better than anywhere else.
- For creators: one app to manage ALL their deals and work, end-to-end, regardless of creator type.

PATH DISCIPLINE (the hard truth this roadmap exists to protect): this north star is earned ONLY by first proving the boring core — ONE real brand–creator deal completing on-platform (brief→accept→deliver→approve→pay). A-list creators, ROI tools, and scale are CONSEQUENCES of nailing the first ordinary deals, never the path to them. The brand intelligence/ROI layer specifically REQUIRES completed deals + platform performance data (deferred API) — it cannot exist before deals flow.

Build narrow; dream wide. The next build is always "close/strengthen the loop," not "reach for the north star."

---

## Open strategic question: launch wedge (finance-first vs. open to all creators)

The locked strategy was finance/BFSI-first as the defensible wedge (biggest budgets, SEBI angle, underserved, Utkarsh's network). PJ has since signaled this is soft — partly because Utkarsh isn't a pure-finance creator.

DECISION NEEDED (deliberately, with Utkarsh — don't let it drift): keep finance-first as the launch wedge, or go open to all creator types from launch?

TRADE: niche-first = defensible, avoids two-sided cold-start (the research's core argument). Open = bigger TAM but the classic marketplace cold-start risk. Product/tooling is creator-type-agnostic either way; this is purely a GO-TO-MARKET decision. Resolve before pilot outreach, since it determines who Utkarsh recruits first.

---

## On-platform deliverable storage (later — as a FEATURE, not just infra)

v1: deliverables are submitted as LINKS (creator pastes Drive/WeTransfer/etc. URL) — zero storage cost, closes the loop.

Later: host deliverables on Guap'd, framed as a feature with tiers — free storage allowance per creator/deal + paid storage upgrades. Vision extension: creators store their reels/content on Guap'd → content lives on-platform (stronger moat, stickiness, a revenue line).

GATE: build when proven worth the storage+bandwidth cost; the deliverables data model should carry either an external_url (v1) OR a hosted file_path (later) so the upgrade is additive, not a rewrite.

---

## Build practices to follow (ref: Anthropic Founder's Playbook)

For any AI-generated feature, follow good architecture/scope/security hygiene to avoid technical debt: small scoped pieces, propose-before-build, security designed and TESTED before features sit on top (as done with RLS), keep CLAUDE.md context current, and distinguish real product-market-fit signals from early hype when the pilot runs. Apply these wherever relevant going forward.

---

## OPEN DECISION (cofounders): platform revenue model — needs math, don't lock from competitor screenshots

Passionfroot appears to run MULTIPLE streams stacked: brand subscription TIERS (Starter $199 / Scale $499 / Enterprise — flat monthly SaaS) AND a per-deal take-rate. "The Passionfroot model" is a combination, not one lever.

Our levers to decide (combine, don't just pick one — our research memo framed these as layers):
- Per-deal take-rate (% of each deal). If DEDUCTED from creator = charging creators (cuts against supply-first thesis); if ON TOP = brand pays more (deals look pricier).
- Brand subscription tiers (flat monthly MRR) — clean, but brands won't pay until platform is proven (post-pilot).
- Who bears the per-deal fee: brand-on-top vs creator-deducted. PJ leaning toward Passionfroot-style DEDUCT (from creator) — note this contradicts the stated "creators free / 100% to creator" position; conscious cofounder call needed.
- Creator plans/slabs + add-on features (later creator-side revenue).

DECISION NEEDED with cofounders + real unit-economics math (where's the margin, what does each lever cost in adoption). Tied to the open finance-first-vs-open-wedge question too.

BUILD IS NOT BLOCKED: fee stored as structured components (base / fee% / mode / who-bears / brand-pays / creator-receives) + per-brand ops setting → any decided model is a config/calc change, not a rebuild. Decide the model deliberately; the foundation flexes to it.

---

## Relationship-scoped Inbox (v2 — gated on payment protection)

Passionfroot-style persistent brand↔creator Inbox: one ongoing conversation before/during/after deals, deal-events threaded in (proposal sent, invoice paid), proposals-from-chat, attachments, archiving. Matches the repeat-deals moat.

GATE: this OPENS the disintermediation surface (a free always-on channel makes taking deals off-platform easier). Only build AFTER payment protection (Route/escrow, post company-registration) makes staying on-platform valuable enough to offset the open channel. Until then, keep messaging DEAL-SCOPED (anchored to an on-platform deal) — the lower-leak model.

NOTE: messaging design does NOT solve disintermediation; the transaction experience + payment protection do. Don't build messaging restrictions AS an anti-leak defense.

---

## Unread-message notification (v1-appropriate, gated on Interakt)

Passionfroot emails a partner if a message goes unread. Our channel is WhatsApp (Interakt), not email, and not built (gated on company registration). Version: unread message → WhatsApp notification. Activates when Interakt lands.
