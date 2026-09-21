'use client'

import { useState, useTransition } from 'react'
import { listMyReels, type ReelCandidate } from './actions'

/**
 * Pull reels from Instagram into the content showcase.
 *
 * ── It hands items back, it does not save them ──────────────────────────────
 * An earlier version owned its own list and wrote it through its own server
 * action, into its own key in `creator_storefronts.stats`. That key then had
 * two writers — this panel and the shopfront form, which saves `stats`
 * wholesale — so pressing Save on the shopfront deleted the creator's reels,
 * and they vanished at the following night's sync.
 *
 * Now there is one list. A reel becomes an ordinary showcase item, saved by
 * the form alongside everything else, and the item carries the reel's id so
 * the page can read its current figures from the snapshot. One list, one
 * writer, and no key for another screen to overwrite.
 *
 * ── Fetched on demand ───────────────────────────────────────────────────────
 * `listMyReels` pages the creator's media through Instagram up to four times.
 * Doing that whenever the editor opens would spend a rate limit on a panel
 * most visits never touch, so nothing is fetched until it is asked for.
 *
 * Thumbnails here are Instagram's own signed CDN URLs, fine on this private
 * screen because they are used immediately and never stored. The public page
 * shows our copies instead — see syncFeaturedReels.
 */
export default function FeaturedReelsPicker({ connected, alreadyPicked, remainingSlots, onPick }: {
  connected: boolean
  /** Reels already in the showcase, so they cannot be added twice. */
  alreadyPicked: string[]
  /** How many showcase slots are left. Zero disables the whole panel. */
  remainingSlots: number
  onPick: (picked: ReelCandidate[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [reels, setReels] = useState<ReelCandidate[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()

  if (!connected || remainingSlots === 0) return null

  function begin() {
    setOpen(true); setError(null); setNote(null)
    if (reels) return
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
      // Refused with a reason rather than silently dropped on save. The
      // showcase holds eight items in total, however they got there.
      if (cur.length >= remainingSlots) {
        setNote(`You have ${remainingSlots} slot${remainingSlots === 1 ? '' : 's'} left in your showcase. Unpick one to swap it.`)
        return cur
      }
      return [...cur, id]
    })
  }

  function add() {
    const chosen = (reels ?? []).filter((r) => selected.includes(r.id))
    onPick(chosen)
    setSelected([]); setOpen(false); setNote(null)
  }

  if (!open) {
    return (
      <button type="button" onClick={begin} style={btnQuiet}>
        Pull from Instagram
      </button>
    )
  }

  return (
    <div style={{ width: '100%', marginTop: 4 }}>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6, margin: '0 0 12px' }}>
        Pick reels to add to your showcase. Their view and engagement figures come
        from Instagram and stay up to date &mdash; you can edit the title and brand
        after adding.
      </p>

      {loading && <p style={{ ...msg, color: 'var(--ink-soft)' }}>Loading your reels…</p>}

      {reels && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, marginBottom: 12 }}>
            {reels.map((r) => {
              const used = alreadyPicked.includes(r.id)
              const on = selected.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => !used && toggle(r.id)}
                  disabled={used}
                  aria-pressed={on}
                  title={used ? 'Already in your showcase' : undefined}
                  style={{
                    position: 'relative', aspectRatio: '9 / 16', padding: 0,
                    cursor: used ? 'default' : 'pointer',
                    borderRadius: 10, overflow: 'hidden', background: '#EFEFEA',
                    border: on ? '2px solid var(--ink)' : '1px solid rgba(22,23,15,.12)',
                    opacity: used ? 0.35 : 1,
                  }}
                >
                  {r.thumbnailUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r.thumbnailUrl} alt={r.caption?.slice(0, 60) ?? 'Reel'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <span style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--ink-soft)' }}>No preview</span>}
                  {on && (
                    <span style={{
                      position: 'absolute', top: 5, left: 5, width: 18, height: 18, borderRadius: 999,
                      background: 'var(--ink)', color: '#fff', fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{selected.indexOf(r.id) + 1}</span>
                  )}
                  {used && (
                    <span style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 4px 4px',
                      background: 'linear-gradient(to top, rgba(0,0,0,.6), transparent)',
                      color: '#fff', fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 700,
                    }}>Added</span>
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={add} disabled={selected.length === 0} style={btnPrimary}>
              Add {selected.length || ''} to showcase
            </button>
            <button type="button" onClick={() => { setOpen(false); setSelected([]); setNote(null) }} style={btnQuiet}>
              Cancel
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
  padding: '9px 16px', borderRadius: 10, border: '1px dashed rgba(22,23,15,.22)',
  background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer',
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
}

const msg: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12.5, margin: '10px 0 0',
}
