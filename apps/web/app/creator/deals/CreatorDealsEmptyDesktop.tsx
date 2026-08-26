import './deals-empty-desktop.css'

/**
 * Creator deals, empty state, DESKTOP.
 *
 * Transcribed from the desktop export by
 * scripts/creator-deals-desktop-from-export.py. Sibling of CreatorDealsEmpty,
 * which is the phone transcription; that one is not a smaller version of this,
 * it is a different drawing, and neither scales into the other.
 *
 * ── What is kept, and what is not ───────────────────────────────────────────
 * The export's outer page div and its sticky <header> are dropped. The creator
 * layout already supplies a page background and the top nav; keeping them put a
 * second background inside the first and a dead 16px bar under the real one.
 *
 * The search field, sort control and seven filter chips ARE kept, unlike the
 * phone version which drops them. They are inert by design -- the export ships
 * them disabled -- and on a phone seven chips reading 0 crowded out the message.
 * At this width they read as the shape of the screen a creator is about to
 * have, which is the point of drawing them at all.
 *
 * All CSS is scoped under .cdeals-desk. The export ships `*`, `body`, bare `a`
 * and ten :root blocks; unscoped, they restyle the entire site.
 */
export default function CreatorDealsEmptyDesktop() {
  return (
    <div className="cdeals-desk">
      <main style={{position: 'relative', zIndex: '1', padding: 'clamp(20px,3vw,40px) clamp(18px,4vw,44px) clamp(56px,6vw,90px)'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto'}}>


            <section className="sr in" style={{position: 'relative', overflow: 'hidden', borderRadius: '24px', background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(26px,3vw,40px) clamp(24px,3vw,40px) clamp(28px,3.4vw,40px)'}}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap'}}>
                <div style={{flex: '1', minWidth: '240px'}}>
                  <h1 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', lineHeight: '1.0', fontSize: 'clamp(34px,4.4vw,44px)', margin: '0', color: 'var(--ink)'}}>My <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400', letterSpacing: '0', fontSize: '1.05em'}}>deals</span></h1>
                  <p style={{fontFamily: 'var(--font-ui)', fontSize: '14px', color: 'var(--wg-600)', margin: '8px 0 0'}}>Everything you have running with brands, newest first.</p>
                </div>
                <a href="/creator/storefront" className="neonbtn" style={{display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: 'var(--radius-pill)', background: 'var(--lime-400)', border: '1px solid transparent', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: 'var(--lime-950)', boxShadow: '0 8px 16px -8px rgba(180,215,50,.55)'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18l-1.5-4.5A2 2 0 0 0 17.6 3H6.4a2 2 0 0 0-1.9 1.5L3 9z" /><path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" /><path d="M9 21v-6h6v6" /></svg>Set up shopfront</a>
              </div>
              <div className="kpigrid" style={{display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0', marginTop: '24px', borderRadius: '16px', background: 'var(--card)', boxShadow: 'var(--sh-2)', overflow: 'hidden'}}>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column'}}>
                  <div style={{fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--wg-500)'}}>Needs your action</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(34px,3.6vw,40px)', lineHeight: '1', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '14px'}}>0</div>
                </div>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hair)'}}>
                  <div style={{fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--wg-500)'}}>Live right now</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(34px,3.6vw,40px)', lineHeight: '1', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '14px'}}>0</div>
                </div>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hair)'}}>
                  <div style={{fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--wg-500)'}}>Total deals</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(34px,3.6vw,40px)', lineHeight: '1', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '14px'}}>0</div>
                </div>
              </div>
            </section>


            <section style={{background: 'var(--card)', borderRadius: '20px', boxShadow: 'var(--sh-2)', marginTop: 'clamp(28px,3.2vw,42px)', overflow: 'hidden'}}>
              <div style={{padding: '26px clamp(20px,2.4vw,28px)'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'}}>
                  <div className="searchwrap" style={{display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 320px', minWidth: '200px', height: '54px', padding: '0 10px 0 20px', borderRadius: '999px', background: '#F5F7FA', border: 'none', boxShadow: 'inset 0 1px 3px rgba(24,28,36,.08),inset 0 0 0 1px rgba(24,28,36,.03)'}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: '0'}}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    <input type="search" placeholder="Search deals or brands" disabled style={{flex: '1', minWidth: '0', border: 'none', outline: 'none', background: 'none', fontFamily: 'var(--font-ui)', fontSize: '15.5px', fontWeight: '500', color: 'var(--ink)'}} />
                  </div>
                  <div style={{position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: '0'}}>
                    <select disabled style={{height: '46px', padding: '0 38px 0 18px', borderRadius: '999px', border: '1px solid var(--line)', background: '#fff', WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: 'var(--wg-400)', cursor: 'not-allowed', whiteSpace: 'nowrap'}}>
                      <option>Needs you first</option>
                    </select>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--wg-400)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none'}}><path d="m6 9 6 6 6-6" /></svg>
                  </div>
                </div>

                <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--line)'}}>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '999px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: '#fff', background: 'var(--ink)'}}>All<span style={{fontSize: '11.5px', fontWeight: '700', color: 'rgba(255,255,255,.6)'}}>0</span></div>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '999px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: 'var(--wg-600)', background: '#F5F7FA'}}>Needs you<span style={{fontSize: '11.5px', fontWeight: '700', color: 'var(--wg-400)'}}>0</span></div>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '999px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: 'var(--wg-600)', background: '#F5F7FA'}}>Negotiating<span style={{fontSize: '11.5px', fontWeight: '700', color: 'var(--wg-400)'}}>0</span></div>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '999px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: 'var(--wg-600)', background: '#F5F7FA'}}>In production<span style={{fontSize: '11.5px', fontWeight: '700', color: 'var(--wg-400)'}}>0</span></div>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '999px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: 'var(--wg-600)', background: '#F5F7FA'}}>In review<span style={{fontSize: '11.5px', fontWeight: '700', color: 'var(--wg-400)'}}>0</span></div>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '999px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: 'var(--wg-600)', background: '#F5F7FA'}}>Posted<span style={{fontSize: '11.5px', fontWeight: '700', color: 'var(--wg-400)'}}>0</span></div>
                  <div style={{display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '999px', fontFamily: 'var(--font-ui)', fontSize: '13px', fontWeight: '600', color: 'var(--wg-600)', background: '#F5F7FA'}}>Declined<span style={{fontSize: '11.5px', fontWeight: '700', color: 'var(--wg-400)'}}>0</span></div>
                </div>
              </div>

              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(48px,6vw,72px) 24px', borderTop: '1px solid var(--hair)'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M2 13h20" /></svg></span>
                <div style={{fontFamily: 'var(--font-display)', fontWeight: '600', fontSize: '20px', marginTop: '16px', color: 'var(--ink)'}}>No deals yet</div>
                <p style={{fontFamily: 'var(--font-ui)', fontSize: '14px', color: 'var(--wg-600)', margin: '9px 0 0', maxWidth: '370px', lineHeight: '1.55'}}>Deals you land with brands show up here. Discover campaigns to send your first pitch.</p>
              </div>
            </section>

            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '22px', padding: '0 4px', flexWrap: 'wrap'}}>
              <span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', color: 'var(--wg-500)'}}>0 deals</span>
            </div>

          </div>
        </main>
    </div>
  )
}
