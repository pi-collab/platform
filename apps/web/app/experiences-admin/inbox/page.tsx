import Link from 'next/link'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { getBrandThread, getLegThread, listBrandThreads, listLegThreads } from '@/lib/experience-console-server'
import { BrandThreadPanel } from '../DealsExtras'
import NoAccess from '../NoAccess'
import LegThreadList from '../LegThreadList'
import LegThreadView from '../LegThreadView'
import { card, container, h1, lede } from '../ui'

export const dynamic = 'force-dynamic'

/**
 * The console inbox (0546): every Guapd ↔ creator thread on a sent Experience
 * deal, across all Experiences, newest activity first. Staff-only (the gate
 * here, and experience_console_require inside every function). The brand never
 * sees these threads; a creator sees only their own.
 */
export default async function ConsoleInboxPage({ searchParams }: { searchParams?: { deal?: string; brand?: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  const rows = await listLegThreads(null)
  const list = rows.ok ? rows.data : []
  const dealId = searchParams?.deal && /^[0-9a-f-]{36}$/i.test(searchParams.deal) && list.some((r) => r.deal_id === searchParams.deal) ? searchParams.deal : null
  const thread = dealId ? await getLegThread(dealId) : null
  // 0550: brand ↔ Guapd threads, one per Experience.
  const brands = await listBrandThreads()
  const brandList = brands.ok ? brands.data : []
  const brandId = searchParams?.brand && /^[0-9a-f-]{36}$/i.test(searchParams.brand) ? searchParams.brand : null
  const brandThread = brandId ? await getBrandThread(brandId) : null
  const unread = list.reduce((n, r) => n + Number(r.unread ?? 0), 0) + brandList.reduce((n, r) => n + Number(r.unread ?? 0), 0)

  return (
    <div style={container}>
      <Link href="/experiences-admin" style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--wg-600)', textDecoration: 'none' }}>← All Experiences</Link>
      <h1 style={{ ...h1, marginTop: 12, fontSize: 'clamp(26px, 3.2vw, 34px)' }}>Messages</h1>
      <p style={lede}>{unread > 0 ? `${unread} unread. ` : ''}Your threads with brands (one per Experience) and with creators on sent deals. Creators see Guapd and never see a brand thread; brands never see a creator thread.</p>
      {brandList.length > 0 && (
        <section className="surface" style={{ ...card, marginTop: 18 }} aria-labelledby="xp-inbox-brands">
          <h2 id="xp-inbox-brands" className="sect-head">Brands</h2>
          <div className="sect-rule" />
          <div className={brandThread?.ok ? 'xp-inbox-split' : undefined} style={{ marginTop: 14 }}>
            <ul className="xp-tl" role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {brandList.map((b) => (
                <li key={b.experience_id}>
                  <Link href={`/experiences-admin/inbox?brand=${b.experience_id}`} className={`xp-tl-row${brandId === b.experience_id ? ' on' : ''}`}>
                    <span className="xp-tl-main">
                      <span className="xp-tl-top"><span className="xp-tl-name">{b.brand_name}</span></span>
                      <span className="xp-tl-sub">{b.experience_title}</span>
                      <span className="xp-tl-last">{b.last_message ? <>{b.last_message.from === 'guapd' ? 'You: ' : ''}{b.last_message.body}</> : <em>No messages yet</em>}</span>
                    </span>
                    {b.unread > 0 && <span className="xp-tl-unread" aria-label={`${b.unread} unread`}>{b.unread}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {brandThread && (brandThread.ok
              ? <BrandThreadPanel experienceId={brandThread.data.experience_id} closeHref="/experiences-admin/inbox" thread={{
                  deal_id: brandThread.data.experience_id, deal_ref: null, status: 'open', experience_id: brandThread.data.experience_id, experience_title: brandThread.data.experience_title,
                  creator_name: brandThread.data.brand_name, creator_handle: null, creator_photo: null, can_message: true,
                  messages: brandThread.data.messages.map((m) => ({ id: m.id, from: m.from === 'guapd' ? 'guapd' as const : 'creator' as const, body: m.body, created_at: m.created_at, sender_name: m.sender_name })),
                }} />
              : <p className="t-body">Could not open the thread: {brandThread.error}</p>)}
          </div>
        </section>
      )}

      <section className="surface" style={{ ...card, marginTop: 18 }}>
        {!rows.ok ? <p className="t-body" style={{ margin: 0 }}>Could not load the messages: {rows.error}</p> : (
          <div className={thread?.ok ? 'xp-inbox-split' : undefined}>
            <LegThreadList rows={list} hrefFor="/experiences-admin/inbox?deal=" activeId={thread?.ok ? thread.data.deal_id : null} showExperience />
            {thread && (thread.ok ? <LegThreadView thread={thread.data} closeHref="/experiences-admin/inbox" /> : <p className="t-body">Could not open the thread: {thread.error}</p>)}
          </div>
        )}
      </section>
      <style dangerouslySetInnerHTML={{ __html: `
        .xp-inbox-split { display: grid; grid-template-columns: minmax(280px, 2fr) 3fr; gap: 16px; align-items: start; }
        @media (max-width: 860px) { .xp-inbox-split { grid-template-columns: 1fr; } .xp-inbox-split > :first-child { display: none; } }
      ` }} />
    </div>
  )
}
