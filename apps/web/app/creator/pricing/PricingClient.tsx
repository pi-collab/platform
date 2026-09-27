'use client'

import { useState } from 'react'
import Link from 'next/link'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import PricingFaq from '@/components/pricing/PricingFaq'
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
export default function PricingClient({ isGrowth, backHref }: {
  isGrowth: boolean
  /** Where the phone's back arrow returns to. See the page's backFrom(). */
  backHref: string
}) {
  const [rate, setRate] = useState(20000)

  const feePercent = isGrowth ? GROWTH_FEE_PERCENT : DEALS_STANDARD_FEE_PERCENT
  const keeps = Math.round(rate * (100 - feePercent) / 100)

  return (
    <main className="prc" style={{ padding: 'clamp(20px,3vw,40px) clamp(18px,4vw,44px) clamp(56px,6vw,90px)' }}>
      <div className="pr-mobile-head">
        <CreatorPageHeader title="Pricing & fees" backHref={backHref} />
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--prc-gap)' }}>

        {/* ── Heading ── */}
        {/* No maxWidth on the block: the lede below is meant to sit on ONE
            line, and a 760px cap broke it into three. The heading is short
            enough not to need one. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* ── The crumb, and why it is not "Profile" ──────────────────────
              It read "Profile › Pricing & fees" and linked to /creator/profile
              at EVERY width. That page is the phone's profile screen, and on a
              desktop this page is opened from the avatar menu — so the crumb
              named a parent the visitor had not come from and sent them to a
              screen built for a different device.

              Two heads, the same split the settings page uses: the desktop
              crumb matches its "Account › Settings" exactly, so the two
              creator sub-pages agree; the phone gets the back arrow every
              other creator sub-page has, honouring ?from= so it returns to the
              profile menu the row was tapped in. */}
          <div className="pr-desktop-head" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-faint)' }}>
            <Link href="/creator/dashboard" style={{ color: 'var(--ink-faint)', textDecoration: 'none' }}>Account</Link>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>Pricing &amp; fees</span>
          </div>
          <h1 className="pr-desktop-head" style={{ margin: '14px 0 0', fontSize: 26, lineHeight: 1.3, fontWeight: 500, letterSpacing: '-0.015em' }}>
            Your rate, your payout
          </h1>
          {/* One line, and bigger: it is the sentence the whole page exists to
              say, and at 15px inside a 560px column it read as body copy
              rather than as the answer. Not nowrap — a phone cannot hold it on
              one line, and forcing it would overflow rather than wrap. */}
          <p style={{ margin: 0, fontSize: 'var(--prc-lede)', lineHeight: 1.55, color: 'var(--ink-soft)' }}>
            {isGrowth
              ? 'Guapd brings you the bookings. The brand pays your listed rate, and our fee comes from your side.'
              : 'The brand pays your listed rate and our fee comes from your side. Your first deal with a brand you bring is 0%.'}
          </p>
        </div>

        {/* ── The calculator ── */}
        <section style={{ ...card, padding: 'var(--prc-cardpad)' }}>
          <div className="pricecalc" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'clamp(24px,4vw,56px)', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={label}>Your listed rate</span>
              <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 'var(--prc-amount)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>
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

        {/* ── Three things worth knowing ──────────────────────────────────
            One icon per card, not one icon three times. These shipped with the
            same tick on all three, which is decoration: a row of identical
            marks tells a reader the cards are a list and nothing else. Each
            now draws the thing it is about — a link for the brand you bring, a
            swiped card for where the fee comes from, a document for the offer
            you read before accepting. */}
        <div className="pricecards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 20 }}>
          {(isGrowth ? GROWTH_POINTS : DEALS_POINTS).map(({ title, body, icon }) => (
            <div key={title} style={{ ...card, padding: 'var(--prc-cardpad)' }}>
              <span className="prc-tile" style={tile('#F1F3EA')}>{icon}</span>
              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: 0, fontSize: 'var(--prc-card-h)', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{title}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 'var(--prc-card-p)', lineHeight: 1.6, color: 'var(--ink-soft)' }}>{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── The product is free ──────────────────────────────────────────
            A row, not a stack, and the only NEON tile on the page. Three grey
            tiles above it make a set; this one is the sentence a creator came
            to hear, so it is the one that is coloured. */}
        <section style={{ ...card, padding: 'var(--prc-freepad)' }}>
          <div className="pricefree" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span className="prc-tile" style={tile('var(--neon)')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="8" width="18" height="4" rx="1" />
                <path d="M12 8v13" />
                <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                <path d="M12 8c-1.5-4-6-4-5-1s5 1 5 1 3.5 2 5-1-3.5-3-5 1" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--prc-free-h)', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>The core product is free</h3>
              <p style={{ margin: '4px 0 0', fontSize: 'var(--prc-free-p)', lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                No monthly fees. Your profile, packages, deals and payments are all free. You only pay a fee when a deal happens.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="pricefaq" style={{ ...card, padding: 'var(--prc-faqpad)' }}>
          <span style={label}>FAQ</span>
          {/* 24px, and the questions are h4 at 16.5. They were 20 and 14.5,
              which made the answers and the questions nearly one size and the
              section read as fine print. */}
          <h2 style={{ margin: '10px 0 0', fontSize: 'var(--prc-faq-h)', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25 }}>Questions, answered</h2>
          <div style={{ marginTop: 14 }}>
            {/* The free-first-deal question is absent for Growth on purpose:
                that exemption keys off a storefront origin, and a Growth
                creator has no storefront. Answering it here would promise a
                route they cannot take. */}
            <PricingFaq items={isGrowth ? GROWTH_FAQ : DEALS_FAQ} />
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
        <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 'var(--prc-outcome-amt)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, whiteSpace: 'nowrap' }}>
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
  /* --font-mono is defined on the marketing page scopes, not on the app's
     :root, so the fallback is what actually renders here. Stated rather than
     dropped, so this matches the design when the token reaches the app. */
  fontFamily: 'var(--font-mono, var(--font-ui))',
  fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap',
}

/** The 46px rounded icon square every card on this page leads with. */
function tile(background: string): React.CSSProperties {
  return {
    width: 46, height: 46, borderRadius: 14, background,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }
}

const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

interface Point { title: string; body: string; icon: React.ReactNode }

const DEALS_POINTS: Point[] = [
  {
    title: 'Bring a brand, pay 0%',
    body: 'First deal through your link is free.',
    /* A link: the storefront link that earns the exemption. */
    icon: (
      <svg {...ICON}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    title: 'Fee from your side',
    body: 'Brands never pay extra.',
    /* A card being swiped: the money moving, and which side it moves from. */
    icon: (
      <svg {...ICON}>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </svg>
    ),
  },
  {
    title: 'Seen before you accept',
    body: 'Every offer shows your exact payout.',
    /* A document with lines: the offer you read first. */
    icon: (
      <svg {...ICON}>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    ),
  },
]

const GROWTH_POINTS: Point[] = [
  {
    title: 'Booked without a big following',
    body: 'Guapd brings you the bookings.',
    /* A trophy — booked on merit rather than on follower count. */
    icon: (
      <svg {...ICON}>
        <path d="M7 20h10" />
        <path d="M12 20v-8" />
        <path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z" />
        <path d="M12 14c0-3-2-5-6-5 0 3 2 5 6 5z" />
      </svg>
    ),
  },
  {
    title: 'Fee from your side',
    body: 'Brands never pay extra.',
    icon: (
      <svg {...ICON}>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </svg>
    ),
  },
  {
    title: 'Grow into Deals',
    body: 'Your fee drops to 15%.',
    /* A rising line: the only card on either page about a change over time. */
    icon: (
      <svg {...ICON}>
        <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
        <path d="M16 7h6v6" />
      </svg>
    ),
  },
]
