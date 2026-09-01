import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { verifyBrand } from '@/lib/brand-auth'
import { readInsightHistory } from '@/lib/deal-post-insights'
import InsightChart from './InsightChart'

export const metadata: Metadata = { title: 'Post performance · Guapd' }
export const dynamic = 'force-dynamic'

/**
 * What the delivered posts actually did.
 *
 * Read straight from the creator's own Instagram account, which is the only
 * media Instagram will serve insights for. Nothing here is entered by hand and
 * nothing is inferred: a post with no numbers says so and shows the link.
 *
 * ── Why every absence is explained ──────────────────────────────────────────
 * "No numbers" has four causes and a brand can act on some of them. Showing a
 * blank card for all four tells them nothing; naming the cause tells them
 * whether to wait, to ask the creator to connect, or to check the link. The
 * status is stored on the item precisely so this screen can say which.
 */

interface ItemRow {
  id: string
  label: string | null
  platform: string | null
  posted_url: string | null
  posted_at: string | null
  ig_match_status: string | null
  ig_insights: Record<string, number | undefined> | null
  ig_thumbnail_url: string | null
  ig_last_synced_at: string | null
  ig_insight_history: unknown
}

export default async function DealAnalyticsPage({ params }: { params: { id: string } }) {
  await verifyBrand()
  const supabase = createClient()

  // RLS scopes a brand to its own deals, so a deal id from another brand
  // resolves to nothing here rather than to someone else's numbers.
  const [{ data: deal }, { data: itemRows }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, deal_ref, title, status, creators(id, full_name, handle)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('deal_deliverable_items')
      .select('id, label, platform, posted_url, posted_at, ig_match_status, ig_insights, ig_thumbnail_url, ig_last_synced_at, ig_insight_history')
      .eq('deal_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  if (!deal) notFound()

  const creator = (deal as unknown as { creators?: { full_name?: string; handle?: string } }).creators
  const creatorName = creator?.full_name?.split(' ')[0] || 'the creator'

  const items = (itemRows ?? []) as ItemRow[]
  const posted = items.filter((i) => i.posted_url)
  const verified = posted.filter((i) => i.ig_match_status === 'resolved' && hasAnyMetric(i.ig_insights))

  // Summed, never averaged. Reach and views add up across posts; a rate does
  // not, and averaging rates across posts of different sizes overweights the
  // small ones.
  const totals = verified.reduce(
    (acc, i) => {
      const s = i.ig_insights ?? {}
      return {
        reach: acc.reach + (s.reach ?? 0),
        views: acc.views + (s.views ?? 0),
        interactions: acc.interactions + (s.totalInteractions ?? 0),
      }
    },
    { reach: 0, views: 0, interactions: 0 },
  )

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(20px,4vw,40px) clamp(16px,4vw,28px)' }}>
      <Link href={`/deals/${params.id}`} style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>
        &larr; Back to deal
      </Link>

      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3vw,30px)', letterSpacing: '-0.02em', margin: '14px 0 4px' }}>
        Post performance
      </h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', margin: 0 }}>
        {deal.title || deal.deal_ref} &middot; {creator?.full_name ?? 'Creator'}
        {creator?.handle ? ` (@${creator.handle})` : ''}
      </p>

      {posted.length === 0 ? (
        <Empty>Nothing has been posted for this deal yet. Performance appears here once {creatorName} marks a deliverable as posted.</Empty>
      ) : (
        <>
          {/* Coverage, stated. A total that quietly omits half the posts is
              worse than no total, and this is the screen spend gets judged on. */}
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)', margin: '18px 0 0' }}>
            {verified.length} of {posted.length} {posted.length === 1 ? 'post' : 'posts'} verified from Instagram
            {verified.length < posted.length && ' — the rest are shown below with the reason'}
          </p>

          {verified.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14,
              margin: '14px 0 0', padding: '16px 18px', borderRadius: 16,
              background: 'var(--card,#fff)', border: '1px solid var(--hairline,rgba(24,28,36,.12))',
            }}>
              {totals.reach > 0 && <Total label="Reach" value={totals.reach} />}
              {totals.views > 0 && <Total label="Views" value={totals.views} />}
              {totals.interactions > 0 && <Total label="Interactions" value={totals.interactions} />}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
            {posted.map((item) => <PostCard key={item.id} item={item} creatorName={creatorName} />)}
          </div>
        </>
      )}
    </main>
  )
}

function PostCard({ item, creatorName }: { item: ItemRow; creatorName: string }) {
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
    <article style={{
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
            {item.label || 'Deliverable'}
          </span>
          {status === 'resolved' && stats.length > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: 999, background: 'var(--neon,#E8FF66)',
              color: 'var(--lime-950,#161B08)', fontFamily: 'var(--font-ui)', fontSize: 10,
              fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
            }}>
              Verified from Instagram
            </span>
          )}
        </div>

        {/* Blank metrics are omitted, never dashed. */}
        {stats.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginTop: 10 }}>
            {stats.map((x) => (
              <span key={x.label} style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
                <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{fmt(x.value!)}</b> {x.label.toLowerCase()}
              </span>
            ))}
          </div>
        )}

        {stats.length === 0 && (
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.55, margin: '8px 0 0' }}>
            {reasonFor(status, creatorName)}
          </p>
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

        {/* Only once there is a shape to show. One reading is a dot, and a
            chart of a dot invites a brand to read a trend that is not there. */}
        <InsightChart history={readInsightHistory(item.ig_insight_history)} />

        {status === 'resolved' && item.ig_last_synced_at && (
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)', margin: '8px 0 0' }}>
            Updated {timeAgo(item.ig_last_synced_at)}. Refreshes daily while the post is new.
          </p>
        )}
      </div>
    </article>
  )
}

/**
 * Why a post has no numbers, in words a brand can act on.
 *
 * "not_found" deliberately does not accuse anyone. A wrong link, a deleted post
 * and a post from a different account are indistinguishable to us, and guessing
 * out loud would be wrong a third of the time.
 */
function reasonFor(status: string, creatorName: string): string {
  switch (status) {
    case 'not_connected':
      return `${creatorName} has not connected their Instagram account, so these numbers are not verified. The post itself is linked below.`
    case 'not_found':
      return `We could not match this link to a post on ${creatorName}'s connected account, so there are no verified numbers for it.`
    case 'unsupported':
      return 'Verified numbers are available for Instagram posts and reels. This link is something else.'
    case 'resolved':
      return `Instagram has no insights for this post. That happens for anything posted before ${creatorName}'s account became a professional one.`
    default:
      return 'Performance for this post has not been read yet. It usually appears within a day of posting.'
  }
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{fmt(value)}</div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 3 }}>{label}, all posts</div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6,
      margin: '20px 0 0', padding: '18px 20px', borderRadius: 14,
      background: 'var(--card,#fff)', border: '1px solid var(--hairline,rgba(24,28,36,.12))',
    }}>{children}</p>
  )
}

function hasAnyMetric(s: Record<string, number | undefined> | null): boolean {
  if (!s) return false
  return ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'totalInteractions']
    .some((k) => s[k] != null)
}

function fmt(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return `${v % 1 === 0 ? v : v.toFixed(1)}M` }
  if (n >= 1_000) { const v = n / 1_000; return `${v % 1 === 0 ? v : v.toFixed(1)}K` }
  return String(n)
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return 'just now'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}
