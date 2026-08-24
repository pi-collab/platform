import './dashboard-desktop.css'

/**
 * The creator dashboard empty state, DESKTOP.
 *
 * Transcribed from "Creator Dashboard - Empty State.html". Its sibling
 * CreatorDashboardEmpty came from a mobile export; both exist because both were
 * drawn, and neither is a resized copy of the other.
 *
 * Which one renders is decided by WIDTH in creator-app.css, not by an early
 * return in the route. An early return fires everywhere, which is how the
 * mobile design ended up being the only thing a desktop creator ever saw.
 *
 * The export's stylesheet is kept and scoped under .cdash-desk. It carries ten
 * :root blocks and 286 custom properties; unscoped, those would repaint the
 * whole site. Its @font-face blocks are dropped — next/font already serves
 * Schibsted Grotesk and Instrument Serif, and shipping them again would refetch
 * the same faces from a second source.
 */
export default function CreatorDashboardEmptyDesktop({
  hasSocials = false,
  hasPackages = false,
  hasShopfront = false,
  hasPayout = false,
}: {
  hasSocials?: boolean
  hasPackages?: boolean
  hasShopfront?: boolean
  hasPayout?: boolean
}) {
  // The four a creator controls. "Receive your first brief" is what happens
  // when these are done, not a task — counting it would pin the bar at 80% for
  // reasons outside their hands.
  const steps = [hasSocials, hasPackages, hasShopfront, hasPayout]
  const doneCount = steps.filter(Boolean).length
  const pct = Math.round((doneCount / steps.length) * 100)
  const allDone = doneCount === steps.length
  // The export draws every row with a "Set up" pill. A checklist that says
  // "Set up" against something already done is worse than no checklist, so the
  // pill reflects state — same shape, same place.
  const Pill = ({ done }: { done: boolean }) => done ? (
    <span className="pillbtn" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      minWidth: '110px', borderRadius: 'var(--radius-pill)', padding: '10px 18px',
      fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '12.5px',
      color: '#166534', background: 'rgba(22,101,52,.08)', border: '1px solid transparent',
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      Done
    </span>
  ) : (
    <span className="pillbtn" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '110px', borderRadius: 'var(--radius-pill)', padding: '10px 18px',
      fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '12.5px',
      color: '#fff', background: 'var(--ink)', border: '1px solid transparent',
    }}>Set up</span>
  )

  return (
    <div className="cdash-desk">
      <div style={{minHeight: '100vh', position: 'relative', overflowX: 'hidden', fontFamily: 'var(--font-ui)', color: 'var(--ink)', background: '#F5F7FA'}}>


        <header style={{position: 'sticky', top: '0', zIndex: '30', padding: '16px clamp(14px,4vw,28px) 0'}}>

        </header>

        <main style={{position: 'relative', zIndex: '1', padding: 'clamp(20px,3vw,40px) clamp(18px,4vw,44px) clamp(56px,6vw,90px)'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto'}}>


            <section className="sr in" style={{position: 'relative', overflow: 'hidden', borderRadius: '24px', background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(26px,3vw,40px) clamp(24px,3vw,40px) clamp(28px,3.4vw,40px)'}}>
              <div style={{position: 'relative', zIndex: '2', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap'}}>
                <div style={{flex: '1', minWidth: '240px'}}>
                  <span className="t-meta" style={{display: 'inline-block', color: 'var(--meta)'}}>Welcome to guapd</span>
                  <h1 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', lineHeight: '1.0', fontSize: 'clamp(34px,4.6vw,44px)', margin: '12px 0 0', color: 'var(--ink)'}}>Let’s land your <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400', letterSpacing: '0', fontSize: '1.12em'}}>first deal</span>.</h1>
                </div>
                <label style={{display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--line)', background: 'var(--card)', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', cursor: 'pointer', flexShrink: '0'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg><select style={{border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', cursor: 'pointer'}}><option>This month</option><option>This year</option><option>Last 3 months</option><option>All time</option></select></label>
              </div>
              <div style={{position: 'relative', zIndex: '2', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '22px'}}>
                <a href="/creator/storefront" className="neonbtn" style={{display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: 'var(--radius-pill)', background: 'var(--lime-400)', border: '1px solid transparent', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: 'var(--lime-950)', boxShadow: '0 8px 16px -8px rgba(180,215,50,.55)'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /></svg>Set up your shopfront</a>
              </div>
              <div className="kpigrid" style={{position: 'relative', zIndex: '2', marginTop: '24px', borderRadius: '16px', background: 'var(--card)', boxShadow: 'var(--sh-2)', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0'}}>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column'}}>
                  <div className="t-meta" style={{color: 'var(--meta)'}}>Total earned</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(30px,3.2vw,40px)', lineHeight: '.9', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '16px'}}>₹0</div>
                  <div className="t-meta" style={{color: 'var(--meta)', marginTop: '12px'}}>No deals yet</div>
                </div>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hair)'}}>
                  <div className="t-meta" style={{color: 'var(--meta)'}}>Pending</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(30px,3.2vw,40px)', lineHeight: '.9', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '16px'}}>₹0</div>
                  <div className="t-meta" style={{color: 'var(--meta)', marginTop: '12px'}}>Nothing pending</div>
                </div>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hair)'}}>
                  <div className="t-meta" style={{color: 'var(--meta)'}}>Active deals</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(30px,3.2vw,40px)', lineHeight: '.9', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '16px'}}>0</div>
                  <div className="t-meta" style={{color: 'var(--meta)', marginTop: '12px'}}>None in progress</div>
                </div>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hair)'}}>
                  <div className="t-meta" style={{color: 'var(--meta)'}}>Completed</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(30px,3.2vw,40px)', lineHeight: '.9', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '16px'}}>0</div>
                  <div className="t-meta" style={{color: 'var(--meta)', marginTop: '12px'}}>Not yet</div>
                </div>
              </div>
            </section>


            {/* Hidden once every step is done — a checklist with nothing left on it
          is a row of ticks taking the top of the screen. */}
      {!allDone && (
        <section className="sr" style={{position: 'relative', marginTop: 'clamp(28px,3.2vw,42px)', borderRadius: '20px', background: 'var(--card)', boxShadow: '0 24px 54px -34px rgba(24,28,36,.28)', padding: 'clamp(24px,3vw,38px)'}}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px'}}>
                <div>
                  <span style={{fontFamily: 'var(--font-ui)', fontSize: '10px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: '#fff', background: 'var(--ink)', borderRadius: 'var(--radius-pill)', padding: '4px 12px'}}>Get started</span>
                  <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '14px 0 0'}}>Five steps to your first deal<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div><span style={{fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '700', color: 'var(--wg-500)', marginLeft: '12px'}}>{pct}% complete</span></h2>                </div>
              </div>
              <div>
                {/* Full width, directly above the steps it measures. It was under the
                    heading, which sits in a 320px flex column — so the bar
                    inherited that and stopped a third of the way across. */}
                <div style={{marginBottom: '18px', height: '6px', borderRadius: '20px', background: 'rgba(24,28,36,.08)', overflow: 'hidden'}} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
                  <div style={{height: '100%', width: `${pct}%`, borderRadius: '20px', background: 'var(--lime-400)', transition: 'width .35s cubic-bezier(.4,0,.2,1)'}} />
                </div>
                <a href="/creator/settings?tab=profile" className="drow" style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '16px', padding: '18px 12px', borderRadius: '12px', textDecoration: 'none'}}>
                  <span style={{width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg></span>
                  <div style={{minWidth: '0'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14.5px', color: 'var(--ink)'}}>Connect your socials</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--wg-500)', marginTop: '3px'}}>Get analytics on your reach and engagement so brands can see your value</div></div>
                  <Pill done={hasSocials} />
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9C8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </a>
                <a href="/creator/packages?from=dashboard" className="drow" style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '16px', padding: '18px 12px', borderRadius: '12px', textDecoration: 'none'}}>
                  <span style={{width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.4" /></svg></span>
                  <div style={{minWidth: '0'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14.5px', color: 'var(--ink)'}}>Set your packages</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--wg-500)', marginTop: '3px'}}>What you offer and what it costs, so brands can send you a real brief</div></div>
                  <Pill done={hasPackages} />
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9C8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </a>
                <a href="/creator/storefront" className="drow" style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '16px', padding: '18px 12px', borderRadius: '12px', borderTop: '1px solid var(--hair)', textDecoration: 'none'}}>
                  <span style={{width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12" /><path d="M9 21v-6h6v6" /></svg></span>
                  <div style={{minWidth: '0'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14.5px', color: 'var(--ink)'}}>Set up your shopfront</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--wg-500)', marginTop: '3px'}}>Showcase your rates and packages so brands can book you</div></div>
                  <Pill done={hasShopfront} />
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9C8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </a>
                <a href="/creator/payments?from=dashboard" className="drow" style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '16px', padding: '18px 12px', borderRadius: '12px', textDecoration: 'none'}}>
                  <span style={{width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></span>
                  <div style={{minWidth: '0'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14.5px', color: 'var(--ink)'}}>Add a payment method</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--wg-500)', marginTop: '3px'}}>So we can pay you when a deal completes</div></div>
                  <Pill done={hasPayout} />
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9C8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </a>
                <div style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '16px', padding: '18px 12px', borderRadius: '12px', borderTop: '1px solid var(--hair)'}}>
                  <span style={{width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(24,28,36,.05)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg></span>
                  <div style={{minWidth: '0'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14.5px', color: 'var(--ink)'}}>Receive your first brief</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--wg-500)', marginTop: '3px'}}>Brands browse and send briefs straight to you</div></div>
                  <span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--wg-500)'}}>Up next</span>
                  <span style={{width: '15px'}}></span>
                </div>
              </div>
            </section>
      )}


            <section className="sr" style={{marginTop: 'clamp(52px,6vw,80px)', borderRadius: '20px', background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(24px,3vw,32px)'}}>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '0 0 24px'}}>Deals in motion<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div></h2>
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(30px,4vw,44px) 0'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M2 13h20" /></svg></span>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px', marginTop: '16px', color: 'var(--ink)'}}>No deals yet</div>
                <p style={{margin: '6px 0 0', fontSize: '13.5px', color: 'var(--wg-500)', maxWidth: '360px', lineHeight: '1.5'}}>Deals you agree with brands will show up here — from first offer to final payment.</p>
              </div>
            </section>


            <div className="ctgrid" style={{marginTop: 'clamp(52px,6vw,80px)', display: 'grid', gridTemplateColumns: '1.63fr 1fr', gap: 'clamp(16px,2vw,20px)', alignItems: 'stretch'}}>
            <section className="sr" style={{position: 'relative', overflow: 'hidden', borderRadius: '24px', background: 'var(--card)', padding: 'clamp(24px,2.6vw,34px)', boxShadow: '0 1px 2px rgba(24,28,36,.05),0 24px 48px -24px rgba(24,28,36,.16)', display: 'flex', flexDirection: 'column'}}>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '0', color: 'var(--ink)'}}>How it’s going<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div></h2>
              <div style={{flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'clamp(20px,3vw,32px) 0'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg></span>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '15px', marginTop: '14px', color: 'var(--ink)'}}>No earnings to chart yet</div>
                <p style={{margin: '6px 0 0', fontSize: '13px', color: 'var(--wg-500)', maxWidth: '300px', lineHeight: '1.5'}}>Your monthly earnings trend appears here once your first deal pays out.</p>
              </div>
            </section>


            <section className="sr" style={{position: 'relative', overflow: 'hidden', borderRadius: '20px', background: 'var(--card)', padding: 'clamp(24px,2.6vw,34px)', boxShadow: 'var(--sh-2)', display: 'flex', alignItems: 'center'}}>
              <div style={{position: 'relative', zIndex: '2', width: '100%'}}>
                <span className="t-meta" style={{display: 'block', color: 'var(--meta)', marginBottom: '12px'}}>Your track record</span>
                <div style={{display: 'flex', alignItems: 'baseline', gap: '10px'}}>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(34px,3.6vw,44px)', letterSpacing: '-0.03em', lineHeight: '1', color: 'var(--wg-400)'}}>0</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--wg-500)'}}>deals completed</div>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0', marginTop: '22px'}}>
                  <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '13px 0', borderTop: '1px solid var(--sec)'}}>
                    <span style={{fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--wg-600)'}}>On-time delivery</span>
                    <span style={{fontFamily: 'var(--font-ui)', fontSize: '14px', fontWeight: '700', color: 'var(--wg-400)', letterSpacing: '-0.02em'}}>—</span>
                  </div>
                  <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '13px 0', borderTop: '1px solid var(--sec)'}}>
                    <span style={{fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--wg-600)'}}>Avg response</span>
                    <span style={{fontFamily: 'var(--font-ui)', fontSize: '14px', fontWeight: '700', color: 'var(--wg-400)', letterSpacing: '-0.02em'}}>—</span>
                  </div>
                  <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '13px 0', borderTop: '1px solid var(--sec)'}}>
                    <span style={{fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--wg-600)'}}>Completion rate</span>
                    <span style={{fontFamily: 'var(--font-ui)', fontSize: '14px', fontWeight: '700', color: 'var(--wg-400)', letterSpacing: '-0.02em'}}>—</span>
                  </div>
                </div>
              </div>
            </section>
            </div>


            <section className="sr" style={{marginTop: 'clamp(52px,6vw,80px)', borderRadius: '20px', background: 'var(--card)', padding: 'clamp(24px,3vw,36px)', boxShadow: 'var(--sh-2)'}}>
              <div style={{marginBottom: '8px'}}>
                <span style={{fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: '700', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--wg-500)'}}>Performance</span>
                <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '8px 0 0', color: 'var(--ink)'}}>Your reach</h2>
                <div style={{height: '1px', background: 'rgba(24,28,36,.1)', marginTop: '18px'}}></div>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(28px,4vw,40px) 0'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" /></svg></span>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '15px', marginTop: '14px', color: 'var(--ink)'}}>Connect your socials to see your reach</div>
                <p style={{margin: '6px 0 0', fontSize: '13px', color: 'var(--wg-500)', maxWidth: '340px', lineHeight: '1.5'}}>Followers, engagement and your top posts will show up here once your profile is connected.</p>
                <a href="/creator/settings?tab=profile" style={{marginTop: '18px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '12.5px', color: '#fff', background: 'var(--ink)', borderRadius: 'var(--radius-pill)', padding: '10px 18px'}}>Connect your socials<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></a>
              </div>
            </section>


            <section className="sr" style={{marginTop: 'clamp(52px,6vw,80px)'}}>
              <div style={{borderRadius: '20px', background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(24px,3vw,32px)'}}>
                <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '0 0 28px'}}>Brands you’ve worked with<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div></h2>
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(34px,4vw,52px) 0'}}>
                  <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-3a2 2 0 0 1-2-2V2" /><path d="M9 22H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2h-1" /><path d="M12 12v6" /><path d="M9 15h6" /></svg></span>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px', marginTop: '16px', color: 'var(--ink)'}}>No brand deals yet</div>
                  <p style={{margin: '6px 0 0', fontSize: '13.5px', color: 'var(--wg-500)', maxWidth: '380px', lineHeight: '1.55'}}>Set up your shopfront so brands can discover you and send briefs — the brands you work with will collect here.</p>
                  <a href="/creator/storefront" className="neonbtn" style={{marginTop: '18px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: 'var(--radius-pill)', background: 'var(--ink)', border: '1px solid transparent', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: '#fff', boxShadow: '0 8px 16px -8px rgba(24,28,36,.35)'}}>Set up your shopfront<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></a>
                </div>
              </div>
            </section>


            <section className="sr" style={{marginTop: 'clamp(52px,6vw,80px)', position: 'relative', overflow: 'hidden', borderRadius: '32px', background: 'linear-gradient(115deg,var(--sec) 0%,var(--sec-2) 26%,var(--card) 55%,#FCFDF6 100%)', minHeight: '300px', display: 'flex', alignItems: 'center', padding: 'clamp(32px,4vw,60px)', boxShadow: 'var(--sh-2)'}}>
              <div style={{position: 'relative', zIndex: '2', display: 'grid', gridTemplateColumns: '1.3fr .9fr', gap: 'clamp(24px,3vw,48px)', alignItems: 'center', width: '100%'}}>
                <div>
                  <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', lineHeight: '1.0', fontSize: 'clamp(38px,4.8vw,44px)', margin: '0', color: 'var(--ink)'}}>Brand–creator deals<br />without the <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400', letterSpacing: '0', fontSize: '1.12em'}}>chaos</span>.</h2>
                  <p style={{fontFamily: 'var(--font-ui)', fontSize: '15px', lineHeight: '1.6', color: 'var(--wg-600)', margin: '16px 0 0', maxWidth: '400px'}}>One home for offers, contracts, content, and payments — so you can focus on making, not chasing.</p>
                  <a href="/creator/storefront" className="neonbtn" style={{display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '26px', padding: '13px 22px', borderRadius: 'var(--radius-pill)', background: 'var(--lime-400)', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '14px', color: 'var(--lime-950)', boxShadow: '0 14px 26px -12px rgba(180,215,50,.7)'}}>Share your shopfront<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></a>
                </div>
                <div style={{position: 'relative', aspectRatio: '1/1', width: '100%', maxWidth: '280px', justifySelf: 'center'}}></div>
              </div>
            </section>




          </div>
        </main>
      </div>
    </div>
  )
}
