/**
 * Marketing sections that are built but have no real content yet: recent
 * deals, featured campaigns, the creator roster, brand logos and brand
 * testimonials. Everything in them is placeholder (invented creators, invented
 * brands, invented numbers), so they render only where `showMarketingPreview()`
 * is true: staging and local dev, never production. Each one carries a
 * PreviewTag so nobody mistakes the placeholder for the real thing.
 *
 * This file holds the shared placeholder data and the phone renderings; the
 * desktop renderings stay inline in each page's ported export markup.
 */

/** Server-side only: VERCEL_ENV is not exposed to the client bundle. */
export function showMarketingPreview(): boolean {
  return process.env.VERCEL_ENV !== 'production'
}

export const PREVIEW_DEALS = [
  { title: 'Skincare routine', brand: 'Glow Labs', when: 'Jun 2026', views: '2.4M', engagement: '8.1%', saves: '34K' },
  { title: 'Goa on ₹5k', brand: 'Wander Co', when: 'May 2026', views: '1.1M', engagement: '6.4%', saves: '21K' },
  { title: 'Get ready with me', brand: 'Bawa Labs', when: 'May 2026', views: '1.7M', engagement: '7.2%', saves: '28K' },
  { title: 'SIP explained', brand: 'Vaultly', when: 'Apr 2026', views: '1.1M', engagement: '6.4%', saves: '22K' },
]

export const PREVIEW_CAMPAIGNS = [
  { num: '01', brand: 'Nextlevel Studio', name: 'Summer Reel campaign', deliverables: 3 },
  { num: '02', brand: 'Aura Brand Identity', name: 'Launch teaser', deliverables: 2 },
  { num: '03', brand: 'Solaris Digital', name: 'Product spotlight', deliverables: 4 },
]

export const PREVIEW_CREATORS = [
  { handle: '@aisha.fin', niche: 'Finance', followers: '180K' },
  { handle: '@rohan.tech', niche: 'Tech', followers: '92K' },
  { handle: '@priya.career', niche: 'Careers', followers: '95K' },
  { handle: '@maya.money', niche: 'Lifestyle', followers: '210K' },
]

export const PREVIEW_BRANDS = [
  { initials: 'NP', name: 'Novapay', bg: '#EEF2F6' },
  { initials: 'BM', name: 'Bluemint', bg: '#F1EFF5' },
  { initials: 'CF', name: 'Cliqfin', bg: '#EFF4F0' },
  { initials: 'LW', name: 'Loopwear', bg: '#F7F5EC' },
]

export const PREVIEW_BRAND_QUOTES = [
  { title: 'Three deals closed in a week', quote: 'Every term was agreed before a single frame was shot. No more back-and-forth over DMs.', who: 'Brand manager', org: 'fintech startup' },
  { title: 'The paper trail is worth it', quote: 'No more WhatsApp screenshots to settle a dispute. Everything is on record.', who: 'Growth lead', org: 'D2C brand' },
  { title: 'Payments are finally calm', quote: 'I can see each payout without asking finance for an update.', who: 'Marketing head', org: 'BFSI brand' },
]

export function PreviewTag({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontFamily: 'var(--font-ui)', fontSize: '10.5px', fontWeight: 600, letterSpacing: '.04em',
        color: '#7A5B00', background: '#FFF4CC', border: '1px dashed #E0B400',
        borderRadius: '999px', padding: '4px 10px', ...style,
      }}
    >
      Staging preview · placeholder content · hidden on live site
    </span>
  )
}

// ── Phone renderings ─────────────────────────────────────────────────────────

const h2: React.CSSProperties = { fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: '1.2', fontSize: '23px', margin: '6px 0 0', color: 'var(--ink)' }
const eyebrow: React.CSSProperties = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', background: 'var(--neon)', color: 'var(--ink)', padding: '6px 16px' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--hairline)', borderRadius: '18px' }
const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400 }

function Head({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '0 24px' }}>
      <PreviewTag style={{ marginBottom: '12px' }} />
      <div><span className="opill" style={eyebrow}>{label}</span></div>
      <h2 style={h2}>{children}</h2>
    </div>
  )
}

export function MobileRecentDeals() {
  return (
    <section className="hr" style={{ padding: '36px 0' }}>
      <Head label="Deals on guapd">Recent deals on <span style={serif}>guapd</span></Head>
      <div className="snap-track" style={{ gap: '14px', padding: '0 24px', marginTop: '20px' }}>
        {PREVIEW_DEALS.map((d) => (
          <div key={d.title} style={{ ...card, scrollSnapAlign: 'start', flex: '0 0 70%', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ position: 'relative', aspectRatio: '4/5', background: 'var(--paper-2, #EDF0F5)' }}>
              <span style={{ position: 'absolute', left: '10px', top: '10px', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '9.5px', letterSpacing: '.05em', textTransform: 'uppercase', background: 'rgba(255,255,255,.85)', borderRadius: '999px', padding: '4px 9px' }}>Reel</span>
            </div>
            <div style={{ padding: '14px 16px 16px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>{d.title}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '2px' }}>{d.brand} · {d.when}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px', marginTop: '12px' }}>
                {[['Views', d.views], ['Engagement', d.engagement], ['Saves', d.saves]].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '10px', color: 'var(--ink-faint)' }}>{k}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MobileCampaigns() {
  return (
    <section className="hr" style={{ padding: '36px 0' }}>
      <Head label="Campaigns">Featured <span style={serif}>campaigns</span></Head>
      <div style={{ display: 'grid', gap: '14px', padding: '0 24px', marginTop: '20px' }}>
        {PREVIEW_CAMPAIGNS.map((c) => (
          <div key={c.num} style={{ ...card, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '19px', color: 'var(--ink-faint)' }}>{c.num}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '10.5px', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Brand · {c.brand}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--ink)', marginTop: '2px' }}>{c.name}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', fontWeight: 600, border: '1px solid var(--hairline)', borderRadius: '999px', padding: '5px 10px', whiteSpace: 'nowrap' }}>{c.deliverables} deliverables</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginTop: '14px' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} aria-hidden="true" style={{ aspectRatio: '3/4', background: 'var(--paper-2, #EDF0F5)', borderRadius: '12px' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MobileCreatorRoster({ label = 'Creators on guapd', title }: { label?: string; title?: React.ReactNode }) {
  return (
    <section className="hr" style={{ padding: '36px 0' }}>
      <Head label={label}>{title ?? <>Find vetted <span style={serif}>creators</span></>}</Head>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px', padding: '0 24px', marginTop: '20px' }}>
        {PREVIEW_CREATORS.map((c) => (
          <div key={c.handle} style={{ ...card, padding: '10px' }}>
            <div aria-hidden="true" style={{ aspectRatio: '1/1', background: 'var(--paper-2, #EDF0F5)', borderRadius: '12px' }} />
            <div style={{ padding: '10px 4px 2px' }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '13px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.handle}</div>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', color: 'var(--ink-faint)', marginTop: '2px' }}>{c.niche} · {c.followers} followers</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MobileBrandLogos({ label = 'Brands we work with', title }: { label?: string; title?: React.ReactNode }) {
  return (
    <section className="hr" style={{ padding: '36px 0' }}>
      <Head label={label}>{title ?? <>Brands you already <span style={serif}>know</span></>}</Head>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px', padding: '0 24px', marginTop: '20px' }}>
        {PREVIEW_BRANDS.map((b) => (
          <div key={b.name} style={{ ...card, borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: b.bg, border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '11px', color: 'var(--ink)' }}>{b.initials}</span>
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>{b.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MobileBrandTestimonials() {
  return (
    <section className="hr" style={{ padding: '36px 0' }}>
      <Head label="Testimonials">Run deals directly. Stay <span style={serif}>calm.</span></Head>
      <div className="snap-track" style={{ gap: '20px', padding: '0 24px', marginTop: '20px' }}>
        {PREVIEW_BRAND_QUOTES.map((q) => (
          <div key={q.title} style={{ ...card, scrollSnapAlign: 'start', flex: '0 0 82%', minWidth: 0, padding: '28px 24px', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '36px', color: 'var(--ink-faint)', lineHeight: '1' }}>“</span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', letterSpacing: '-0.02em', margin: '10px 0 0', color: 'var(--ink)' }}>{q.title}</h3>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: '12.5px', lineHeight: '1.55', color: 'var(--ink-soft)', margin: '8px 0 0' }}>{q.quote}</p>
            <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>{q.who}</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', color: 'var(--ink-faint)' }}>{q.org}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
