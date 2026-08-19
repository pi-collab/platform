'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import BookDemoModal from '@/components/BookDemoModal'

/**
 * The export sets CSS custom properties inline (--sr-delay, --oh-delay,
 * --sr-rot) to stagger each element's animation. React passes them through
 * correctly at runtime, but CSSProperties does not type them, so this widens
 * it once rather than casting at ~40 call sites.
 */
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined
  }
}

/**
 * The "For Brands" marketing page, ported from Chandreyee's design export.
 *
 * The markup keeps the export's inline styles rather than being re-authored as
 * utility classes. That is deliberate: the export IS the specification, and
 * every value in it — a 63.92% aspect padding, a clamp(26px,3vw,38px) — was
 * chosen in the design tool. Rewriting them by hand is where a "pixel-perfect"
 * port silently stops being pixel-perfect. The shared design tokens and the
 * animation classes live in app/brands-page.css, scoped to .brands-page.
 *
 * Two sections ship structurally complete but hidden: brand logos and
 * testimonials, whose content is not real yet. Flip the flags when it is.
 */

const SHOW_BRAND_LOGOS = false

/** Placeholder text that types itself into the deal builder when idle. */
const GHOST_LINES = [
  '1 Reel with a fashion brand, budget \u20B945K',
  '3 Stories with a fintech brand, live in 7 days',
  '1 YouTube Short, budget \u20B980K, live in 14 days',
]

export default function BrandsPageClient() {
  const router = useRouter()
  const [demoOpen, setDemoOpen] = useState(false)
  const openDemo = () => setDemoOpen(true)
  // The deal builder is a preview of brand signup, so its CTA goes there.
  const goToSignup = () => router.push('/signup/brand')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [ghost, setGhost] = useState('')
  const [typed, setTyped] = useState(false)

  /**
   * Reveal-on-scroll. Every .sr element starts at opacity 0 and only becomes
   * visible once .sr-in is added — so without this observer the entire page
   * renders blank. The export drove it from its own runtime, which is not
   * ported; this is the equivalent.
   *
   * Anything already on screen at mount is revealed immediately rather than
   * waiting for a scroll that may never come on a short viewport.
   */
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('.brands-page .sr, .brands-page .sr-fade, .brands-page .pv-reveal'))
    if (!els.length) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => el.classList.add('sr-in'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('sr-in')
            io.unobserve(e.target)
          }
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  /** Ghost placeholder cycles until the visitor types something of their own. */
  useEffect(() => {
    if (typed) { setGhost(''); return }
    let line = 0, char = 0, dir: 1 | -1 = 1
    const tick = () => {
      const text = GHOST_LINES[line]
      char += dir
      setGhost(text.slice(0, char))
      if (char >= text.length) { dir = -1; return void (timer = setTimeout(tick, 1600)) }
      if (char <= 0) { dir = 1; line = (line + 1) % GHOST_LINES.length }
      timer = setTimeout(tick, dir === 1 ? 45 : 22)
    }
    let timer = setTimeout(tick, 600)
    return () => clearTimeout(timer)
  }, [typed])

  function onType(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTyped(e.target.value.length > 0)
  }

  function fillFromChip(value: string) {
    setTyped(true)
    if (inputRef.current) {
      inputRef.current.value = value
      inputRef.current.focus()
    }
  }

  return (
    <div className="brands-page">
      {/* ============ HERO ============ */}
        {/* ============ GLASS PANEL SHOWCASE ============ */}
        <section style={{position: 'relative', width: '100vw', left: '50%', right: '50%', marginLeft: '-50vw', marginRight: '-50vw', marginTop: 'clamp(-96px,-8vw,-70px)', overflow: 'hidden', background: '#fff', zIndex: '0', paddingBottom: '40px'}}>
          <div style={{position: 'relative', overflow: 'hidden', paddingBottom: 'calc(63.92% - 60px)'}}>
            <img src="/brands/glass-panel.webp" alt="guapd campaign brief, creator, invoice and deliverable glass panel" style={{position: 'absolute', top: '0', left: '20px', width: '100%', height: 'auto', display: 'block', objectPosition: 'top', transform: 'scale(0.9)', transformOrigin: 'top center'}} width={2825} height={1806} decoding="async" />
            <div aria-hidden="true" style={{position: 'absolute', top: '0', bottom: '0', left: '0', width: '50%', background: 'linear-gradient(90deg,#fff 46%,rgba(255,255,255,0))', pointerEvents: 'none', zIndex: '1'}}></div>
            <div aria-hidden="true" style={{position: 'absolute', top: '0', bottom: '0', right: '0', width: '18%', background: 'linear-gradient(270deg,#fff 0%,#fff 30%,rgba(255,255,255,0) 100%)', pointerEvents: 'none', zIndex: '1'}}></div>
          </div>
          <div style={{position: 'absolute', zIndex: '2', left: 'calc(6% + 80px)', top: 'calc(50% - 30px)', transform: 'translateY(-50%)', width: 'min(36%,420px)', minWidth: '200px', textAlign: 'left'}}>
            <h1 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.02', fontSize: 'clamp(44px,3.2vw,56px)', margin: '0', color: '#12151C'}}>Everything your team needs, <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>in one place.</span></h1>
            <p style={{fontFamily: 'var(--font-ui)', fontSize: '16px', lineHeight: '1.55', color: '#565C68', margin: '22px 0 0'}}>Plan campaigns, collaborate with creators, approve content, automate payments, and track every deal — all in one shared space.</p>
            <button type="button" style={{marginTop: '28px', background: '#12151C', color: '#fff', border: 'none', borderRadius: '999px', padding: '12px 24px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '700', cursor: 'pointer'}} onClick={openDemo}>Book demo</button>
          </div>
        </section>

        <section id="top" style={{position: 'relative', overflow: 'visible', background: '#fff', padding: 'clamp(12px,1.5vw,20px) clamp(20px,5vw,72px) clamp(56px,6vw,88px)'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', background: '#fff', border: '1px solid var(--hairline)', borderRadius: '32px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(40px,5vw,64px)', overflow: 'visible'}}>
          <div aria-hidden="true" style={{position: 'absolute', left: '-10%', top: '-20%', width: '520px', height: '520px', borderRadius: '32px 0 0 32px', overflow: 'hidden', pointerEvents: 'none'}}><div style={{position: 'absolute', left: '0', top: '0', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,#E7F1FC 0%,rgba(231,241,252,0) 70%)'}}></div></div>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '64px', alignItems: 'center'}}>
            <div className="sr" style={{'--sr-delay': '0s', position: 'relative', zIndex: '1', marginLeft: '75px'}}>
              <span style={{display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: '600', letterSpacing: '.02em', lineHeight: '1', padding: '5px 10px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--frost-edge)', color: 'var(--ink-soft)', background: 'rgba(255,255,255,.78)', whiteSpace: 'nowrap'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#4F8DDB', flexShrink: '0'}}></span>AI-powered deal builder</span>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.02', fontSize: 'clamp(26px,3vw,38px)', margin: '12px 0 0', color: '#12151C'}}>Create your next <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>deal.</span></h2>
              <p style={{fontFamily: 'var(--font-ui)', fontSize: '14.5px', lineHeight: '1.5', color: '#565C68', maxWidth: '420px', margin: '16px 0 0'}}>Describe it once. We structure the brief, terms and timeline instantly — no agency, no back-and-forth.</p>

              <div style={{marginTop: '28px', marginBottom: '8px', position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '20px', border: '1px solid var(--hairline)', background: '#fff', boxShadow: 'inset 0 1px 3px rgba(24,28,36,.06),0 20px 44px -30px rgba(40,45,25,.3)', padding: '11px 11px 11px 18px', maxWidth: '560px'}}>
                <div style={{flex: '1', position: 'relative', display: 'flex', alignItems: 'center', minHeight: '28px'}}>
                  <textarea id="dealInput" rows={1} ref={inputRef} onChange={onType} style={{width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'var(--font-ui)', fontSize: '14.5px', lineHeight: '1.5', color: 'var(--ink)', position: 'relative', zIndex: '2', overflow: 'hidden', whiteSpace: 'nowrap'}}></textarea>
                  <div id="dealGhost" aria-hidden="true" style={{position: 'absolute', left: '0', top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--font-ui)', fontSize: '14.5px', lineHeight: '1.5', color: 'var(--ink-faint)', pointerEvents: 'none', zIndex: '1', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%'}}>{ghost}</div>
                </div>
                <div id="createDealBtn"><button type="button" style={{background: '#12151C', color: '#fff', border: 'none', borderRadius: '999px', padding: '11px 22px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap'}} onClick={goToSignup}>Create deal</button></div>
              </div>
              <div style={{display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap'}}>
                <button onClick={() => fillFromChip("1 Reel with a fashion brand, budget ₹45K")} style={{cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--ink-soft)', background: '#fff', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '6px 12px', whiteSpace: 'nowrap'}}>Reel · ₹45K</button>
                <button onClick={() => fillFromChip("3 Stories with a fintech brand, live in 7 days")} style={{cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--ink-soft)', background: '#fff', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '6px 12px', whiteSpace: 'nowrap'}}>Stories · 7 days</button>
                <button onClick={() => fillFromChip("1 YouTube Short, budget ₹80K, live in 14 days")} style={{cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--ink-soft)', background: '#fff', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '6px 12px', whiteSpace: 'nowrap'}}>YT Short · ₹80K</button>
              </div>
              <div id="pvHeroLine" className="sr-fade" style={{marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span style={{width: '5px', height: '5px', borderRadius: '50%', background: '#4F8DDB', flexShrink: '0'}}></span>
                <span className="t-meta-tight" style={{color: 'var(--ink-3)', whiteSpace: 'nowrap'}}>YOUR CAMPAIGN DATA IS VISIBLE TO YOU. NEVER TO ANOTHER BRAND.</span>
              </div>
            </div>

            <div className="sr" style={{'--sr-delay': '.12s', position: 'relative', minHeight: '460px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <div aria-hidden="true" className="card oh-float-r" style={{position: 'absolute', zIndex: '1', width: '88%', maxWidth: '420px', top: '6%', right: '-4%', borderRadius: '20px', background: '#F3F8FD', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', height: '120px'}}></div>
              <div className="card oh-deals-card" style={{position: 'relative', zIndex: '2', width: '100%', maxWidth: '560px', borderRadius: '22px', background: '#fff', border: '1px solid rgba(18,21,28,.1)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', overflow: 'hidden'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border-hairline)'}}><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px'}}>Draft briefs</span><span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)'}}><span className="oh-livedot" style={{width: '7px', height: '7px', borderRadius: '50%', background: '#4F8DDB'}}></span>3 ready to send</span></div>
                <div style={{padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                  <div className="oh-row" style={{'--oh-delay': '.05s', animationDelay: '.05s', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', background: '#FAFBFC'}}><div style={{width: '44px', height: '44px', borderRadius: '50%', background: '#E7F1FC', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>RM</div><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px'}}>Rohan Mehta</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>1 Reel · 14 days</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '500', fontSize: '16px'}}>₹45,000</div></div>
                  <div className="oh-row" style={{'--oh-delay': '.15s', animationDelay: '.15s', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', background: '#FAFBFC'}}><div style={{width: '44px', height: '44px', borderRadius: '50%', background: '#F0EAFD', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>AK</div><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px'}}>Anaya Kapoor</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>3 Stories · 7 days</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '500', fontSize: '16px'}}>₹22,000</div></div>
                  <div className="oh-row" style={{'--oh-delay': '.25s', animationDelay: '.25s', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', background: '#FAFBFC'}}><div style={{width: '44px', height: '44px', borderRadius: '50%', background: '#E9F7F0', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>VS</div><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px'}}>Vikram Shah</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>1 YT Short · 21 days</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '500', fontSize: '16px'}}>₹80,000</div></div>
                </div>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: '1px solid var(--border-hairline)', background: '#FAFBFC'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)'}}>Total pending</span><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: '#12151C'}}>₹1,47,000</span></div>
              </div>
            </div>
          </div>
          </div>
        </section>

        <section style={{position: 'relative', overflow: 'visible', background: '#fff', padding: '0 clamp(20px,5vw,72px) clamp(56px,6vw,88px)'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', background: '#fff', border: '1px solid var(--hairline)', borderRadius: '32px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(40px,5vw,64px)', overflow: 'visible'}}>
          <div aria-hidden="true" style={{position: 'absolute', right: '-10%', top: '-20%', width: '520px', height: '520px', borderRadius: '0 32px 32px 0', overflow: 'hidden', pointerEvents: 'none', zIndex: '0'}}><div style={{position: 'absolute', right: '0', top: '0', width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle,#E7F1FC 0%,rgba(231,241,252,0) 70%)'}}></div></div>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: '64px', alignItems: 'stretch'}}>
            <div className="sr" style={{'--sr-delay': '0s', position: 'relative', minHeight: '460px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '100px'}}>
              <div aria-hidden="true" className="card oh-float-l" style={{position: 'absolute', zIndex: '1', width: '88%', maxWidth: '420px', top: '8%', left: '-4%', borderRadius: '20px', background: '#F3F8FD', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', height: '110px'}}></div>
              <div className="card oh-deals-card" style={{position: 'relative', zIndex: '2', width: '100%', maxWidth: '560px', borderRadius: '22px', background: '#fff', border: '1px solid rgba(18,21,28,.1)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', overflow: 'hidden'}}>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border-hairline)'}}><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px'}}>Active campaigns</span><span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)'}}><span className="oh-livedot" style={{width: '7px', height: '7px', borderRadius: '50%', background: '#2FA877'}}></span>3 running</span></div>
                <div style={{padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                  <div className="oh-row" style={{animationDelay: '.05s', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', background: '#FAFBFC'}}><div style={{width: '44px', height: '44px', borderRadius: '12px', background: '#E9F7F0', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>SD</div><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px'}}>Summer drop</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>6 creators · live</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '500', fontSize: '16px'}}>₹2,10,000</div></div>
                  <div className="oh-row" style={{animationDelay: '.15s', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', background: '#FAFBFC'}}><div style={{width: '44px', height: '44px', borderRadius: '12px', background: '#F0EAFD', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>AL</div><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px'}}>App launch</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>4 creators · review</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '500', fontSize: '16px'}}>₹1,40,000</div></div>
                  <div className="oh-row" style={{animationDelay: '.25s', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', background: '#FAFBFC'}}><div style={{width: '44px', height: '44px', borderRadius: '12px', background: '#FCF6E4', flexShrink: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--ink)'}}>FT</div><div style={{flex: '1'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px'}}>Festive teaser</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>5 creators · live</div></div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '500', fontSize: '16px'}}>₹1,00,000</div></div>
                </div>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: '1px solid var(--border-hairline)', background: '#FAFBFC'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--ink-faint)'}}>Total in motion</span><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: '#12151C'}}>₹4,50,000</span></div>
              </div>
            </div>

            <div className="sr" style={{'--sr-delay': '.12s', position: 'relative', zIndex: '1', marginLeft: '80px', marginTop: '32px'}}>
              <span style={{display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: '600', letterSpacing: '.02em', lineHeight: '1', padding: '5px 10px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--frost-edge)', color: 'var(--ink-soft)', background: 'rgba(255,255,255,.78)', whiteSpace: 'nowrap'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#4F8DDB', flexShrink: '0'}}></span>Live campaign tracking</span>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.02', fontSize: 'clamp(26px,3vw,38px)', margin: '12px 0 0', color: '#12151C'}}>Every campaign, <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>on track.</span></h2>
              <p style={{fontFamily: 'var(--font-ui)', fontSize: '14.5px', lineHeight: '1.5', color: '#565C68', maxWidth: '420px', margin: '16px 0 0'}}>See every creator, deliverable and payment status across all your live campaigns — no spreadsheets, no status meetings.</p>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '18px', marginTop: 'clamp(32px,4vw,48px)', maxWidth: '420px'}}>
                <div style={{padding: '26px 24px', border: '1px solid rgba(18,21,28,.1)', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div style={{fontFamily: 'var(--font-display)', fontWeight: '600', fontSize: 'clamp(26px,2.4vw,32px)', letterSpacing: '-0.02em', color: '#12151C'}}>1</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '13px', color: '#565C68', marginTop: '5px'}}>Dashboard for everything</div></div>
                <div style={{padding: '26px 24px', border: '1px solid rgba(18,21,28,.1)', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div style={{fontFamily: 'var(--font-display)', fontWeight: '600', fontSize: 'clamp(26px,2.4vw,32px)', letterSpacing: '-0.02em', color: '#12151C'}}>Live</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '13px', color: '#565C68', marginTop: '5px'}}>Delivery status</div></div>
              </div>
            </div>
          </div>
          </div>
        </section>

  
  




        {/* ============ VALUE TICKER ============ */}
        <section style={{padding: '0', background: '#fff'}}>
          <div style={{position: 'relative', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)', maskImage: 'linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)'}}>
            <div style={{display: 'flex', width: 'max-content', gap: '0', animation: 'mqMove 32s linear infinite'}}>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>razorpay payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>one-tap re-engage</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}} aria-hidden="true">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>razorpay payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>one-tap re-engage</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
      
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>razorpay payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>one-tap re-engage</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}} aria-hidden="true">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>razorpay payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>one-tap re-engage</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
      
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>razorpay payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>one-tap re-engage</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}} aria-hidden="true">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>razorpay payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>one-tap re-engage</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
      
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>razorpay payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>one-tap re-engage</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
              <div style={{display: 'flex', gap: '12px', paddingRight: '12px'}} aria-hidden="true">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#7FA8E8'}}></span>locked terms</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#8FD4A8'}}></span>razorpay payouts</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E8B36B'}}></span>full paper trail</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#C9A0E0'}}></span>one-tap re-engage</span>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', background: 'var(--card)', border: '1.2px solid var(--hairline)', borderRadius: 'var(--radius-pill)', padding: '10px 16px', whiteSpace: 'nowrap', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#E88F8F'}}></span>no whatsapp</span>
              </div>
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS (Offers / Negotiation / Payments) ============ */}
        <section style={{padding: '0', background: '#fff'}}>
          <div style={{position: 'relative', width: '100vw', left: '50%', right: '50%', marginLeft: '-50vw', marginRight: '-50vw', overflow: 'hidden', background: '#fff', paddingTop: 'clamp(320px,40vh,480px)'}}>
            <div style={{position: 'absolute', top: '0', left: '0', right: '0', height: 'clamp(320px,40vh,480px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '0px', transform: 'translateY(50px)', textAlign: 'center', pointerEvents: 'none', zIndex: '2'}}>
              <div style={{maxWidth: '900px'}}>
                <h2 className="hero-fade" style={{margin: '0', color: '#12151C', fontSize: 'clamp(44px,3.2vw,56px)', fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.06', '--sr-delay': '0s'}}>The operating system<br />for <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>creator collabs.</span></h2>
                <p className="t-body hero-fade" style={{color: '#565C68', margin: '16px 0 0', '--sr-delay': '0.12s'}}>One place for creators, approvals, deliverables, contracts and payments.</p>
                <button type="button" className="t-content hero-fade" style={{pointerEvents: 'auto', marginTop: '24px', background: '#12151C', color: '#fff', border: 'none', borderRadius: '999px', padding: '14px 36px', minHeight: '48px', cursor: 'pointer', transition: 'transform .2s cubic-bezier(.16,1,.3,1)', '--sr-delay': '0.22s'}} onClick={openDemo}>Book a demo</button>
              </div>
            </div>
            <img src="/brands/showcase-a.webp" alt="Glass panels showing campaign brief, creators, approvals, deliverables and payments" style={{display: 'block', width: '84%', height: 'auto', margin: '0 auto', aspectRatio: '1672/941', objectFit: 'cover'}} loading="lazy" decoding="async" />
            <div aria-hidden="true" style={{position: 'absolute', top: 'clamp(320px,40vh,480px)', left: '0', right: '0', height: '34%', background: 'linear-gradient(to bottom,#FFFFFF 0%,rgba(255,255,255,0.85) 20%,rgba(255,255,255,0.5) 45%,rgba(255,255,255,0.18) 70%,rgba(255,255,255,0) 100%)', pointerEvents: 'none'}}></div>
            <div aria-hidden="true" style={{position: 'absolute', top: '0', bottom: '0', left: '0', width: '16%', background: 'linear-gradient(to right,#FFFFFF 0%,#FFFFFF 50%,rgba(255,255,255,0) 100%)', pointerEvents: 'none'}}></div>
            <div aria-hidden="true" style={{position: 'absolute', top: '0', bottom: '0', right: '0', width: '16%', background: 'linear-gradient(to left,#FFFFFF 0%,#FFFFFF 50%,rgba(255,255,255,0) 100%)', pointerEvents: 'none'}}></div>
          </div>
        </section>


        {/* ============ BRAND STATEMENT — GUAP + RIBBON ============ */}
        {/* ============ CONTENT SHOWCASE ============ */}

        <section id="how" style={{padding: 'clamp(56px,6vw,88px) clamp(14px,4vw,28px) clamp(56px,6vw,88px)', background: '#fff'}}>
          <div id="brands" style={{maxWidth: '1200px', margin: '0 auto', background: '#fff', border: '1px solid var(--hairline)', borderRadius: '36px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(44px,5.5vw,72px) clamp(24px,4vw,48px)'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', textAlign: 'center'}}>
            <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,48px)', margin: '0', color: 'var(--ink)'}}>How it <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>works</span></h2>
          </div>

          <div style={{maxWidth: '1200px', margin: 'clamp(20px,2.5vw,32px) auto 0', display: 'flex', flexDirection: 'column', gap: 'clamp(32px,4vw,52px)'}}>

            {/* 01 Offers */}
            <div className="sr" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))', gap: 'clamp(28px,4vw,60px)', alignItems: 'center', background: 'linear-gradient(135deg,#EFFAF5 0%,#fff 60%)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', borderRadius: '28px', padding: 'clamp(28px,4vw,56px)'}}>
              <div>
                <div style={{display: 'inline-flex', alignItems: 'center', gap: '9px', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '5px 14px 5px 5px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--neon)', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '11px', color: 'var(--ink)'}}>01</span><span className="t-meta" style={{color: 'var(--ink-soft)'}}>Offers</span></div>
                <h3 className="t-title" style={{margin: '14px 0 0'}}>A structured brief in <span className="t-accent">minutes</span></h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '15px', lineHeight: '1.55', color: 'var(--ink-soft)', maxWidth: '360px', margin: '16px 0 0'}}>Deliverables, budget, timeline, rights and payment — all agreed before work starts.</p>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '22px'}}>
                  <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '7px 13px'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>Agreed upfront</span>
                  <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '7px 13px'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>In writing</span>
                </div>
              </div>
              <div className="sr sr-rot" style={{'--sr-delay': '.15s', '--sr-rot': '-2deg', display: 'flex', justifyContent: 'center'}}>
                <div className="lift" style={{width: 'min(400px,100%)'}}>
                  <div className="fgcard">
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>New brief</span><span style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '10.5px', color: 'var(--ink-faint)'}}><span style={{width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-deep)', animation: 'dotPulse 2s ease-in-out infinite'}}></span>Draft</span></div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0 16px'}}><div style={{width: '44px', height: '44px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 4-6 8-6s8 2 8 6"></path></svg></div><div><div style={{fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '15px'}}>Rohan Mehta</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px'}}>Finance · 180K · 94% match</div></div></div>
                    <div style={{display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid var(--border-hairline)', fontSize: '13.5px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>deliverable</span><span style={{fontWeight: '600'}}>1 Instagram Reel</span></div>
                    <div style={{display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid var(--border-hairline)', fontSize: '13.5px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>amount</span><span style={{fontFamily: 'var(--font-ui)'}}>₹45,000</span></div>
                    <div style={{display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid var(--border-hairline)', fontSize: '13.5px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>timeline</span><span style={{fontWeight: '600'}}>14 days · 2 revisions</span></div>
                    <div style={{padding: '11px 0 16px', borderTop: '1px solid var(--border-hairline)'}}><div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginBottom: '8px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>payment</span><span style={{fontWeight: '600'}}>50% upfront · 50% on approval</span></div><div style={{display: 'flex', height: '7px', borderRadius: 'var(--radius-pill)', overflow: 'hidden', background: 'rgba(24,28,36,.07)'}}><div style={{width: '50%', background: 'var(--neon-deep)'}}></div><div style={{width: '50%', background: 'rgba(24,28,36,.14)', borderLeft: '2px solid var(--card)'}}></div></div></div>
                    <button type="button" style={{width: '100%', background: '#12151C', color: '#fff', border: 'none', borderRadius: 'var(--radius-pill)', padding: '9px 16px', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', minHeight: '40px', cursor: 'pointer'}}>Send offer</button>
                  </div>
                </div>
              </div>
            </div>

            {/* 02 Negotiation */}
            <div className="sr" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))', gap: 'clamp(28px,4vw,60px)', alignItems: 'center', background: 'linear-gradient(135deg,#EFF6FD 0%,#fff 60%)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', borderRadius: '28px', padding: 'clamp(28px,4vw,56px)'}}>
              <div style={{order: '1'}}>
                <div className="lift" style={{width: 'min(400px,100%)', margin: '0 auto'}}>
                  <div className="fgcard">
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>Negotiation</span><span style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'var(--font-ui)', fontSize: '10.5px', color: 'var(--ink-faint)'}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>secured</span></div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '9px'}}>
                      <div style={{alignSelf: 'flex-end', maxWidth: '80%', background: 'rgba(245,248,252,.95)', border: '1px solid var(--border-hairline)', borderRadius: '16px 16px 5px 16px', padding: '10px 13px', fontFamily: 'var(--font-ui)', fontSize: '13px'}}>Offer · <span style={{fontFamily: 'var(--font-ui)'}}>₹45,000</span></div>
                      <div style={{alignSelf: 'flex-start', maxWidth: '80%', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: '16px 16px 16px 5px', padding: '10px 13px', fontFamily: 'var(--font-ui)', fontSize: '13px'}}>Counter · <span style={{fontFamily: 'var(--font-ui)'}}>₹50,000</span></div>
                      <div style={{alignSelf: 'flex-end', maxWidth: '80%', background: 'rgba(245,248,252,.95)', border: '1px solid var(--border-hairline)', borderRadius: '16px 16px 5px 16px', padding: '10px 13px', fontFamily: 'var(--font-ui)', fontSize: '13px'}}><span style={{fontFamily: 'var(--font-ui)'}}>₹48,000</span> final</div>
                      <div style={{alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: '16px', padding: '11px 14px'}}><span style={{width: '5px', height: '5px', borderRadius: '50%', background: 'var(--ink-faint)', animation: 'typingDot 1.2s ease-in-out infinite'}}></span><span style={{width: '5px', height: '5px', borderRadius: '50%', background: 'var(--ink-faint)', animation: 'typingDot 1.2s ease-in-out .15s infinite'}}></span><span style={{width: '5px', height: '5px', borderRadius: '50%', background: 'var(--ink-faint)', animation: 'typingDot 1.2s ease-in-out .3s infinite'}}></span></div>
                      <div style={{alignSelf: 'center', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '7px', background: '#12151C', color: '#fff', borderRadius: 'var(--radius-pill)', padding: '8px 14px', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '12px', boxShadow: '0 12px 26px -14px rgba(18,21,28,.5)'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>Locked · <span style={{fontFamily: 'var(--font-ui)', fontWeight: '500'}}>₹48,000</span> · 14:32</div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{order: '2'}}>
                <div style={{display: 'inline-flex', alignItems: 'center', gap: '9px', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '5px 14px 5px 5px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--neon)', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '11px', color: 'var(--ink)'}}>02</span><span className="t-meta" style={{color: 'var(--ink-soft)'}}>Negotiation</span></div>
                <h3 className="t-title" style={{margin: '14px 0 0'}}>Agree on terms, on the <span className="t-accent">record</span></h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '15px', lineHeight: '1.55', color: 'var(--ink-soft)', maxWidth: '360px', margin: '16px 0 0'}}>Every offer and counter is timestamped and locked. No disputes, no screenshots.</p>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '22px'}}>
                  <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '7px 13px'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>Timestamped</span>
                  <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '7px 13px'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>Auditable</span>
                </div>
              </div>
            </div>

            {/* 03 Payments */}
            <div className="sr" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))', gap: 'clamp(28px,4vw,60px)', alignItems: 'center', background: 'linear-gradient(135deg,#F5F0FD 0%,#fff 60%)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', borderRadius: '28px', padding: 'clamp(28px,4vw,56px)'}}>
              <div>
                <div style={{display: 'inline-flex', alignItems: 'center', gap: '9px', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '5px 14px 5px 5px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--neon)', fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '11px', color: 'var(--ink)'}}>03</span><span className="t-meta" style={{color: 'var(--ink-soft)'}}>Analytics</span></div>
                <h3 className="t-title" style={{margin: '14px 0 0'}}>See what's <span className="t-accent">working</span></h3>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '15px', lineHeight: '1.55', color: 'var(--ink-soft)', maxWidth: '360px', margin: '16px 0 0'}}>Reach, engagement and spend across every creator — rolled up into one dashboard.</p>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '22px'}}>
                  <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '7px 13px'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>Live reach</span>
                  <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: 'var(--radius-pill)', padding: '7px 13px'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>Cost per view</span>
                </div>
              </div>
              <div className="sr sr-rot" style={{'--sr-delay': '.15s', '--sr-rot': '-2deg', display: 'flex', justifyContent: 'center'}}>
                <div className="lift" style={{width: 'min(400px,100%)'}}>
                  <div className="fgcard">
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)'}}>Campaign analytics</span><span style={{fontFamily: 'var(--font-ui)', fontSize: '12px'}}>Summer drop</span></div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px'}}>
                        <div style={{background: 'var(--card)', border: '1px solid var(--border-hairline)', borderRadius: '14px', padding: '12px'}}><div style={{fontFamily: 'var(--font-ui)', fontSize: '10.5px', color: 'var(--ink-faint)'}}>Reach</div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '18px', marginTop: '4px'}}>2.4M</div></div>
                        <div style={{background: 'var(--card)', border: '1px solid var(--border-hairline)', borderRadius: '14px', padding: '12px'}}><div style={{fontFamily: 'var(--font-ui)', fontSize: '10.5px', color: 'var(--ink-faint)'}}>Engagement</div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '18px', marginTop: '4px'}}>6.8%</div></div>
                        <div style={{background: 'var(--card)', border: '1px solid var(--border-hairline)', borderRadius: '14px', padding: '12px'}}><div style={{fontFamily: 'var(--font-ui)', fontSize: '10.5px', color: 'var(--ink-faint)'}}>CPV</div><div style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '18px', marginTop: '4px'}}>₹0.32</div></div>
                      </div>
                      <div>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--ink-faint)', marginBottom: '6px'}}><span>Top creators by reach</span></div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                          <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', width: '64px', flexShrink: '0'}}>@meera.k</span><span style={{flex: '1', maxWidth: '150px', height: '6px', borderRadius: '4px', background: 'var(--border-hairline)', overflow: 'hidden'}}><span style={{display: 'block', height: '100%', width: '88%', borderRadius: '4px', background: '#12151C'}}></span></span><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', width: '30px', textAlign: 'right', flexShrink: '0'}}>88%</span></div>
                          <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', width: '64px', flexShrink: '0'}}>@arjun.fit</span><span style={{flex: '1', maxWidth: '150px', height: '6px', borderRadius: '4px', background: 'var(--border-hairline)', overflow: 'hidden'}}><span style={{display: 'block', height: '100%', width: '64%', borderRadius: '4px', background: '#12151C'}}></span></span><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', width: '30px', textAlign: 'right', flexShrink: '0'}}>64%</span></div>
                          <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', width: '64px', flexShrink: '0'}}>@nina.style</span><span style={{flex: '1', maxWidth: '150px', height: '6px', borderRadius: '4px', background: 'var(--border-hairline)', overflow: 'hidden'}}><span style={{display: 'block', height: '100%', width: '41%', borderRadius: '4px', background: '#12151C'}}></span></span><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', width: '30px', textAlign: 'right', flexShrink: '0'}}>41%</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
          </div>
        </section>
        {/* ============ CAMPAIGN WORKFLOW SHOWCASE ============ */}
        <section style={{position: 'relative', width: '100vw', left: '50%', right: '50%', marginLeft: '-50vw', marginRight: '-50vw', height: 'auto', overflow: 'hidden', background: '#FFFFFF', paddingTop: 'clamp(56px,6vw,88px)'}}>
          <div className="ws-grid">
            <div className="ws-imgwrap"><img src="/brands/brand-team.webp" alt="Brand team photo" style={{...{width: '100%', height: '100%'}, objectFit: 'cover'}} width={1402} height={1122} loading="lazy" decoding="async" /></div>
            <div className="ws-right">
              <div className="ws-content">
                <div className="t-meta" style={{color: '#878D99', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase'}}>Why brands switch</div>
                <h2 className="ws-headline" style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.02', fontSize: 'clamp(26px,3vw,38px)'}}>
                  <span style={{color: '#12151C'}}>All the reach of an agency. None of the <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>retainer</span></span>
                </h2>
                <div className="ws-table">
                  <div className="ws-cell ws-cell-head ws-label ws-meta" style={{color: '#878D99', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase'}}>What you get</div>
                  <div className="ws-cell ws-cell-head ws-mark ws-meta" style={{color: '#878D99', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', textAlign: 'center'}}>Guapd</div>
                  <div className="ws-cell ws-cell-head ws-mark ws-meta" style={{color: '#878D99', fontFamily: 'var(--font-ui)', fontSize: '9.5px', fontWeight: '500', letterSpacing: '.14em', textTransform: 'uppercase', textAlign: 'center'}}>Agency</div>

                  <div className="ws-cell ws-cell-body ws-label t-subhead">Talk to the creator, not a middleman</div>
                  <div className="ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-cell ws-cell-body ws-label t-subhead">Terms in writing, agreed by both sides</div>
                  <div className="ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>

                  <div className="ws-cell ws-cell-body ws-label t-subhead">No middleman knows what you pay</div>
                  <div className="ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-cell ws-cell-body ws-label t-subhead">Brief to payout in one place</div>
                  <div className="ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-cell ws-cell-body ws-label t-subhead">Every approval timestamped, not remembered</div>
                  <div className="ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-cell ws-cell-body ws-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="1.75" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></div>

                  <div className="ws-cell ws-cell-body ws-label t-subhead">Manage multiple deals at once</div>
                  <div className="ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                  <div className="ws-cell ws-cell-body ws-mark"><span className="ws-yes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FEATURE GRID ============ */}
        <section style={{padding: 'clamp(56px,6vw,88px) clamp(14px,4vw,28px) clamp(56px,6vw,88px)', background: '#fff'}}>
          <div style={{position: 'relative', maxWidth: '1200px', margin: '0 auto', borderRadius: 'clamp(24px,2.6vw,38px)', overflow: 'hidden', background: '#FFFFFF', border: '1px solid var(--hairline)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16),0 6px 18px -10px rgba(40,45,25,.12)'}}>
            <div style={{position: 'relative', zIndex: '2', padding: 'clamp(40px,5vw,76px) clamp(22px,4.4vw,64px)'}}>
              <div className="t-meta" style={{color: 'var(--ink-faint)'}}>Everything in one deal</div>
              <h2 className="t-title" style={{margin: '14px 0 0', maxWidth: '620px', whiteSpace: 'nowrap'}}>No more WhatsApp, DMs and <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>spreadsheets</span></h2>
              <div style={{marginTop: 'clamp(32px,4vw,52px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: '18px'}}>
                <div className="lift sr" style={{'--sr-delay': '0s'}}><div className="fgcard"><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '17px', background: '#F2FAF6', border: '1px solid var(--hairline)', marginBottom: '14px'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#565C68" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"></path><path d="M5 21V5a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"></path><path d="M9 13h6"></path><path d="M9 17h4"></path></svg></span><h3 className="t-subhead" style={{margin: '0'}}>Structured briefs</h3><p style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.55', color: 'var(--ink-soft)', margin: '8px 0 0'}}>No scope argument three weeks in.</p></div></div>
                <div className="lift sr" style={{'--sr-delay': '.06s'}}><div className="fgcard"><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '17px', background: '#F0F6FD', border: '1px solid var(--hairline)', marginBottom: '14px'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#565C68" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"></path><path d="M5 21V5a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"></path><path d="m9 15 2 2 4-4"></path></svg></span><h3 className="t-subhead" style={{margin: '0'}}>Agreed terms on record</h3><p style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.55', color: 'var(--ink-soft)', margin: '8px 0 0'}}>Neither side can quietly move them.</p></div></div>
                <div className="lift sr" style={{'--sr-delay': '.12s'}}><div className="fgcard"><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '17px', background: '#F6F1FC', border: '1px solid var(--hairline)', marginBottom: '14px'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#565C68" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg></span><h3 className="t-subhead" style={{margin: '0'}}>Deliverable review</h3><p style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.55', color: 'var(--ink-soft)', margin: '8px 0 0'}}>Revisions counted against the limit you set.</p></div></div>
                <div className="lift sr" style={{'--sr-delay': '.18s'}}><div className="fgcard"><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '17px', background: '#FDF9EE', border: '1px solid var(--hairline)', marginBottom: '14px'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#565C68" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg></span><h3 className="t-subhead" style={{margin: '0'}}>Payment tracking</h3><p style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.55', color: 'var(--ink-soft)', margin: '8px 0 0'}}>Nobody has to ask where the money is.</p></div></div>
                <div className="lift sr" style={{'--sr-delay': '.24s'}}><div className="fgcard"><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '17px', background: '#FCF2F2', border: '1px solid var(--hairline)', marginBottom: '14px'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#565C68" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg></span><h3 className="t-subhead" style={{margin: '0'}}>One-tap re-engagement</h3><p style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.55', color: 'var(--ink-soft)', margin: '8px 0 0'}}>Previous terms pre-filled, nothing renegotiated.</p></div></div>
                <div className="lift sr" style={{'--sr-delay': '.3s'}}><div className="fgcard"><span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '17px', background: '#E9F7F0', border: '1px solid var(--hairline)', marginBottom: '14px'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#565C68" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg></span><h3 className="t-subhead" style={{margin: '0'}}>Full deal timeline</h3><p style={{fontFamily: 'var(--font-ui)', fontSize: '13.5px', lineHeight: '1.55', color: 'var(--ink-soft)', margin: '8px 0 0'}}>One chronological record.</p></div></div>
              </div>
            </div>
          </div>
        </section>
        {/* ============ BRAND SIDE SHOWCASE ============ */}
        <section style={{position: 'relative', padding: '0 clamp(14px,4vw,28px) clamp(56px,6vw,88px)', background: '#fff'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', position: 'relative', borderRadius: '40px', overflow: 'hidden', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}>
            <img src="/brands/showcase-b.webp" alt="Brand dashboard cards — active campaigns, applicants, contracts, payouts" style={{...{width: '100%', aspectRatio: '1672/941', display: 'block'}, objectFit: 'cover'}} loading="lazy" decoding="async" />
            <div style={{position: 'absolute', left: '0', right: '0', top: '0', padding: 'clamp(22px,3vw,36px) clamp(28px,4vw,48px) clamp(14px,2.2vw,28px)', textAlign: 'center'}}>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(44px,3.2vw,56px)', margin: '10px auto 0', maxWidth: '480px', color: '#12151C'}}>Every campaign,<br /><span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>in one place.</span></h2>
            </div>
          </div>
        </section>

        {/* ============ YOUR DATA (privacy statement) ============ */}
        <section id="privacySec" style={{padding: '0 clamp(14px,4vw,28px) clamp(56px,6vw,88px) clamp(14px,4vw,28px)', background: '#fff'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', background: '#fff', border: '1px solid var(--hairline)', borderRadius: 'clamp(24px,2.6vw,38px)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(40px,5vw,76px) clamp(22px,4.4vw,64px)'}}>
            <div style={{textAlign: 'left', maxWidth: '760px'}}>
              <div id="pvEyebrow" className="t-meta pv-reveal" style={{color: 'var(--ink-3)', transition: 'opacity .22s ease,transform .22s cubic-bezier(.16,1,.3,1)'}}>YOUR DATA</div>
              <h2 id="pvHead" className="t-title pv-reveal" style={{margin: '16px 0 0', color: 'var(--ink)', fontSize: 'clamp(28px,3.4vw,38px)', transition: 'opacity .32s cubic-bezier(.16,1,.3,1),transform .32s cubic-bezier(.16,1,.3,1)'}}>As private as your <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>spreadsheet.</span></h2>
              <p id="pvBody" className="t-body pv-reveal" style={{color: 'var(--ink-2)', margin: '16px 0 0', transition: 'opacity .28s ease,transform .28s cubic-bezier(.16,1,.3,1)'}}>Your creator list, your rates, your spend and your strategy stay yours. No other brand on guapd can see any of it.</p>
            </div>
            <div style={{background: '#fff', border: '1px solid var(--hairline)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', borderRadius: '20px', padding: '8px 32px', marginTop: '40px'}}>
              <div className="pv-row pv-hover pv-reveal" style={{display: 'flex', gap: '18px', alignItems: 'center', padding: '22px 0', borderBottom: '1px solid var(--hairline)', transition: 'opacity .4s ease,transform .4s cubic-bezier(.16,1,.3,1)'}}>
                <span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '22px', color: 'var(--ink-3)'}}>01</span>
                <div style={{flex: '1'}}><div className="t-content" style={{color: 'var(--ink)', marginBottom: '4px'}}>Your campaign data</div><div className="t-body" style={{color: 'var(--ink-2)'}}>Visible to your team only</div></div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" style={{padding: '12px', borderRadius: '12px', background: '#E9F7F0', boxSizing: 'content-box'}}><path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </div>
              <div className="pv-row pv-hover pv-reveal" style={{display: 'flex', gap: '18px', alignItems: 'center', padding: '22px 0', borderBottom: '1px solid var(--hairline)', transition: 'opacity .4s ease,transform .4s cubic-bezier(.16,1,.3,1)'}}>
                <span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '22px', color: 'var(--ink-3)'}}>02</span>
                <div style={{flex: '1'}}><div className="t-content" style={{color: 'var(--ink)', marginBottom: '4px'}}>Your competition</div><div className="t-body" style={{color: 'var(--ink-2)'}}>Shut out completely</div></div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" style={{padding: '12px', borderRadius: '12px', background: '#F0EAFD', boxSizing: 'content-box'}}><circle cx="12" cy="12" r="9.5"></circle><line x1="5.4" y1="18.6" x2="18.6" y2="5.4"></line></svg>
              </div>
              <div className="pv-row pv-hover pv-reveal" style={{display: 'flex', gap: '18px', alignItems: 'center', padding: '22px 0', transition: 'opacity .4s ease,transform .4s cubic-bezier(.16,1,.3,1)'}}>
                <span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '22px', color: 'var(--ink-3)'}}>03</span>
                <div style={{flex: '1'}}><div className="t-content" style={{color: 'var(--ink)', marginBottom: '4px'}}>Your rates and spend</div><div className="t-body" style={{color: 'var(--ink-2)'}}>Never shown to another brand</div></div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" style={{padding: '12px', borderRadius: '12px', background: '#FCF6E4', boxSizing: 'content-box'}}><rect x="5" y="10.5" width="14" height="10" rx="2.4"></rect><path d="M8 10.5V7.2A4 4 0 0 1 16 7.2"></path></svg>
              </div>
            </div>
          </div>
        </section>

        {/* ============ RUN DEALS DIRECTLY ============
            The export carries three testimonial cards under this heading. They
            are not here, and will not be until the quotes are real — invented
            praise from invented brands is not something to put on a page that
            asks people to trust us with their money.

            With the cards gone the heading is centred in the frame rather than
            sitting at the export's 17%, where it read as stranded above empty
            space. The second sentence of the export's standfirst ("Hear
            directly from the people running campaigns on guapd every day")
            went with the cards: it points at testimonials that are not below
            it. */}
        <section id="creators" style={{padding: '0', marginTop: '0'}}>
          <div style={{position: 'relative', minHeight: '640px'}}>
            <img
              id="brandsWhySwitchImg"
              src="/brands/showcase-c.webp"
              alt=""
              style={{width: '100%', height: '80vh', minHeight: '640px', display: 'block', objectFit: 'cover', objectPosition: 'top', opacity: 0.5}}
              decoding="async"
              loading="lazy"
            />
            <div className="sr" style={{position: 'absolute', left: '0', right: '0', top: '50%', transform: 'translateY(-50%)', textAlign: 'center', padding: '0 20px'}}>
              {/* 700, not the export's 800: Schibsted Grotesk is embedded at
                  400/500/600/700 only, so 800 renders as 700 anyway and asking
                  for it just makes this heading disagree with its neighbours. */}
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(34px,3vw,46px)', margin: '0 auto', maxWidth: '45%', color: '#12151C'}}>
                Run deals directly. Stay <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400}}>calm.</span>
              </h2>
              <p style={{fontFamily: 'var(--font-ui)', fontSize: '16px', lineHeight: '1.5', color: '#12151C', maxWidth: '56ch', margin: '40px auto 0'}}>
                Real brand teams, real deals, real reasons to skip the agency.
              </p>
            </div>
          </div>
        </section>


        {SHOW_BRAND_LOGOS && (<>
      {/* ============ BRANDS WE WORK WITH ============ */}
        <section style={{padding: '0 clamp(20px,5vw,72px) clamp(56px,6vw,88px)', background: '#fff'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', border: '1.2px solid var(--hairline)', borderRadius: '24px', background: 'var(--card)', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)', padding: 'clamp(32px,4.5vw,56px) clamp(20px,4vw,48px)', textAlign: 'center'}}>
            <span className="t-meta" style={{display: 'inline-block', color: 'var(--ink-faint)'}}>Brands we work with</span>
            <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '700', letterSpacing: '-0.035em', lineHeight: '1.04', fontSize: 'clamp(28px,3.8vw,48px)', margin: '10px 0 clamp(24px,3.2vw,34px)', color: 'var(--ink)'}}>Brands you already know</h2>
            <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '26px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '11px', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: '16px', padding: '12px 18px 12px 12px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div style={{width: '38px', height: '38px', flexShrink: '0', borderRadius: '50%', border: '1px solid var(--hairline)', background: '#EEF2F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: 'var(--ink)'}}>NP</div><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: 'var(--ink)'}}>Novapay</span></div>
              <div style={{display: 'flex', alignItems: 'center', gap: '11px', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: '16px', padding: '12px 18px 12px 12px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div style={{width: '38px', height: '38px', flexShrink: '0', borderRadius: '50%', border: '1px solid var(--hairline)', background: '#F1EFF5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: 'var(--ink)'}}>BM</div><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: 'var(--ink)'}}>Bluemint</span></div>
              <div style={{display: 'flex', alignItems: 'center', gap: '11px', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: '16px', padding: '12px 18px 12px 12px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div style={{width: '38px', height: '38px', flexShrink: '0', borderRadius: '50%', border: '1px solid var(--hairline)', background: '#EFF4F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: 'var(--ink)'}}>CF</div><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: 'var(--ink)'}}>Cliqfin</span></div>
              <div style={{display: 'flex', alignItems: 'center', gap: '11px', background: 'var(--card)', border: '1px solid var(--frost-edge)', borderRadius: '16px', padding: '12px 18px 12px 12px', boxShadow: '0 20px 44px -28px rgba(40,45,25,.16)'}}><div style={{width: '38px', height: '38px', flexShrink: '0', borderRadius: '50%', border: '1px solid var(--hairline)', background: '#F7F5EC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: 'var(--ink)'}}>LW</div><span style={{fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '16px', color: 'var(--ink)'}}>Loopwear</span></div>
            </div>
          </div>
        </section>


  
      </>)}
    </div>
  )
}
