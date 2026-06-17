import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import DealDisplayCards from '@/components/DealDisplayCards'
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
import { creatorPage, BRAND_NAME } from '@/lib/content'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'For Creators',
  description:
    'One inbox for every brand deal. Accept offers, negotiate terms, upload deliverables, and track payment — all in one place. Free for creators, always.',
  openGraph: {
    title: `For Creators — ${BRAND_NAME}`,
    description:
      'One inbox for every brand deal. Accept offers, negotiate terms, upload deliverables, and track payment — all in one place. Free for creators, always.',
    url: '/creators',
  },
  alternates: { canonical: '/creators' },
}

// ── CSS-ONLY FEATURE VISUALS ───────────────────────────────────────────────

function DealInboxMock() {
  const deals = [
    { brand: 'Groww',  amount: '₹48,000', status: 'New offer',   active: true  },
    { brand: 'Fi',     amount: '₹35,000', status: 'Negotiating', active: false },
    { brand: 'Zerodha', amount: '₹60,000', status: 'Agreed',     active: false },
  ]

  return (
    <div className="feature-mock">
      <p className="feature-mock__title">Deal inbox</p>
      {deals.map((deal) => (
        <div
          key={deal.brand}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem',
            marginBottom: '0.5rem',
            background: deal.active ? 'var(--brand-tint)' : 'var(--section-bg-alt)',
            border: `1px solid ${deal.active ? 'var(--brand-tint-strong)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-heading)' }}>
              {deal.brand}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 2 }}>
              {deal.status}
            </div>
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: deal.active ? 'var(--accent)' : 'var(--color-heading)' }}>
            {deal.amount}
          </div>
        </div>
      ))}
    </div>
  )
}

function DeliverableMock() {
  return (
    <div className="feature-mock">
      <p className="feature-mock__title">Deliverable upload</p>

      <div className="feature-mock__field">
        <p className="feature-mock__label">Brand</p>
        <div className="feature-mock__value">Groww</div>
      </div>

      <div className="feature-mock__field">
        <p className="feature-mock__label">Deliverable</p>
        <div className="feature-mock__value">1 Instagram Reel</div>
      </div>

      <div className="feature-mock__field">
        <p className="feature-mock__label">Revision status</p>
        <div className="feature-mock__value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>1 of 2 revisions used</span>
          <span style={{ flex: 1, height: 4, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden', marginLeft: 8 }}>
            <span style={{ display: 'block', width: '50%', height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: '0.75rem',
          padding: '1.25rem',
          border: '2px dashed var(--color-border)',
          borderRadius: 'var(--radius-md)',
          textAlign: 'center',
          background: 'var(--section-bg-alt)',
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>📤</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>Drop file or click to upload</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-subtle)', marginTop: 2 }}>v2 — this replaces your previous upload</div>
      </div>
    </div>
  )
}

function CreatorPaymentMock() {
  const steps = [
    { label: 'Offer agreed',       sub: '₹48,000 locked',           done: true,  active: false },
    { label: 'Content approved',   sub: 'Brand approved your Reel',  done: true,  active: false },
    { label: 'Payment sent',       sub: 'Link sent by Groww',        done: false, active: true  },
    { label: 'Paid',               sub: 'In your account',           done: false, active: false },
  ]

  return (
    <div className="feature-mock">
      <p className="feature-mock__title">Payment status</p>
      <div className="payment-track__steps">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`payment-track__step${step.done ? ' done' : step.active ? ' active' : ''}`}
          >
            <div className="payment-track__icon">
              {step.done ? '✓' : step.active ? '◉' : ''}
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

// ── PAGE ────────────────────────────────────────────────────────────────────

const visualMap = {
  'offer-builder': <DealInboxMock />,
  'thread':        <DeliverableMock />,
  'payment':       <CreatorPaymentMock />,
}

export default function CreatorPage() {
  const features = creatorPage.features.map((f) => ({
    ...f,
    visual: visualMap[f.visual],
  }))

  return (
    <div data-page="creator">
      <MeshGradientBackground />
      <Nav audience="creator" />

      <main>
        <Hero
          badge={creatorPage.hero.badge}
          headline={creatorPage.hero.headline}
          subheadline={creatorPage.hero.subheadline}
          ctaText={creatorPage.hero.ctaText}
          ctaHref={creatorPage.hero.ctaHref}
          microcopy={creatorPage.hero.microcopy}
          visual={<DealDisplayCards />}
        />

        <StatsRow stats={creatorPage.stats} />

        <ContainerScroll
          titleComponent={
            <h2 className="container-scroll__title">
              Your deals, managed in one place
            </h2>
          }
        >
          <FeatureZigzag features={features} />
        </ContainerScroll>

        <MidCTA
          headline={creatorPage.midCta.headline}
          ctaText={creatorPage.midCta.ctaText}
          ctaHref={creatorPage.midCta.ctaHref}
        />

        <Testimonials
          label={creatorPage.testimonials.label}
          headline={creatorPage.testimonials.headline}
          cards={creatorPage.testimonials.cards}
        />

        <FeatureGrid
          label={creatorPage.featureGrid.label}
          headline={creatorPage.featureGrid.headline}
          cards={creatorPage.featureGrid.cards}
        />

        <FinalCTA
          headline={creatorPage.finalCta.headline}
          sub={creatorPage.finalCta.sub}
          ctaText={creatorPage.finalCta.ctaText}
          ctaHref={creatorPage.finalCta.ctaHref}
          microcopy={creatorPage.finalCta.microcopy}
        />
      </main>

      <Footer />

      <MobileBottomCTA
        ctaText={creatorPage.mobileCta.ctaText}
        ctaHref={creatorPage.mobileCta.ctaHref}
      />
    </div>
  )
}
