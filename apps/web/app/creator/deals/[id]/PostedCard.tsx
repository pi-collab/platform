'use client'

import { useState } from 'react'
import { markItemPosted, markPosted } from './posted-actions'

interface PostedItem {
  id: string
  label: string
  platform?: string | null
  posted_url: string | null
  posted_at: string | null
}

interface Props {
  dealId: string
  items?: PostedItem[]
  timelineDate?: string | null
}

export default function PostedCard({ dealId, items, timelineDate }: Props) {
  // No structured items — legacy single-URL mode
  if (!items || items.length === 0) {
    return <SinglePostCard dealId={dealId} timelineDate={timelineDate} />
  }

  const postedCount = items.filter((i) => !!i.posted_url).length
  const allPosted = postedCount === items.length

  // Build date range text
  const dateRange = timelineDate
    ? (() => {
        const d = new Date(timelineDate + 'T00:00:00')
        const day = d.getDate()
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const mon = months[d.getMonth()]
        const start = new Date(d)
        start.setDate(start.getDate() - 6)
        return `${start.getDate()} – ${day} ${mon}`
      })()
    : null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
          {allPosted ? 'Content posted' : 'Time to share it'}
        </h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: allPosted ? 'var(--success, #16a34a)' : 'var(--warning)' }} />
          {allPosted ? 'ALL POSTED' : `${postedCount} OF ${items.length} POSTED`}
        </span>
      </div>

      {!allPosted && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 22, borderRadius: 16, marginTop: 18, background: 'var(--sec-2, #f5f5f0)', border: '1px solid var(--sec-mid-2, #e5e5dc)' }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--sec-mid-2, #e5e5dc)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {items.length === 1
                ? 'Your deliverable is approved and ready for your feed'
                : `All ${items.length} assets are approved and ready for your feed`}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-soft)', marginTop: 5, maxWidth: 560 }}>
              {dateRange
                ? `Publish any day between ${dateRange}, then paste the live URL for each below. That confirms the campaign ran and unlocks your invoice.`
                : 'Paste the live URL for each deliverable below once you publish. That confirms the campaign ran and unlocks your invoice.'}
            </div>
          </div>
        </div>
      )}

      {/* Per-item posting rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        {items.map((item) => (
          <ItemPostRow key={item.id} dealId={dealId} item={item} />
        ))}
      </div>
    </>
  )
}

const PLATFORM_PLACEHOLDERS: Record<string, string> = {
  instagram: 'https://instagram.com/reel/…',
  youtube: 'https://youtube.com/shorts/…',
  twitter: 'https://x.com/username/status/…',
  linkedin: 'https://linkedin.com/posts/…',
  facebook: 'https://facebook.com/…',
}

function ItemPostRow({ dealId, item }: { dealId: string; item: PostedItem }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [posted, setPosted] = useState(!!item.posted_url)
  const [postedUrl, setPostedUrl] = useState(item.posted_url)

  async function handleSubmit() {
    if (!url.trim()) return
    setError(null)
    setLoading(true)
    const result = await markItemPosted(dealId, item.id, url)
    setLoading(false)
    if (result.status === 'error') {
      setError(result.message)
    } else {
      setPosted(true)
      setPostedUrl(url.trim())
    }
  }

  if (posted && postedUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--success, #16a34a)', boxShadow: '0 0 0 4px rgba(22,163,74,.18)', flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{item.label}</div>
          <a href={postedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'underline', wordBreak: 'break-all' }}>
            {postedUrl.length > 50 ? postedUrl.slice(0, 50) + '…' : postedUrl}
          </a>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success, #16a34a)', whiteSpace: 'nowrap' }}>Posted</span>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 18px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>{item.label}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="dinput"
          style={{ flex: 1, minWidth: 200 }}
          placeholder={PLATFORM_PLACEHOLDERS[item.platform?.toLowerCase() ?? ''] ?? 'https://…'}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <button
          className="neonbtn"
          onClick={handleSubmit}
          disabled={loading || !url.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 40, padding: '0 16px', borderRadius: 10,
            background: 'var(--neon)', border: 'none',
            boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12, color: 'var(--ink)',
            cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !url.trim() ? 0.5 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          {loading ? '...' : 'Mark as posted'}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0' }}>{error}</p>}
    </div>
  )
}

/** Fallback for deals without structured items — single URL posting */
function SinglePostCard({ dealId, timelineDate }: { dealId: string; timelineDate?: string | null }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    if (!url.trim()) return
    setError(null)
    setLoading(true)
    const result = await markPosted(dealId, url)
    setLoading(false)
    if (result.status === 'error') {
      setError(result.message)
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--success, #16a34a)', boxShadow: '0 0 0 4px rgba(22,163,74,.18)' }} />
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>Content posted</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
          Marked as posted. The brand has been notified.
        </p>
      </>
    )
  }

  const dateRange = timelineDate
    ? (() => {
        const d = new Date(timelineDate + 'T00:00:00')
        const day = d.getDate()
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const mon = months[d.getMonth()]
        const start = new Date(d)
        start.setDate(start.getDate() - 6)
        return `${start.getDate()} – ${day} ${mon}`
      })()
    : null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Time to share it</h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
          NOT POSTED
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
        <input
          className="dinput"
          style={{ flex: 1, minWidth: 260 }}
          placeholder="https://instagram.com/p/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <button
          className="neonbtn"
          onClick={handleSubmit}
          disabled={loading || !url.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 44, padding: '0 20px', borderRadius: 11,
            background: 'var(--neon)', border: 'none',
            boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13, color: 'var(--ink)',
            cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !url.trim() ? 0.5 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          {loading ? 'Posting...' : 'Mark as posted'}
        </button>
      </div>

      {error && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '10px 0 0', background: '#fef2f2', padding: '6px 10px', borderRadius: 8 }}>{error}</p>}
    </>
  )
}
