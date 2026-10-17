'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CreatorCollabPost } from '@/lib/creator-leg-money'
import { openCollabVideo, submitCollabPostLink } from './leg-actions'
import { metaLabel, sectionHeading } from './deal-shell'
import LinkTile, { LinkTiles, tileBtn } from '@/components/LinkTile'

/**
 * 0561: the videos Guapd sent this creator, on the deal page's card design.
 * Collab: post it on Instagram as a collab with the brand, then paste the post
 * link (0566: their invoice no longer waits for it); the brand's affiliate link shows here once
 * added. Shared: theirs to post if they like, nothing asked.
 * 0573: Guapd's posting instructions (caption, tags, timing) show above the links, with Copy.
 */
function Instructions({ text, at }: { text: string; at: string | null }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked: the text is still selectable */ }
  }
  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--sec-2, #F7F7F4)', border: '1px solid var(--border-hairline, #EAEAE3)', borderLeft: '3px solid var(--neon-deep, #8FAF1F)', fontFamily: 'var(--font-ui)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint, #8A8F98)' }}>How to post · from Guapd</span>
        {at && <span style={{ fontSize: 11, color: 'var(--ink-faint, #8A8F98)' }}>updated {fmt(at)}</span>}
        <button type="button" onClick={copy} style={{ ...tileBtn, marginLeft: 'auto' }} aria-label="Copy the posting instructions">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</div>
    </div>
  )
}

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
          ? `Post it on Instagram as a collab with ${brand} (invite them as a collaborator), then paste the post link here.`
          : p.status === 'posted'
          ? `Posted ${fmt(p.posted_at)}. ${brand} runs it as an ad on the agreed terms and marks it complete.`
          : `${brand} marked the ad complete on ${fmt(p.ad_complete_at)}.`}
      </p>
      {p.instructions && <Instructions text={p.instructions} at={p.instructions_at} />}
      {((p.post_url && !editing) || p.affiliate_url) && (
        <LinkTiles>
          {p.post_url && !editing && <LinkTile label="Your post" url={p.post_url}
            actions={p.can_post ? <button type="button" onClick={() => setEditing(true)} style={tileBtn}>Change</button> : undefined} />}
          {p.affiliate_url && <LinkTile label={`${brand}\u2019s affiliate link`} url={p.affiliate_url} hint="Use it wherever you share this post (caption, bio, stories)." />}
        </LinkTiles>
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
          {waiting} collab video{waiting === 1 ? '' : 's'} still to post with {brand}. Paste each post link here once it is up.
          {posts.length === 0 ? ' Guapd sends them once the brand approves the edits.' : ''}
        </p>
      )}
      <div style={{ marginTop: 6 }}>
        {posts.map((p, i) => <PostRow key={p.id} dealId={dealId} p={p} brand={brand} last={i === posts.length - 1} />)}
      </div>
    </div>
  )
}
