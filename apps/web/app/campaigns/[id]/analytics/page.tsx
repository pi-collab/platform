import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { verifyBrand } from '@/lib/brand-auth'

export const metadata: Metadata = { title: 'Campaign performance · Guapd' }
export const dynamic = 'force-dynamic'

/**
 * What a campaign's posts did, across every creator on it.
 *
 * A campaign is a grouping over independent single-creator deals, so this is a
 * rollup of the same per-post numbers the deal screen shows, never a separate
 * source of truth.
 *
 * ── Sums, not averages ──────────────────────────────────────────────────────
 * Reach and views add up across posts. An engagement RATE does not: averaging
 * one creator's 9% over 800 reach with another's 2% over 400,000 produces 5.5%,
 * which describes nobody and flatters the campaign. Where a campaign-level rate
 * is wanted it is total interactions over total reach, computed once at the end.
 *
 * ── Coverage is stated ──────────────────────────────────────────────────────
 * Not every post can be verified: a creator may not have connected Instagram,
 * and Instagram refuses insights for anything posted before an account became
 * professional. A total that silently omits those posts understates the
 * campaign while looking authoritative, so the count is always on screen.
 */

interface ItemRow {
  id: string
  deal_id: string
  label: string | null
  posted_url: string | null
  ig_match_status: string | null
  ig_insights: Record<string, number | undefined> | null
  ig_thumbnail_url: string | null
}

interface DealRow {
  id: string
  title: string | null
  creators?: { id?: string; full_name?: string; handle?: string } | null
}

export default async function CampaignAnalyticsPage({ params }: { params: { id: string } }) {
  await verifyBrand()
  const supabase = createClient()

  // RLS scopes a brand to its own campaigns and deals, so another brand's id
  // resolves to nothing rather than to their numbers.
  const [{ data: campaign }, { data: dealRows }] = await Promise.all([
    supabase.from('campaigns').select('id, name, status').eq('id', params.id).maybeSingle(),
    supabase
      .from('deals')
      .select('id, title, creators(id, full_name, handle)')
      .eq('campaign_id', params.id),
  ])

  if (!campaign) notFound()

  const deals = (dealRows ?? []) as unknown as DealRow[]
  const dealIds = deals.map((d) => d.id)

  const { data: itemRows } = dealIds.length
    ? await supabase
        .from('deal_deliverable_items')
        .select('id, deal_id, label, posted_url, ig_match_status, ig_insights, ig_thumbnail_url')
        .in('deal_id', dealIds)
    : { data: [] as ItemRow[] }

  const items = (itemRows ?? []) as ItemRow[]
  const posted = items.filter((i) => i.posted_url)
  const verified = posted.filter((i) => i.ig_match_status === 'resolved' && hasAnyMetric(i.ig_insights))

  const totals = sum(verified)
  // Computed ONCE, from the campaign's own totals. Never an average of per-post
  // rates, which would weight a 500-reach post the same as a 400,000 one.
  const rate = totals.reach > 0 ? (totals.interactions / totals.reach) * 100 : null

  // Per creator, so a brand can see who carried the campaign rather than only
  // what it did in aggregate.
  const byDeal = new Map<string, DealRow>(deals.map((d) => [d.id, d]))
  const perCreator = deals
    .map((deal) => {
      const mine = posted.filter((i) => i.deal_id === deal.id)
      const mineVerified = mine.filter((i) => i.ig_match_status === 'resolved' && hasAnyMetric(i.ig_insights))
      return {
        deal,
        postedCount: mine.length,
        verifiedCount: mineVerified.length,
        totals: sum(mineVerified),
        // The reason shown when a creator contributes no verified numbers, so
        // the gap is explained rather than left as a blank row.
        gap: mine.length > 0 && mineVerified.length === 0
          ? (mine[0].ig_match_status ?? 'pending')
          : null,
      }
    })
    .filter((r) => r.postedCount > 0)
    .sort((a, b) => b.totals.reach - a.totals.reach)

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(20px,4vw,40px) clamp(16px,4vw,28px)' }}>
      <Link href={`/campaigns/${params.id}`} style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none' }}>
        &larr; Back to campaign
      </Link>

      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px,3vw,30px)', letterSpacing: '-0.02em', margin: '14px 0 4px' }}>
        Campaign performance
      </h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', margin: 0 }}>
        {campaign.name} &middot; {deals.length} {deals.length === 1 ? 'creator' : 'creators'}
      </p>

      {posted.length === 0 ? (
        <Empty>Nothing has been posted on this campaign yet. Performance appears here as creators mark their deliverables posted.</Empty>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)', margin: '18px 0 0' }}>
            {verified.length} of {posted.length} {posted.length === 1 ? 'post' : 'posts'} verified from Instagram
            {verified.length < posted.length && ' — totals below cover the verified posts only'}
          </p>

          {verified.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 16,
              margin: '14px 0 0', padding: '18px 20px', borderRadius: 16,
              background: 'var(--card,#fff)', border: '1px solid var(--hairline,rgba(24,28,36,.12))',
            }}>
              {totals.reach > 0 && <Total label="Total reach" value={fmt(totals.reach)} />}
              {totals.views > 0 && <Total label="Total views" value={fmt(totals.views)} />}
              {totals.interactions > 0 && <Total label="Interactions" value={fmt(totals.interactions)} />}
              {rate != null && (
                <Total
                  label="Interactions per reach"
                  value={`${rate.toFixed(1)}%`}
                  note="Campaign totals, not an average of each post"
                />
              )}
            </div>
          )}

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '28px 0 12px' }}>By creator</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {perCreator.map((row) => (
              <article
                key={row.deal.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  padding: '14px 16px', borderRadius: 14,
                  background: 'var(--card,#fff)', border: '1px solid var(--hairline,rgba(24,28,36,.12))',
                }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                    {row.deal.creators?.full_name ?? 'Creator'}
                    {row.deal.creators?.handle && (
                      <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}> @{row.deal.creators.handle}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                    {row.verifiedCount} of {row.postedCount} verified
                  </div>
                </div>

                {row.gap ? (
                  <p style={{ flex: 2, minWidth: 220, margin: 0, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    {gapReason(row.gap, row.deal.creators?.full_name?.split(' ')[0] ?? 'This creator')}
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    {row.totals.reach > 0 && <Mini label="reach" value={row.totals.reach} />}
                    {row.totals.views > 0 && <Mini label="views" value={row.totals.views} />}
                    {row.totals.interactions > 0 && <Mini label="interactions" value={row.totals.interactions} />}
                  </div>
                )}

                <Link
                  href={`/deals/${row.deal.id}/analytics`}
                  style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  Per post &rarr;
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

function sum(items: ItemRow[]) {
  return items.reduce(
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
}

function gapReason(status: string, firstName: string): string {
  switch (status) {
    case 'not_connected':
      return `${firstName} has not connected Instagram, so their posts are not counted in the totals above.`
    case 'not_found':
      return `We could not match ${firstName}'s link to a post on their connected account.`
    case 'unsupported':
      return 'Verified numbers are available for Instagram posts and reels.'
    case 'resolved':
      return `Instagram has no insights for ${firstName}'s post — that happens for anything posted before their account became professional.`
    default:
      return 'Not read yet. Numbers usually appear within a day of posting.'
  }
}

function Total({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 3 }}>{label}</div>
      {note && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 3, lineHeight: 1.4 }}>{note}</div>}
    </div>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
      <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{fmt(value)}</b> {label}
    </span>
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
  return ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'totalInteractions'].some((k) => s[k] != null)
}

function fmt(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return `${v % 1 === 0 ? v : v.toFixed(1)}M` }
  if (n >= 1_000) { const v = n / 1_000; return `${v % 1 === 0 ? v : v.toFixed(1)}K` }
  return String(n)
}
