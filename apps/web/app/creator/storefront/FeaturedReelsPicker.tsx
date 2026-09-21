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
export default function FeaturedReelsPicker({ connected, selectedIds, maxSelectable, onApply }: {
  connected: boolean
  /** The reels currently in the showcase. Opens with these already ticked, so
   *  the panel is the selection rather than a way to add to it. */
  selectedIds: string[]
  /** How many reels may be chosen: the cap, less whatever manual pieces the
   *  creator has. Their own uploads keep their slots. */
  maxSelectable: number
  /** The full new selection, in pick order. The parent reconciles it against
   *  the existing items so a title the creator typed is not lost. */
  onApply: (picked: ReelCandidate[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [reels, setReels] = useState<ReelCandidate[] | null>(null)
  const [selected, setSelected] = useState<string[]>(selectedIds)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()

  /* Hidden ONLY when there is no connected account, because then it can do
     nothing at all.
     Never disabled otherwise. It was, at a full showcase — which made
     CHANGING a selection impossible: a creator who had picked five reels and
     wanted a different fifth had to work out that the fix was deleting a card
     from a list elsewhere on the page. The panel is the selection, so a full
     one is exactly when it is most needed. */
  if (!connected) return null

  function begin() {
    // Reopened from the current selection, not from whatever was left behind
    // last time the panel was closed.
    setSelected(selectedIds)
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
      // Refused with a reason rather than silently dropped on save.
      if (cur.length >= maxSelectable) {
        setNote(`You can show ${maxSelectable} reel${maxSelectable === 1 ? '' : 's'}. Unpick one to swap it.`)
        return cur
      }
      return [...cur, id]
    })
  }

  function apply() {
    // Ordered by the creator's picks, not by Instagram's listing, so the
    // numbered badges match the order they end up in.
    const byId = new Map((reels ?? []).map((r) => [r.id, r]))
    onApply(selected.map((id) => byId.get(id)).filter((r): r is ReelCandidate => !!r))
    setOpen(false); setNote(null)
  }

  if (!open) {
    return (
      <button type="button" onClick={begin} style={btnQuiet}>
        {/* Says what it does NOW. "Pull from Instagram" reads as adding, which
            is wrong once there is a selection to change. */}
        {selectedIds.length > 0
          ? `Edit Instagram selection (${selectedIds.length})`
          : 'Pull from Instagram'}
      </button>
    )
  }

  return (
    <div style={{ width: '100%', marginTop: 4 }}>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6, margin: '0 0 12px' }}>
        Tap to pick or unpick. Their view and engagement figures come from
        Instagram and stay up to date; you can edit the title and brand on each
        card afterwards.
      </p>

      {loading && <p style={{ ...msg, color: 'var(--ink-soft)' }}>Loading your reels…</p>}

      {reels && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10, marginBottom: 12 }}>
            {reels.map((r) => {
              const on = selected.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-pressed={on}
                  style={{
                    position: 'relative', aspectRatio: '9 / 16', padding: 0, cursor: 'pointer',
                    borderRadius: 10, overflow: 'hidden', background: '#EFEFEA',
                    border: on ? '2px solid var(--ink)' : '1px solid rgba(22,23,15,.12)',
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
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Enabled at zero on purpose: clearing the selection is a
                legitimate thing to want, and the only way to do it here. */}
            <button type="button" onClick={apply} style={btnPrimary}>
              {selected.length === 0 ? 'Remove all reels' : `Save ${selected.length} reel${selected.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={() => { setOpen(false); setSelected(selectedIds); setNote(null) }} style={btnQuiet}>
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
