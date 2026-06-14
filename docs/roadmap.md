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

## Build practices to follow (ref: Anthropic Founder's Playbook)

For any AI-generated feature, follow good architecture/scope/security hygiene to avoid technical debt: small scoped pieces, propose-before-build, security designed and TESTED before features sit on top (as done with RLS), keep CLAUDE.md context current, and distinguish real product-market-fit signals from early hype when the pilot runs. Apply these wherever relevant going forward.
