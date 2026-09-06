/**
 * The Guapd Playbook — source of truth for the /ops/playbook page.
 *
 * Markdown, held as a template literal rather than a .md read from disk at
 * request time. A runtime fs read depends on Next.js tracing the file into the
 * deployment bundle, which is a bet that pays out silently in dev and fails in
 * production. This cannot fail that way.
 *
 * EDITING: write normal markdown. Supported: # ## ### ####, `- ` bullets,
 * `1. ` ordered lists, **bold**, *italic*, and `---` rules. Do NOT introduce a
 * backtick or a ${'$'}{...} sequence — both would break the literal. Nothing in the
 * document needs them today.
 *
 * MAINTENANCE: see CLAUDE.md. Parts 1-12 are strategy and change only when
 * Palak asks. Part 13 and the Appendix are the living layer, updated when a
 * significant feature ships — and only after asking.
 */

export const PLAYBOOK_MD = `# The Guapd Playbook

*The one document that explains what we're building, why, and how to talk about it. If you're reaching out to brands or creators for Guapd, start here.*

*Last updated: as features ship. The philosophy is stable; the feature list changes as we build.*

---

## Part 1 — Why Guapd exists

### The problem we're solving

Brand–creator deals are broken. Not the demand — the *process*.

Every collaboration between a brand and a creator still splinters across WhatsApp threads, Instagram DMs, email chains, Google Drive links, screenshots of terms, and bank transfers that arrive 45–90 days late, if they arrive at all. There's no contract, no clear scope, no record of what was agreed, and no way to trust the numbers a creator claims.

This isn't a small-business problem. A mid-size influencer agency in India runs 50–200 active campaigns, every one of them through spreadsheets and group chats. A brand's in-house team juggles 10–30 creators the same way. And the creator — the person actually making the work — has the least leverage of anyone: they chase payment, absorb unlimited revisions, and have no paper trail when a deal goes sideways.

The money is there. It's the way the deal happens that's stuck in 2015.

### Why now

The creator economy is not a trend anymore, it's infrastructure.

- India has **2–2.5 million monetized creators**, influencing **$350–400 billion** in consumer spending every year.
- India's influencer marketing market is heading toward **₹5,000 crore by 2027**, up from roughly ₹4,500 crore in 2025.
- Globally, the creator economy is on track to approach **$480 billion by 2027**, with over 200 million creators worldwide.
- And yet **around half of creators earn under $15,000 a year** — not for lack of demand, but because of the friction between "a brand wants to work with me" and "I got paid, cleanly, for it."

Brands are moving real budget to creators. Creators are more numerous and more professional than ever. UPI and India's payment rails are mature. Regulators (SEBI, the DPDP Act) are formalizing the space, which rewards platforms with compliance built in. Every condition for a proper operating layer exists — and nobody in India has built a clean one.

### Why *we* started this

Utkarsh is a creator. He has lived this problem — the unstructured inbound, the vague briefs, the payment that never comes on time, the agency contact who has to "check with the brand" for a week. We're not consultants who studied the market from the outside. One of our founders *is* the market, which means we build for the pain we actually know.

That's the thing to carry into every conversation: **we understand this from the inside.**

---

## Part 2 — Our philosophy

**We are a product company, not an agency.** This is the most important sentence in this document. Agencies sell you their time and take a cut for being the middleman. We sell a product that removes the middleman. We don't run your campaign for you and mark it up — we give brands and creators a clean system to run it themselves, transparently. When you talk to a brand that's used agencies, this is the contrast that lands: no opaque markup, no human bottleneck, no "let me check and get back to you."

**We're young, and we say so.** We're early. We don't pretend to be a decade-old incumbent. Being early is the pitch, not a weakness — brands and creators who join now shape the product and get in before everyone else. Honesty about where we are builds more trust than inflated claims that fall apart on inspection.

**Best experience for both sides.** We are a two-sided platform, and we refuse to treat either side as the product. Brands get verified creators and a clean workflow. Creators get a professional presence, leverage, and to keep more of what they earn. If either side has a bad experience, the marketplace dies. We design for both.

**Quality over quantity — always.** We are not trying to onboard everyone. We want the *best* brands and the *best* creators. A flood of weak creators makes brands leave; a flood of low-intent brands wastes creators' time. Every person you bring on is a curation decision. You are not a recruiter hitting a signup number — you are a curator protecting the quality of the marketplace. That standard *is* the product.

**The relationship is the moat.** Every deal run on Guapd generates data no competitor has — rates, reliability, response times, campaign history, verified performance. Over time that becomes a record brands trust and creators build a reputation on. That's why getting deals *onto* the platform matters more than almost anything else.

---

## Part 3 — Who we are

**Palak Jain — Product.** Owns what Guapd is and how it works.

**Utkarsh Verma — Creators & Growth.** A creator himself. Owns creator relationships, distribution, and the creator-side go-to-market. His network is our supply-side head start.

**Chandreyee Majumder — Design & Research.** Owns how Guapd looks and feels, and the research behind the decisions.

A creator-founder matters because it means the product is built by someone who has *been* the frustrated creator waiting on a payment — not guessed at from a deck.

---

## Part 4 — What Guapd is

Guapd collapses the entire brand–creator collaboration — from first offer to final payment — into one clean, structured flow.

At the center is the **Deal**: a single record holding the terms (deliverables, price, timeline, revision count, usage rights, payment terms), the negotiation and chat thread, the delivered files, the payment status, and a timestamped log of every change. The brand sees one side of it, the creator sees the other, and it's the same record. That consolidation *is* the product — everything a collaboration used to scatter across five apps now lives in one place.

Around the Deal sit: verified creator storefronts, a structured offer builder, an in-app negotiation thread, deliverable review and revision tracking, invoicing and payment status, campaign grouping for multi-creator work, and verified performance analytics pulled straight from Instagram.

---

## Part 5 — Pricing (and the philosophy behind it)

Our pricing is simple and it's designed to be *fair*, which is itself a selling point in a market full of hidden agency markups.

- **If the creator brings the brand:** **0% on that first deal.** The creator found the brand themselves — we're just giving them a clean, free way to run it. No cut. This is the wedge: "You already have this deal. Run it on Guapd instead of WhatsApp — verified terms, a real contract, on-time payment tracking — and it costs you nothing."

- **If Guapd brings the deal:** **15% from the creator.** We sourced it, so we earn on it. Still far below what an agency takes, and the creator gets a deal they wouldn't have had otherwise.

Why this structure works: it aligns our revenue with the value we actually add. We only take a cut when we genuinely brought something to the table. It rewards creators for bringing their own relationships onto the platform (which builds our moat), and it's dramatically cheaper and more transparent than the agency model it replaces.

*(Note: the platform fee is configurable per-brand and per-deal in the system, so specific arrangements can be set. The 0%/15% is the default philosophy.)*

---

## Part 6 — Who we take inspiration from

We study the best in the world, and we build for India in a way they don't.

- **Passionfroot (our primary reference).** The clearest expression of the thesis we believe in: the pain in creator sponsorships is *administration and workflow*, not discovery. They built a clean operating layer for sponsorships — find, agree, pay, track — and won on solving operational friction rather than being another marketplace. Their lesson for us: *solving the operational mess beats solving discovery.* Where we differ: they're optimized for individual Western creators (newsletters, podcasts, B2B); we're built for the Indian brand-creator market, with India-native payments, and for both sides of the deal.

- **#paid.** Brand–creator matching with a content and campaign layer. A reference for the brand-facing, campaign-oriented side of the market.

Others worth knowing as context: Aspire (campaign management for DTC brands — "HubSpot for influencer campaigns"), CreatorIQ (enterprise governance — too heavy for our wedge), Beacons (creator operating system — but creators are their customer, not brands). Each solves one slice. **The recurring gap none of them owns cleanly is trust infrastructure: verified reliability, payment certainty, campaign memory.** That's our long game.

---

## Part 7 — What sets us apart

When someone asks "why you, not an agency or another platform," these are the answers:

1. **We're a product, not an agency.** No markup, no middleman, no human bottleneck. Transparent by design.

2. **Verified data, not claims.** Creators connect their Instagram, and brands see *verified* follower counts, reach, and audience demographics — not self-reported numbers a brand has to take on faith. (See the note in Part 9 on where this stands.)

3. **The whole workflow, one place.** Offer, negotiate, deliver, review, pay, and measure — end to end. Not a discovery tool that dumps you back into WhatsApp to actually close.

4. **India-native.** Built for how deals actually happen here — UPI payouts, INR, GST-aware invoicing, WhatsApp notifications, and a hand-vetted roster.

5. **Fair to creators.** 0% when they bring the deal. Verified stats that raise their standing. Leverage they've never had. Creators who feel respected bring their best brands with them.

6. **We live the problem.** A creator-founder means we're building the thing we ourselves needed.

---

## Part 8 — The value we offer (this is what you pitch)

Payment is the headline pain, but it is *not* the whole story. Lead with the deeper value — it's what makes people relate.

### For brands

- **Verified creators, no fakes.** Real follower counts, real audience demographics, hand-vetted roster. Stop guessing whether an engagement rate is inflated.
- **No agency markup.** Pay the creator's actual rate. Transparent fees, visible as you build the offer.
- **One workflow instead of thirty chats.** Manage every creator and campaign in one place — briefs, approvals, revisions, payments, all tracked.
- **Real ROI, not a black box.** Verified post-level and campaign-level performance, pulled from the creator's own Instagram. See what you actually got.
- **Speed and accountability.** Structured offers, agreed revision limits, a timestamped record. Campaigns close faster and nobody can rewrite history.
- **Repeat with one tap.** Re-engage a creator who performed, terms pre-filled from last time.
- **More reach for the same spend.** Run a deal with a creator, then boost that content directly on Guapd — at lower cost than boosting on Instagram — and activate our Growth creators to amplify it. You get more reach, more interactions, and more engagement per rupee than a single post alone.
- **Two ways to work.** *Guapd Deals* connects you with established creators who already run brand deals — the proven ones for your headline campaigns. *Guapd Growth* is our community of UGC and emerging creators — a pool for authentic content, volume, and amplification. Most platforms give you one or the other; we give you both, for different jobs.

### For creators

Frame these around *reputation, presence, and leverage* — not just money.

- **You look professional.** A real storefront at guapd.com/c/your-handle — put it in your bio, send it to a brand. It signals you're a business, not a hobby. That changes how brands treat you and what they'll pay.
- **You're taken seriously.** Verified stats mean bigger brands trust your numbers. Your presence in the market becomes credible, not something you have to argue for.
- **You have leverage.** Agreed terms, a revision cap, a real record. No more unlimited "just one more change," no more he-said-she-said. You negotiate from a position of structure.
- **You keep more.** 0% when you bring the brand. No agency skimming your rate.
- **You get paid, cleanly.** Invoicing, payment tracking, polite reminders, payment history for your taxes. The chasing ends.
- **You build a reputation that compounds.** Every deal on Guapd adds to a track record that makes the next deal easier and better-paid.

The through-line for creators: **Guapd makes you look and operate like the professional you already are — and that reputation earns you better deals, not just this payment.**

---

## Part 9 — Guapd Deals & Guapd Growth (our two-tier model)

This is one of our clearest differentiators, and worth explaining well — most platforms give brands one kind of creator. We have two, for two different jobs.

**Guapd Deals** is the core: established creators who already run brand deals, hand-vetted and verified. These are the proven creators a brand uses for headline campaigns — the ones with the audience, the track record, and the reach.

**Guapd Growth** is our track for emerging and UGC creators — smaller creators who aren't yet running big brand deals, but who are building an audience and want to grow. Rather than reject them (the way most platforms effectively do), we bring them into a community with guidance and a path forward. This isn't charity — it's strategy, and it creates real value on both sides:

- **For those creators:** a way to grow, learn how brand collaborations work, produce content, and build toward being deal-ready — not a dead end.
- **For brands:** a pool of authentic UGC creators for volume content, and — crucially — an **amplification engine**. Growth creators can repost, engage with, and extend a headline creator's branded content, and take on content tasks. That means more reach and engagement for a campaign, at a fraction of the cost of buying it through ads.
- **For Guapd:** a growing, engaged supply base, a content and amplification layer no competitor has, and a pipeline of creators who graduate into Guapd Deals over time.

The pitch in one line: **Guapd Deals gives you the proven creators; Guapd Growth gives you authentic content, amplification, and reach — so one campaign does more.**

---

---

## Part 10 — Internal notes: how to demo smartly

*This section is for us, not for clients. It's not a list of gaps — it's the handful of things to be aware of so a demo goes smoothly and expectations are set right.*

**Instagram verified stats are rolling out.** The full capability is built — connecting an account, verified followers, reach, audience demographics, post analytics — and final approval is in progress. Pitch it as a core feature (it is), and walk brands and creators through what it does. Just don't click a live connect on a brand-new account mid-demo yet, since it's still finalizing — describe it and show the concept rather than relying on a fresh live connection.

**Payments are being finalized.** Payment tracking — invoicing, status, history, fee splits — is live end to end. The direct payment-link step is landing shortly. Pitch the full payment flow as how Guapd works; it's how the product operates, not a hypothetical.

**First offers get a quick quality review.** A brand's first offer passes a fast manual check before reaching the creator — it's how we keep the marketplace high-quality. Mention it to brands at signup so it's expected: "Your first offer goes through a quick review to keep quality high — after that, they go straight through."

---

## Part 11 — How you work

**Your mission:** bring the *best* brands and the *best* creators onto Guapd, and get real deals running. You are the face of Guapd — the first impression a brand or a strong creator has of us. Represent us like the product-first, creator-respecting company we are.

**The North Star:** completed, paid deals on Guapd. Everything you do ladders to that — a great demo that doesn't lead toward a real deal is activity, not progress.

**On the brand side:** find good brands, reach out, demo, onboard, and support them to their first real deal.

**On the creator side:** recruit strong (especially larger) creators, and *activate* the ones we have — get their profile and storefront complete, their Instagram connected, and their Guapd link in their bio. A signed-up creator with an empty storefront is not a win; an activated one is.

**The creator pitch that converts:** "Bring your own brand deals onto Guapd — it costs you nothing (0%), and you get a real contract, verified terms, and clean payment instead of WhatsApp chaos." Free to them, and it moves their deals onto our rails.

**Quality bar:** if you wouldn't be proud to show this brand to our creators, or this creator to our brands, don't onboard them. Curate.

---

## Part 12 — Where we're going

*The team should be able to speak to the vision, not just today's product. This is where Guapd is headed — pitch it as direction and ambition, framed as "coming soon," never as something live today.*

**We're removing the operational work entirely — with AI at the center.**

Today Guapd replaces the chaos of running a deal. Next, we take the work out of it altogether.

- **AI for brands** — campaign setup, creator matching, and brief-building that used to take hours, done in minutes. Describe a campaign and get the right creators, the right terms, and a ready-to-send brief. Less manual work, better matches, faster launches.
- **AI for creators** — help managing deals, responding to offers, and producing content, so creators spend their time creating, not administrating.
- **More reach for the same spend** — our amplification model (see Part 8) lets brands boost campaign content directly on Guapd and activate Growth creators to extend it, getting more reach and engagement per rupee than boosting on the platforms alone.
- **Trust infrastructure that compounds** — over time, the reliability scores, verified performance, and relationship history built on Guapd become a record no competitor can replicate, and the foundation for creator financing, smarter matching, and more.

The one-line version for a pitch: **Guapd started by fixing how the deal happens. We're building toward removing the operational work of creator marketing entirely — AI-powered, for both sides.**

---

## Part 13 — What's on the platform

*A high-level reference for what brands and creators can actually do on Guapd today. Use it to answer "can it do X?" and to pitch concrete capability. This is the living part of the Playbook — it grows as we ship.*

### For brands

- **Get set up** — create a brand profile, add your team with admin and member roles, invite colleagues by link.
- **Find creators** — browse a hand-vetted roster, filter by follower band, niche, category and platform, and search by name or handle. Every creator has a full storefront: work samples, rate card, past collaborations, and audience stats.
- **Make a structured offer** — build an offer from the creator's rate card, not a chat message: per-item pricing, quantities, delivery dates, collab and boosting add-ons, usage rights, revision limits, and a live running total with a transparent fee breakdown. Send it to a creator on Guapd, or as a secure link to one who isn't yet.
- **Run the deal** — negotiate in a structured thread (accept, counter with line-item prices, or decline), review submitted work, approve or request revisions against the agreed limit, track product shipments, and see a full timestamped record of everything.
- **Message in context** — deal-scoped chat with each creator, so every conversation stays tied to its deal instead of scattered across DMs. An inbox across all your deals, with unread counts and filters for active and completed. Messaging stays open for 30 days after a deal is paid or completed.
- **Run campaigns** — group multiple creators under one campaign with a shared brief, send proposals to several creators at once, keep per-creator terms independent, and see a campaign-level rollup.
- **Handle payment** — review and accept creator invoices, track payment status end to end, with fees handled automatically and payout details visible on the deal.
- **See real performance** — verified post-level and campaign-level analytics (views, reach, likes, comments, saves), pulled from the creator's connected Instagram, with history charts showing how a post grew.
- **Repeat easily** — re-engage a past creator in one tap with terms pre-filled from the last deal, and see your full history with every creator.
- **Stay in the loop** — in-app notifications plus email updates on every offer, delivery, approval and payment, so nothing slips.

### For creators

- **Get set up fast** — sign up with just a phone number, complete a short onboarding, and get reviewed by hand (vetted for deals, invited to Guapd Growth, with an appeal path if needed).
- **A professional storefront** — a public page at guapd.com/c/your-handle to put in your bio or send to a brand: photo, bio, categories, work samples, past brands, and audience stats. Brands can start a deal straight from it. Edit with a live preview, and choose whether to show your rates.
- **Your own rate card** — per-platform, per-format products with fixed, "from", or on-request pricing, included revisions plus a price for extras, and add-on rates for collab posts and boosting. Everything a brand sees when building an offer comes from here.
- **Manage deals** — every offer arrives as a card with the full terms; accept, counter with your own prices, or decline. Track each deal through a clear pipeline, and handle product shipments.
- **Talk to the brand in one place** — deal-scoped chat tied to each deal, not scattered across DMs, with everything on the record. Get updates in-app, by email, and by WhatsApp so you never miss an offer.
- **Deliver work** — submit deliverables as links (Drive, YouTube, Loom, anything hosted), track multiple deliverables per deal, respond to revision requests, and mark content posted with the live URL.
- **Get paid, cleanly** — raise an invoice, track payment status, see total earned and what's outstanding, send a polite reminder, and store your UPI payout ID so brands know where to send money. The fee split is always shown clearly.
- **Show verified numbers** — connect Instagram for verified follower count, reach, and audience demographics, plus analytics on your own delivered content.
- **Guapd Growth** — a dedicated track for creators not yet ready for brand deals, with its own guidance — not a dead end.

---

## Appendix — Full feature reference

*The exhaustive list, for when you need to answer a specific "does it do exactly this?" question. Part 13 above is what you pitch; this is the complete reference. Kept current as we ship.*

### Brand side

**Getting started**
- Email + password signup with confirmation
- Brand profile: name, category, company size, website, logo, location, contact details
- Team accounts — multiple people under one brand, with admin and member roles
- Team invites via a shareable link

**Finding creators**
- Browse a vetted creator roster — every creator reviewed by hand
- Filter by follower band, niche, category, platform
- Search by name or handle
- Full creator storefronts: photo, bio, categories, work samples, rate card, past brand collaborations
- Creator cards show niches and follower counts at a glance

**Making an offer**
- Structured offer builder, not a chat message
- Pick deliverables from the creator's published rate card
- Per-item pricing, quantity, and delivery date on each deliverable
- Collab vs non-collab reel type
- Boosting rights with duration, priced as an add-on
- Usage rights and payment terms
- Revision limit agreed up front
- Product shipment flag for deals involving physical product
- Live deal total with fee breakdown as you build
- Send to a creator on Guapd, or as a secure link to one who isn't — they can accept or decline without signing up

**Running the deal**
- Negotiation thread — creators accept, counter with their own line-item prices and a note, or decline
- Deal pipeline: negotiating → agreed → delivered → revision → approved → paid → complete
- Review submitted work and approve or request a revision
- Revision count tracked against the agreed limit
- Product shipment tracking with delivery status
- Full timestamped audit log of every change on the deal
- Deal-scoped messaging with the creator, with unread counts
- Inbox across all deals, with filters for unread, active and completed
- Messaging stays open 30 days after payment or completion

**Campaigns**
- Group multiple creator deals under one campaign
- Shared campaign brief
- Build a creator roster for the campaign
- Send proposals to multiple creators at once
- Per-creator terms remain fully independent
- Campaign-level rollup and analytics

**Money**
- Creator raises an invoice once content is posted
- Brand reviews and accepts the invoice
- Payment status tracked end to end: issued → accepted → paid
- Platform fee handled automatically — configurable percentage, charged on top or deducted, with per-brand and per-deal rates
- Creator's payout details visible on the deal
- (Direct Razorpay payment-link integration is the next step on this flow)

**Performance**
- Post-level analytics on delivered content: views, reach, likes, comments, saves, shares
- Performance history charts showing how a post grew over time
- Campaign-level aggregate performance
- Reads from the creator's connected Instagram

**Repeat business**
- One-tap re-engage a past creator with terms pre-filled from the last deal
- Items the creator no longer offers are dropped and flagged
- Full deal history with every creator

**Notifications**
- In-app notification feed
- Transactional email on offers, deliveries, approvals and payments

### Creator side

**Getting started**
- Phone number + OTP signup — no email or password
- Short onboarding questionnaire
- Reviewed by hand, with three outcomes: vetted for deals, moved to Guapd Growth, or not accepted
- Rejected creators can appeal and have the decision reversed

**Storefront**
- Public page at guapd.com/c/their-handle — shareable in a bio, DM or email
- Profile photo, headline, bio, categories
- Work samples and content showcase
- Past brands worked with
- Audience stats and platform breakdown
- Choose whether to show rates publicly
- Live preview while editing
- Brands land on it directly and can start a deal from it

**Rate card and packages**
- Per-platform, per-format products (reel, story, post, and more)
- Fixed price, "from" price, or price on request
- Included revisions per package, plus a price per extra revision
- Add-on rates for collab posts and for boosting rights
- Everything a brand sees when building an offer comes from here

**Deals**
- Deal inbox with every offer as a card showing the full terms
- Accept, counter, or decline
- Counter with their own line-item prices and a note
- Deal pipeline visible end to end
- Filter by needs-you, negotiating, in production, in review, posted, declined
- Deal-scoped chat with the brand
- Shipping address capture for product deals, with delivery tracking

**Delivering work**
- Submit deliverables as a link (Drive, YouTube, Loom, anything hosted)
- Multiple deliverables per deal, tracked individually
- See revision requests and resubmit
- Mark content as posted with the live URL

**Getting paid**
- Raise an invoice once content is posted
- Payment status tracked: sent → accepted → paid
- Total earned, what's outstanding, and payment history by month
- Send a payment reminder to the brand, rate-limited so it stays polite
- UPI payout ID stored so brands know where to send money
- Fee split shown clearly — what the brand pays and what the creator receives

**Performance**
- Post analytics on their own delivered content
- Verified follower count, reach and audience demographics
- Growth history over time

**Guapd Growth**
- A separate track for creators not yet ready for brand deals
- Its own quiz, screens and guidance — not a dead end

**Notifications**
- In-app feed
- Email updates
- WhatsApp status updates

---

*Questions, gaps, or something in here that's gone stale? Flag it. This document is only useful if it's true.*
`
