# Roadmap (post-v1)

> Parking lot for **serious, deliberate ideas we intend to build later** — not the v1 defer-list (that's "don't build now" inside CLAUDE.md). Items here are directional, unscheduled, and to be revisited only after v1 proves the manual workflow works and is used.

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

## Build practices to follow (ref: Anthropic Founder's Playbook)

For any AI-generated feature, follow good architecture/scope/security hygiene to avoid technical debt: small scoped pieces, propose-before-build, security designed and TESTED before features sit on top (as done with RLS), keep CLAUDE.md context current, and distinguish real product-market-fit signals from early hype when the pilot runs. Apply these wherever relevant going forward.
