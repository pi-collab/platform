# Strategy & Market Memo

> **Note:** Background market research from June 3, representing earlier and broader thinking. Where anything here conflicts with the handoff brief or CLAUDE.md — e.g. escrow, serving agencies, or discovery — the handoff brief and CLAUDE.md are the source of truth and win.

> Source: ICOP Research & Startup Memo (June 3, 2026). Reconstructed as markdown so `@docs/strategy-memo.md` resolves for Claude Code. Founders: Utkarsh Verma (marketing/creator), Palak Jain (product).

## Executive thesis

The strongest version of this idea is **not a generic influencer marketplace** — it is a **campaign operations system**: a single workspace where a brand and a creator manage brief, negotiation, deliverables, approvals, revisions, and payment status. Discovery alone is crowded and commoditized. The durable pain is operational: every collaboration fragments into scattered messages, repeated follow-ups, unclear scope, delayed approvals, and late payments. The wedge is **time saved and fewer errors**, not creator inventory. Start where the workflow is most painful and most repeatable.

## The problem, per side

- **Creator:** unstructured inbound across DMs/WhatsApp/email; no standard brief; no rate transparency; verbal agreements with no paper trail; revision scope creep; payment delays (industry norm 30 days, reality 45–90); no invoicing; no escrow protection.
- **Brand:** agency markup opacity; no verified analytics / fake-follower risk; category mismatch (searching "finance influencer" returns lifestyle creators who occasionally post about money); manual management across WhatsApp + Excel + email; no deliverable tracking; ASCI legal exposure; no attribution; no re-engagement system.
- **Agency (incumbent being disrupted, not a target user):** human router managing 50–200 campaigns over WhatsApp; cash-flow pressure (pays creators before brand pays them); weakening value as creators and brands get more sophisticated; no neutral system of record; manual reporting.

The shared root cause across all three: **the workflow is not systematized** — lack of structure, auditability, accountability.

## Market timing & sizing

- India influencer marketing market value: **₹3,000–3,500 crore (2025)**, projected **₹4,500–5,000 crore by 2027**. CAGR ~20% (2026–2033).
- **4.0–4.4 million active creators** in India (2025); 1.8–2.3M Instagram, 500–700K YouTube.
- **232,000+ finance influencers** in India.
- Instagram = 50%+ of influencer ad spend. ~75% of brands view influencer marketing as integral.
- Structural tailwinds: 900M internet users; short-form video explosion; structural (not tactical) budget shift; Tier 2/3 creator boom (finance, regional, devotional growing fastest); regulatory formalization (DPDP Act, SEBI crackdown on unregistered finfluencers favors compliant platforms); mature UPI rails.
- Key India insight: **88% of Indian creators earn less than 75% of income from social media** — the constraint is friction in accessing and completing deals, not lack of deals.

## Competitive landscape

**Global (referenced, not direct competitors):** CreatorIQ (enterprise governance), GRIN (DTC commerce), Aspire (brand campaign mgmt), Upfluence, Modash (discovery/analytics), Creator.co, #paid. Pricing $300–$2,000+/month, no India localization, no UPI/INR rails.

**Indian (the real competitive set):** Qoruz (best-in-class data, no campaign/payment — brands still go to WhatsApp), Winkl (closest to self-serve, weak payments/UX), Plixxo (beauty/lifestyle, managed service), Influencer.in (large DB, enterprise, dated UX), Kofluence (analytics + managed service), OPA, Grynow, PulpKey.

**The four archetypes studied (Beacons, Passionfroot, Aspire, CreatorIQ):**
- Beacons — creator OS; customer is creators, not brands; infrastructure not campaign ops.
- Passionfroot — sponsorship admin for professional creators; workflow ownership moat; not built for agencies/scale.
- Aspire — campaign management for mid-market/DTC brands; sits in the middle, not creator-first nor enterprise-first.
- CreatorIQ — enterprise governance; too heavy for SMBs.

**The recurring gap across all four: Trust Infrastructure.** Nobody owns creator reliability, payment certainty, revision accountability, campaign memory, relationship reputation. Lesson: **build a tool before a marketplace; solving operational friction beats solving discovery.**

## Recommended wedge

A **campaign workspace for repeat buyers** of influencer work — lean brands, and creators who run many deals per month and are tired of fragmented execution. The first product should feel like a **narrow operating system, not a marketplace homepage**: create a deal, select a creator, confirm deliverables, track revisions, release payment — in one place.

## MVP scope

Must-have: structured campaign/offer creation (deliverables, dates, budget, revision count, usage rights, payment terms); threaded communication tied to a deal; approvals (approve / request revision / notes); payment status (pending / approved / released / overdue); file upload + version control; basic reporting (timeline + completion).

**Do not build first:** open creator discovery; AI scoring / fraud detection; deep analytics dashboards before workflow usage; a public social network; an all-in-one marketplace. *Every extra click competes with WhatsApp — the product must be faster, clearer, less annoying than existing behavior.*

## Business model & unit economics

Think in layers, not one flat fee:
- Phase 1: **free for creators** (supply = distribution; charging creators kills early adoption — free for creators, always).
- Phase 2: **transaction commission from brands**, ~10–12% of deal value on deal close.
- Phase 3+: featured creator placement (₹499–999/mo); brand subscriptions (₹4,999–12,999/mo); agency white-label (₹24,999–49,999/mo); enterprise analytics API.

Illustrative unit economics (₹30,000 avg deal, 10% commission): ₹3,000 gross, ~₹600 Razorpay fee, **~₹2,400 net/transaction**. ~417 deals/month → ₹10L MRR. Brand CAC ₹2,000–5,000; creator CAC ₹0–500 (Utkarsh's network). Brand LTV (6 campaigns/yr) ~₹14,400 → LTV:CAC 3:1 to 7:1. Target gross margin 75–82%.

**Do not monetize early:** don't charge creators to join; don't make tax/GST handling a paid line (it's a trust feature/moat); don't run an agency model (conflict of interest — stay pure SaaS).

## Go-to-market

**Supply before demand** (Airbnb/Uber pattern — recruit creators first).
- Phase 1 (months 1–2): creators in the ₹20K–₹2L/campaign range, 50K–2M followers, priority niches **personal finance / fintech / career / tech / fitness**, Delhi NCR + Mumbai + Bengaluru + Pune. Channels: Utkarsh's personal network (first 100, >60% target conversion), referral program, Utkarsh's public content, finance/tech creator communities, creator events. **Target 100+ quality creators before any brand.**
- Phase 2 (months 2–6): brands — D2C (boAt, Mamaearth, Sugar, etc.), fintech/BFSI (Groww, Zerodha, Upstox, Jupiter, Fi), edtech, gaming. Tactics: warm intros via Utkarsh, first campaigns free (no commission) for case studies, Palak's LinkedIn content, direct outreach to growth/marketing heads, case-study flywheel.
- Phase 3 (month 6+): product-led growth — shareable campaign cards, brand word-of-mouth, SEO on high-intent India terms.

## Metrics that matter

Time brief→agreement; time submission→approval; time approval→payment; revisions per campaign; campaigns/customer/month; retention after first campaign; **% of campaigns executed without off-platform WhatsApp dependence.**

## Key risks

- **Cold start** — solve supply first via Utkarsh's network; don't open to brands publicly until 200+ quality creators.
- **Disintermediation / leakage** — make repeat deals *easier* than WhatsApp, not just safer; campaign history + records as retention.
- **Fake followers** — (deferred for v1) future third-party detection.
- **Agency retaliation** — best defense is brand satisfaction (faster + cheaper); later sell to agencies as a tool.
- **Regulatory (SEBI/RBI/MCA)** — lawyer early; build compliance (TDS, DPDP, ASCI) awareness from the start.
- **Co-founder conflict** — agreement + vesting + decision rights before building.
- **Tech execution risk** — strong technical ownership; a badly built MVP is costlier to fix than a well-built one.

## Legal & compliance (checklist — confirm with a qualified Indian CA/CS/lawyer)

Private Limited Company is the default venture-scale structure; founder shareholding + 4-year vesting with 1-year cliff; IP assigned to the company; founders' agreement; clear decision rights. Compliance areas: DPDP Act 2023 (consent, privacy notice, retention, deletion, breach response); ASCI disclosure forced in the brief/approval flow; GST + TDS (Section 194-O: 1% TDS on marketplace payments to creators); structured contracts as source of truth; claim-substantiation step for sensitive verticals (finance especially). This memo is not legal advice.

## Strategic conclusion

Do not become another Beacons/Aspire/marketplace. Most attractive wedge: **Campaign Operations + Trust Infrastructure**. Long-term moat: proprietary workflow, reliability, relationship, and payment data generated by deals executed through the platform. Before building, identify the **exact switching trigger** that gets users off WhatsApp (interview 10–15 finance creators).
