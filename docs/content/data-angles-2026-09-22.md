# Carousel angles from our own data — 22 Sep 2026

Pulled from production. Every number below is a real count, not an estimate.

## Read this before using any of it

**Two different sample sizes, and they are not the same people.**
- **Roster:** 1,372 creators signed up. Demographic facts only.
- **Onboarding survey:** 105 responses. Pains, deal handling, deal volume.
- **Growth quiz:** 141 responses. Goals, posting frequency, niche.

The 105 and the 141 are **self-selected subsets** of the 1,372 — creators who
chose to answer. Anyone quoting them publicly should say "of 105 creators
surveyed", never "of creators" and never "creators in India". The honest
framing is our own survey, not the market. Used that way these are credible;
used as market statistics they are not defensible and a journalist would take
them apart.

**PostHog is not in here.** Reading aggregates needs a personal API key, which
this environment does not have — only the write-only project key. If you want
PostHog patterns, add a read key and I can pull them.

---

## SAFE TO POST

### 1. Creators are not short of work. They are short of *deals*.
**n=105.** Biggest pains, multi-select:

| Pain | Count | Share |
|---|---|---|
| Not enough brand deals | 73 | **69.5%** |
| Slow payments | 57 | **54.3%** |
| Chaotic communication across channels | 47 | **44.8%** |
| No record of past work | 32 | **30.5%** |

**Safe: yes.** It describes the problem, not our traction, and it is the
single most quotable thing we own. Sourced to our own survey it is credible
precisely because the sample is stated.

**Angle:** "We asked 105 creators what actually hurts." Four slides, one per
pain, biggest first. The 54.3% on payments is the one that will travel.

### 2. Nine in ten creators are their own agent
**n=105.** How they handle deals: direct 47.6% (50) · mix of direct and agency
33.3% (35) · just starting out 9.5% (10) · **agency 9.5% (10)**.

So **90.5% handle deals themselves, at least partly.**

**Safe: yes.** This is a statement about how the market works and it is
flattering to creators, not to us.

**Angle:** "90% of creators are their own agent" — then the pains from #1 as
the consequence. This is the strongest single carousel in the set, because
the two datasets compound: they negotiate alone, and the thing they most lack
is deals.

### 3. Most creators are already working, just not at scale
**n=105.** Deals per month: 2–4 → 48.6% (51) · 0–1 → 27.6% (29) · 5+ → 23.8% (25).

**72.4% are doing two or more brand deals a month.**

**Safe: yes.** Counters the "creators are hobbyists" assumption, and says
nothing about our volume.

### 4. This is a daily job
**n=141.** Posting frequency: daily 41.8% (59) · a few times a week 39.7% (56)
· weekly 11.3% (16) · rarely 7.1% (10).

**81.5% post daily or several times a week.**

**Safe: yes.** Widely relatable, easy to design, zero exposure.

### 5. The long tail is the market
**n=1,372** (the whole roster, not a survey).

| Band | Count | Share |
|---|---|---|
| Under 20k | 935 | **68.1%** |
| Not answered | 236 | 17.2% |
| 20k–50k | 86 | 6.3% |
| 100k–500k | 53 | 3.9% |
| 50k–100k | 48 | 3.5% |
| 1M+ | 10 | 0.7% |
| 500k–1M | 4 | 0.3% |

**Safe: yes, with care.** 1,372 is a real number and a respectable one to
state. Quote the *distribution*, and be careful that "1,372 creators signed
up" reads as roster size — fine on its own, weak if a brand count follows it.
Exclude or label the 17.2% who did not answer; a chart that silently drops
them overstates every other band.

**Angle:** "Nano and micro is not a segment. It is the market." Pairs with the
industry shift toward smaller creators — check the weekly brief for a
third-party stat to cite alongside it.

### 6. Almost everyone wants all of it
**n=141.** Growth goal: everything 71.6% (101) · first brand deals 24.1% (34) ·
grow following 2.8% (4) · learn collabs 1.4% (2).

**Safe: yes**, but weak on its own — "all of the above" winning a multiple
choice is partly a question-design artifact and worth saying so internally.
The usable cut is the **24.1% who have not landed their first deal yet**.

### 7. Instagram is the whole game
**n=1,372.** Instagram 78.5% (1,077) · YouTube 5.0% (69) · LinkedIn 0.1% (2).

**Safe: yes.** Note honestly that we are an Instagram-first product, so this
is partly who we attract rather than a market split. Do not present it as
"creators prefer Instagram" — present it as our roster.

### 8. Fashion leads, but a quarter do not fit a box
**n=141.** Fashion 28.4% (40) · **other 27.0% (38)** · entertainment 11.3% (16)
· fitness 11.3% (16) · finance 9.9% (14) · food 7.8% (11) · tech 4.3% (6).

**Safe: yes.** The interesting bit is that "other" nearly ties for first —
a quarter of creators do not fit the seven categories we offered. That is a
better observation than the fashion number.

---

## NOT SAFE TO POST

| Data point | Value | Why not |
|---|---|---|
| Brands on the platform | **14** | Reveals we are pre-traction on the demand side. A creator marketplace with 14 brands is the number a competitor would quote back at us. |
| Deals completed | **0** | Nothing has transacted. This cannot appear anywhere, in any aggregate, including a "deals so far" figure. |
| Instagram connections | **1** of 1,372 | Verified data is our core claim; one connected account undercuts it entirely. Talk about *what* verification does, never how many have it. |
| Quiz completion | 105 and 141 of 1,372 | ~8–10% response rate reads as a disengaged roster. State the sample size, never the rate. |
| Location coverage | 98.7% blank | No geographic story exists. Do not attempt "creators across India" — we cannot support it. |
| Roster niches | 0 of 1,372 filled | The field is empty for everyone. Only the 141 quiz niches exist; do not present them as the roster. |

**The rule for the whole set:** anything that is a count *of our activity* is
out. Anything that is a *distribution within a stated sample* is in. #1 and #2
are the two to build first.

---

## Verification before publishing

Re-run the numbers the week you post — the roster grows and the percentages
move. The queries are straightforward aggregates against `creators`,
`creator_onboarding_responses` and `creator_growth_quiz_responses` on
production; ask and I will re-pull them.

Do not let a designer round 69.5% to 70% in one slide and quote 69.5% in
another. Pick one precision and hold it.
