import Link from 'next/link'

/**
 * Creator dashboard — empty state.
 *
 * Transcribed from the mobile export. This is what a creator sees before any
 * deal exists: every stat reads zero and each says so in its own words ("No
 * deals yet", "Nothing pending") rather than showing a bare 0, which reads as
 * a number that failed to load.
 *
 * Identity arrives as props. The export hardcodes a name and handle, and a
 * dashboard showing someone else's name is worse than showing none.
 */
export default function CreatorDashboardEmpty({
  firstName,
  handleLine,
  hasSocials = false,
  hasPackages = false,
  hasShopfront = false,
}: {
  firstName: string
  handleLine: string
  /** A social account with a handle exists. Marks the first step done. */
  hasSocials?: boolean
  /** At least one active package. A prerequisite for receiving deals — a brand
      cannot build an offer against a creator with no priced deliverables — so
      it sits above the shopfront, which is optional by comparison. */
  hasPackages?: boolean
  /** A creator_storefronts row exists. */
  hasShopfront?: boolean
}) {
  return (
<div className="creator-app__inner">

      <div className="cdash-head" style={{padding: '20px 18px 0', background: '#F5F7FA', paddingBottom: '18px'}}>
        <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px'}}>
          <div style={{minWidth: '0'}}>
            <h1 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: '30px', margin: '0', color: 'var(--ink)', whiteSpace: 'nowrap'}}>Hey, <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: '400'}}>{firstName}</span></h1>
            <div style={{fontSize: '12.5px', color: 'var(--wg-500)', marginTop: '6px', whiteSpace: 'nowrap'}}>{handleLine}</div>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexShrink: '0'}}>
            <Link href="/creator/storefront" aria-label="Shopfront" style={{display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 11px', borderRadius: '999px', border: '1.3px solid var(--neon-deep)', background: 'var(--neon)', flexShrink: '0'}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg><span style={{fontFamily: 'var(--font-ui)', fontSize: '11.5px', fontWeight: '700', color: 'var(--lime-950)'}}>Shopfront</span></Link>
            <Link href="/creator/notifications" aria-label="Notifications" style={{position: 'relative', width: '34px', height: '34px', flexShrink: '0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', boxShadow: '0 6px 14px -10px rgba(40,45,25,.3)'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg></Link>
          </div>
        </div>
      </div>

      <div className="cdash-sections" style={{padding: '4px 18px 0', display: 'flex', flexDirection: 'column', gap: '36px'}}>

        
        

        <div className="sr">
          <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: '19px', margin: '0', color: 'var(--ink)'}}>Get started<div className="secline"></div></h2>
          <div className="mcard" style={{marginTop: '16px', padding: '6px 18px'}}>
            <Link href="/creator/settings" style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0'}}>
              <span style={{width: '36px', height: '36px', borderRadius: '11px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11 3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg></span>
              <div style={{flex: '1', minWidth: '0'}}>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '13.5px', color: 'var(--ink)'}}>Connect your socials</div>
                <div style={{fontSize: '11.5px', color: 'var(--wg-500)', marginTop: '2px'}}>So brands can see your reach</div>
              </div>
              <StepPill done={hasSocials} />
            </Link>
            <Link href="/creator/packages?from=dashboard" style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0', borderTop: '1px solid var(--hair)'}}>
              <span style={{width: '36px', height: '36px', borderRadius: '11px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"></path><circle cx="7" cy="7" r="1.4"></circle></svg></span>
              <div style={{flex: '1', minWidth: '0'}}>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '13.5px', color: 'var(--ink)'}}>Set your packages</div>
                <div style={{fontSize: '11.5px', color: 'var(--wg-500)', marginTop: '2px'}}>What you offer and what it costs</div>
              </div>
              <StepPill done={hasPackages} />
            </Link>
            <Link href="/creator/storefront" style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0', borderTop: '1px solid var(--hair)'}}>
              <span style={{width: '36px', height: '36px', borderRadius: '11px', background: 'linear-gradient(135deg,#E9F7F0,#E7F1FC)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21V9l9-6 9 6v12"></path><path d="M9 21v-6h6v6"></path></svg></span>
              <div style={{flex: '1', minWidth: '0'}}>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '13.5px', color: 'var(--ink)'}}>Set up your shopfront</div>
                <div style={{fontSize: '11.5px', color: 'var(--wg-500)', marginTop: '2px'}}>Give brands a page to buy from</div>
              </div>
              <StepPill done={hasShopfront} />
            </Link>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0', borderTop: '1px solid var(--hair)'}}>
              <span style={{width: '36px', height: '36px', borderRadius: '11px', background: 'rgba(24,28,36,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg></span>
              <div style={{flex: '1', minWidth: '0'}}>
                <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '13.5px', color: 'var(--ink)'}}>Receive your first brief</div>
                <div style={{fontSize: '11.5px', color: 'var(--wg-500)', marginTop: '2px'}}>Brands send briefs straight to you</div>
              </div>
              <span style={{flexShrink: '0', fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: '600', color: 'var(--wg-500)'}}>Up next</span>
            </div>
          </div>
        </div>

        
        

        

        <div className="sr mcard" style={{padding: '22px'}}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--hair)'}}>
            <span className="t-meta" style={{color: 'var(--meta)'}}>Overview</span>
            <label style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
              <select defaultValue="This month" aria-label="Period" style={{border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: '600', color: 'var(--ink)', appearance: 'none', WebkitAppearance: 'none', whiteSpace: 'nowrap'}}><option>This month</option><option>This year</option><option>Last 3 months</option><option>All time</option></select>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
            </label>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: '8px'}}>
            <div style={{padding: '14px 0'}}>
              <div className="t-meta" style={{color: 'var(--meta)'}}>Total earned</div>
              <div className="tnum" style={{fontFamily: 'var(--font-ui)', fontWeight: '600', letterSpacing: '-0.03em', fontSize: '28px', marginTop: '8px', color: 'var(--wg-400)'}}>₹0</div>
              <div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px'}}>No deals yet</div>
            </div>
            <div style={{padding: '14px 0 14px 18px', borderLeft: '1px solid var(--hair)'}}>
              <div className="t-meta" style={{color: 'var(--meta)'}}>Pending</div>
              <div className="tnum" style={{fontFamily: 'var(--font-ui)', fontWeight: '600', letterSpacing: '-0.03em', fontSize: '28px', marginTop: '8px', color: 'var(--wg-400)'}}>₹0</div>
              <div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px'}}>Nothing pending</div>
            </div>
            <div style={{padding: '14px 0', borderTop: '1px solid var(--hair)'}}>
              <div className="t-meta" style={{color: 'var(--meta)'}}>Active deals</div>
              <div className="tnum" style={{fontFamily: 'var(--font-ui)', fontWeight: '600', letterSpacing: '-0.03em', fontSize: '28px', marginTop: '8px', color: 'var(--wg-400)'}}>0</div>
              <div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px'}}>None in progress</div>
            </div>
            <div style={{padding: '14px 0 14px 18px', borderTop: '1px solid var(--hair)', borderLeft: '1px solid var(--hair)'}}>
              <div className="t-meta" style={{color: 'var(--meta)'}}>Completed</div>
              <div className="tnum" style={{fontFamily: 'var(--font-ui)', fontWeight: '600', letterSpacing: '-0.03em', fontSize: '28px', marginTop: '8px', color: 'var(--wg-400)'}}>0</div>
              <div className="t-meta" style={{color: 'var(--meta)', marginTop: '6px'}}>Not yet</div>
            </div>
          </div>
        </div>

        <div className="sr">
          <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between'}}>
            <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: '19px', margin: '0', color: 'var(--ink)'}}>Deals in motion<div className="secline"></div></h2>
          </div>
          <div className="mcard" style={{marginTop: '16px', padding: '34px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'}}>
            <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '13px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M2 13h20"></path></svg></span>
            <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14px', marginTop: '14px', color: 'var(--ink)'}}>No deals yet</div>
            <p style={{margin: '6px 0 0', fontSize: '12px', color: 'var(--wg-500)', lineHeight: '1.5'}}>Offers from brands will show up here, from first offer to final payment.</p>
          </div>
        </div>

        
        <div className="sr mcard" style={{padding: '20px 22px'}}>
          <span style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: '19px', color: 'var(--ink)'}}>Performance</span>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 0 6px'}}>
            <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '13px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path></svg></span>
            <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14px', marginTop: '14px', color: 'var(--ink)'}}>No earnings to chart yet</div>
            <p style={{margin: '6px 0 0', fontSize: '12px', color: 'var(--wg-500)', lineHeight: '1.5'}}>Your monthly earnings appear here after your first payout.</p>
          </div>
        </div>

        
        <div className="sr mcard" style={{padding: '20px 22px'}}>
          <h2 style={{fontFamily: 'var(--font-display)', fontWeight: '600', letterSpacing: '-0.02em', fontSize: '19px', margin: '0', color: 'var(--ink)'}}>Your reach<div className="secline"></div></h2>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 0 6px'}}>
            <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '13px', background: '#F5F7FA', border: '1px solid var(--line)'}}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 21a8 8 0 0 0-16 0"></path><circle cx="10" cy="8" r="5"></circle><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"></path></svg></span>
            <div style={{fontFamily: 'var(--font-ui)', fontWeight: '600', fontSize: '14px', marginTop: '14px', color: 'var(--ink)'}}>Connect your socials</div>
            <p style={{margin: '6px 0 0', fontSize: '12px', color: 'var(--wg-500)', lineHeight: '1.5', maxWidth: '260px'}}>Followers, engagement and top posts show up here once connected.</p>
            <Link href="/creator/settings" style={{marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-ui)', fontWeight: '700', fontSize: '12px', color: '#fff', background: 'var(--ink)', borderRadius: '999px', padding: '9px 16px'}}>Connect socials<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"></path></svg></Link>
          </div>
        </div>

      </div>
    </div>
  )
}

/**
 * A checklist step's status pill.
 *
 * "Set up" in guap green while there is work to do; a done state once there
 * isn't. Green because this is the action we want taken — the checklist is the
 * first thing on the screen, and an ink-coloured button there reads as one more
 * row rather than the thing to press.
 */
function StepPill({ done }: { done: boolean }) {
  if (done) {
    return (
      <span
        style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
          borderRadius: 999, padding: '8px 12px',
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 11.5,
          color: '#166534', background: 'rgba(22,101,52,.08)',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Done
      </span>
    )
  }
  return (
    <span
      style={{
        flexShrink: 0, width: 64, textAlign: 'center', borderRadius: 999,
        padding: '8px 0', fontFamily: 'var(--font-ui)', fontWeight: 700,
        fontSize: 11.5, color: 'var(--lime-950)', background: 'var(--neon)',
      }}
    >
      Set up
    </span>
  )
}
