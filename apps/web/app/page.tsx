import Link from 'next/link'
import Nav from '@/components/Nav'
import StatsRow from '@/components/StatsRow'
import Footer from '@/components/Footer'
import { homePage, BRAND_NAME } from '@/lib/content'

export const metadata = {
  title: `${BRAND_NAME} — Brand–creator deals without the chaos`,
  description: 'One platform for brand–creator collaborations. Offer, negotiate, deliver, and pay — without agencies or WhatsApp threads.',
}

export default function HomePage() {
  const { problem, howItWorks, bothSides, homeFinalCta } = homePage

  return (
    <>
      <Nav audience="none" />

      <main>

        {/* ── HERO: AUDIENCE SPLIT ─────────────────────────────────── */}
        <section className="home-hero">
          {/* Pastel blob backgrounds */}
          <div className="home-hero__blob home-hero__blob--purple" aria-hidden="true" />
          <div className="home-hero__blob home-hero__blob--peach"  aria-hidden="true" />
          <div className="home-hero__blob home-hero__blob--rose"   aria-hidden="true" />

          {/* Floating name chips */}
          <div className="hero-chip" style={{ top: '22%', left: '8%', animationDelay: '0s' }} aria-hidden="true">
            <span className="hero-chip__avatar" style={{ background: 'var(--brand-tint)', color: 'var(--accent)' }}>R</span>
            Rohan · Finance · 180K
          </div>
          <div className="hero-chip" style={{ top: '38%', right: '6%', animationDelay: '1.4s' }} aria-hidden="true">
            <span className="hero-chip__avatar" style={{ background: '#EDE4D4', color: '#5C5048' }}>P</span>
            Priya · Tech · 95K
          </div>
          <div className="hero-chip" style={{ bottom: '28%', left: '6%', animationDelay: '2.8s' }} aria-hidden="true">
            <span className="hero-chip__avatar" style={{ background: 'var(--brand-tint)', color: 'var(--accent)' }}>Z</span>
            Zerodha · BFSI
          </div>
          <div className="hero-chip" style={{ bottom: '22%', right: '7%', animationDelay: '0.7s' }} aria-hidden="true">
            <span className="hero-chip__avatar" style={{ background: '#F5E8D8', color: '#78350F' }}>boAt</span>
            boAt · D2C
          </div>

          <div className="home-hero__inner">
            <span className="home-hero__badge">{homePage.badge}</span>
            <h1 className="home-hero__headline">{homePage.headline}</h1>
            <p className="home-hero__sub">{homePage.subheadline}</p>

            <div className="audience-split">
              <Link href={homePage.audienceSplit.brand.href} className="audience-card">
                <span className="audience-card__emoji">{homePage.audienceSplit.brand.emoji}</span>
                <div className="audience-card__label">{homePage.audienceSplit.brand.label}</div>
                <p className="audience-card__tagline">{homePage.audienceSplit.brand.tagline}</p>
                <span className="audience-card__cta">{homePage.audienceSplit.brand.cta}</span>
              </Link>
              <Link href={homePage.audienceSplit.creator.href} className="audience-card">
                <span className="audience-card__emoji">{homePage.audienceSplit.creator.emoji}</span>
                <div className="audience-card__label">{homePage.audienceSplit.creator.label}</div>
                <p className="audience-card__tagline">{homePage.audienceSplit.creator.tagline}</p>
                <span className="audience-card__cta">{homePage.audienceSplit.creator.cta}</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ── PROBLEM ──────────────────────────────────────────────── */}
        <section className="problem">
          <div className="problem__inner">
            <div className="problem__text" data-animate>
              <p className="problem__eyebrow">{problem.eyebrow}</p>
              <h2 className="problem__headline">{problem.headline}</h2>
              <p className="problem__body">{problem.body}</p>
              <div className="problem__solution">{problem.solution}</div>
            </div>

            <div className="problem__visual" data-animate data-delay="150">
              <p className="problem__visual-label">A deal right now lives in…</p>
              <div className="problem__tools">
                {problem.tools.map((tool) => (
                  <span key={tool} className="problem__tool">{tool}</span>
                ))}
              </div>
              <div className="problem__arrow">↓</div>
              <div className="problem__after">One deal on {BRAND_NAME}</div>
            </div>
          </div>
        </section>

        {/* ── STATS ────────────────────────────────────────────────── */}
        <StatsRow stats={homePage.stats} className="home-stats stats" />

        {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
        <section className="how-it-works" id={howItWorks.id}>
          <div className="how-it-works__header" data-animate>
            <p className="how-it-works__eyebrow">{howItWorks.eyebrow}</p>
            <h2 className="how-it-works__headline">{howItWorks.headline}</h2>
          </div>

          <div className="how-it-works__steps">
            {howItWorks.steps.map((step, i) => (
              <div key={step.number} className="step-card" data-animate data-delay={String(i * 100)}>
                <div className="step-card__number">{step.number}</div>
                <div className="step-card__text">
                  <h3 className="step-card__title">{step.title}</h3>
                  <p className="step-card__body">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── BOTH SIDES ───────────────────────────────────────────── */}
        <section className="both-sides">
          <div className="both-sides__header" data-animate>
            <p className="both-sides__eyebrow">{bothSides.eyebrow}</p>
            <h2 className="both-sides__headline">{bothSides.headline}</h2>
          </div>

          <div className="both-sides__grid">
            {/* Brand card */}
            <div className="side-card" data-animate data-delay="0">
              <p className="side-card__label">{bothSides.brand.label}</p>
              <div className="side-card__points">
                {bothSides.brand.points.map((pt) => (
                  <div key={pt} className="side-card__point">
                    <span className="side-card__point-check">✓</span>
                    {pt}
                  </div>
                ))}
              </div>
              <Link href={bothSides.brand.href} className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }}>
                {bothSides.brand.cta} →
              </Link>
            </div>

            {/* Creator card */}
            <div className="side-card" data-animate data-delay="150">
              <p className="side-card__label">{bothSides.creator.label}</p>
              <div className="side-card__points">
                {bothSides.creator.points.map((pt) => (
                  <div key={pt} className="side-card__point">
                    <span className="side-card__point-check">✓</span>
                    {pt}
                  </div>
                ))}
              </div>
              <Link href={bothSides.creator.href} className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }}>
                {bothSides.creator.cta} →
              </Link>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ────────────────────────────────────────────── */}
        <section className="home-final-cta">
          <div className="home-final-cta__glow" aria-hidden="true" />
          <div className="home-final-cta__inner" data-animate>
            <h2 className="home-final-cta__headline">{homeFinalCta.headline}</h2>
            <div className="home-final-cta__buttons">
              <Link href={homeFinalCta.brandCta.href} className="btn btn--on-dark">
                {homeFinalCta.brandCta.label}
              </Link>
              <Link href={homeFinalCta.creatorCta.href} className="btn btn--outline-dark">
                {homeFinalCta.creatorCta.label}
              </Link>
            </div>
            <p className="home-final-cta__microcopy">{homeFinalCta.microcopy}</p>
          </div>
        </section>

      </main>

      <Footer />
    </>
  )
}
