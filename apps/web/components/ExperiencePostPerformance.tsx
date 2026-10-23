import type { ReactNode } from 'react'
import { compactNumber } from '@/lib/compact-number'
import type { PostMetrics } from '@/lib/experience-brand-server'
import './experience-post-performance.css'

/** The shape both reads return (brand 0576, console 0577): performance only. */
export type PerformancePost = {
  post_id: string; creator_name: string; handle: string | null; label: string
  post_url: string; posted_at: string; match_status: string
  metrics: PostMetrics | null; thumbnail_url: string | null; synced_at: string | null
}

/**
 * 0576/0577: how the creators' collab posts did, from the same verified Instagram
 * numbers a deal's analytics page shows. Performance only: the read behind it
 * (brand_experience_post_performance / experience_console_post_performance)
 * carries no pay, cost or margin. Used by the brand's Experience page and the
 * ops console's Analytics tabs, so both show the same numbers.
 *
 * Totals add VERIFIED posts only; a post with no verified numbers says why,
 * the same reasons the deal analytics page gives.
 */
export default function ExperiencePostPerformance({ posts, action, showTotals = true, showPosts = true }: {
  posts: PerformancePost[]
  showPosts?: boolean
  /** Optional per-post control (the console's Re-check). */
  action?: (postId: string) => ReactNode
  showTotals?: boolean
}) {
  const verified = posts.filter((p) => p.match_status === 'resolved' && p.metrics && Object.values(p.metrics).some((v) => typeof v === 'number'))
  const sum = (k: keyof PostMetrics) => verified.reduce((n, p) => n + (p.metrics?.[k] ?? 0), 0)
  // Shown only if at least one verified post reported it: a metric Instagram
  // gave for no post is "—", not a confident zero.
  const has = (k: keyof PostMetrics) => verified.some((p) => typeof p.metrics?.[k] === 'number')
  const fmtSum = (k: keyof PostMetrics) => (has(k) ? compactNumber(sum(k)) : '—')
  const reach = sum('reach')
  const views = sum('views')
  const interactions = sum('totalInteractions')
  const rate = reach > 0 ? (interactions / reach) * 100 : null

  return (
    <div>
      {showTotals && <><div className="bx-perf-totals">
        <Total label="Reach" value={reach > 0 ? compactNumber(reach) : '—'} />
        <Total label="Views" value={views > 0 ? compactNumber(views) : '—'} />
        <Total label="Interactions" value={interactions > 0 ? compactNumber(interactions) : '—'} />
        <Total label="Engagement" value={rate != null ? `${rate.toFixed(1)}%` : '—'} />
      </div>
      <div className="bx-perf-totals bx-perf-totals--minor">
        <Total label="Likes" value={fmtSum('likes')} small />
        <Total label="Comments" value={fmtSum('comments')} small />
        <Total label="Shares" value={fmtSum('shares')} small />
        <Total label="Saves" value={fmtSum('saved')} small />
      </div>
      <p className="bx-perf-note">
        Verified across {verified.length} of {posts.length} {posts.length === 1 ? 'post' : 'posts'}, from each creator&apos;s own Instagram account.
      </p></>}
      {showPosts && <div className="bx-perf-grid">
        {posts.map((p) => (
          <div key={p.post_id} className="bx-perf-card">
            {p.thumbnail_url
              ? <img src={p.thumbnail_url} alt="" className="bx-perf-thumb" loading="lazy" />
              : <div className="bx-perf-thumb" aria-hidden="true" />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{p.creator_name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>{p.label}{p.handle ? ` · @${p.handle.replace(/^@/, '')}` : ''}</div>
              {p.match_status === 'resolved' && p.metrics ? (
                <div className="bx-perf-stats">
                  {p.metrics.views != null && <Stat label="Views" value={p.metrics.views} />}
                  {p.metrics.reach != null && <Stat label="Reach" value={p.metrics.reach} />}
                  {p.metrics.likes != null && <Stat label="Likes" value={p.metrics.likes} />}
                  {p.metrics.comments != null && <Stat label="Comments" value={p.metrics.comments} />}
                  {p.metrics.saved != null && <Stat label="Saves" value={p.metrics.saved} />}
                  {p.metrics.shares != null && <Stat label="Shares" value={p.metrics.shares} />}
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '8px 0 0', lineHeight: 1.5 }}>{reasonFor(p.match_status, p.creator_name)}</p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
                <a href={p.post_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>View post ↗</a>
                {action?.(p.post_id)}
              </div>
            </div>
          </div>
        ))}
      </div>}
    </div>
  )
}

function Total({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: small ? 17 : 22, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{compactNumber(value)}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{label}</div>
    </div>
  )
}

function reasonFor(status: string, creatorName: string): string {
  switch (status) {
    case 'not_connected':
      return `${creatorName} has not connected their Instagram account, so there are no verified numbers yet.`
    case 'not_found':
      return `This link does not match a post on ${creatorName}'s connected account, so there are no verified numbers for it.`
    case 'unsupported':
      return 'Verified numbers are available for Instagram posts and reels. This link is something else.'
    case 'resolved':
      return 'Instagram has no insights for this post yet.'
    default:
      return 'Numbers for this post have not been read yet. They usually appear within a day of posting.'
  }
}
