'use client'

import { useState } from 'react'

/**
 * A link with room of its own: what it is, the link itself (without https://,
 * cut short with an ellipsis, the full link on hover), then Open and Copy and
 * any extra actions (e.g. Change). Used for the collab post and the brand's
 * affiliate link on the creator's deal, the brand's Experience page and the
 * console, so the three read the same.
 *
 * Lay several out with <LinkTiles>: side by side on desktop, stacked on mobile.
 */
const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')

const tileBtn: React.CSSProperties = {
  height: 30, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border-hairline, #EAEAE3)', background: '#fff',
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center',
}

export function LinkTiles({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 12 }}>{children}</div>
}

export default function LinkTile({ label, url, meta, hint, actions }: {
  label: string
  url: string
  /** A small line under the link: when, by whom. */
  meta?: string
  /** A sentence of guidance under that. */
  hint?: string
  /** Extra buttons after Open and Copy. */
  actions?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard blocked: the link is still selectable */ }
  }
  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--sec-2, #F7F7F4)', border: '1px solid var(--border-hairline, #EAEAE3)', minWidth: 0, fontFamily: 'var(--font-ui)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint, #8A8F98)' }}>{label}</div>
      <a href={url} target="_blank" rel="noreferrer noopener" title={url}
        style={{ display: 'block', marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--ink)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bare(url)}
      </a>
      {meta && <div style={{ fontSize: 11.5, color: 'var(--ink-soft, #565C68)', marginTop: 4 }}>{meta}</div>}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--ink-soft, #565C68)', marginTop: 4, lineHeight: 1.45 }}>{hint}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <a href={url} target="_blank" rel="noreferrer noopener" style={tileBtn}>Open &#8599;</a>
        <button type="button" onClick={copy} style={tileBtn} aria-label={`Copy ${label.toLowerCase()}`}>{copied ? 'Copied' : 'Copy'}</button>
        {actions}
      </div>
    </div>
  )
}

export { tileBtn }
