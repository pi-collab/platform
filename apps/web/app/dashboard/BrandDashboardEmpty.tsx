import './brand-dashboard-empty.css'

/**
 * Brand dashboard, empty state, DESKTOP.
 *
 * Transcribed from the desktop export by
 * scripts/brand-dashboard-desktop-from-export.py.
 *
 * The export draws the whole page. Three parts are dropped:
 *
 *   its page wrapper and empty <header>  the brand layout already supplies a
 *                                        background and the top nav, and a
 *                                        second of each sits inside the first
 *   the marketing CTA at the end         "Brand-creator deals without the
 *                                        chaos" is landing-page copy; a brand
 *                                        reading its own dashboard has already
 *                                        signed up
 *
 * Everything the design states is ZERO or absent -- no spend, no deals, no
 * campaigns, no reach. Nothing here is a placeholder figure waiting to be
 * replaced: this component only ever renders when the brand genuinely has none
 * of it, so the numbers are accurate rather than illustrative.
 *
 * All CSS is scoped under .bdash-desk. The export ships `*`, `body`, bare `a`
 * and ten :root blocks; unscoped they restyle the entire site.
 */
export default function BrandDashboardEmpty() {
  return (
    <div className="bdash-desk">
      <div style={{maxWidth: '1200px', margin: '0 auto'}}>


            <section className="sr in" style={{position: 'relative', overflow: 'hidden', borderRadius: '24px', background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(26px,3vw,40px) clamp(24px,3vw,40px) clamp(28px,3.4vw,40px)'}}>
              <div style={{position: 'relative', zIndex: '2', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap'}}>
                <div style={{flex: '1', minWidth: '240px'}}>
                  <span className="t-meta" style={{display: 'inline-block', color: 'var(--meta)'}}>Welcome to guapd</span>
                  <h1 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', lineHeight: '1.0', fontSize: 'clamp(34px,4.6vw,44px)', margin: '12px 0 0', color: 'var(--ink)'}}>Let’s start your <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400', letterSpacing: '0', fontSize: '1.12em'}}>first campaign</span>.</h1>
                </div>
                <label style={{display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--line)', background: 'var(--card)', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', cursor: 'pointer', flexShrink: '0'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg><select style={{border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: '600', color: 'var(--ink)', cursor: 'pointer'}}><option>This month</option><option>This year</option><option>Last 3 months</option><option>All time</option></select></label>
              </div>
              <div style={{position: 'relative', zIndex: '2', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '22px'}}>
                <a href="/browse" className="neonbtn" style={{display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: 'var(--radius-pill)', background: 'var(--lime-400)', border: '1px solid transparent', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: 'var(--lime-950)', boxShadow: '0 8px 16px -8px rgba(180,215,50,.55)'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>Start a new deal</a>
              </div>
              <div className="kpigrid" style={{position: 'relative', zIndex: '2', marginTop: '24px', borderRadius: '16px', background: 'var(--card)', boxShadow: 'var(--sh-2)', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0'}}>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column'}}>
                  <div className="t-meta" style={{color: 'var(--meta)'}}>Total spent</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(30px,3.2vw,40px)', lineHeight: '.9', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '16px'}}>₹0</div>
                  <div className="t-meta" style={{color: 'var(--meta)', marginTop: '12px'}}>No deals yet</div>
                </div>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hair)'}}>
                  <div className="t-meta" style={{color: 'var(--meta)'}}>Pending payouts</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(30px,3.2vw,40px)', lineHeight: '.9', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '16px'}}>₹0</div>
                  <div className="t-meta" style={{color: 'var(--meta)', marginTop: '12px'}}>Nothing pending</div>
                </div>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hair)'}}>
                  <div className="t-meta" style={{color: 'var(--meta)'}}>Active campaigns</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(30px,3.2vw,40px)', lineHeight: '.9', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '16px'}}>0</div>
                  <div className="t-meta" style={{color: 'var(--meta)', marginTop: '12px'}}>None running</div>
                </div>
                <div style={{padding: 'clamp(22px,2.2vw,30px)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--hair)'}}>
                  <div className="t-meta" style={{color: 'var(--meta)'}}>Active deals</div>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: 'clamp(30px,3.2vw,40px)', lineHeight: '.9', letterSpacing: '-0.03em', color: 'var(--wg-400)', marginTop: '16px'}}>0</div>
                  <div className="t-meta" style={{color: 'var(--meta)', marginTop: '12px'}}>None in progress</div>
                </div>
              </div>
            </section>


            <section className="sr" style={{position: 'relative', marginTop: 'clamp(28px,3.2vw,42px)', borderRadius: '20px', background: 'var(--card)', boxShadow: '0 24px 54px -34px rgba(24,28,36,.28)', padding: 'clamp(24px,3vw,38px)'}}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px'}}>
                <div>
                  <span style={{fontFamily: 'var(--font-ui)', fontSize: '10px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: '#fff', background: 'var(--ink)', borderRadius: 'var(--radius-pill)', padding: '4px 12px'}}>Get started</span>
                  <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '14px 0 0'}}>Three steps to your first deal<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div></h2>
                </div>
              </div>
              <div>
                <a href="#" className="drow" style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '16px', padding: '18px 12px', borderRadius: '12px', textDecoration: 'none'}}>
                  <span style={{width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg></span>
                  <div style={{minWidth: '0'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14.5px', color: 'var(--ink)'}}>Complete your profile</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--wg-500)', marginTop: '3px'}}>Add your logo and story so creators know who they’re working with</div></div>
                  <span className="pillbtn" style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '110px', borderRadius: 'var(--radius-pill)', padding: '10px 18px', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '12.5px', color: '#fff', background: 'var(--ink)', border: '1px solid transparent'}}>Set up</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9C8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </a>
                <a href="/browse" className="drow" style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '16px', padding: '18px 12px', borderRadius: '12px', borderTop: '1px solid var(--hair)', textDecoration: 'none'}}>
                  <span style={{width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg></span>
                  <div style={{minWidth: '0'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14.5px', color: 'var(--ink)'}}>Browse creators &amp; send a brief</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--wg-500)', marginTop: '3px'}}>Explore our exclusive creators and send your brief to the ones you pick</div></div>
                  <span className="pillbtn" style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '110px', borderRadius: 'var(--radius-pill)', padding: '10px 18px', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '12.5px', color: '#fff', background: 'var(--ink)', border: '1px solid transparent'}}>Browse</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9C8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </a>
                <div style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: '16px', padding: '18px 12px', borderRadius: '12px', borderTop: '1px solid var(--hair)'}}>
                  <span style={{width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(24,28,36,.05)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg></span>
                  <div style={{minWidth: '0'}}><div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14.5px', color: 'var(--ink)'}}>Agree terms &amp; start the deal</div><div style={{fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--wg-500)', marginTop: '3px'}}>Once a creator accepts your brief, track delivery and pay in one place</div></div>
                  <span style={{fontFamily: 'var(--font-ui)', fontSize: '12px', fontWeight: '600', color: 'var(--wg-500)'}}>Up next</span>
                  <span style={{width: '15px'}}></span>
                </div>
              </div>
            </section>


            <section className="sr" style={{marginTop: 'clamp(52px,6vw,80px)', borderRadius: '20px', background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(24px,3vw,32px)'}}>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '0 0 24px'}}>Deals in motion<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div></h2>
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(30px,4vw,44px) 0'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M2 13h20" /></svg></span>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px', marginTop: '16px', color: 'var(--ink)'}}>No deals yet</div>
                <p style={{margin: '6px 0 0', fontSize: '13.5px', color: 'var(--wg-500)', maxWidth: '360px', lineHeight: '1.5'}}>Deals you agree with creators will show up here — from first offer to final payment.</p>
              </div>
            </section>


            <section className="sr" style={{marginTop: 'clamp(52px,6vw,80px)', borderRadius: '20px', background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(24px,3vw,32px)'}}>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '0 0 24px'}}>Campaigns in motion<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div></h2>
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(30px,4vw,44px) 0'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg></span>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px', marginTop: '16px', color: 'var(--ink)'}}>No campaigns running</div>
                <p style={{margin: '6px 0 0', fontSize: '13.5px', color: 'var(--wg-500)', maxWidth: '360px', lineHeight: '1.5'}}>Browse creators, send them a brief, and the campaigns you run will appear here.</p>
              </div>
            </section>


            <div className="ctgrid" style={{marginTop: 'clamp(52px,6vw,80px)', display: 'grid', gridTemplateColumns: '1.63fr 1fr', gap: 'clamp(16px,2vw,20px)', alignItems: 'stretch'}}>
            <section className="sr" style={{position: 'relative', overflow: 'hidden', borderRadius: '24px', background: 'var(--card)', padding: 'clamp(24px,2.6vw,34px)', boxShadow: '0 1px 2px rgba(24,28,36,.05),0 24px 48px -24px rgba(24,28,36,.16)', display: 'flex', flexDirection: 'column'}}>
              <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '0', color: 'var(--ink)'}}>How it’s going<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div></h2>
              <div style={{flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'clamp(20px,3vw,32px) 0'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg></span>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '15px', marginTop: '14px', color: 'var(--ink)'}}>No spend to chart yet</div>
                <p style={{margin: '6px 0 0', fontSize: '13px', color: 'var(--wg-500)', maxWidth: '300px', lineHeight: '1.5'}}>Your monthly spend trend appears here once your first deal pays out.</p>
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
                    <span style={{fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--wg-600)'}}>On-time payment</span>
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
                <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '8px 0 0', color: 'var(--ink)'}}>Your collabs’ reach</h2>
                <div style={{height: '1px', background: 'rgba(24,28,36,.1)', marginTop: '18px'}}></div>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(28px,4vw,40px) 0'}}>
                <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 6 13.5 15.5l-5-5L1 18" /><path d="M17 6h6v6" /></svg></span>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '15px', marginTop: '14px', color: 'var(--ink)'}}>No reach to show yet</div>
                <p style={{margin: '6px 0 0', fontSize: '13px', color: 'var(--wg-500)', maxWidth: '340px', lineHeight: '1.5'}}>Reach, engagement, and top posts from your campaigns will show up here once creators start posting.</p>
              </div>
            </section>


            <section className="sr" style={{marginTop: 'clamp(52px,6vw,80px)'}}>
              <div style={{borderRadius: '20px', background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(24px,3vw,32px)'}}>
                <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: '0 0 28px'}}>Creators you’ve worked with<div aria-hidden="true" style={{width: '40px', height: '1px', background: '#C9EB3C', marginTop: '16px'}}></div></h2>
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'clamp(34px,4vw,52px) 0'}}>
                  <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '16px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></span>
                  <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '16px', marginTop: '16px', color: 'var(--ink)'}}>No creators yet</div>
                  <p style={{margin: '6px 0 0', fontSize: '13.5px', color: 'var(--wg-500)', maxWidth: '380px', lineHeight: '1.55'}}>Browse creators and send your first brief — the creators you work with will collect here.</p>
                  <a href="/browse" className="neonbtn" style={{marginTop: '18px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: 'var(--radius-pill)', background: 'var(--ink)', border: '1px solid transparent', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '13px', color: '#fff', boxShadow: '0 8px 16px -8px rgba(24,28,36,.35)'}}>Browse creators<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></a>
                </div>
              </div>
            </section>






          </div>
    </div>
  )
}
