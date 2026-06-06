# 30-Day v1 Build Plan

*Creator-first, agency-free workflow platform for brand–creator deals (India)*

---

## 0. The thesis this plan is built on

- **Creator-first, transactions not discovery.** The platform hosts deals between a brand and a creator who already found each other. It does **not** match people or run a search engine in v1.
- **Disintermediate agencies.** Remove the opaque middleman; brand and creator deal directly, transparently.
- **Win one niche first: finance / BFSI creators.** Biggest budgets, SEBI-compliance angle, underserved. Not "all creators in 6 metros."
- **The wedge is recurring deals.** The agency earns its cut on first match, nothing on the fourth repeat deal. Make the repeat deal one tap.
- **Three surfaces, one system.** Marketing site + brand web workflow + creator app, all reading/writing one `Deal` object.
- **Win on "easier than DMs," not just "safer than DMs."** Every flow must beat a WhatsApp message on speed, or creators leak back off-platform.

---

## 1. What we are building (the three surfaces)

| Surface | Who | Platform | Job |
|---|---|---|---|
| Marketing site | Brands + creators | Web (Next.js) | Explain value, capture signups, host the first-offer accept page |
| Brand workflow | Brand managers | Web, desktop (Next.js) | Create offers, negotiate, review, track payment, re-engage |
| Creator app | Creators | Native (Expo / React Native) | Deal inbox, offer card, chat, upload, status, payment, push |

Plus a **thin web accept-page** (one screen inside the marketing-site domain) so a creator's *first* offer opens without a download. App becomes the home only after they accept.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Database + auth + storage + realtime | **Supabase** (Postgres) | One portable source of truth. Standard Postgres scales far past your 10k-creator / 1k-brand target. Clean handoff to a future dev. |
| Brand web + marketing site + web accept-page | **Next.js (React)** on **Vercel** | Fast to build, AI tools understand it, same language as the app |
| Creator app | **Expo (React Native)** | Same JS/React skillset + same Supabase backend as the web → one team, one language, two clients. No second skillset (vs Flutter/Dart). |
| Offer + status notifications | **WhatsApp Business API** via a BSP (Interakt or Twilio) | ~90%+ open rate, instant on lock screen. The real notification channel. |
| In-app notifications | Expo push notifications | Native push for creators once in the app |
| Payments (v1) | **Razorpay Payment Links** + status tracking | Real money movement, no held escrow → no RBI payment-aggregator burden in v1 |
| File / deliverable storage | Supabase Storage | Versioned uploads next to the deal |
| Contracts (v1) | Recorded agreed-terms screen | Lawyer validates base terms; not Aadhaar eSign yet |
| AI-assisted dev | Cursor / Claude Code (real code) + v0 (UI scaffolds) | Speed without locking into a no-code platform |
| Pilot distribution | **TestFlight (iOS) + Play internal testing (Android)** | First cohort gets the real app **without** waiting on public store review |

**One rule that protects the future:** keep all data in Supabase/Postgres and decoupled from the frontends. Whatever you rebuild later, the deal/relationship/audit data — your moat — is never trapped.

---

## 3. Data model (core entities)

Keep it small. The `Deal` is the center; everything else hangs off it.

- **`users`** — `role` (creator / brand_member), auth identity. Include a **`managed_by`** / delegated-access stub now (nullable) so agencies and influencer-managers slot in later as a permission layer, **not** a rewrite.
- **`creators`** — profile, niche, self-entered stats, **rate card** (per deliverable type).
- **`brands`** — brand profile, members.
- **`deals`** — the core object. Structured fields: deliverables, price, timeline, **revision count**, usage rights, payment terms, status.
- **`messages`** — negotiation + chat thread, tied to a deal.
- **`deliverables`** — uploaded files + versions, tied to a deal.
- **`payments`** — status (invoiced / link-sent / paid / released / overdue), Razorpay link reference.
- **`events`** — timestamped audit log of every state change. **This is the moat — build it from commit one.**

> Do **not** hard-code "one deal = one creator = one human login." The `managed_by` stub is what lets agencies/managers come later cheaply.

---

## 4. Feature list

### v1 — build these
**Marketing site**
- Brand landing page (save money, no agency markup, transparent pricing)
- Creator landing page (earn more, get paid on time, one inbox)
- CTAs → brand signup / creator onboarding
- **Web accept-page** (first-offer doorway)

**Brand workflow (web)**
- Brand signup + account
- Create **structured offer/brief** (deliverable, price, timeline, revision count, usage rights, payment terms)
- Select a creator from the **onboarded list** (not a discovery/search engine)
- Send offer → triggers WhatsApp notification
- **Negotiation thread** (offer / counter / accept, line-item, timestamped)
- Review deliverables → approve / request revision (counts against agreed limit)
- Payment: send Razorpay link, track status
- **Re-engage a past creator in one tap, terms pre-filled** (recurring loop)
- Deal timeline view

**Creator app (Expo)**
- Onboarding + **self-entered rate card**
- **Deal inbox** — every deal as a card (sent via platform *or* logged from an off-platform DM)
- **Offer card**: Accept / Counter / Decline (the "MyGate" card)
- Negotiation thread / chat
- Deliverable upload (with versions)
- **Status pipeline**: negotiating → agreed → delivered → paid
- Payment status ("funds secured / paid")
- Push notifications

### Explicitly NOT in v1 (defer — each is a multi-week sinkhole)
Discovery/search engine · Instagram Graph API auto-stats · fake-follower scoring · **held escrow + KYC/Route** · Aadhaar eSign contracts · GST auto-invoicing · frame-by-frame video review · analytics dashboards · agency portal · influencer-manager role · multi-influencer campaigns.

---

## 5. End-to-end workflow (the happy path)

1. **Brand** signs up → creates a structured offer → selects an onboarded creator.
2. **Creator** gets a **WhatsApp ping**: "[Brand] sent you a ₹50k offer for 1 Reel — view & respond: [link]."
3. Link opens the **web accept-card** (first time): **Accept / Counter / Decline**.
4. On Accept → **agreed terms recorded** + audit log entry → "Your deal's secured — download the app to manage everything."
5. In the **app**: brand sends a Razorpay payment link → status flips to *funded/paid*; creator uploads the deliverable.
6. **Brand** reviews → approves, or requests a revision (counts against the agreed limit).
7. Approved → creator goes live → payment marked released → **deal complete, lands in history**.
8. **Next deal, same creator:** brand re-engages in one tap, terms pre-filled. ← *the recurring loop, and the whole point.*

---

## 6. The 30-day schedule

> Two long-lead items to start on **Day 1**, because their queues are outside your control:
> **(a)** WhatsApp Business API / BSP onboarding + template approval (a few days).
> **(b)** Razorpay account + payment-link setup.

### Week 1 — Foundation (Days 1–7)
- Lock the `Deal` object schema (Section 3) in Supabase, incl. the `managed_by` stub.
- Supabase auth: phone/OTP for creators, email for brands.
- Scaffold Next.js (web) + Expo (app) projects against the shared backend.
- Ship the **marketing site** (brand + creator pages, CTAs).
- Kick off WhatsApp BSP + Razorpay onboarding.
- **Checkpoint:** marketing site live; a deal row can be created in the DB; both clients connect to Supabase.

### Week 2 — Brand workflow (Days 8–14)
- Brand signup + account.
- Structured offer/brief builder.
- Onboarded-creator list + select + send offer.
- Negotiation thread (shared data model with the creator side).
- Deal status view.
- **Checkpoint:** a brand can create and send a real offer; it exists as a `Deal` with a negotiation thread.

### Week 3 — Creator app + first-offer doorway (Days 15–21)
- Expo app: onboarding, rate card, deal inbox, offer card (accept/counter/decline), chat, status pipeline.
- Thin **web accept-page** wired to the same deal.
- WhatsApp notification fires on "offer sent."
- Expo push notifications.
- **Checkpoint:** brand sends offer → creator gets WhatsApp ping → opens web card → accepts → deal moves to *agreed*; app shows it.

### Week 4 — Money, files, the loop, and testing (Days 22–30)
- Razorpay payment link + payment-status tracking.
- Supabase Storage: deliverable upload + brand review/approve/revision.
- Surface the audit log as a deal **timeline**.
- One-tap **re-engage** (recurring loop).
- **End-to-end test with a real deal** from Utkarsh's network, on TestFlight/internal track.
- Buffer for bugs (keep ~2 days clear).
- **Checkpoint (the v1 bar):** one real deal goes brief → accept → deliver → approve → paid, entirely on-platform, with a WhatsApp ping and a native-app upload.

---

## 7. Rules to protect the 30 days

- **The defer-list is law.** If a deferred feature creeps into scope, something real falls off.
- **No held escrow in v1.** Payment-tracked + payment link only. Held escrow = RBI payment-aggregator territory and the #1 timeline-killer.
- **Manual vetting.** Creator applies → you get pinged → you approve by hand. Don't code a vetting engine.
- **One stack, few tools.** Supabase + Next.js + Expo + one WhatsApp BSP. Resist tool sprawl.
- **No Instagram-DM outreach.** The IG API can't cold-DM creators; WhatsApp is the channel.
- **First cohort = TestFlight/internal.** Don't let app-store review sit on the critical path.

---

## 8. Run in parallel (not blocking the build)

- **Switching-trigger interviews:** 10–15 finance creators — what is the *one* reason they'd leave WhatsApp? Let the answer sharpen the offer card vs payment vs reminders emphasis.
- **Lawyer:** validate enforceability of the agreed-terms screen and draft base terms (you're not relying on a chatbot for "legally binding").
- **Confirm the first ~20 creators are committed**, not just reachable.

---

## 9. Pilot success metrics

- A real deal completes brief → paid **entirely on-platform** (the binary v1 test).
- Time from brief → agreement, and approval → payment, vs the WhatsApp baseline.
- Revisions per deal stay within the agreed limit.
- **Would they run deal #2 on it?** — the leakage / retention signal that matters most.

---

*Brand/creator-first · agency-free · finance niche first · recurring deals are the moat.*
