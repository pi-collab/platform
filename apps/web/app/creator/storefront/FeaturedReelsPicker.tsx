'use client'

import { useState, useTransition } from 'react'
import { MAX_FEATURED_REELS } from '@/lib/featured-reels'
import { listMyReels, saveFeaturedReels, type ReelCandidate } from './actions'

/**
 * Choose which reels appear on the shopfront.
 *
 * ── Why this is a picker and not an automatic strip ─────────────────────────
 * The shopfront deliberately does not show recent reels. Latest is not best:
 * an automatic strip shows whatever the creator last made, next to a Content
 * Showcase they curated and a collaborations section that already carries the
 * reel they made for each brand. What was missing was never the strip, it was
 * the choosing — the two server actions behind this screen were written and
 * then had nothing to call them.
 *
 * ── Fetched on demand, never on page load ───────────────────────────────────
 * `listMyReels` pages the creator's media through Instagram, up to four pages.
 * Doing that every time the storefront editor opens would spend a rate limit
 * on a panel most visits never touch, so nothing is fetched until the creator
 * asks to see their reels.
 *
 * Thumbnails here are Instagram's own signed CDN URLs. They expire, which is
 * fine on this private screen and is exactly why the public shopfront shows a
 * copy stored in our bucket instead — see syncFeaturedReels.
 */
export default function FeaturedReelsPicker({ initialSelected, connected }: {
  initialSelected: string[]
  connected: boolean
}) {
  const [reels, setReels] = useState<ReelCandidate[] | null>(null)
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const [saving, startSaving] = useTransition()

  const atCap = selected.length >= MAX_FEATURED_REELS

  function load() {
    setError(null); setNote(null)
    startLoading(async () => {
      const res = await listMyReels()
      if (res.ok) setReels(res.reels)
      else setError(res.message)
    })
  }

  function toggle(id: string) {
    setNote(null)
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      // Refused with a reason rather than silently ignored. The server clamps
      // to the same number, so a selection that looked accepted here and came
      // back trimmed would be the worst version of this.
      if (cur.length >= MAX_FEATURED_REELS) {
        setNote(`You can feature up to ${MAX_FEATURED_REELS} reels. Unpick one to swap it.`)
        return cur
      }
      return [...cur, id]
    })
  }

  function save() {
    setError(null); setNote(null)
    startSaving(async () => {
      const res = await saveFeaturedReels(selected)
      if (res.ok) setNote(selected.length === 0 ? 'Cleared. No reels on your shopfront.' : 'Saved.')
      else setError(res.message ?? 'Could not save that.')
    })
  }

  if (!connected) {
    return (
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6, margin: 0 }}>
        Connect Instagram to choose reels for your shopfront. The numbers on each
        reel come from Instagram, so brands see measured views rather than a claim.
      </p>
    )
  }

  return (
    <div>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6, margin: '0 0 14px' }}>
        Pick up to {MAX_FEATURED_REELS} reels to show on your shopfront, with their
        real view and reach figures from Instagram. Nothing appears until you choose.
      </p>

      {reels === null ? (
        <button type="button" onClick={load} disabled={loading} style={btnPrimary}>
          {loading ? 'Loading your reels…' : 'Choose reels'}
        </button>
      ) : (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
            gap: 10, marginBottom: 14,
          }}>
            {reels.map((r) => {
              const on = selected.includes(r.id)
              const rank = selected.indexOf(r.id) + 1
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-pressed={on}
                  // Dimmed rather than hidden once the cap is reached: the reel
                  // is still there to look at, it just cannot be added.
                  style={{
                    position: 'relative', aspectRatio: '9 / 16', padding: 0, cursor: 'pointer',
                    borderRadius: 12, overflow: 'hidden', background: '#EFEFEA',
                    border: on ? '2px solid var(--ink)' : '1px solid rgba(22,23,15,.12)',
                    opacity: !on && atCap ? 0.45 : 1,
                    transition: 'opacity .15s ease, border-color .15s ease',
                  }}
                >
                  {r.thumbnailUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r.thumbnailUrl} alt={r.caption?.slice(0, 60) ?? 'Reel'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <span style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-soft)' }}>No preview</span>}

                  {on && (
                    <span style={{
                      position: 'absolute', top: 6, left: 6, minWidth: 20, height: 20, padding: '0 5px',
                      borderRadius: 999, background: 'var(--ink)', color: '#fff',
                      fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{rank}</span>
                  )}

                  {typeof r.likeCount === 'number' && (
                    <span style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 6px 5px',
                      background: 'linear-gradient(to top, rgba(0,0,0,.62), transparent)',
                      color: '#fff', fontFamily: 'var(--font-ui)', fontSize: 10.5, fontWeight: 600,
                    }}>{r.likeCount.toLocaleString('en-IN')} likes</span>
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={saving} style={btnPrimary}>
              {saving ? 'Saving…' : `Save ${selected.length} of ${MAX_FEATURED_REELS}`}
            </button>
            <button type="button" onClick={() => { setSelected([]); setNote(null) }} disabled={saving || selected.length === 0} style={btnQuiet}>
              Clear all
            </button>
          </div>
        </>
      )}

      {note && <p style={{ ...msg, color: 'var(--ink-soft)' }}>{note}</p>}
      {error && <p style={{ ...msg, color: '#9B3030' }}>{error}</p>}
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 10, border: '1px solid var(--ink)',
  background: 'var(--ink)', color: '#fff', cursor: 'pointer',
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
}

const btnQuiet: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(22,23,15,.14)',
  background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer',
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
}

const msg: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12.5, margin: '10px 0 0',
}
