import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import type { Metadata } from 'next'
import CreatorDealsTable from './CreatorDealsTable'
import CreatorDealsMobile from '@/components/CreatorDealsMobile'
import CreatorDealsEmpty from './CreatorDealsEmpty'
import CreatorDealsEmptyDesktop from './CreatorDealsEmptyDesktop'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import { unreadNotificationCount } from '@/lib/unread'

export const metadata: Metadata = { title: 'My Deals · Guapd Creator' }

export default async function CreatorDealsPage() {
  const ctx = await verifyCreator()
  const supabase = createClient()

  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, deal_ref, title, deliverables, price_paise, status, is_posted, created_at, brands(name)')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <main style={wrapper}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', borderRadius: 20, background: '#fff',
            boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)',
            color: '#9B3030',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D2545A', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500 }}>
              Error loading deals: {error.message}
            </span>
          </div>
        </div>
      </main>
    )
  }

  /* WHOSE MOVE IT IS, for the negotiating rows. deals.status says only that a
     negotiation is open; it cannot say who moved last, and deals.last_offer_by
     is not an answer either - createDeal writes 'brand' and neither counter
     action updates it. The counter events are the only record, so read those.

     Scoped to the negotiating deals and skipped entirely when there are none,
     so a creator whose deals are all settled pays nothing for this. */
  const negotiatingIds = (deals ?? []).filter((d) => d.status === 'negotiating').map((d) => d.id)

  const awaitingBrand = new Set<string>()
  if (negotiatingIds.length > 0) {
    const { data: counterEvents } = await supabase
      .from('events')
      .select('deal_id, event_type, created_at')
      .in('deal_id', negotiatingIds)
      .in('event_type', ['deal.counter_offer', 'deal.brand_counter'])
      .order('created_at', { ascending: true })

    // Last writer per deal wins: ascending order means the final entry for a
    // deal is its most recent counter, whoever made it.
    const lastBy = new Map<string, string>()
    for (const e of counterEvents ?? []) lastBy.set(e.deal_id, e.event_type)
    // Array.from, not for..of over the Map — this project targets below ES2015
    // iteration (see the same rule for Set elsewhere).
    for (const [dealId, type] of Array.from(lastBy.entries())) {
      if (type === 'deal.counter_offer') awaitingBrand.add(dealId)
    }
  }

  const all = (deals ?? []).map((d) => {
    const rawBrand = d.brands as unknown
    const brand = Array.isArray(rawBrand) ? rawBrand[0]?.name : (rawBrand as any)?.name ?? null
    return { ...d, brand, awaiting_brand: awaitingBrand.has(d.id) }
  })

  // No deals at all. CreatorDealsTable renders a toolbar, column headers and
  // filters — chrome for a list that does not exist — so the empty state
  // replaces the screen rather than sitting inside it.
  // Both render when there are no deals; the width decides which is visible.
  // Returning the mobile design early fired at every width, so a creator on a
  // desktop with no deals never reached the deals screen.
  const unreadNotifs = await unreadNotificationCount(supabase, ctx.profileId)
  const isEmpty = all.length === 0

  return (
    <>
    {isEmpty && (
      <main className="creator-empty-mobile" style={{ position: 'relative', zIndex: 1 }}>
        <CreatorPageHeader title="My deals" backHref="/creator/dashboard" />
        <CreatorDealsEmpty />
      </main>
    )}
    {/* Desktop has its own drawn empty state now. It used to fall through to
        CreatorDealsTable with an empty array, which renders the toolbar, the
        column headers and seven filters around nothing at all. */}
    {isEmpty ? (
      <main className="creator-empty-desktop" style={{ position: 'relative', zIndex: 1 }}>
        <CreatorDealsEmptyDesktop />
      </main>
    ) : (
      <>
        {/* Both mounted; CSS picks one at 720px. The table has no responsive
            handling of its own, so before this a phone got a desktop table. */}
        <CreatorDealsMobile deals={all} unreadNotifications={unreadNotifs} />
        <main className="cdeals-desktop" style={wrapper}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <CreatorDealsTable deals={all} />
          </div>
        </main>
      </>
    )}
    </>
  )
}

const wrapper: React.CSSProperties = {
  flex: 1, minWidth: 0,
  padding: 'clamp(22px,3vw,38px) clamp(22px,4vw,56px) clamp(48px,5vw,80px)',
}
