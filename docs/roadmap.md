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

## (Other future items — add as they come up)

- (Reserved for future roadmap ideas. Keep this file for deliberate "build later" items; keep the CLAUDE.md defer-list for "do not build in v1.")
