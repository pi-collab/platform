'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CreatorCollabPost } from '@/lib/creator-leg-money'
import { openCollabVideo, submitCollabPostLink } from './leg-actions'
import { metaLabel, sectionHeading } from './deal-shell'

/**
 * 0561: the videos Guapd sent this creator, on the deal page's card design.
 * Collab: post it on Instagram as a collab with the brand, then paste the post
 * link (their invoice waits for it); the brand's affiliate link shows here once
 * added. Shared: theirs to post if they like, nothing asked.
 */
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

function PostRow({ dealId, p, brand, last }: { dealId: string; p: CreatorCollabPost; brand: string; last: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(p.can_post && !p.post_url)
  const [url, setUrl] = useState(p.post_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const open = async () => {
    setError(null)
    const w = window.open('', '_blank')
    const r = await openCollabVideo(dealId, p.id)
    if (!r.ok) { w?.close(); setError(r.message); return }
    if (w) w.location.href = r.data; else window.location.href = r.data
  }
  const save = () => {
    setError(null)
    start(async () => {
      const r = await submitCollabPostLink(dealId, p.id, url)
      if (!r.ok) { setError(r.message); return }
      setEditing(false); router.refresh()
    })
  }
  const pill = p.kind === 'share' ? 'Yours to post' : p.status === 'ad_complete' ? 'Ad complete' : p.status === 'posted' ? 'Posted' : 'To post'
  const dot = p.kind === 'share' ? 'var(--ink-faint)' : p.status === 'sent' ? 'var(--warning)' : p.status === 'posted' ? 'var(--neon-deep)' : 'var(--success, #16a34a)'
  return (
    <div style={{ padding: '14px 0', borderBottom: last ? 'none' : '1px solid var(--border-hairline, #EAEAE3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{p.label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />{pill}
        </span>
        <button type="button" className="pill" onClick={open} style={{ marginLeft: 'auto', height: 34, padding: '0 14px', borderRadius: 999, border: '1.5px solid var(--border-hairline, #EAEAE3)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          {p.has_link ? 'Open video' : 'Download video'}
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '6px 0 0', lineHeight: 1.5 }}>
        {p.kind === 'share'
          ? `Guapd shared this on ${fmt(p.sent_at)}. Post it on your own account if you like; nothing more is needed.`
          : p.status === 'sent'
          ? `Post it on Instagram as a collab with ${brand} (invite them as a collaborator), then paste the post link here. Your invoice waits for it.`
          : p.status === 'posted'
          ? `Posted ${fmt(p.posted_at)}. ${brand} runs it as an ad on the agreed terms and marks it complete.`
          : `${brand} marked the ad complete on ${fmt(p.ad_complete_at)}.`}
      </p>
      {p.post_url && !editing && (
        <div style={{ fontSize: 12.5, marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span>Your post: <a href={p.post_url} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.post_url}</a></span>
          {p.can_post && <button type="button" onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', color: 'var(--ink)' }}>Change</button>}
        </div>
      )}
      {p.affiliate_url && (
        <div style={{ fontSize: 12.5, marginTop: 6 }}>
          {brand}&rsquo;s affiliate link: <a href={p.affiliate_url} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--ink)', fontWeight: 600, wordBreak: 'break-all' }}>{p.affiliate_url}</a>
        </div>
      )}
      {editing && p.can_post && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input className="dinput" aria-label={`Instagram post link for ${p.label}`} placeholder="https://www.instagram.com/reel/…" value={url} maxLength={500}
            onChange={(e) => setUrl(e.target.value)} style={{ flex: '1 1 240px', height: 42 }} />
          <button type="button" className="neonbtn" disabled={pending || !url.trim()} onClick={save}
            style={{ height: 42, padding: '0 18px', borderRadius: 999, border: 'none', background: 'var(--neon)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: pending || !url.trim() ? 0.6 : 1 }}>
            {pending ? 'Saving…' : 'Save post link'}
          </button>
        </div>
      )}
      {error && <p role="alert" style={{ fontSize: 12.5, color: '#9B3030', margin: '8px 0 0' }}>{error}</p>}
    </div>
  )
}

export default function CollabPosts({ dealId, posts, brand, waiting }: { dealId: string; posts: CreatorCollabPost[]; brand: string; waiting: number }) {
  if (posts.length === 0 && waiting === 0) return null
  return (
    <div className="surface" style={{ padding: '22px 24px' }} id="your-videos">
      <div style={metaLabel}>From your shoot</div>
      <h3 style={{ ...sectionHeading, marginTop: 6 }}>Your videos</h3>
      {waiting > 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '8px 0 0', lineHeight: 1.5 }}>
          {waiting} collab video{waiting === 1 ? '' : 's'} still to post. You can raise your invoice once {waiting === 1 ? 'it is' : 'they are'} posted and linked here.
          {posts.length === 0 ? ' Guapd sends them once the brand approves the edits.' : ''}
        </p>
      )}
      <div style={{ marginTop: 6 }}>
        {posts.map((p, i) => <PostRow key={p.id} dealId={dealId} p={p} brand={brand} last={i === posts.length - 1} />)}
      </div>
    </div>
  )
}
