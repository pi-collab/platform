'use client'

import { useState } from 'react'
import ContactLink from '@/components/ContactLink'
import PricingFaq from '@/components/pricing/PricingFaq'

/**
 * What a brand pays — plans, not a fee calculator.
 *
 * ── What changed, and why the calculator went ───────────────────────────────
 * This page used to be a slider proving the Guapd fee on top is ₹0. That fact
 * has not changed and is still the first thing the page says, but it was the
 * WHOLE page — which left a brand reading a long proof of a zero and learning
 * nothing about what Guapd costs. The plans answer that; the zero-markup line
 * is now one card near the bottom, where a reassurance belongs.
 *
 * ── Only one of these plans is real ─────────────────────────────────────────
 * Free is what every brand is on, and it is the only row the product enforces
 * anything about. The other three are marked "Launching soon" and their
 * buttons open the contact form rather than a checkout, because there is no
 * billing, no seat model and no quota enforcement behind them. See the note on
 * PLANS about the quota figures — they are the intent, not a live limit.
 *
 * ── Two layouts, not one ────────────────────────────────────────────────────
 * Four columns do not survive a phone, and four stacked full cards is a very
 * long scroll past three plans nobody can buy yet. The phone gets an accordion
 * with a one-line summary per plan, open on Scale, exactly as the design draws
 * it.
 */

interface Plan {
  id: 'free' | 'starter' | 'scale' | 'ent'
  name: string
  price: string
  per?: string
  blurb: string
  /** Free is the plan every brand is actually on. */
  active?: boolean
  popular?: boolean
  /** The headline limits, as label/value rows. */
  quota: [string, string][]
  /** The same limits as one line, for the phone's collapsed row. */
  summary: string
  features: string[]
  cta: { label: string; kind: 'current' | 'outline' | 'filled' }
}

/**
 * NOTE ON THE NUMBERS. The deal and campaign counts are what the plans are
 * INTENDED to include. Nothing in the product counts a brand's deals against a
 * monthly limit or blocks the next one, so "Up to 3 / month" describes a plan,
 * not a live restriction — and a brand on Free today can run more than three.
 * If these are ever meant to bind, the enforcement has to be built first; a
 * limit stated on a pricing page and not enforced is the safer failure of the
 * two, but it is still a claim.
 */
const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    blurb: 'Try Guapd.',
    active: true,
    quota: [['Deals', 'Up to 3 / month'], ['Growth campaigns', '2 / month']],
    summary: '3 deals · 2 growth campaigns · 1 seat',
    features: ['1 seat', 'AI creator search', 'Self-serve'],
    cta: { label: 'Current plan', kind: 'current' },
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '₹9,999',
    per: '/ month',
    blurb: 'For brands getting started.',
    quota: [['Deals', 'Up to 10 / month'], ['Growth campaigns', '5 / month']],
    summary: '10 deals · 5 growth campaigns · 3 seats',
    features: ['3 seats', 'Campaigns and reporting', 'AI creator search'],
    cta: { label: 'Join waitlist', kind: 'outline' },
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '₹24,999',
    per: '/ month',
    blurb: 'For teams running at scale.',
    popular: true,
    quota: [['Deals', 'Unlimited'], ['Growth campaigns', 'Unlimited']],
    summary: 'Unlimited deals · Unlimited growth · 5+ seats',
    features: ['5+ seats', 'Full Growth and amplification', 'AI creator recommendations', 'Advanced analytics', 'Dedicated support'],
    cta: { label: 'Join waitlist', kind: 'filled' },
  },
  {
    id: 'ent',
    name: 'Enterprise',
    price: 'Custom',
    blurb: 'For agencies and large brands.',
    quota: [['Everything', 'Unlimited']],
    summary: 'Unlimited everything',
    features: ['Full campaign execution, sourcing to payment', 'Custom seats and setup'],
    cta: { label: 'Contact us', kind: 'outline' },
  },
]

const FAQ: [string, string][] = [
  ['What counts as a deal?', 'A deal is one collaboration with one creator, run end to end on Guapd: offer, delivery, and payment.'],
  ['What is a growth campaign?', 'A campaign where you book multiple Growth creators at once for content, volume, or amplification.'],
  ['Do I pay Guapd on top of the creator’s rate?', 'No. You pay the creator’s listed rate. Your plan is a separate subscription for using Guapd.'],
  ['Can I change plans later?', 'Yes, upgrade or downgrade any time as your volume changes.'],
]

export default function BrandPricingClient() {
  // Which plan is open on the phone. Scale, because it is the one the design
  // marks most popular; null when the open one is tapped shut.
  const [open, setOpen] = useState<Plan['id'] | null>('scale')

  return (
    <div className="prc" style={{ padding: 'clamp(20px,3vw,40px) clamp(18px,4vw,44px) clamp(56px,6vw,90px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'clamp(24px,3vw,40px)' }}>

        {/* ── Heading ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-faint)' }}>
            <a href="/settings" style={{ color: 'var(--ink-faint)', textDecoration: 'none' }}>Settings</a>
            <Chevron />
            <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>Pricing</span>
          </div>
          {/* clamp, not a fixed 44 with a phone override: every other page
              title in the brand app is clamp(22px,2.4vw,30px), and this one
              was 44 at every width. */}
          <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(24px,3.6vw,44px)', lineHeight: 1.05, fontWeight: 600, letterSpacing: '-0.03em' }}>
            Pricing
          </h1>
          {/* One line on a desktop, same as the creator page's lede. The
              560px cap broke it into three, which made the sentence the page
              opens with read as body copy rather than as the answer. Not
              nowrap: a phone cannot hold it on one line and forcing it would
              overflow instead of wrapping. */}
          <p style={{ margin: 0, fontSize: 'var(--prc-lede)', lineHeight: 1.55, color: 'var(--ink-soft)' }}>
            You always pay the creator&rsquo;s real rate, with no markup. Pick a plan that fits how much you run.
          </p>
        </div>

        {/* ── Plans, desktop ── */}
        <div className="brprice-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16, alignItems: 'stretch' }}>
          {PLANS.map((p) => <PlanCard key={p.id} plan={p} />)}
        </div>

        {/* ── Plans, phone ── */}
        <div className="brprice-list">
          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(18,21,28,.06)', overflow: 'hidden' }}>
            {PLANS.map((p, i) => (
              <PlanRow
                key={p.id}
                plan={p}
                open={open === p.id}
                onToggle={() => setOpen(open === p.id ? null : p.id)}
                first={i === 0}
              />
            ))}
          </div>
          <p style={{ margin: '12px 2px 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-faint)' }}>
            Paid plans are launching soon. Tap a plan to see everything included.
          </p>
        </div>

        {/* ── The zero-markup promise ──────────────────────────────────────
            What the whole page used to be, now one line where it belongs:
            after the prices, as the reassurance that they are the only prices. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 'var(--prc-freepad)', borderRadius: 20, background: '#FFFFFF', border: '1px solid rgba(18,21,28,.06)' }}>
          <span className="prc-tile" style={{ width: 44, height: 44, borderRadius: 14, background: '#F1F3EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <p style={{ margin: 0, fontSize: 'var(--prc-free-p)', lineHeight: 1.55, color: 'var(--ink-soft)' }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>No hidden markup.</span>{' '}
            You always pay the creator&rsquo;s real rate. We never inflate a price and pocket the difference.
          </p>
        </div>

        {/* ── FAQ ── */}
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: 'var(--prc-faq-h)', fontWeight: 600, letterSpacing: '-0.015em' }}>Questions</h2>
          <PricingFaq items={FAQ} headingSize="var(--prc-faq-q, 16px)" headingTag="h3" divider="bottom" answerMaxWidth={720} />
        </div>

      </div>

      <style>{`
        .brprice-list { display: none; }
        @media (max-width: 1080px) {
          .brprice-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
        }
        @media (max-width: 720px) {
          .brprice-grid { display: none !important; }
          .brprice-list { display: block; }
        }
      `}</style>
    </div>
  )
}

/* ── Desktop card ─────────────────────────────────────────────────────────── */

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div style={{
      position: 'relative', background: '#FFFFFF', borderRadius: 24,
      /* The popular plan is marked by a heavier border and a deeper shadow,
         not by a different fill — a coloured card among white ones reads as an
         advert rather than as one of four comparable things. */
      border: plan.popular ? '1.5px solid var(--ink)' : '1px solid rgba(18,21,28,.06)',
      boxShadow: plan.popular
        ? '0 1px 2px rgba(18,21,28,.03), 0 8px 16px rgba(18,21,28,.04), 0 32px 64px rgba(18,21,28,.1)'
        : '0 1px 2px rgba(18,21,28,.03), 0 8px 16px rgba(18,21,28,.04), 0 32px 64px rgba(18,21,28,.05)',
      padding: '26px 24px', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 26 }}>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{plan.name}</span>
        {plan.popular && (
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: 'var(--neon)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
            Most popular
          </span>
        )}
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 'var(--prc-plan-price)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1 }}>{plan.price}</span>
        {plan.per && <span style={{ fontSize: 13.5, color: 'var(--ink-faint)' }}>{plan.per}</span>}
      </div>

      {/* min-height so four cards' quota boxes line up whatever the blurb does. */}
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--ink-soft)', minHeight: 42 }}>{plan.blurb}</p>

      <div style={{ marginTop: 4 }}>{plan.active ? <ActiveChip /> : <SoonChip />}</div>

      <div style={{ marginTop: 16, padding: '4px 14px', borderRadius: 14, background: '#F7F8F4' }}>
        {plan.quota.map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '11px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(18,21,28,.08)' }}>
            <span style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>{k}</span>
            <span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* flex:1 pushes every card's button to the same baseline. */}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {plan.features.map((f) => (
          <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.45 }}>
            <Tick size={16} />
            <span>{f}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22 }}><Cta cta={plan.cta} height={46} /></div>
    </div>
  )
}

/* ── Phone row ────────────────────────────────────────────────────────────── */

function PlanRow({ plan, open, onToggle, first }: { plan: Plan; open: boolean; onToggle: () => void; first: boolean }) {
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid rgba(18,21,28,.08)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: '100%', border: 'none', background: 'none', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: 16 }}
      >
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15.5, fontWeight: 600 }}>{plan.name}</span>
            {plan.active && <ActiveChip small />}
            {plan.popular && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'var(--neon)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>Most popular</span>
            )}
          </span>
          <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>{plan.summary}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>{plan.price}</span>
          {plan.per && <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{plan.per}</span>}
        </span>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#F5F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {plan.features.map((f) => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, lineHeight: 1.45 }}>
              <Tick size={15} />
              <span>{f}</span>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><Cta cta={plan.cta} height={44} /></div>
        </div>
      )}
    </div>
  )
}

/* ── Bits ─────────────────────────────────────────────────────────────────── */

/**
 * The buttons.
 *
 * "Join waitlist" and "Contact us" open the CONTACT DIALOG rather than linking
 * anywhere. There is no waitlist table and no checkout, and a button that goes
 * to "#" is worse than one that does something — the form reaches us and
 * records an events row, which is a waitlist of the only kind that exists
 * today. "Current plan" is not a button at all: it states a fact.
 */
function Cta({ cta, height }: { cta: Plan['cta']; height: number }) {
  const base: React.CSSProperties = {
    height, borderRadius: 999, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 14, fontWeight: 600, width: '100%',
  }

  if (cta.kind === 'current') {
    return <div style={{ ...base, border: '1px solid rgba(18,21,28,.14)', color: 'var(--ink-soft)' }}>{cta.label}</div>
  }

  const filled = cta.kind === 'filled'
  return (
    <ContactLink
      label={cta.label}
      style={{
        ...base,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: filled ? 'var(--ink)' : '#FFFFFF',
        color: filled ? '#FFFFFF' : 'var(--ink)',
        border: filled ? 'none' : '1px solid rgba(18,21,28,.18)',
      }}
    />
  )
}

function ActiveChip({ small }: { small?: boolean } = {}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: small ? 5 : 6, fontSize: small ? 11.5 : 12, fontWeight: 600, color: '#1E6B47', whiteSpace: 'nowrap' }}>
      <span style={{ width: small ? 6 : 7, height: small ? 6 : 7, borderRadius: '50%', background: '#2E9E6A' }} />
      Active
    </span>
  )
}

/** Not "coming soon" — these have no date. "Launching soon" is the design's
 *  word and the most a page can honestly say about an unbuilt plan. */
function SoonChip() {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 500, padding: '4px 9px', borderRadius: 999, background: '#F2F3EF', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
      Launching soon
    </span>
  )
}

function Tick({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function Chevron() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
