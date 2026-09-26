'use client'

import { useState } from 'react'
import Link from 'next/link'
import { GROWTH_FEE_PERCENT, DEALS_STANDARD_FEE_PERCENT } from '@/lib/fee'

/**
 * What a creator keeps, at any rate they might charge.
 *
 * ── Why a slider and not a worked example ───────────────────────────────────
 * A fee is an abstraction until it is applied to YOUR number. "15%" is a fact
 * a creator has to do arithmetic on; a slider they drag to their own rate does
 * the arithmetic for them, and the answer lands on the figure they actually
 * charge rather than on ours.
 *
 * ── Deals and Growth see different pages ────────────────────────────────────
 * Not a toggle. A creator is on one track, and showing them the other one's
 * economics invites the question "can I have that instead", which this page
 * cannot answer. The Growth page names the route out (the fee drops to 15% on
 * Deals) without pricing a tier they are not on.
 */
export default function PricingClient({ isGrowth }: { isGrowth: boolean }) {
  const [rate, setRate] = useState(20000)

  const feePercent = isGrowth ? GROWTH_FEE_PERCENT : DEALS_STANDARD_FEE_PERCENT
  const keeps = Math.round(rate * (100 - feePercent) / 100)

  return (
    <main style={{ padding: 'clamp(20px,3vw,40px) clamp(18px,4vw,44px) clamp(56px,6vw,90px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Heading ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-faint)' }}>
            <Link href="/creator/profile" style={{ color: 'var(--ink-faint)', textDecoration: 'none' }}>Profile</Link>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>Pricing &amp; fees</span>
          </div>
          <h1 style={{ margin: '14px 0 0', fontSize: 26, lineHeight: 1.3, fontWeight: 500, letterSpacing: '-0.015em' }}>
            Your rate, your payout
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: 560 }}>
            {isGrowth
              ? 'Guapd brings you the bookings. The brand pays your listed rate, and our fee comes from your side.'
              : 'The brand pays your listed rate and our fee comes from your side. Your first deal with a brand you bring is 0%.'}
          </p>
        </div>

        {/* ── The calculator ── */}
        <section style={{ ...card, padding: 'clamp(24px,3vw,40px)' }}>
          <div className="pricecalc" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'clamp(24px,4vw,56px)', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={label}>Your listed rate</span>
              <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 48, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>
                {rupees(rate)}
              </span>
              <input
                type="range" min={1000} max={100000} step={500} value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                aria-label="Your listed rate"
                style={{ width: '100%', marginTop: 6, accentColor: 'var(--neon-deep, #C9EB3C)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                <span>{rupees(1000)}</span><span>{rupees(100000)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Deals gets two outcomes because it HAS two. Growth has one, and
                  inventing a second to balance the layout would be a rate that
                  does not exist. */}
              {!isGrowth && (
                <Outcome
                  title="Brand you bring, first deal"
                  fee="0% fee"
                  amount={rupees(rate)}
                  tone="neon"
                />
              )}
              <Outcome
                title={isGrowth ? 'Every Growth booking' : 'Deals we bring you'}
                fee={`${feePercent}% fee`}
                amount={rupees(keeps)}
                tone="plain"
              />
            </div>
          </div>
        </section>

        {/* ── Three things worth knowing ── */}
        <div className="pricecards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 20 }}>
          {(isGrowth
            ? [
                ['Booked without a big following', 'Guapd brings you the bookings.'],
                ['Fee from your side', 'Brands never pay extra.'],
                ['Grow into Deals', 'Your fee drops to 15%.'],
              ]
            : [
                ['Bring a brand, pay 0%', 'First deal through your link is free.'],
                ['Fee from your side', 'Brands never pay extra.'],
                ['Seen before you accept', 'Every offer shows your exact payout.'],
              ]
          ).map(([title, body]) => (
            <div key={title} style={{ ...card, padding: 24 }}>
              <span style={{ width: 46, height: 46, borderRadius: 14, background: '#F1F3EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{title}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── The product is free ── */}
        <section style={{ ...card, padding: 'clamp(22px,2.6vw,32px)' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>The core product is free</h2>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: 620 }}>
            No monthly fees. Your profile, packages, deals and payments are all free. You only pay a fee when a deal happens.
          </p>
        </section>

        {/* ── FAQ ── */}
        <section style={{ ...card, padding: 'clamp(22px,2.6vw,32px)' }}>
          <span style={label}>FAQ</span>
          <h2 style={{ margin: '10px 0 0', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Questions, answered</h2>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column' }}>
            {/* The free-first-deal question is absent for Growth on purpose:
                that exemption keys off a storefront origin, and a Growth
                creator has no storefront. Answering it here would promise a
                route they cannot take. */}
            {(isGrowth ? GROWTH_FAQ : DEALS_FAQ).map(([q, a], i) => (
              <div key={q} style={{ padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-hairline)' }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{q}</div>
                <p style={{ margin: '5px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

function Outcome({ title, fee, amount, tone }: { title: string; fee: string; amount: string; tone: 'neon' | 'plain' }) {
  return (
    <div style={{ padding: '18px 20px', borderRadius: 18, background: tone === 'neon' ? 'var(--neon)' : '#F7F8F4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{fee}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
        <span style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>You receive</span>
        <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>
          {amount}
        </span>
      </div>
    </div>
  )
}

const DEALS_FAQ: [string, string][] = [
  ['How do I get my free first deal?', 'Share your storefront link with a brand that isn’t on Guapd yet. When they sign up through your link and send an offer, that first deal is 0% automatically. You’ll see the zero fee before you accept.'],
  ['How will I know what the fee is?', 'Every offer shows the fee and your exact payout before you accept.'],
  ['When is the fee taken?', 'It’s deducted from your payout when the brand pays.'],
  ['Does the brand pay more because of the fee?', 'No. The brand pays exactly your listed rate. The fee is always your side.'],
]

const GROWTH_FAQ: [string, string][] = [
  ['How will I know what the fee is?', 'Every offer shows the fee and your exact payout before you accept.'],
  ['When is the fee taken?', 'It’s deducted from your payout when the brand pays.'],
  ['Does the brand pay more because of the fee?', 'No. The brand pays exactly your listed rate. The fee is always your side.'],
]

/** Whole rupees. A rate is never quoted in paise. */
function rupees(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

const card: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 24,
  boxShadow: '0 1px 2px rgba(18,21,28,.03), 0 8px 16px rgba(18,21,28,.04), 0 32px 64px rgba(18,21,28,.05)',
}

const label: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap',
}
