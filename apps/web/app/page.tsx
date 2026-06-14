import Link from 'next/link'
import Nav from '@/components/Nav'
import StatsRow from '@/components/StatsRow'
import ContainerScroll from '@/components/ContainerScroll'
import Footer from '@/components/Footer'
import ExperimentHero from '@/components/ExperimentHero'
import MeshGradientBackground from '@/components/MeshGradientBackground'
import { homePage, BRAND_NAME } from '@/lib/content'

export const metadata = {
  title: `${BRAND_NAME} — Brand–creator deals without the chaos`,
  description: 'One platform for brand–creator collaborations. Offer, negotiate, deliver, and pay — without agencies or WhatsApp threads.',
}

export default function HomePage() {
  const { problem, howItWorks, bothSides, homeFinalCta } = homePage

  return (
    <div data-page="home">
      <MeshGradientBackground />
      <Nav audience="none" />

      <main>

        {/* ── HERO: EXPERIMENT (split layout + blob mascot) ────────── */}
        {/* Original home-hero is preserved on main. This is experiment/hero-redesign only. */}
        <ExperimentHero />

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
        <ContainerScroll
          titleComponent={
            <div className="how-it-works__header" data-animate>
              <p className="how-it-works__eyebrow">{howItWorks.eyebrow}</p>
              <h2 className="how-it-works__headline">{howItWorks.headline}</h2>
            </div>
          }
        >
          <section className="how-it-works" id={howItWorks.id}>
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
        </ContainerScroll>

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
    </div>
  )
}
