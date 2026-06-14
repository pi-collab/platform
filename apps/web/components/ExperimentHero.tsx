import Link from 'next/link'
import { homePage } from '@/lib/content'
import { SplineScene } from './SplineScene'

// Public Spline demo robot scene — replace with a glass/pastel variant from
// https://app.spline.design/community once you find one you like.
const SCENE_URL = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

/**
 * EXPERIMENT — split hero with Spline glass robot.
 * Branch: experiment/hero-redesign. Easy to remove entirely.
 */
export default function ExperimentHero() {
  return (
    <section className="exp-hero">
      {/* Subtle background glow */}
      <div className="exp-hero__bg-glow" aria-hidden="true" />

      {/* Floating name chips */}
      <div
        className="hero-chip"
        style={{ position: 'absolute', top: '22%', left: '4%', animationDelay: '0s' }}
        aria-hidden="true"
      >
        <span className="hero-chip__avatar" style={{ background: 'var(--brand-tint)', color: 'var(--accent)' }}>R</span>
        Rohan · Finance · 180K
      </div>
      <div
        className="hero-chip"
        style={{ position: 'absolute', bottom: '24%', left: '3%', animationDelay: '2s' }}
        aria-hidden="true"
      >
        <span className="hero-chip__avatar" style={{ background: '#F5E8D8', color: '#78350F' }}>Z</span>
        Zerodha · BFSI
      </div>
      <div
        className="hero-chip"
        style={{ position: 'absolute', top: '28%', right: '3%', animationDelay: '1s' }}
        aria-hidden="true"
      >
        <span className="hero-chip__avatar" style={{ background: '#EDE4D4', color: '#5C5048' }}>P</span>
        Priya · Tech · 95K
      </div>

      <div className="exp-hero__inner">

        {/* LEFT: Content */}
        <div className="exp-hero__content">
          <span className="exp-hero__badge">{homePage.badge}</span>
          <h1 className="exp-hero__headline">{homePage.headline}</h1>
          <p className="exp-hero__sub">{homePage.subheadline}</p>
          <div className="exp-hero__ctas">
            <Link href={homePage.audienceSplit.brand.href} className="btn btn--primary">
              {homePage.audienceSplit.brand.cta}
            </Link>
            <Link href={homePage.audienceSplit.creator.href} className="btn btn--ghost">
              {homePage.audienceSplit.creator.cta}
            </Link>
          </div>
          <p className="exp-hero__microcopy">No agencies. No WhatsApp threads. Just the deal.</p>
        </div>

        {/* RIGHT: Spline glass robot */}
        <div className="exp-hero__visual">
          <SplineScene scene={SCENE_URL} className="exp-hero__spline" />
        </div>

      </div>
    </section>
  )
}
