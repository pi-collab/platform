'use client'

import { useState } from 'react'
import { GROWTH_FEE_PERCENT, DEALS_STANDARD_FEE_PERCENT } from '@/lib/fee'

/**
 * What a brand pays, which is the creator's rate and nothing else.
 *
 * ── Why the zeros are stated, not omitted ───────────────────────────────────
 * The calculator prints "Guapd fee ₹0" and "Markup ₹0" as their own rows. A
 * brand arriving here has usually been charged a platform cut somewhere else
 * and is looking for ours; a page that simply does not mention a fee reads as
 * one that has not disclosed it yet. Naming it at zero answers the question.
 *
 * ── The split bars are about the CREATOR's side ─────────────────────────────
 * They show where our fee comes from, which is the only honest way to say
 * "free" to a brand without pretending we are a charity. A brand who
 * understands the creator is paying it can price a deal properly; one who
 * thinks nobody pays it will wonder what the catch is.
 */
export default function BrandPricingClient() {
  const [rate, setRate] = useState(20000)

  return (
    <main style={{ padding: 'clamp(20px,3vw,40px) clamp(18px,4vw,44px) clamp(56px,6vw,90px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
          <span style={label}>Pricing</span>
          <h1 style={{ margin: '10px 0 0', fontSize: 26, lineHeight: 1.3, fontWeight: 500, letterSpacing: '-0.015em' }}>
            What you pay
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: 560 }}>
            You pay the creator&rsquo;s real rate. No markup, no Guapd fee on top.
          </p>
        </div>

        {/* ── The calculator ── */}
        <section style={{ ...card, padding: 'clamp(24px,3vw,40px)' }}>
          <div className="pricecalc" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'clamp(24px,4vw,56px)', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={label}>Creator&rsquo;s listed rate</span>
              <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 48, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>
                {rupees(rate)}
              </span>
              <input
                type="range" min={1000} max={100000} step={500} value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                aria-label="Creator's listed rate"
                style={{ width: '100%', marginTop: 6, accentColor: 'var(--neon-deep, #C9EB3C)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                <span>{rupees(1000)}</span><span>{rupees(100000)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Row label="Creator's rate" value={rupees(rate)} />
              <Row label="Guapd fee on top" value={rupees(0)} />
              <Row label="Markup" value={rupees(0)} />
              <div style={{ height: 1, background: 'var(--border-hairline)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>You pay</span>
                <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {rupees(rate)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Where the fee actually comes from ── */}
        <section style={{ ...card, padding: 'clamp(24px,3vw,40px)' }}>
          <div className="pricesplit" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)', gap: 'clamp(24px,3.5vw,48px)', alignItems: 'center' }}>
            <div>
              <span style={label}>How Guapd earns</span>
              <h2 style={{ margin: '10px 0 0', fontSize: 24, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25 }}>
                Our fee comes from the creator, not from you
              </h2>
              <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                You pay the listed rate. Guapd takes its fee out of the creator&rsquo;s payout, so nothing is added to your bill.
              </p>
            </div>
            <div className="pricesplitcards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Split
                title="Deals creators"
                feePercent={DEALS_STANDARD_FEE_PERCENT}
                note="0% on a creator’s first deal with a brand they bring to Guapd."
              />
              <Split
                title="Growth creators"
                feePercent={GROWTH_FEE_PERCENT}
                note="Covers discovery and booking for emerging creators."
              />
            </div>
          </div>
        </section>

        {/* ── Three things worth knowing ── */}
        <div className="pricecards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 20 }}>
          {[
            ['Browse and offer free', 'No monthly fees.'],
            ['No markup', 'You always pay the creator’s real price.'],
            ['Plans coming soon', 'Optional, and only if you choose one.'],
          ].map(([title, body]) => (
            <div key={title} style={{ ...card, padding: 24 }}>
              <span style={{ width: 46, height: 46, borderRadius: 14, background: '#F1F3EA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{title}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{body}</p>
              </div>
            </div>
          ))}
        </div>

        <section style={{ ...card, padding: 'clamp(22px,2.6vw,32px)' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Free to use</h2>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-soft)', maxWidth: 620 }}>
            No monthly fees. You pay the creator&rsquo;s listed rate and nothing extra to Guapd.
          </p>
        </section>

        <section style={{ ...card, padding: 'clamp(22px,2.6vw,32px)' }}>
          <span style={label}>FAQ</span>
          <h2 style={{ margin: '10px 0 0', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Questions, answered</h2>
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column' }}>
            {FAQ.map(([q, a], i) => (
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

function Row({ label: l, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14.5, color: 'var(--ink-soft)' }}>
      <span>{l}</span>
      <span style={{ fontFamily: 'var(--font-num, var(--font-ui))' }}>{value}</span>
    </div>
  )
}

function Split({ title, feePercent, note }: { title: string; feePercent: number; note: string }) {
  const keeps = 100 - feePercent
  return (
    <div style={{ padding: '20px 22px', borderRadius: 18, background: '#F7F8F4' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{feePercent}%</span>
      </div>
      {/* Same bar as the creator's package note, so the two sides of the
          product describe one split rather than two coincidences. */}
      <div style={{ display: 'flex', gap: 3, height: 8, marginTop: 14 }}>
        <div style={{ flex: keeps, borderRadius: 999, background: 'var(--neon)' }} />
        <div style={{ flex: feePercent, borderRadius: 999, background: 'repeating-linear-gradient(135deg,#EEF0F3 0 6px,#E3E6EB 6px 12px)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 9, fontSize: 12.5, color: 'var(--ink-soft)' }}>
        <span>Creator keeps {keeps}%</span><span>Guapd {feePercent}%</span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-faint)' }}>{note}</p>
    </div>
  )
}

const FAQ: [string, string][] = [
  ['Is there a monthly fee?', 'No. Guapd is free to use today.'],
  ['Do creators charge more on Guapd?', 'No. You pay the rate they list, with nothing added.'],
  ['Will subscriptions change this?', 'Nothing changes until you choose a plan.'],
]

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
