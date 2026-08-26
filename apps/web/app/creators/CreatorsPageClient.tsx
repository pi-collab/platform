'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The "For Creators" marketing page, ported from the design export.
 *
 * Same approach as the brands page: the export's inline styles are kept rather
 * than re-authored, because the export IS the specification and retyping its
 * values by hand is where a pixel-perfect port stops being pixel-perfect. The
 * conversion runs from scripts/creators-convert-from-export.py so a re-export
 * can be re-ported rather than hand-merged.
 *
 * Brand logos and testimonials ship structurally complete but hidden — that
 * content is not real yet, the same call as on the brands page.
 */

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined
  }
}

const SHOW_BRAND_LOGOS = false
/** The creator roster ("Made for creators like you") shows invented creators. */
const SHOW_CREATOR_ROSTER = false

export default function CreatorsPageClient() {
  const router = useRouter()
  /** The hero CTA is a dead button in the export; creators sign up here. */
  const goToSignup = () => router.push('/signup/creator')

  /**
   * Reveal-on-scroll. Every .sr element starts at opacity 0 and only becomes
   * visible once .sr-in is added, so without this the page renders blank. The
   * export drove it from its own runtime, which is not ported.
   */
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll('.creators-page .sr, .creators-page .sr-fade, .creators-page .ws-fade'),
    )
    if (!els.length) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.add('sr-in', 'ws-in'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            // Two reveal conventions in this export: .sr elements wait for
            // .sr-in, while the #whySwitch table's .ws-fade elements wait for
            // .ws-in. Adding both is harmless and covers each.
            e.target.classList.add('sr-in', 'ws-in')
            io.unobserve(e.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="creators-page">
      {/* ============ HERO ============ */}
        <section id="top" style={{position: 'relative', width: '100vw', left: '50%', right: '50%', marginLeft: '-50vw', marginRight: '-50vw', overflow: 'hidden', background: '#fff', marginTop: 'clamp(-96px,-8vw,-70px)', paddingBottom: '40px'}}>
          <div style={{position: 'relative', overflow: 'hidden', paddingBottom: 'calc(63.92% - 60px)'}}>
            <img src="/creators/hero.webp" alt="guapd creator dashboard cards showing opportunities, upcoming deliverables, earnings, payments, and recent activity" style={{position: 'absolute', top: '0', left: '0', width: '100%', height: 'auto', display: 'block', objectPosition: 'top'}} width={1672} height={941} decoding="async" />
            <div aria-hidden="true" style={{position: 'absolute', top: '0', bottom: '0', left: '0', width: '20%', background: 'linear-gradient(to right,#FFFFFF 0%,#FFFFFF 40%,rgba(255,255,255,0) 100%)', pointerEvents: 'none', zIndex: '1'}}></div>
            <div aria-hidden="true" style={{position: 'absolute', top: '0', bottom: '0', right: '0', width: '20%', background: 'linear-gradient(to left,#FFFFFF 0%,#FFFFFF 40%,rgba(255,255,255,0) 100%)', pointerEvents: 'none', zIndex: '1'}}></div>
          </div>
          <div className="hero-text" style={{position: 'absolute', zIndex: '2', left: 'calc(5.5% + 100px)', top: '27%', width: '34%', maxWidth: '560px', minWidth: '320px', textAlign: 'left'}}>
            <h1 style={{margin: '0'}}>
              <span className="hero-fade" style={{display: 'block', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: 'clamp(44px,3.2vw,56px)', lineHeight: '1.06', letterSpacing: '-0.03em', color: '#12151C', animationDelay: '0ms'}}>Your creator</span>
              <span className="hero-fade" style={{display: 'block', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: 'clamp(44px,3.2vw,56px)', lineHeight: '1.06', letterSpacing: '-0.03em', color: '#12151C', animationDelay: '80ms'}}>business. <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400', letterSpacing: '-0.01em'}}>Organized.</span></span>
            </h1>
            <p className="hero-fade" style={{fontFamily: 'var(--font-ui)', fontSize: '18px', fontWeight: '400', lineHeight: '1.45', color: '#565C68', maxWidth: '30ch', margin: '24px 0 0', animationDelay: '160ms'}}>Keep every opportunity, deliverable and payment in one place.</p>
            <div className="hero-fade" style={{margin: '44px 0 0', animationDelay: '240ms'}}>
              <button type="button" onClick={goToSignup} className="hero-cta" style={{background: '#12151C', color: '#fff', border: 'none', borderRadius: '999px', padding: '17px 34px', fontFamily: 'var(--font-ui)', fontSize: '16px', fontWeight: '600', letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', cursor: 'pointer'}}>Get early access<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: '12px'}}><path d="M5 12h14M13 6l6 6-6 6"></path></svg></button>
            </div>
          </div>
        </section>

  

        {/* ============ ORIGINAL HERO (deals & campaigns) ============ */}
        <section style={{position: 'relative', overflow: 'visible', background: '#fff', padding: 'clamp(12px,1.5vw,30px) clamp(20px,5vw,72px) clamp(56px,6vw,88px)'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', background: '#fff', border: '1px solid var(--hairline)', borderRadius: '32px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(40px,5vw,64px)', overflow: 'visible'}}>
          <div aria-hidden="true" style={{position: 'absolute', left: '-10%', top: '-20%', width: '520px', height: '520px', borderRadius: '32px 0 0 32px', overflow: 'hidden', pointerEvents: 'none'}}><div style={{position: 'absolute', left: '0', top: '0', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,#E7F1FC 0%,rgba(231,241,252,0) 70%)'}}></div></div>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '64px', alignItems: 'center'}}>
            <div className="sr" style={{'--sr-delay': '0s', position: 'relative', zIndex: '1'}}>
              <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)', fontSize: '12px'}}>For creators</span>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.02', fontSize: 'clamp(22px,2.5vw,32px)', margin: '12px 0 0', color: '#12151C', maxWidth: 'none'}}>Every brand deal you're offered.<br /><span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>All tracked in one place.</span></h2>
              <p style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.5', color: '#565C68', maxWidth: '48ch', margin: '14px 0 0'}}>Stop managing collaborations across DMs, email, and WhatsApp. Accept offers, negotiate terms, upload deliverables, and track payment, all in one place.</p>
            </div>
            <div className="sr" style={{'--sr-delay': '.12s', position: 'relative', minHeight: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <div aria-hidden="true" className="card oh-float" style={{position: 'absolute', zIndex: '1', width: '88%', maxWidth: '420px', top: '8%', right: '-4%', borderRadius: '20px', background: '#E7F1FC', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', height: '110px', transform: 'rotate(3deg)'}}></div>
              <div className="card oh-deals-card" style={{position: 'relative', zIndex: '2', width: '100%', maxWidth: '387px', borderRadius: '20px', background: '#fff', border: '1px solid rgba(18,21,28,.1)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', overflow: 'hidden'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border-hairline)'}}><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '15px'}}>Deals and campaigns</span><span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}><span className="oh-livedot" style={{width: '7px', height: '7px', borderRadius: '50%', background: 'var(--neon-deep)'}}></span>3 active</span></div>
                <div style={{padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  <div className="oh-row" style={{'--oh-delay': '.05s', display: 'flex', alignItems: 'center', gap: '13px', padding: '17px', borderRadius: '13px', background: '#FAFBFC'}}><span style={{width: '38px', height: '38px', borderRadius: '50%', background: '#E9F7F0', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '13.5px', color: 'var(--ink)'}}>H</span><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '15px'}}>Halcyon</div><div style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)', marginTop: '2px'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#4F8DDB'}}></span>New offer</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '15px'}}>₹45,000</div></div>
                  <div className="oh-row" style={{'--oh-delay': '.15s', display: 'flex', alignItems: 'center', gap: '13px', padding: '17px', borderRadius: '13px', background: '#FAFBFC'}}><span style={{width: '38px', height: '38px', borderRadius: '50%', background: '#FCF6E4', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '13.5px', color: 'var(--ink)'}}>V</span><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '15px'}}>Verity Goods</div><div style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)', marginTop: '2px'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E0A23C'}}></span>Negotiating</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '15px'}}>₹35,000</div></div>
                  <div className="oh-row" style={{'--oh-delay': '.25s', display: 'flex', alignItems: 'center', gap: '13px', padding: '17px', borderRadius: '13px', background: '#FAFBFC'}}><span style={{width: '38px', height: '38px', borderRadius: '50%', background: '#E7F1FC', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '13.5px', color: 'var(--ink)'}}>W</span><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '15px'}}>Wrenfield</div><div style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)', marginTop: '2px'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#2FA877'}}></span>Agreed</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '15px'}}>₹60,000</div></div>
                </div>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '17px 20px', borderTop: '1px solid var(--border-hairline)', background: '#FAFBFC'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)'}}>Total in motion</span><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '15px', color: '#12151C'}}>₹140,000</span></div>
              </div>
            </div>
          </div>
          </div>
        </section>
  

        {/* ============ EARNINGS & GROWTH ============ */}
        <section style={{position: 'relative', overflow: 'visible', background: '#fff', padding: '0 clamp(20px,5vw,72px) clamp(56px,6vw,88px)'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', background: '#fff', border: '1px solid var(--hairline)', borderRadius: '32px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(40px,5vw,64px)', overflow: 'visible'}}>
          <div aria-hidden="true" style={{position: 'absolute', right: '-10%', top: '-20%', width: '520px', height: '520px', borderRadius: '0 32px 32px 0', overflow: 'hidden', pointerEvents: 'none', zIndex: '0'}}><div style={{position: 'absolute', right: '0', top: '0', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,#E7F1FC 0%,rgba(231,241,252,0) 70%)'}}></div></div>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '64px', alignItems: 'center'}}>
            <div className="sr" style={{'--sr-delay': '.12s', position: 'relative', minHeight: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <div aria-hidden="true" className="card eg-float" style={{position: 'absolute', zIndex: '1', width: '88%', maxWidth: '420px', top: '8%', left: '-4%', borderRadius: '20px', background: '#E7F1FC', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', height: '110px', transform: 'rotate(-3deg)'}}></div>
              <div className="card eg-chart" style={{position: 'relative', zIndex: '2', width: '100%', maxWidth: '387px', borderRadius: '20px', background: '#fff', border: '1px solid rgba(18,21,28,.1)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', overflow: 'hidden', padding: '20px'}}>
                <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
                  <div>
                    <div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)'}}>Total earnings, this year</div>
                    <div style={{fontFamily: 'var(--font-display)', fontWeight: '600', fontSize: '26px', letterSpacing: '-0.02em', color: '#12151C', marginTop: '5px'}}>₹8,42,000</div>
                  </div>
                  <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '700', color: '#fff', background: '#12151C', borderRadius: '999px', padding: '5px 11px'}}>+22% YoY</span>
                </div>
                <div style={{height: '1px', background: 'var(--border-hairline)', marginTop: '16px'}}></div>
                <div style={{display: 'flex', alignItems: 'flex-end', gap: '9px', height: '170px', marginTop: '26px'}}>
                  <div style={{flex: '1', height: '38%', borderRadius: '7px 7px 0 0', background: '#EDEFF3'}}></div>
                  <div style={{flex: '1', height: '52%', borderRadius: '7px 7px 0 0', background: '#EDEFF3'}}></div>
                  <div style={{flex: '1', height: '44%', borderRadius: '7px 7px 0 0', background: '#EDEFF3'}}></div>
                  <div style={{flex: '1', height: '70%', borderRadius: '7px 7px 0 0', background: '#EDEFF3'}}></div>
                  <div style={{flex: '1', height: '60%', borderRadius: '7px 7px 0 0', background: '#EDEFF3'}}></div>
                  <div style={{flex: '1', height: '100%', borderRadius: '7px 7px 0 0', background: '#E7F1FC'}}></div>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '9px', fontFamily: 'var(--font-ui)', fontSize: '10.5px', color: 'var(--ink-faint)'}}><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span></div>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '16px', marginTop: '16px', borderTop: '1px solid var(--border-hairline)'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>Best month</span><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px', color: '#12151C'}}>Jul · ₹1,95,000</span></div>
              </div>
            </div>
            <div style={{position: 'relative', zIndex: '1', order: '2'}}>
              <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)', fontSize: '12px'}}>For creators</span>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.02', fontSize: 'clamp(22px,2.5vw,32px)', margin: '12px 0 0', color: '#12151C', maxWidth: 'none'}}>Watch your earnings <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>add up.</span></h2>
              <p style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.5', color: '#565C68', maxWidth: 'none', margin: '14px 0 0'}}>Every deal, past and present, rolls into one earnings view, so you always know what you've made, what's still coming, and where it's all coming from.</p>
              <div style={{display: 'grid', gridTemplateColumns: '1fr', gap: '14px', marginTop: 'clamp(32px,4vw,48px)', maxWidth: 'none'}}>
                <div style={{padding: '22px 24px', borderRadius: '16px', background: '#fff', border: '1px solid rgba(18,21,28,.1)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', display: 'flex', alignItems: 'center', gap: '16px'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '11px', background: '#FCF6E4', flexShrink: '0'}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg></span><div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '15px', color: '#12151C'}}>By month</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: '#565C68', marginTop: '2px'}}>Spot your slow months before they happen.</div></div></div>
                <div style={{padding: '22px 24px', borderRadius: '16px', background: '#fff', border: '1px solid rgba(18,21,28,.1)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', display: 'flex', alignItems: 'center', gap: '16px'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '11px', background: '#E7F1FC', flexShrink: '0'}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 6v6c0 5 4 8 8 10 4-2 8-5 8-10V6z"></path></svg></span><div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '15px', color: '#12151C'}}>Downloadable statements</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: '#565C68', marginTop: '2px'}}>Export a clean record for tax season.</div></div></div>
              </div>
            </div>
          </div>
          </div>
        </section>
  

        {/* ============ MOBILE APP SHOWCASE ============ */}
        <section style={{position: 'relative', width: '100vw', left: '50%', right: '50%', marginLeft: '-50vw', marginRight: '-50vw', overflow: 'hidden', background: '#fff', marginTop: 'clamp(56px,6vw,88px)'}}>
          <img src="/creators/mobile-app.webp" alt="guapd mobile app showing deals list, offer accepted, campaign live, deliverable approved, payment received, and earnings" style={{width: '100%', height: 'auto', display: 'block'}} width={1672} height={941} loading="lazy" decoding="async" />
          <div style={{position: 'absolute', left: '0', right: '0', bottom: '0', height: '38%', background: 'linear-gradient(180deg,rgba(255,255,255,0) 0%,#fff 82%)', pointerEvents: 'none'}}></div>
        </section>
        <section style={{padding: '0 clamp(20px,5vw,72px) clamp(56px,6vw,88px)', marginTop: 'clamp(-40px,-3.5vw,-20px)', position: 'relative', background: '#fff'}}>
          <div className="gx gx--prose" style={{textAlign: 'center', position: 'relative', top: '-30px'}}>
            <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)'}}>Deals, on the go</span>
            <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,44px)', margin: '12px 0 0', color: 'var(--ink)'}}>Every offer and payment,<br /><span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>right there</span></h2>
          </div>
        </section>



        {/* ============ VALUE TICKER ============ */}
        <section style={{padding: '0 0 clamp(40px,5vw,64px)', background: '#fff'}}>
          <div style={{position: 'relative', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)', maskImage: 'linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)'}}>
            <div style={{display: 'flex', width: 'max-content', gap: '0', animation: 'mqMove 32s linear infinite'}}>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>on-time payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>no chasing brands</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}} aria-hidden="true">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>on-time payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>no chasing brands</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
      
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>on-time payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>no chasing brands</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}} aria-hidden="true">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>on-time payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>no chasing brands</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
      
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>on-time payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>no chasing brands</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}} aria-hidden="true">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>on-time payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>no chasing brands</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
      
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>on-time payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>no chasing brands</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}} aria-hidden="true">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>on-time payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>no chasing brands</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
            </div>
          </div>
        </section>
        {/* ============ FEATURES (clean split rows) ============ */}
        <section id="how" style={{padding: 'clamp(32px,4vw,48px) clamp(14px,4vw,28px) clamp(56px,6vw,88px)'}}>
          <div className="gx" style={{background: '#fff', border: '1px solid var(--hairline)', borderRadius: '36px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(44px,5.5vw,72px) clamp(24px,4vw,48px)'}}>
          <div style={{maxWidth: '1080px', margin: '0 auto', textAlign: 'center'}}>
            <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,48px)', margin: '0', color: 'var(--ink)'}}>How it <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>works</span></h2>
          </div>

          <div style={{maxWidth: '1080px', margin: 'clamp(20px,2.5vw,32px) auto 0', display: 'flex', flexDirection: 'column', gap: 'clamp(32px,4vw,52px)'}}>
            {/* 01 Inbox (card right) */}
            <div className="sr" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))', gap: 'clamp(28px,4vw,60px)', alignItems: 'center', background: 'linear-gradient(135deg,#EFFAF5 0%,#fff 60%)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', borderRadius: '28px', padding: 'clamp(28px,4vw,56px)'}}>
              <div>
                <div style={{display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '16px'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '46px', height: '46px', borderRadius: '14px', background: '#fff', flexShrink: '0'}}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg></span><span className="t-meta" style={{color: 'var(--ink)'}}>01 · Deals</span></div>
                <h3 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.05', fontSize: 'clamp(26px,2.6vw,32px)', margin: '12px 0 0', color: 'var(--ink)'}}>Every deal, one <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>place</span></h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '15.5px', lineHeight: '1.6', color: 'var(--ink-soft)', maxWidth: '480px', margin: '16px 0 0'}}>No more offers buried in Instagram DMs. Every brand brief arrives as a structured card, deliverables, rate, timeline, all laid out clearly. Accept, counter, or decline in one tap.</p>
              </div>
              <div className="card sr sr-rot" style={{'--sr-delay': '.1s', '--sr-rot': '1.4deg', borderRadius: '18px', background: 'var(--card)', border: '1px solid var(--border-hairline)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', overflow: 'hidden', transition: 'transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1)'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--border-hairline)'}}><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px'}}>Deals and campaigns</span><span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}><span style={{width: '7px', height: '7px', borderRadius: '50%', background: 'var(--neon-deep)'}}></span>3 active</span></div>
                <div style={{padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <div className="inboxrow" style={{display: 'flex', alignItems: 'center', gap: '13px', padding: '13px', borderRadius: '12px', background: '#F7F4FB'}}><span id="ib4" style={{width: '38px', height: '38px', borderRadius: '11px', background: '#E7F1FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>F</span><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>Finlay</div><div style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#4F8DDB'}}></span>New offer</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>₹45,000</div></div>
                  <div className="inboxrow" style={{display: 'flex', alignItems: 'center', gap: '13px', padding: '13px', borderRadius: '12px', background: '#F7F4FB'}}><span id="ib5" style={{width: '38px', height: '38px', borderRadius: '11px', background: '#F0EAFD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>P</span><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>Pebble</div><div style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E0A23C'}}></span>Negotiating</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>₹35,000</div></div>
                  <div className="inboxrow" style={{display: 'flex', alignItems: 'center', gap: '13px', padding: '13px', borderRadius: '12px', background: '#F7F4FB'}}><span id="ib6" style={{width: '38px', height: '38px', borderRadius: '11px', background: '#E9F7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>V</span><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>Vaultly</div><div style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#2FA877'}}></span>Agreed</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>₹60,000</div></div>
                </div>
              </div>
            </div>

            {/* 02 Deliverables (card left) */}
            <div className="sr" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))', gap: 'clamp(28px,4vw,60px)', alignItems: 'center', background: 'linear-gradient(135deg,#EFF6FD 0%,#fff 60%)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', borderRadius: '28px', padding: 'clamp(28px,4vw,56px)'}}>
              <div className="card sr sr-rot" style={{'--sr-delay': '.1s', '--sr-rot': '-1.4deg', order: '1', borderRadius: '18px', background: 'var(--card)', border: '1px solid var(--border-hairline)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', overflow: 'hidden', transition: 'transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1)'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--border-hairline)'}}><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px'}}>Deliverable upload</span><span style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E0A23C'}}></span>In review</span></div>
                <div style={{padding: '18px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', paddingBottom: '11px', fontSize: '13.5px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>brand</span><span style={{fontWeight: '600'}}>Groww</span></div>
                  <div style={{display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid var(--border-hairline)', fontSize: '13.5px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>deliverable</span><span style={{fontWeight: '600'}}>1 Instagram Reel</span></div>
                  <div style={{padding: '13px 0', borderTop: '1px solid var(--border-hairline)'}}><div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginBottom: '9px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>revisions</span><span style={{fontWeight: '600'}}>1 of 2 used</span></div><div style={{display: 'flex', gap: '5px'}}><div style={{flex: '1', height: '7px', borderRadius: 'var(--radius-pill)', background: 'var(--neon-deep)', transformOrigin: 'left', animation: 'barGrow 1.4s cubic-bezier(.22,1,.36,1) forwards'}}></div><div style={{flex: '1', height: '7px', borderRadius: 'var(--radius-pill)', background: 'rgba(24,28,36,.1)'}}></div></div></div>
                  <div style={{marginTop: '6px', border: '1.6px dashed rgba(24,28,36,.18)', borderRadius: '14px', padding: '22px 16px', textAlign: 'center', background: '#FAFBFD'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(232,255,102,.35)', marginBottom: '10px'}}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4"></path><path d="m6 10 6-6 6 6"></path><path d="M4 20h16"></path></svg></span><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13.5px'}}>Drop file or click to upload</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '4px'}}>v2 replaces your previous upload</div></div>
                </div>
              </div>
              <div style={{order: '2'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '16px'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '46px', height: '46px', borderRadius: '14px', background: '#fff', flexShrink: '0'}}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4"></path><path d="m6 10 6-6 6 6"></path><path d="M4 20h16"></path></svg></span><span className="t-meta" style={{color: 'var(--ink)'}}>02 · Deliverables</span></div>
                <h3 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.05', fontSize: 'clamp(26px,2.6vw,32px)', margin: '12px 0 0', color: 'var(--ink)'}}>Upload and get <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>approved</span></h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '15.5px', lineHeight: '1.6', color: 'var(--ink-soft)', maxWidth: '480px', margin: '16px 0 0'}}>Track revision requests and see exactly how many rounds are left. No scope creep, no surprises.</p>
              </div>
            </div>

            {/* 03 Payment (card right) */}
            <div className="sr" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))', gap: 'clamp(28px,4vw,60px)', alignItems: 'center', background: 'linear-gradient(135deg,#FAF7FE 0%,#fff 55%)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', borderRadius: '28px', padding: 'clamp(28px,4vw,56px)'}}>
              <div>
                <div style={{display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '16px'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '46px', height: '46px', borderRadius: '14px', background: '#fff', flexShrink: '0'}}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg></span><span className="t-meta" style={{color: 'var(--ink)'}}>03 · Payment</span></div>
                <h3 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.05', fontSize: 'clamp(26px,2.6vw,32px)', margin: '12px 0 0', color: 'var(--ink)'}}>Know exactly when you get <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>paid</span></h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '15.5px', lineHeight: '1.6', color: 'var(--ink-soft)', maxWidth: '480px', margin: '16px 0 0'}}>Watch payment move from link sent to paid in real time. No chasing, no vague updates.</p>
              </div>
              <div className="card sr sr-rot" style={{'--sr-delay': '.1s', '--sr-rot': '1.2deg', borderRadius: '18px', background: 'var(--card)', border: '1px solid var(--border-hairline)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', overflow: 'hidden', transition: 'transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1)'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--border-hairline)'}}><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px'}}>Payment status</span><span style={{fontFamily: 'var(--font-ui)', fontSize: '12px'}}>₹46,000</span></div>
                <div style={{padding: '18px', display: 'flex', flexDirection: 'column'}}>
                  <div style={{display: 'grid', gridTemplateColumns: '28px 1fr', gap: '13px'}}><div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}><span style={{width: '26px', height: '26px', borderRadius: '50%', background: 'var(--neon)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span><span style={{flex: '1', width: '2px', background: 'var(--border-hairline)', margin: '3px 0', minHeight: '14px', position: 'relative', overflow: 'hidden'}}><span style={{position: 'absolute', inset: '0', background: 'var(--neon-deep)', transformOrigin: 'top', animation: 'payFill 4s ease-in-out infinite'}}></span></span></div><div style={{paddingBottom: '14px'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>Offer agreed</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>₹46,000 locked</div></div></div>
                  <div style={{display: 'grid', gridTemplateColumns: '28px 1fr', gap: '13px'}}><div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}><span style={{width: '26px', height: '26px', borderRadius: '50%', background: 'var(--neon)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span><span style={{flex: '1', width: '2px', background: 'var(--border-hairline)', margin: '3px 0', minHeight: '14px', position: 'relative', overflow: 'hidden'}}><span style={{position: 'absolute', inset: '0', background: 'var(--neon-deep)', transformOrigin: 'top', animation: 'payFill 4s ease-in-out .5s infinite'}}></span></span></div><div style={{paddingBottom: '14px'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>Content approved</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>Brand approved your Reel</div></div></div>
                  <div style={{display: 'grid', gridTemplateColumns: '28px 1fr', gap: '13px'}}><div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}><span style={{width: '26px', height: '26px', borderRadius: '50%', background: 'var(--neon)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span><span style={{flex: '1', width: '2px', background: 'var(--border-hairline)', margin: '3px 0', minHeight: '14px'}}></span></div><div style={{paddingBottom: '14px'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px'}}>Payment sent</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>Link sent by Groww</div></div></div>
                  <div style={{display: 'grid', gridTemplateColumns: '28px 1fr', gap: '13px'}}><div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}><span style={{width: '26px', height: '26px', borderRadius: '50%', background: 'var(--card)', border: '2px solid var(--border-hairline)'}}></span></div><div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--ink-faint)'}}>Paid</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>In your account</div></div></div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>



  


        <section id="whySwitch" style={{marginTop: '0', marginBottom: 'clamp(56px,6vw,88px)'}}>
          <div className="ws-grid">
            <div className="ws-imgwrap"><img src="/creators/features.webp" alt="guapd dashboard showing active collaborations, upcoming campaigns, earnings, and content reviews" style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center', display: 'block'}} width={1254} height={1254} loading="lazy" decoding="async" /></div>
            <div className="ws-right">
              <div className="ws-content">
                <div className="ws-fade t-meta" style={{color: '#878D99', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase'}}>Why creators switch</div>
                <h2 className="ws-fade ws-headline" style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,48px)'}}>
                  <span style={{color: '#12151C'}}>Everything DMs can't give you</span>
                </h2>
                <div className="ws-table">
                  <div className="ws-fade ws-cell ws-cell-head ws-label ws-meta" style={{color: '#878D99', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase'}}>What you get</div>
                  <div className="ws-fade ws-cell ws-cell-head ws-mark ws-meta" style={{color: '#878D99', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase'}}>Guapd</div>
                  <div className="ws-fade ws-cell ws-cell-head ws-mark ws-meta" style={{color: '#878D99', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase'}}>DMs &amp; email</div>

                  <div className="ws-fade ws-cell ws-cell-body ws-label">Every offer with rate, scope and dates</div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-fade ws-cell ws-cell-body ws-label">Terms locked the moment you accept</div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-fade ws-cell ws-cell-body ws-label">Revisions counted against what you agreed</div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-fade ws-cell ws-cell-body ws-label">Payment terms agreed before you shoot</div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-fade ws-cell ws-cell-body ws-label">Counter a price without an awkward DM</div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-fade ws-cell ws-cell-body ws-label">Usage rights and boosting, with an end date</div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-fade ws-cell ws-cell-body ws-label">Every change timestamped, by both sides</div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-fade ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ============ CREATOR DASHBOARD SHOWCASE ============ */}
        {/* ============ FEATURE GRID ============ */}
        <section style={{padding: '0 clamp(20px,5vw,72px) clamp(56px,6vw,88px)'}}>
          <div className="gx" style={{background: 'var(--card)', border: '1px solid rgba(18,21,28,.1)', borderRadius: '32px', padding: 'clamp(30px,4vw,58px)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}>
            <div style={{textAlign: 'center', maxWidth: '640px', margin: '0 auto clamp(32px,4vw,52px)'}}>
              <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)'}}>Everything you need</span>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,48px)', margin: '14px 0 0', color: 'var(--ink)'}}>Everything you <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>need</span></h2>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(28px,4vw,56px)', alignItems: 'center'}}>
              {/* left: feature list */}
              <div className="sr" style={{borderRadius: '22px', background: 'var(--card)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: '8px clamp(18px,2.4vw,28px)'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 0'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '14px', background: 'var(--sec-2)', flexShrink: '0'}}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg></span><div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '17px', letterSpacing: '-0.02em'}}>Deal inbox</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.5', color: 'var(--ink-soft)', marginTop: '3px'}}>All offers in one place, structured and easy to respond to.</div></div></div>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 0', borderTop: '1px solid var(--border-hairline)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '14px', background: 'var(--sec)', flexShrink: '0'}}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V7a5 5 0 0 1 10 0v4"></path><rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="m9 16 2 2 4-4"></path></svg></span><div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '17px', letterSpacing: '-0.02em'}}>Accept or counter</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.5', color: 'var(--ink-soft)', marginTop: '3px'}}>Respond in one tap. Counter on any line item with a reason.</div></div></div>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 0', borderTop: '1px solid var(--border-hairline)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '14px', background: 'var(--sec)', flexShrink: '0'}}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9"></path><path d="M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"></path><path d="M3 9h18"></path><path d="M9 21v-6h6v6"></path></svg></span><div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '17px', letterSpacing: '-0.02em'}}>Shopfront</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.5', color: 'var(--ink-soft)', marginTop: '3px'}}>A public page for your rates, past work, and availability, share one link instead of a media kit.</div></div></div>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 0', borderTop: '1px solid var(--border-hairline)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '14px', background: 'var(--sec-2)', flexShrink: '0'}}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg></span><div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '17px', letterSpacing: '-0.02em'}}>Payment status</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.5', color: 'var(--ink-soft)', marginTop: '3px'}}>Watch payment move from pending to paid in real time.</div></div></div>
              </div>
              {/* right: creators & brands collage */}
              <div className="sr" style={{'--sr-delay': '.1s', display: 'flex', alignItems: 'stretch', height: '100%'}}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '320px', margin: '0 auto', alignContent: 'center', width: '100%'}}>
                  <img src="/creators/grid-1.webp" alt="Creator portrait · vertical" style={{...{width: '100%', height: 'auto', aspectRatio: '1/1', display: 'block', background: '#FBFCFA'}, objectFit: 'cover'}} loading="lazy" decoding="async" />
                  <img src="/creators/grid-2.webp" alt="Brand logo or product shot" style={{...{width: '100%', height: 'auto', aspectRatio: '1/1', display: 'block', background: '#FBFCFA'}, objectFit: 'cover'}} loading="lazy" decoding="async" />
                  <img src="/creators/grid-3.webp" alt="Brand logo or team" style={{...{width: '100%', height: 'auto', aspectRatio: '1/1', display: 'block', background: '#FBFCFA'}, objectFit: 'cover'}} loading="lazy" decoding="async" />
                  <img src="/creators/grid-4.webp" alt="Creator portrait · vertical" style={{...{width: '100%', height: 'auto', aspectRatio: '1/1', display: 'block', background: '#FBFCFA'}, objectFit: 'cover'}} loading="lazy" decoding="async" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ TRUST & SECURITY ============ */}
        <section style={{padding: '0 clamp(20px,5vw,72px) clamp(56px,6vw,88px)'}}>
          <div className="gx" style={{background: 'var(--card)', border: '1px solid rgba(18,21,28,.1)', borderRadius: '32px', padding: 'clamp(30px,4vw,58px)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}>
            <div style={{textAlign: 'center', maxWidth: '620px', margin: '0 auto clamp(32px,4vw,52px)'}}>
              <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)'}}>Built for trust</span>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,48px)', margin: '14px 0 0', color: 'var(--ink)'}}>Your deals, <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>protected</span></h2>
              <p style={{fontFamily: 'var(--font-ui)', fontSize: '16px', lineHeight: '1.5', color: '#565C68', margin: '16px 0 0'}}>Every collaboration on guapd is backed by a written contract and a payment that's tracked from day one.</p>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '24px'}}>
              <div style={{padding: '28px 24px', borderRadius: '20px', background: '#fff', border: '1px solid rgba(18,21,28,.06)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '12px', background: '#E9F7F0', marginBottom: '16px'}}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 6v6c0 5 4 8 8 10 4-2 8-5 8-10V6z"></path></svg></span><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '17px', letterSpacing: '-0.02em'}}>Written contracts, every time</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '14px', lineHeight: '1.55', color: '#565C68', marginTop: '8px'}}>Terms are locked in before work starts. No more verbal agreements that brands forget.</div></div>
              <div style={{padding: '28px 24px', borderRadius: '20px', background: '#fff', border: '1px solid rgba(18,21,28,.06)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '12px', background: '#E7F1FC', marginBottom: '16px'}}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg></span><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '17px', letterSpacing: '-0.02em'}}>Payment status, always visible</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '14px', lineHeight: '1.55', color: '#565C68', marginTop: '8px'}}>Track every payment from invoice sent to money in your account. No chasing, no vague replies.</div></div>
              <div style={{padding: '28px 24px', borderRadius: '20px', background: '#fff', border: '1px solid rgba(18,21,28,.06)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '12px', background: '#FCF6E4', marginBottom: '16px'}}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '17px', letterSpacing: '-0.02em'}}>Approvals on record</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '14px', lineHeight: '1.55', color: '#565C68', marginTop: '8px'}}>Every revision request and sign-off is logged, so scope stays exactly what was agreed.</div></div>
            </div>
          </div>
        </section>

        <section style={{position: 'relative', width: '100%', overflow: 'hidden', background: '#fff', marginTop: '0', marginBottom: 'clamp(56px,6vw,88px)'}}>
          <div style={{maxWidth: '1040px', margin: '0 auto', position: 'relative', transform: 'translateX(80px)'}}>
            <img src="/creators/trust.webp" alt="guapd creator dashboard showing earnings, active campaigns, upcoming deliverables, and recent activity" style={{width: '100%', height: 'auto', display: 'block', borderRadius: '24px'}} width={2139} height={1204} loading="lazy" decoding="async" />
            <div style={{position: 'absolute', left: '0', top: '0', bottom: '0', width: 'clamp(60px,14vw,220px)', background: 'linear-gradient(90deg,#fff 0%,#fff 25%,rgba(255,255,255,0) 100%)', pointerEvents: 'none'}}></div>
            <div style={{position: 'absolute', right: '0', top: '0', bottom: '0', width: 'clamp(40px,9vw,150px)', background: 'linear-gradient(270deg,#fff 0%,#fff 25%,rgba(255,255,255,0) 100%)', pointerEvents: 'none'}}></div>
          </div>
          <div style={{position: 'absolute', left: 'clamp(104px,10.5vw,176px)', top: '50%', transform: 'translateY(-50%)', maxWidth: '420px', textAlign: 'left'}}>
            <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)'}}>One dashboard, every deal</span>
            <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,44px)', margin: '12px 0 0', color: 'var(--ink)'}}>Run your whole creator business from <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>one place</span></h2>
            <p style={{fontFamily: 'var(--font-ui)', fontSize: '15px', lineHeight: '1.5', color: 'var(--ink-soft)', margin: '14px 0 0', maxWidth: '420px'}}>Track opportunities, deliverables, and payments without switching apps.</p>
          </div>
        </section>

        {SHOW_CREATOR_ROSTER && (<>
      {/* ============ CREATORS & BRANDS ============ */}
        <section style={{padding: '0 clamp(20px,5vw,72px) clamp(56px,6vw,88px)'}}>
          <div className="gx">
            <div style={{textAlign: 'center', maxWidth: '620px', margin: '0 auto clamp(36px,4.5vw,56px)'}}>
              <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)'}}>Creators we work with</span>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,48px)', margin: '12px 0 0', color: 'var(--ink)'}}>Made for creators like <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>you</span></h2>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'clamp(22px,3vw,34px)', maxWidth: '980px', margin: '0 auto'}}>
              <div className="card sr" style={{'--sr-delay': '0s', background: 'var(--card)', border: '1px solid rgba(18,21,28,.1)', borderRadius: '24px', padding: '14px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div id="c1" aria-hidden="true" data-placeholder="Creator portrait" style={{width: '100%', height: 'auto', aspectRatio: '1/1', display: 'block'}} /><div style={{padding: '16px 6px 6px'}}><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', letterSpacing: '-0.01em', color: 'var(--ink)'}}>@aisha.fin</div><div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--ink)', background: '#F3F5F9', borderRadius: 'var(--radius-pill)', padding: '4px 11px'}}>Finance</span><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)'}}>180K followers</span></div></div></div>
              <div className="card sr" style={{'--sr-delay': '.07s', background: 'var(--card)', border: '1px solid rgba(18,21,28,.1)', borderRadius: '24px', padding: '14px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div id="c2" aria-hidden="true" data-placeholder="Creator portrait" style={{width: '100%', height: 'auto', aspectRatio: '1/1', display: 'block'}} /><div style={{padding: '16px 6px 6px'}}><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', letterSpacing: '-0.01em', color: 'var(--ink)'}}>@rohan.tech</div><div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--ink)', background: '#F3F5F9', borderRadius: 'var(--radius-pill)', padding: '4px 11px'}}>Tech</span><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)'}}>92K followers</span></div></div></div>
              <div className="card sr" style={{'--sr-delay': '.14s', background: 'var(--card)', border: '1px solid rgba(18,21,28,.1)', borderRadius: '24px', padding: '14px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div id="c3" aria-hidden="true" data-placeholder="Creator portrait" style={{width: '100%', height: 'auto', aspectRatio: '1/1', display: 'block'}} /><div style={{padding: '16px 6px 6px'}}><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', letterSpacing: '-0.01em', color: 'var(--ink)'}}>@priya.career</div><div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--ink)', background: '#F3F5F9', borderRadius: 'var(--radius-pill)', padding: '4px 11px'}}>Careers</span><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)'}}>95K followers</span></div></div></div>
              <div className="card sr" style={{'--sr-delay': '.21s', background: 'var(--card)', border: '1px solid rgba(18,21,28,.1)', borderRadius: '24px', padding: '14px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div id="c4" aria-hidden="true" data-placeholder="Creator portrait" style={{width: '100%', height: 'auto', aspectRatio: '1/1', display: 'block'}} /><div style={{padding: '16px 6px 6px'}}><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', letterSpacing: '-0.01em', color: 'var(--ink)'}}>@maya.money</div><div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--ink)', background: '#F3F5F9', borderRadius: 'var(--radius-pill)', padding: '4px 11px'}}>Lifestyle</span><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)'}}>210K followers</span></div></div></div>
            </div>
          </div>
        </section>

  
      </>)}
      {SHOW_BRAND_LOGOS && (<>
      {/* ============ BRANDS WE WORK WITH ============ */}
        <section style={{padding: '0 clamp(20px,5vw,72px) clamp(56px,6vw,88px)'}}>
          <div className="sr gx" style={{border: '1.2px solid var(--hairline)', borderRadius: '24px', background: 'var(--card)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(32px,4.5vw,56px) clamp(20px,4vw,48px)', textAlign: 'center'}}>
            <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)'}}>Brands on guapd</span>
            <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,48px)', margin: '10px 0 clamp(24px,3.2vw,34px)', color: 'var(--ink)'}}>Work with brands you already <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>know</span></h2>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', alignItems: 'center', justifyContent: 'center', gap: '14px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '11px', background: 'var(--card)', borderRadius: '16px', padding: '12px 18px 12px 12px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span id="b1" style={{width: '38px', height: '38px', borderRadius: '19px', background: '#E7F1FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>F</span><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: 'var(--ink)'}}>Groww</span></div>
              <div style={{display: 'flex', alignItems: 'center', gap: '11px', background: 'var(--card)', borderRadius: '16px', padding: '12px 18px 12px 12px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span id="b2" style={{width: '38px', height: '38px', borderRadius: '19px', background: '#E9F7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>V</span><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: 'var(--ink)'}}>Vaultly</span></div>
              <div style={{display: 'flex', alignItems: 'center', gap: '11px', background: 'var(--card)', borderRadius: '16px', padding: '12px 18px 12px 12px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span id="b3" style={{width: '38px', height: '38px', borderRadius: '19px', background: '#F0EAFD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>P</span><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: 'var(--ink)'}}>Pebble</span></div>
              <div style={{display: 'flex', alignItems: 'center', gap: '11px', background: 'var(--card)', borderRadius: '16px', padding: '12px 18px 12px 12px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span id="b4" style={{width: '38px', height: '38px', borderRadius: '19px', background: '#FCF6E4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>S</span><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: 'var(--ink)'}}>Statuz</span></div>
            </div>
          </div>
        </section>

  
      </>)}
      {/* ============ TESTIMONIALS ============ */}
        <section id="creators" style={{padding: '0', marginTop: '0'}}>
          <div style={{position: 'relative', minHeight: '640px'}}>
            <img src="/creators/testimonials.webp" alt="Creator lifestyle photo, moody, editorial" style={{...{width: '100%', height: '80vh', minHeight: '640px', display: 'block', objectPosition: 'top'}, objectFit: 'cover'}} width={1536} height={1024} loading="lazy" decoding="async" />
            <div style={{position: 'absolute', left: '0', right: '0', top: '17%', textAlign: 'center', padding: '0 20px'}}>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(34px,3vw,46px)', margin: '0 auto', maxWidth: '45%', color: '#12151C'}}>Why creators are making the <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>switch</span></h2>
              <p style={{fontFamily: 'var(--font-ui)', fontSize: '16px', lineHeight: '1.5', color: '#12151C', maxWidth: '56ch', margin: '40px auto 0'}}>Real creators, real deals, real reasons to leave DMs behind. Hear directly from the people running their business on guapd every day.</p>
            </div>
            <div style={{position: 'absolute', left: '0', right: '0', bottom: '0', padding: '0 0 clamp(112px,12vw,148px)'}}>
            <div style={{position: 'relative'}}>
            <div className="creatorsTrack" style={{display: 'flex', gap: '52px', overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '0 clamp(24px,5vw,72px)'}}>
              <div className="card sr" style={{'--sr-delay': '0s', scrollSnapAlign: 'start', flex: '0 0 30%', minWidth: '280px', background: 'rgba(43,51,36,.72)', backdropFilter: 'blur(6px)', borderRadius: '20px', padding: '24px 28px', display: 'flex', flexDirection: 'column'}}>
                <span style={{color: 'var(--neon-deep)', fontSize: '12px', letterSpacing: '2px'}}>★★★★★</span>
                <h3 style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '20px', letterSpacing: '-0.02em', margin: '8px 0 0', color: '#fff'}}>Written terms, finally</h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '13px', lineHeight: '1.5', color: 'rgba(255,255,255,.72)', margin: '8px 0 0'}}>I have had brands forget what we agreed verbally three times in one campaign. Written terms would have saved all of it.</p>
                <div style={{marginTop: '16px', borderTop: '1px solid rgba(255,255,255,.16)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <span style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: '#fff'}}>Creator</span>
                  <span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'rgba(255,255,255,.6)'}}>@uvichar_</span>
                </div>
              </div>
              <div className="card sr" style={{'--sr-delay': '.06s', scrollSnapAlign: 'start', flex: '0 0 30%', minWidth: '280px', background: 'rgba(255,255,255,.78)', backdropFilter: 'blur(6px)', borderRadius: '20px', padding: '24px 28px', display: 'flex', flexDirection: 'column'}}>
                <span style={{color: 'var(--neon-deep)', fontSize: '12px', letterSpacing: '2px'}}>★★★★★</span>
                <h3 style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '20px', letterSpacing: '-0.02em', margin: '8px 0 0', color: 'var(--ink)'}}>No more chasing payment</h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '13px', lineHeight: '1.5', color: 'var(--ink-soft)', margin: '8px 0 0'}}>The worst part of brand deals is chasing payment. If I could see exactly where it is, I would sleep better.</p>
                <div style={{marginTop: '16px', borderTop: '1px solid var(--border-hairline)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <span style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>Creator</span>
                  <span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)'}}>@utkarsh_verma_</span>
                </div>
              </div>
              <div className="card sr" style={{'--sr-delay': '.12s', scrollSnapAlign: 'start', flex: '0 0 30%', minWidth: '280px', background: 'rgba(43,51,36,.72)', backdropFilter: 'blur(6px)', borderRadius: '20px', padding: '24px 28px', display: 'flex', flexDirection: 'column'}}>
                <span style={{color: 'var(--neon-deep)', fontSize: '12px', letterSpacing: '2px'}}>★★★★★</span>
                <h3 style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '20px', letterSpacing: '-0.02em', margin: '8px 0 0', color: '#fff'}}>An actual inbox for deals</h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '13px', lineHeight: '1.5', color: 'rgba(255,255,255,.72)', margin: '8px 0 0'}}>I miss offers because they get buried in DMs. An actual inbox for deals would change how I work.</p>
                <div style={{marginTop: '16px', borderTop: '1px solid rgba(255,255,255,.16)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <span style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: '#fff'}}>Creator</span>
                  <span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'rgba(255,255,255,.6)'}}>@uvichar_</span>
                </div>
              </div>
            </div>
            </div>
            </div>
          </div>
        </section>
    </div>
  )
}
