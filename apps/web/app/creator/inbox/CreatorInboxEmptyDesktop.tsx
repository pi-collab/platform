import './inbox-empty-desktop.css'

/**
 * Creator inbox, empty state, DESKTOP.
 *
 * Transcribed from the desktop export by
 * scripts/creator-inbox-desktop-from-export.py, then finished by hand for the
 * two things a converter cannot do:
 *
 *   THE LOOPS. This export ships `sc-for` over `filters` and `ghosts` with no
 *   data behind them. The filter labels are taken from the inbox's OWN
 *   FILTER_DEFS so the empty screen names the same four filters the populated
 *   one does; inventing a different set here would be a screen that changes its
 *   vocabulary the moment a first message arrives.
 *
 *   THE CHIP STYLES. The export writes those chips as `style="{{ f.style }}"`,
 *   a whole-value binding. Every converter drops it -- there is no `:` in the
 *   value to split on -- so the chips arrived with style={{}} and no styling at
 *   all. Restated here, matching the deals empty state's chips so the two
 *   screens agree.
 *
 * The export's page wrapper, its empty sticky <header> and its fixed grain
 * overlay are all dropped: the creator layout already supplies a background and
 * a top nav, and a second grain over the first only darkens the page.
 *
 * The ghost rows are decorative. They are the shape of a conversation list a
 * creator does not have yet, which is why they carry no text to read.
 */

/** Same four the populated inbox shows. See CreatorInboxView's FILTER_DEFS. */
const FILTERS = ['All', 'Unread', 'Active', 'Completed']

/** Five skeleton rows. Fading down the column so it reads as a list running out
 *  of content rather than five identical bars. */
const GHOSTS = [
  { opacity: 1,    w1: '58%', w2: '86%', w3: '44%' },
  { opacity: 0.82, w1: '46%', w2: '74%', w3: '52%' },
  { opacity: 0.62, w1: '64%', w2: '58%', w3: '38%' },
  { opacity: 0.42, w1: '40%', w2: '80%', w3: '46%' },
  { opacity: 0.24, w1: '54%', w2: '66%', w3: '34%' },
]

export default function CreatorInboxEmptyDesktop() {
  return (
    <div className="cinbox-desk">
      <main style={{ flex: '1', minHeight: '0', minWidth: '0', maxWidth: '1200px', width: '100%', margin: '0 auto', padding: 'clamp(14px,2vw,22px) clamp(14px,2.4vw,26px) 0' }}>
        <div className="workspace reveal" style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRadius: '26px', overflow: 'hidden', border: '1px solid var(--frost-edge)', background: 'var(--card)', boxShadow: '0 34px 66px -34px rgba(40,45,25,.42),inset 0 1px 0 rgba(255,255,255,.9)' }}>

          <div className="worktop" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px,2vw,22px)', padding: '16px clamp(16px,2vw,24px)', borderBottom: '1px solid var(--border-hairline)', background: 'var(--card)' }}>
            <h1 className="t-headline" style={{ margin: '0', flexShrink: '0' }}>Inbox</h1>
            <div className="searchwrap" style={{ position: 'relative', flex: '1', maxWidth: '560px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              {/* Inert, as the export draws it. `disabled` as a real boolean:
                  disabled="" from the export is disabled={""} in JSX, which is
                  falsy, and would ship a search box that takes typing and
                  searches nothing. */}
              <input type="text" disabled placeholder="Search brands or deals" style={{ width: '100%', padding: '10px 15px 10px 39px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-hairline)', background: 'var(--card)', fontSize: '13.5px', color: 'var(--ink-faint)', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: '0', marginLeft: 'auto' }}>
              {FILTERS.map((label, i) => (
                <div
                  key={label}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '7px 14px', borderRadius: 'var(--radius-pill)',
                    fontFamily: 'var(--font-ui)', fontSize: '12.5px', fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color: i === 0 ? '#fff' : 'var(--ink-soft)',
                    background: i === 0 ? 'var(--ink)' : 'rgba(24,28,36,.05)',
                  }}
                >
                  {label}
                  <span style={{ fontSize: '11px', fontWeight: 700, color: i === 0 ? 'rgba(255,255,255,.6)' : 'var(--ink-faint)' }}>0</span>
                </div>
              ))}
            </div>
          </div>

          <div className="workbody" style={{ display: 'flex', flex: '1', minHeight: '0' }}>
            <div className="listcol" style={{ width: '340px', flexShrink: '0', overflowY: 'auto', padding: '12px', borderRight: '1px solid var(--border-hairline)', display: 'flex', flexDirection: 'column' }}>
              {GHOSTS.map((g, i) => (
                <div key={i} className="conv" aria-hidden="true" style={{ display: 'flex', gap: '12px', padding: '13px 12px', opacity: g.opacity }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '13px', flexShrink: '0', background: 'rgba(24,28,36,.06)' }} />
                  <div style={{ flex: '1', minWidth: '0', paddingTop: '2px' }}>
                    <div style={{ width: g.w1, height: '10px', borderRadius: '5px', background: 'rgba(24,28,36,.09)' }} />
                    <div style={{ width: g.w2, height: '8px', borderRadius: '5px', background: 'rgba(24,28,36,.06)', marginTop: '9px' }} />
                    <div style={{ width: g.w3, height: '8px', borderRadius: '5px', background: 'rgba(24,28,36,.06)', marginTop: '7px' }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="threadcol" style={{ flex: '1', minWidth: '0', padding: 'clamp(12px,1.6vw,18px)' }}>
              <div style={{ height: '100%', minHeight: '560px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px', overflow: 'hidden', borderRadius: '20px', background: 'var(--card)', border: '1px solid var(--frost-edge)', boxShadow: '0 26px 54px -34px rgba(40,45,25,.42),inset 0 1px 0 rgba(255,255,255,.9)' }}>
                <div className="t-headline" style={{ position: 'relative' }}>No messages yet</div>
                <div style={{ position: 'relative', fontFamily: 'var(--font-ui)', fontSize: '13.5px', color: 'var(--ink-faint)', marginTop: '8px', maxWidth: '300px', lineHeight: '1.55' }}>
                  This is where your brand chats will live. Set up your shopfront so brands can find you and send the first brief.
                </div>
                <a href="/creator/storefront" className="hbtn-neon" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '22px', padding: '12px 24px', borderRadius: 'var(--radius-pill)', backgroundColor: 'var(--neon)', border: 'none', fontWeight: '700', fontSize: '14px', color: 'var(--ink)', textDecoration: 'none', boxShadow: '0 14px 28px -8px rgba(180,210,60,.9)' }}>
                  Set up your shopfront
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </a>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
