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

---

## Roadmap items (from PJ braindump — captured, NOT building now; notification/liveness build in progress)

NEAR-TERM (completes the deal loop's meaning):
- POSTED state: workflow state after the creator posts the content (with live link). "Done" = posted, not just paid. Prerequisite for any future performance tracking. Small; fold into polish.

V1.5 (on-thesis workflow value):
- CAMPAIGNS: one campaign → many deals (e.g. "Summer Drop" = 10 creators = 10 deals). Campaign-level rollup metrics + per-deal. Strong fit (multi-deal operations = the pain). Interacts with deferred multi-influencer campaigns + analytics. Build after single-deal loop is polished + real.
- SHIPMENT TRACKING: brand adds product shipment status + tracking link; creator sees delivery ETA; gate "start recording/deliverable" on product delivered. Adds a lifecycle state. Real gap for PRODUCT deals.
- REEL TYPE + RIGHTS: collab vs non-collab; boosting rights (yes/no + duration in months); structured terms fields. Record + timestamp creator confirmation of granted rights → this audit trail is the creator's EVIDENCE if content is used beyond granted rights. NOTE: platform RECORDS rights + confirmations; ENFORCEMENT of "used without confirmation → creator has rights" is CONTRACTUAL/legal, backed by the audit log — not software enforcement.
- USAGE-RIGHTS END DATE: display when usage rights expire (buildable now — already capture usage rights). EXTENSION flow: brand extends rights (esp. for well-performing creators) = a new mini-deal/payment (rides payment rails, stubbed now / real post-registration). "Performing creators" targeting needs real metrics (deferred analytics).

OPERATIONAL/SECURITY (near-term when headcount grows):
- ROLE-BASED ACCESS: the moment a 4th person (dev/employee) touches the system — proper RBAC. Ops portal is currently founder-gated by HARDCODED email (doesn't scale). Least-privilege GitHub + Supabase (service-role keys are dangerous — who gets them?), secrets hygiene. SECURITY-CRITICAL given RLS was just hardened; adding broad-access people undoes it. Not a feature — a necessity. (Brief already flags: no named engineering owner.)

POST-PILOT SCALING (biggest scope-expansion — GATED on core deal-loop proven with real users):
- CREATOR-TOOLS FUNNEL: free/low-fee creator productivity tools (reel planning, calendar) as a supply-side ACQUISITION play → convert creators to "Guap'd money" (brand deals through the platform), initially deals-only-through-us. Clever supply-growth wedge BUT: it's a SECOND product (creator-productivity, ≠ deal-workflow), and building it before the core loop is validated with real users splits focus (research explicitly chose NOT to be Beacons/creator-OS). Does NOT violate "no discovery marketplace" (good), but IS the scope-creep the brief warns against. Roadmap post-pilot, gated on the deal-loop being proven. Do NOT pull forward.

---

## Deliverable upload + storage (decision captured)

Current: link-submission (creator pastes Drive/YouTube/Loom URL) — zero storage cost. Schema already supports hosted: deliverables.storage_path (nullable) alongside external_url.

V1 add (when prioritized): UPLOAD as an OPTION ALONGSIDE links (not replacing) — Supabase Storage, 500MB/file cap, RLS-scoped bucket (only deal parties access). Keeps link-users free (no egress); upload for those who prefer it.

Cost reality: storage is cheap (~$0.021/GB/mo); EGRESS (viewing) is the real cost (~$0.09/GB) — a video watched repeatedly during review drives cost, not storage. At pilot scale: a few dollars. Cap + monitor; a paid "more storage" tier is a possible later model.

DEFERRED (defer-list): Loom-style TIMESTAMPED video review (brand comments pinned to exact timecodes). This is NOT "just upload" — it's a frame-accurate review tool (video player + timecode-anchored comment threads + resolve/resubmit), weeks-long build. Free-text-notes-per-item works for pilot. Creators can paste Loom links today. Real differentiator for later, not now.

---

## External notifications: email interim → WhatsApp at registration

In-app feed (bell + realtime) is built. External ping (reaches user OFF-platform) is the pilot gap — creators won't sit on the web app.
- EMAIL (now, no registration gate): add a transactional email channel (Resend/Postmark/SES) to the existing notify() helper — same call that creates the in-app notification also sends an email ("new offer / message / payment on Guap'd → view"). Small addition; notify() is already channel-pluggable. Enough for pilot start.
- WHATSAPP (Interakt, post-registration): the intended channel (Indian creators live on WhatsApp) — adds as a THIRD channel on the same notify(), when registration + verification complete.
Build email before Utkarsh testing (so creators get notified off-platform); WhatsApp swaps/adds at registration. No rebuild — both attach to notify().

---

## Strategic / roadmap ideas (PJ braindump — captured; #3 needs cofounder decision)

1. CREATOR STICKINESS — "see what other creators are doing" (content types, brand categories, to help creators grow).
   Goal (retention) is right. BUT: exposing individual creators' deals violates confidentiality (rates/relationships — we just LOCKED this in the RLS audit) and pulls toward a social/discovery product (off-thesis).
   Safe version: AGGREGATED/ANONYMIZED benchmarks ("finance creators charging ₹X-Y for Reels; category growing"), OPT-IN, post-data-volume. NOT individual deal exposure. Better near-term stickiness = payment reliability + re-engage relationships (already built).

2. AGENCY AGENT (AI does agency work: manage, negotiate, delivery-check, updates, find creators).
   Strongly on-thesis (AI-realizes the agency-disintermediation). V2, AI-heavy (needs mature product + real data).
   BUILD (assisted): delivery-check, status updates, drafting, workflow automation.
   CAUTION: negotiation = ASSISTED only (AI suggests, human confirms — money terms, real consequences), not autonomous.
   EXCLUDE: "find creators" = DISCOVERY, which the thesis explicitly avoids (host transactions, not discovery marketplace).

3. AGENCIES AS PARTNER USER-TYPE (agencies sign up, bring their creators + brands; brand can go agency-partner [higher fee] or direct [Guap'd fee]; we run agencies' workflow, they bring volume + share revenue; long-game: creators experience the platform via agency, then get DIRECT Guap'd deals even if the agency leaves — "embrace to replace").
   COFOUNDER DECISION, not a build task. Clever supply+demand cold-start accelerant (agencies have both sides now), and "creators stay if agency leaves" is the strongest part.
   TENSION TO RESOLVE CONSCIOUSLY: this partially RE-mediates the agency we set out to DISintermediate — enables the agency markup we pitch against (for some deals), risks channel conflict ("skip agencies" vs "here's our agency partner"), could muddy creator-first positioning.
   KEY QUESTIONS: (a) bootstrap-to-outlast or permanent channel? (bootstrap = more defensible, matches "creators stay if agency leaves"); (b) how to manage the "go direct" vs "agency partner" channel conflict; (c) does it dilute creator-first brand. Decide with cofounders (esp. Utkarsh — owns creator/agency relationships) BEFORE building. On-thesis IF framed as embrace-to-replace bootstrap; off-thesis if it just becomes agency-markup-as-a-service.

---

## COMPANY INCORPORATED (COI, PAN, TAN, DIN done) — unlocks the stubbed→real transition

Start these EXTERNAL queues NOW, in parallel (lead times you can't compress; they gate the real pilot):
1. RAZORPAY Route + linked-account onboarding + per-creator KYC — replaces the payment stub (swap-point: mark_deal_paid). LONGEST lead time (KYC per creator). Start immediately.
2. GST registration (GSTIN) — needed to charge brands. NOTE: getting GSTIN ≠ building in-product GST invoicing (still deferred; pilot invoicing manual/accountant).
3. WhatsApp / Interakt business verification — Meta verification is SLOW; start now. Unblocks WhatsApp notification channel (email interim bridges until then). Swap-point: notify() helper.
4. Supabase Pro upgrade — unblocks 500MB uploads (free-tier 50MB cap) + production infra (no pausing, backups).
5. Company current account — for Razorpay settlements.
BUILD SWAP-POINTS ALL READY (architected for this): mark_deal_paid stub→Razorpay Route; notify()→WhatsApp channel; upload 50MB→500MB. Each is a SWAP not a rebuild. Do the swaps as each external dependency goes live.

**Company contact now established:** phone number + contact@guapd.com (domain email).
- **contact@guapd.com**: use for Razorpay/Interakt/GST business registrations; verify guapd.com domain (SPF/DKIM) when setting up transactional email (Resend/Postmark) — the interim notification channel; point in-product "reach out to us"/support paths here (not placeholders).
- **Company phone**: business contact for Razorpay/KYC + support. DECIDE: is this the WhatsApp Business number (tied to Interakt verification) or a dedicated line? WhatsApp Business number often shouldn't double as a regular-call line. Decide before starting Interakt.
- **SMALL PRODUCT TASK**: update placeholder contact references (rejected-creator "reach out to us", support escapes, footer) to contact@guapd.com.

---

## PATH TO LAUNCH (web-first, app later) — sequencing + long-lead flags

DECISION NEEDED: controlled PILOT (Utkarsh's network, real deals, lower polish bar, sooner, real validation) vs full PUBLIC LAUNCH (higher polish bar, later). Lean: pilot-first → learn → then public-launch polish informed by real usage. Don't polish everything before any validation.

LONG-LEAD EXTERNAL GATES — start ALL now, parallel (they gate launch, not code):
- Razorpay Route + per-creator KYC (payment swap: mark_deal_paid)
- Interakt/WhatsApp Meta verification (notify() swap; email bridges)
- META APP + REVIEW (biggest sleeper): needed for brand-side post ANALYTICS + creator profile SNAPSHOTS/storefront. Instagram/FB data = Meta app review + Business Verification + permissions, can take WEEKS, can be rejected/iterated. START EARLY — do not treat as a late build task. Note: deep metrics require creators/brands to CONNECT their business/creator accounts.
- Supabase Pro (500MB uploads)

BUILD QUEUE (net-new): 2c campaign brief, extension mini-deal, deal_ref+search — then launch surfaces: privacy policy + terms (legal, must-have), support (contact@guapd.com flow), settings, creator self-serve profile/storefront, error messages + empty states across app, marketing site polish + book-a-demo.
RANK these must-have-to-launch vs fast-follow (don't treat all as pre-launch — e.g. deep Meta analytics + storefront auto-build + book-a-demo may be fast-follows).

PRE-LAUNCH SECURITY:
- [ ] **Rotate `OFFER_TOKEN_SECRET` for production** — the dev value was exposed in a chat log. Prod must use its own never-exposed secret (`openssl rand -base64 32`). Staging already uses a separate rotated value.
- [ ] **Rotate `MSG91_AUTH_KEY` for production** — the dev key was exposed in a chat log. Production must use a fresh key issued from the MSG91 dashboard, never the dev value. Note the key authorises real WhatsApp sends against the prepaid balance, so treat exposure as billable, not just a data risk.
- [ ] **Confirm `STAGING_OTP_BYPASS` is NOT set on production.** Remove bypass codes (`000000`/`123456`) from `signup/creator/actions.ts` and `login/creator/actions.ts` before public launch.
- [ ] **Configure custom SMTP (Resend/Postmark) for transactional email before launch** — built-in Supabase email is rate-limited (~4/hr). Needed for brand email confirmation + password reset at scale.
- [ ] **Confirm `mailer_autoconfirm` stays `false` on production** — brand email confirmation must be enforced.

DESIGN: Chandreyee design-system-first → restyle screens keeping logic intact (parallel with build).
APP: after web launch — replicate mobile-web → app, then build all surfaces together.

---

## Measurement — 3 distinct needs, mostly TOOLS not builds

1. SYSTEM HEALTH / errors / API failures / uptime → Sentry (error tracking + alerting — catches server-action/API/webhook failures with stack traces) + an uptime monitor (UptimeRobot/Betterstack) + existing Supabase & Vercel dashboards. INTEGRATION not build. PRE-LAUNCH / pre-real-money must-have (silent payment/webhook failures = lost money+trust invisibly). Do Sentry early — ~1 day.
2. PRODUCT/BUSINESS analytics (founder view: funnels, GMV, conversion offer→accepted→paid, drop-off, active brands/creators, revenue=fees) → PostHog (fire events from existing actions: offer_created/accepted, deal_paid, signup) + optionally a light internal metrics view or Metabase over the DB. Around launch/pilot — needed to run pilot with eyes open. Mostly event-tracking on existing actions, not custom dashboards.
3. CAMPAIGN CONTENT performance (views/clicks/reach/engagement) → Meta API. Fast-follow (needs Meta app review + accounts connected). NOT must-have (PJ confirmed).

PRINCIPLE: don't BUILD analytics/monitoring dashboards — integrate Sentry + PostHog (better dashboards, ~free, minimal build). Build time → product; measurement → tools.

---

## Brand team management (multi-user brand orgs + roles) — PILOT-CRITICAL

A brand = a company with MULTIPLE people (managers/team) who each log in, under one brand, with an ADMIN controlling access. Standard B2B org/team management — NOT a small add. PILOT-CRITICAL: pilot brands need multiple logins day one.

Partial foundation exists: brand_members table (users belong to a brand); RLS scopes by my_brand_id() (brand, not individual) — so "all a brand's members share that brand's deals" may already work; confirm.

SCOPE (v1 — pilot):
- Multiple users under one brand (via brand_members).
- Roles: Admin (invite/remove members, manage settings) vs Member (deal work, not team management). NO granular permission matrix for pilot — just Admin + Member.
- INVITE FLOW: admin invites by email → invite token → invitee signs up/logs in → attached to the brand as member. Real work (tokens, email, accept-invite, attach-to-correct-brand).
- Permission enforcement: admin-only team management; RLS scopes so all members see their brand's deals but NEVER another brand's (careful — multi-user is where cross-brand leaks hide; track in rls.sql).
- Admin UI: view team, invite, change roles, remove.

BUILD ORDER:
1. INVESTIGATE existing multi-user/RLS state first — confirm brand_members + my_brand_id() already grants shared access to all brand deals for all members. Identify gaps.
2. THEN invite flow + roles (Admin/Member) + admin UI.
SECURITY-CRITICAL: cross-brand isolation MUST hold as membership layer is added — test adversarially + track in rls.sql.

RELATED but DIFFERENT axis: the "role-based access for OUR team" roadmap item (ops/codebase/Supabase) is RBAC for us; this is RBAC for brand CUSTOMERS. Same concept, different users — build the pattern well once.

NOTE: same likely applies to CREATORS eventually (a creator with a manager/agent) — but creator-side is usually single-user; defer.

---

## Invoice gating on posted status (DECIDED — Utkarsh confirmed)

Creator POSTS first, THEN invoices. Gate invoice-generation on `is_posted = true` (server-enforced). Sequence: `approved → creator marks posted (+ live URL) → invoice unlocks`. The invoice-generation action rejects if the deal isn't posted yet, with a clear message ("Mark the content as posted before invoicing").

EDGE TO CHECK at build time: deal types where the creator doesn't post on their own channel (e.g. pure content-licensing where the brand uses the content) — the posting gate may apply only where the creator is the one posting. Flag if there's a deal type where posting-before-invoice doesn't fit.

BUILD: tomorrow.

---

## External queues status (as of 2026-07-21)

### Razorpay
Account application started with COI/PAN/TAN; GSTIN pending. Verify with Razorpay what GSTIN actually blocks (typically settlement/activation, not account creation). Route + per-creator KYC is the separate, longer track that gates real money movement. Integration itself can be built on staging with TEST keys before Route clears.

### Meta (start now — longest lead)
1. **Meta Business Suite account** — create.
2. **BUSINESS VERIFICATION** — submit with COI/incorporation docs. Pure queue time; prerequisite for everything else. START IMMEDIATELY.
3. **Meta app** (developers.facebook.com) — create.
4. **APP REVIEW** for Instagram permissions (instagram_basic, instagram_manage_insights, etc.) — requires a working demo, screencasts, and a LIVE PRIVACY POLICY URL. Weeks, can be rejected/iterated. Needs something to show, so submit once the feature exists.

NOTE: metrics require creators/brands to CONNECT their IG Business/Creator account via OAuth — we cannot query arbitrary handles. The feature is "connect your account → auto-populate profile/storefront + post performance," not "look up any handle."

DEPENDENCY SURFACED: **privacy policy is a HARD BLOCKER for Meta app review** — move it up from "pre-launch nice-to-have." Must be a live URL on guapd.com before submission.

---

## AI creator search / matching for brands (PJ wants soon — STRATEGIC DECISION, flagged)

Request: brand describes their campaign → AI finds/recommends the best creators.
⚠️ THIS IS DISCOVERY — the Handoff Brief's locked strategy explicitly excludes it in v1 ("host transactions between a brand and creator who already found each other; NOT a discovery/search marketplace — avoids two-sided cold-start"). Research reached the same conclusion twice (discovery is crowded/commoditised; Industry Layer Framework ranks Discovery LAST as an entry point).

ARGUMENTS AGAINST BUILDING SOON:
- Supply too small (~20-50 vetted creators) — AI matching over that is just a filtered list; value needs hundreds+.
- Competes where we're weakest: Qoruz/Modash/global platforms have years of creator+audience data.
- Reopens the two-sided cold-start the thesis was designed to avoid.
- Meaningful matching needs data we don't have yet: audience demographics (Meta API, gated on app review) + campaign history (accumulates via usage).

THE DEFENSIBLE VERSION (on-thesis reframe): not generic discovery search, but RECOMMENDATION OVER OUR PROPRIETARY OPERATIONAL DATA — reliability, on-time delivery, revision frequency, past performance with similar campaigns/categories (the "Creator Reliability Index" + "campaign memory" from our own research). Qoruz can't replicate this because they don't host the transactions. REQUIRES campaign history to exist first.

RECOMMENDATION: post-pilot, built on operational data, not a generic creator-search engine. If pulled forward, it's a deliberate thesis change to make with cofounders (esp. Utkarsh), not scope creep.

---

## Mutual ratings + interest/favourites (post-pilot)

### Ratings

Prefer the DERIVED Creator Reliability Score (on-time delivery, response time, revision frequency, completion rate) as the primary signal — it's the moat, competitors can't fake it, it's fact not opinion.

If subjective star ratings are added, they SUPPLEMENT the behavioral score, not replace it.

If two-sided subjective ratings are built, they MUST be double-blind (neither side sees the other's rating until both submit or a window closes) — otherwise ratings inflate uselessly from fear of retaliation.

Brand-rates-creator AND creator-rates-brand (brand reliability matters too: payment speed, brief clarity, revision reasonableness).

### Interest / favourites — SPLIT by thesis alignment

**ON-THESIS (build first when this lands):** favourite / re-engage a creator you've ALREADY completed a deal with → powers the recurring-deals wedge ("run deal #2 in one tap"). This is the good version.

**THESIS-DRIFT (defer, flag before building):** brands favouriting / creators signalling interest to parties they have NO deal history with → that's pre-relationship discovery/matchmaking, which the v1 thesis excludes. Don't let a favourites button become a discovery marketplace.

DECISION NEEDED when this is picked up: is "mark as interested" post-relationship (re-engagement, on-thesis) or pre-relationship (discovery, drift)? Answer that first.

---

## Post-deal rights extension (follow-on rights acquisition)

**What:** After a deal completes, a brand can acquire ADDITIONAL rights they didn't originally buy — extend usage duration, add boosting/paid-media rights, or license a clip for the brand's own channels. This is a new commercial agreement on top of a finished deal.

**On-thesis:** Post-relationship, between a brand and creator who already transacted. Not discovery. Extends the recurring-deals wedge.

**Reuse — do NOT build new:**
- The deal model already has: per-item boosting rights, usage_rights_end_date, rights_confirmed_at, and a rights snapshot that survives edits.
- The "extension as a linked mini-deal" (Option A) was already specced: a linked follow-on deal that rides existing payment rails and preserves the original rights snapshot. THIS is the vehicle. Apply it here — don't invent a parallel mechanism.

**Shape:**
- On a completed (or post-approval) deal, the brand initiates a "rights extension."
- Creates a LINKED follow-on deal with its own price, terms, and a NEW rights snapshot. Goes through the normal accept → pay flow on existing rails.
- Do NOT edit the original completed deal. Its rights snapshot stays frozen as the record of what was first agreed. The extension links to it and appears in the deal's timeline/history.
- The creator must agree and be paid — additional rights (boosting, clip licensing) have real value and can't be silently extended. Consistent with Terms §6 (rights are whatever the agreed terms say; brands can't exceed them, so more rights = a new agreement).

**Rights types to support:** extend usage duration, add/upgrade boosting rights, license a clip for brand's own channels (organic/paid/whitelisting per the content-rights schedule).

**Defer to v2 (needs analytics we don't have yet):**
- Proactively SUGGESTING a rights extension when a reel is performing well. Requires IG/Meta performance data (Meta Graph API + review — deferred). Build the ABILITY to take additional rights now; the SMART SUGGESTION of when comes later.

**Audit:** the extension is moat data — "original deal, then rights extension on [date] for [amount]." Ensure it's captured in the deal's audit/timeline.

---

## MCP / agent connectivity (platform play — post-PMF)

Let internal tools, Claude, and external agents connect to Guapd data via MCP to build scripts, automations, workflows.

- Requires FIRST: a stable public API, external-agent auth + scoped permissions, rate limiting, and a settled data model.
- Security gate: do NOT expose an agent/MCP surface until RLS and access boundaries are hardened and audited. (This codebase had a live write-hole on the money table; an external surface multiplies that risk.)
- On-vision (Guapd as a system others plug into) but this is a post-PMF platform feature, not a pilot one.

---

## Creator content-script agent (post-pilot, low priority)

AI helper that generates content scripts for creators.

- Creator-tools feature — parked as post-pilot, gated on core loop proven.
- Note: commodity capability (creators already have ChatGPT). Does NOT touch the moat (operational/transaction data). Lowest priority relative to core-loop and trust-infrastructure work.

---

## Deploy notes

REALTIME PROD GOTCHA: the supabase_realtime publication must include deals, messages, notifications, deal_deliverable_items, invoices in EVERY environment (dev done; must re-run on the production Supabase project post-registration). If missing, subscriptions connect but events never fire — silent failure ("only updates after clicking elsewhere"). Verify with: SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime';
