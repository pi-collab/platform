import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { readInsightHistory } from '@/lib/deal-post-insights'
import InsightChart from '@/components/InsightChart'
import RecheckInsights from './RecheckInsights'

export const metadata: Metadata = { title: 'How your post did · Guapd' }
export const dynamic = 'force-dynamic'

/**
 * The creator's own view of what their delivered post did.
 *
 * Same numbers the brand sees, deliberately. A creator negotiating their next
 * rate is doing it against figures the brand is already looking at, and showing
 * them something different — or nothing — leaves them arguing blind.
 *
 * It differs in one way: where the brand screen explains an absence, this one
 * offers the FIX. "We could not match this link" is information to a brand and
 * an action to the creator, who is the only person who can re-check it.
 */

interface ItemRow {
  id: string
  label: string | null
  posted_url: string | null
  ig_match_status: string | null
  ig_insights: Record<string, number | undefined> | null
  ig_thumbnail_url: string | null
  ig_last_synced_at: string | null
  ig_insight_history: unknown
}

export default async function CreatorDealAnalyticsPage({ params }: { params: { id: string } }) {
  const ctx = await verifyCreator()
  const admin = createAdminClient()

  // Scoped to this creator's OWN deal. The admin client bypasses RLS, so the
  // creator_id check is the boundary rather than a formality.
  const { data: deal } = await admin
    .from('deals')
    .select('id, deal_ref, title, creator_id, brands(name)')
    .eq('id', params.id)
    .eq('creator_id', ctx.creatorId)
    .maybeSingle()

  if (!deal) notFound()

  const { data: itemRows } = await admin
    .from('deal_deliverable_items')
    .select('id, label, posted_url, ig_match_status, ig_insights, ig_thumbnail_url, ig_last_synced_at, ig_insight_history')
    .eq('deal_id', params.id)
    .order('created_at', { ascending: true })

  const items = (itemRows ?? []) as ItemRow[]
  const posted = items.filter((i) => i.posted_url)
  const brandName = (deal as unknown as { brands?: { name?: string } }).brands?.name ?? 'the brand'

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(20px,4vw,40px) clamp(16px,4vw,28px)' }}>
      <Link href={`/creator/deals/${params.id}`} style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>
        &larr; Back to deal
      </Link>

      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3vw,30px)', letterSpacing: '-0.02em', margin: '14px 0 4px' }}>
        How your post did
      </h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', margin: 0 }}>
        {deal.title || deal.deal_ref} &middot; {brandName} sees these same numbers.
      </p>

      {posted.length === 0 ? (
        <p style={{
          fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6,
          margin: '20px 0 0', padding: '18px 20px', borderRadius: 14,
          background: 'var(--card,#fff)', border: '1px solid var(--hairline,rgba(24,28,36,.12))',
        }}>
          Once you mark a deliverable as posted and add the link, its performance appears here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
          {posted.map((item) => {
            const s = item.ig_insights ?? {}
            const stats = [
              { label: 'Views', value: s.views },
              { label: 'Reach', value: s.reach },
              { label: 'Likes', value: s.likes },
              { label: 'Comments', value: s.comments },
              { label: 'Saves', value: s.saved },
              { label: 'Shares', value: s.shares },
            ].filter((x) => x.value != null)

            const status = item.ig_match_status ?? 'pending'

            return (
              <article key={item.id} style={{
                display: 'flex', gap: 16, padding: 16, borderRadius: 16,
                background: 'var(--card,#fff)', border: '1px solid var(--hairline,rgba(24,28,36,.12))',
              }}>
                <div style={{
                  width: 84, height: 112, flexShrink: 0, borderRadius: 10, overflow: 'hidden',
                  background: 'linear-gradient(150deg,#F4F8FC 0%,#F7F4FB 55%,#FAFAF8 100%)',
                }}>
                  {item.ig_thumbnail_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={item.ig_thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                    {item.label || 'Deliverable'}
                  </span>

                  {stats.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginTop: 10 }}>
                      {stats.map((x) => (
                        <span key={x.label} style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                          <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{fmt(x.value!)}</b> {x.label.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  )}

                  <InsightChart history={readInsightHistory(item.ig_insight_history)} />

                  {/* Where the brand screen explains, this one offers the fix. */}
                  {stats.length === 0 && (
                    <>
                      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.55, margin: '8px 0 0' }}>
                        {FIX[status] ?? FIX.pending}
                      </p>
                      {(status === 'not_found' || status === 'not_connected' || status === 'pending') && (
                        <RecheckInsights dealId={params.id} itemId={item.id} />
                      )}
                    </>
                  )}

                  {item.posted_url && (
                    <a
                      href={item.posted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-block', marginTop: 10, fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}
                    >
                      See the post &rarr;
                    </a>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}

/** Written as something to DO, because the creator is the one who can do it. */
const FIX: Record<string, string> = {
  not_connected:
    'Connect Instagram in Settings and re-check, and the brand will see verified numbers for this post instead of just the link.',
  not_found:
    'We could not match this link to a post on your connected account. Check the link is right and that you posted it from the account you connected, then re-check.',
  unsupported:
    'Verified numbers are available for Instagram posts and reels. The brand still sees your link.',
  resolved:
    'Instagram has no insights for this post. That happens for anything posted before your account became a professional one.',
  pending:
    'We have not read this post yet. Numbers usually appear within a day.',
}

function fmt(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return `${v % 1 === 0 ? v : v.toFixed(1)}M` }
  if (n >= 1_000) { const v = n / 1_000; return `${v % 1 === 0 ? v : v.toFixed(1)}K` }
  return String(n)
}
