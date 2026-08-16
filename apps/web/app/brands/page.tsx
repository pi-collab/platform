import Nav from '@/components/Nav'
import StatsRow from '@/components/StatsRow'
import ContainerScroll from '@/components/ContainerScroll'
import FeatureZigzag from '@/components/FeatureZigzag'
import FeatureGrid from '@/components/FeatureGrid'
import Testimonials from '@/components/Testimonials'
import MidCTA from '@/components/MidCTA'
import FinalCTA from '@/components/FinalCTA'
import MobileBottomCTA from '@/components/MobileBottomCTA'
import Footer from '@/components/Footer'
import MeshGradientBackground from '@/components/MeshGradientBackground'
import AIHero from '@/components/BrandAIHero'
import { brandPage, BRAND_NAME } from '@/lib/content'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'For Brands',
  description:
    'Stop overpaying for creator deals. Run every collaboration directly, from structured offer to final payment, without an agency in the middle.',
  openGraph: {
    title: `For Brands · ${BRAND_NAME}`,
    description:
      'Stop overpaying for creator deals. Run every collaboration directly, from structured offer to final payment, without an agency in the middle.',
    url: '/brands',
  },
  alternates: { canonical: '/brands' },
}

// ── CSS-ONLY FEATURE VISUALS ───────────────────────────────────────────────
// These are HTML/CSS mockups of what the product looks like.
// Replace with real screenshots when available — just swap the JSX in `features` below.

function OfferBuilderMock() {
  return (
    <div className="feature-mock">
      <p className="feature-mock__title">New brief</p>

      <div className="feature-mock__field">
        <p className="feature-mock__label">Creator</p>
        <div className="feature-mock__value">Rohan Mehta · Finance · 180K</div>
      </div>

      <div className="feature-mock__row">
        <div className="feature-mock__field">
          <p className="feature-mock__label">Deliverable</p>
          <div className="feature-mock__value">1 Instagram Reel</div>
        </div>
        <div className="feature-mock__field">
          <p className="feature-mock__label">Amount</p>
          <div className="feature-mock__value highlight">₹45,000</div>
        </div>
      </div>

      <div className="feature-mock__row">
        <div className="feature-mock__field">
          <p className="feature-mock__label">Timeline</p>
          <div className="feature-mock__value">14 days</div>
        </div>
        <div className="feature-mock__field">
          <p className="feature-mock__label">Revisions</p>
          <div className="feature-mock__value">2</div>
        </div>
      </div>

      <div className="feature-mock__field">
        <p className="feature-mock__label">Usage rights</p>
        <div className="feature-mock__value">30 days, paid media</div>
      </div>

      <div className="feature-mock__field">
        <p className="feature-mock__label">Payment terms</p>
        <div className="feature-mock__value">50% upfront · 50% on approval</div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <span className="btn btn--primary btn--sm" style={{ width: '100%', justifyContent: 'center' }}>
          Send offer →
        </span>
      </div>
    </div>
  )
}

function ThreadMock() {
  return (
    <div className="feature-mock">
      <p className="feature-mock__title">Negotiation thread</p>

      <div className="thread-mock__message brand">
        Offer sent: ₹45,000 · 1 Reel · 14 days · 2 revisions
      </div>

      <div className="thread-mock__message creator">
        Can we do ₹50,000? Timeline works.
      </div>

      <div className="thread-mock__message brand">
        ₹48,000 final. Same terms.
      </div>

      <div className="thread-mock__message creator">
        Works for me. Let's go.
      </div>

      <div className="thread-mock__agreed">
        <span>✓</span>
        Terms agreed · ₹48,000 · Locked at 14:32
      </div>
    </div>
  )
}

function PaymentMock() {
  const steps = [
    { label: 'Deal agreed',      sub: '₹48,000 locked',       done: true,  active: false },
    { label: 'Payment link sent', sub: 'Razorpay link sent',   done: true,  active: false },
    { label: 'Payment received', sub: 'Confirmed',             done: false, active: true  },
    { label: 'Complete',         sub: 'Deal closed',           done: false, active: false },
  ]

  return (
    <div className="feature-mock">
      <p className="feature-mock__title">Payment tracker</p>
      <div className="payment-track__steps">
        {steps.map((step, i) => (
          <div
            key={step.label}
            className={`payment-track__step${step.done ? ' done' : step.active ? ' active' : ''}`}
          >
            <div className="payment-track__icon">
              {step.done ? '✓' : step.active ? '•' : ''}
            </div>
            <div className="payment-track__text">
              <div className="payment-track__name">{step.label}</div>
              <div className="payment-track__sub">{step.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── HERO VISUAL ─────────────────────────────────────────────────────────────

function DealCardMock() {
  return (
    <div className="deal-card">
      <div className="deal-card__header">
        <span className="deal-card__eyebrow">Deal</span>
        <span className="deal-card__status-pill">
          <span className="deal-card__status-dot" />
          Agreed
        </span>
      </div>

      <div className="deal-card__parties">Groww × Rohan Mehta</div>
      <div className="deal-card__niche">Finance · Instagram</div>

      <hr className="deal-card__divider" />

      <div className="deal-card__terms">
        <div className="deal-card__term">
          <span className="deal-card__term-icon">📹</span>
          1 Instagram Reel
        </div>
        <div className="deal-card__term">
          <span className="deal-card__term-icon">📅</span>
          14 days · 2 revisions
        </div>
        <div className="deal-card__term">
          <span className="deal-card__term-icon">⚖️</span>
          30-day paid media usage
        </div>
      </div>

      <div className="deal-card__amount">₹48,000</div>

      <div className="deal-card__timeline">
        <p className="deal-card__timeline-label">Pipeline</p>
        <div className="deal-card__steps">
          <div className="deal-card__step">
            <div className="deal-card__step-dot done" />
            <div className="deal-card__step-line done" />
          </div>
          <div className="deal-card__step">
            <div className="deal-card__step-dot done" />
            <div className="deal-card__step-line done" />
          </div>
          <div className="deal-card__step">
            <div className="deal-card__step-dot active" />
            <div className="deal-card__step-line" />
          </div>
          <div className="deal-card__step">
            <div className="deal-card__step-dot" />
            <div className="deal-card__step-line" />
          </div>
          <div className="deal-card__step">
            <div className="deal-card__step-dot" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PAGE ────────────────────────────────────────────────────────────────────

const visualMap = {
  'offer-builder': <OfferBuilderMock />,
  'thread':        <ThreadMock />,
  'payment':       <PaymentMock />,
}

export default function BrandPage() {
  const features = brandPage.features.map((f) => ({
    ...f,
    visual: visualMap[f.visual],
  }))

  return (
    <div data-page="brand">
      <MeshGradientBackground colors={[
        '#c0b8e8', // pale lavender
        '#e8b8d0', // soft pink
        '#f0a8c0', // warm rose
        '#ffc090', // peach-orange
        '#f0a060', // warm amber
        '#d0b8e8', // lilac
      ]} />
      <Nav audience="brand" />

      <main>
        <AIHero />

        <StatsRow stats={brandPage.stats} />

        <ContainerScroll
          titleComponent={
            <h2 className="container-scroll__title">
              Everything you need to run deals directly
            </h2>
          }
        >
          <FeatureZigzag features={features} />
        </ContainerScroll>

        <MidCTA
          headline={brandPage.midCta.headline}
          ctaText={brandPage.midCta.ctaText}
          ctaHref={brandPage.midCta.ctaHref}
        />

        <Testimonials
          label={brandPage.testimonials.label}
          headline={brandPage.testimonials.headline}
          cards={brandPage.testimonials.cards}
        />

        <FeatureGrid
          label={brandPage.featureGrid.label}
          headline={brandPage.featureGrid.headline}
          cards={brandPage.featureGrid.cards}
        />

        <FinalCTA
          headline={brandPage.finalCta.headline}
          sub={brandPage.finalCta.sub}
          ctaText={brandPage.finalCta.ctaText}
          ctaHref={brandPage.finalCta.ctaHref}
          microcopy={brandPage.finalCta.microcopy}
        />
      </main>

      <Footer />

      <MobileBottomCTA
        ctaText={brandPage.mobileCta.ctaText}
        ctaHref={brandPage.mobileCta.ctaHref}
      />
    </div>
  )
}
