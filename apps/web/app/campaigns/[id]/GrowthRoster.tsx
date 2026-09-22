'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setGrowthDraftPackage, removeCampaignDraft, bulkSendCampaignDrafts } from './draft-actions'
import TrackTag from '@/components/track/TrackTag'

/**
 * The roster of a Growth campaign.
 *
 * ── Why this is not DraftPlacementEditor ────────────────────────────────────
 * That editor exists for a negotiation: the brand names a price, adds collab
 * and boosting charges, edits lines. None of it applies here. A Growth package
 * is bought at the price the creator set, there is no counter, and the only
 * decision the brand makes per creator is WHICH package. Reusing the editor
 * would have meant hiding four fifths of it and leaving a price field that
 * must not be editable sitting in the middle.
 *
 * ── What the brand is looking at ────────────────────────────────────────────
 * Three things, in this order: whether they can send yet (the minimum), who is
 * on the roster and for what, and what it costs. The minimum is first because
 * it is the thing standing between them and sending, and discovering it at the
 * button would be the wrong moment.
 */

export interface GrowthProduct {
  id: string
  product_type: string
  platform: string
  handle: string
  price_paise: number
}

export interface GrowthDraft {
  id: string
  creator_id: string
  creatorName: string
  creatorPhoto: string | null
  /** The chosen package, or null when nothing is picked yet. */
  productId: string | null
  pricePaise: number
  products: GrowthProduct[]
}

export interface GrowthMinimumView {
  metric: 'creators' | 'value'
  minCreators: number | null
  minValuePaise: number | null
}

const inr = (paise: number) =>
  '₹' + Math.round(paise / 100).toLocaleString('en-IN')

export default function GrowthRoster({
  campaignId, drafts, minimum, feePercent, uniformType, sentCount,
}: {
  campaignId: string
  drafts: GrowthDraft[]
  minimum: GrowthMinimumView
  /** Snapshot of what the deals will carry. 30 on the growth track. */
  feePercent: number
  /** Set when the campaign is "same for everyone". */
  uniformType: string | null
  /** Deals already sent from this campaign — the roster is drafts only. */
  sentCount: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const priced = drafts.filter((d) => d.productId && d.pricePaise > 0)
  const unpriced = drafts.length - priced.length

  const creatorsTotal = priced.reduce((sum, d) => sum + d.pricePaise, 0)
  /* Deducted, always, on this track: the brand pays the package price and the
     fee comes out of it. Shown rather than folded away, because "no markup on
     the brand" only reads as true if the arithmetic is on screen. */
  const feeTotal = Math.round(creatorsTotal * feePercent / 100)
  const creatorsReceive = creatorsTotal - feeTotal

  const progress = useMemo(() => {
    if (minimum.metric === 'value') {
      const need = minimum.minValuePaise ?? 0
      return {
        met: creatorsTotal >= need,
        label: `${inr(creatorsTotal)} of ${inr(need)}`,
        hint: 'campaign value',
        pct: need > 0 ? Math.min(100, Math.round((creatorsTotal / need) * 100)) : 100,
      }
    }
    const need = minimum.minCreators ?? 0
    return {
      met: priced.length >= need,
      label: `${priced.length} of ${need}`,
      hint: need === 1 ? 'creator' : 'creators',
      pct: need > 0 ? Math.min(100, Math.round((priced.length / need) * 100)) : 100,
    }
  }, [minimum, priced.length, creatorsTotal])

  /* Three separate reasons a send is refused, named separately. "Cannot send"
     with one message covering all of them is how a brand ends up re-reading a
     roster looking for what is wrong. */
  const blocked =
    drafts.length === 0 ? 'Add creators to this campaign'
    : unpriced > 0 ? `${unpriced} creator${unpriced === 1 ? ' has' : 's have'} no package chosen`
    : !progress.met ? `Below the minimum — ${progress.label} ${progress.hint}`
    : null

  function choose(draftId: string, productId: string) {
    setError(null)
    startTransition(async () => {
      const res = await setGrowthDraftPackage(campaignId, draftId, productId || null)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  function remove(draftId: string) {
    setError(null)
    startTransition(async () => {
      const res = await removeCampaignDraft(draftId, campaignId)
      if (res && 'error' in res && res.error) setError(res.error)
      else router.refresh()
    })
  }

  function send() {
    if (blocked) return
    if (!confirm(`Send this campaign to ${priced.length} creators? Each gets their own offer at their own rate.`)) return
    setError(null)
    setSending(true)
    startTransition(async () => {
      const { results } = await bulkSendCampaignDrafts(campaignId, priced.map((d) => d.id))
      const failed = results.filter((r) => !r.success)
      setSending(false)
      if (failed.length > 0) setError(failed.map((f) => f.error).filter(Boolean).join(' · '))
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── The minimum, first ───────────────────────────────────────────── */}
      <div style={{
        borderRadius: 14, padding: '14px 18px',
        background: progress.met ? 'rgba(31,157,107,.07)' : 'var(--sec-2, #F7F4FB)',
        border: `1px solid ${progress.met ? 'rgba(31,157,107,.24)' : 'var(--hairline, #EAEAE3)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: progress.met ? '#1F8A5B' : 'var(--ink)' }}>
            {progress.met ? 'Minimum met' : 'Campaign minimum'}
          </span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, color: progress.met ? '#1F8A5B' : 'var(--ink-soft, #565C68)' }}>
            {progress.label} {progress.hint}
          </span>
        </div>
        <div style={{ marginTop: 10, height: 6, borderRadius: 20, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}
             role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{
            height: '100%', width: `${progress.pct}%`, borderRadius: 20,
            background: progress.met ? '#1F9D6B' : 'var(--lime-400, #C9EB3C)',
            transition: 'width .35s cubic-bezier(.4,0,.2,1)',
          }} />
        </div>
        {uniformType && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint, #8A9099)', marginTop: 8 }}>
            {uniformType} for everyone &middot; each creator&rsquo;s own rate applies
          </div>
        )}
      </div>

      {/* ── The roster ───────────────────────────────────────────────────── */}
      <div>
        {drafts.map((d, i) => (
          <div key={d.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', flexWrap: 'wrap',
            borderTop: i === 0 ? undefined : '1px solid var(--hairline, #EAEAE3)',
          }}>
            <Avatar name={d.creatorName} photo={d.creatorPhoto} />

            <span style={{ flex: 1, minWidth: 160 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                  {d.creatorName}
                </span>
                <TrackTag track="growth" size="sm" />
              </span>
              {d.productId && (
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-faint, #8A9099)', marginTop: 2 }}>
                  {d.products.find((p) => p.id === d.productId)?.handle
                    ? '@' + d.products.find((p) => p.id === d.productId)!.handle
                    : ''}
                </span>
              )}
            </span>

            {/* ── Uniform: nothing to choose. Mixed: their packages. ────── */}
            {uniformType ? (
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft, #565C68)' }}>
                {uniformType}
              </span>
            ) : (
              <select
                value={d.productId ?? ''}
                disabled={pending}
                onChange={(e) => choose(d.id, e.target.value)}
                aria-label={`Package for ${d.creatorName}`}
                style={{
                  minWidth: 210, padding: '7px 10px', borderRadius: 8, fontSize: 13,
                  border: `1px solid ${d.productId ? 'rgba(24,28,36,.18)' : '#D2545A'}`,
                  background: '#fff', color: 'var(--ink)',
                }}
              >
                <option value="">Choose a package</option>
                {d.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_type} — {inr(p.price_paise)}
                  </option>
                ))}
              </select>
            )}

            <span style={{
              minWidth: 92, textAlign: 'right',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14,
              color: d.pricePaise > 0 ? 'var(--ink)' : 'var(--ink-faint, #8A9099)',
            }}>
              {d.pricePaise > 0 ? inr(d.pricePaise) : '—'}
            </span>

            <button
              type="button"
              onClick={() => remove(d.id)}
              disabled={pending}
              aria-label={`Remove ${d.creatorName}`}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-faint, #8A9099)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
            >
              &times;
            </button>
          </div>
        ))}

        {drafts.length === 0 && (
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-faint, #8A9099)', padding: '18px 0' }}>
            {sentCount > 0
              ? 'Everyone on this campaign has been sent their offer.'
              : 'No creators yet. Add Growth creators to build the campaign.'}
          </p>
        )}
      </div>

      {/* ── What it costs, written out ───────────────────────────────────── */}
      {priced.length > 0 && (
        <div style={{ borderTop: '1px solid var(--hairline, #EAEAE3)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Line label={`Creator rates (${priced.length})`} value={inr(creatorsTotal)} />
          <Line label={`Guapd fee (${feePercent}%, deducted)`} value={'−' + inr(feeTotal)} muted />
          <Line label="Creators receive" value={inr(creatorsReceive)} muted />
          <div style={{ height: 1, background: 'var(--hairline, #EAEAE3)', margin: '4px 0' }} />
          <Line label="You pay" value={inr(creatorsTotal)} strong />
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint, #8A9099)', margin: '2px 0 0', lineHeight: 1.5 }}>
            Nothing is added on top &mdash; you pay each creator their listed rate, and our fee comes out of it.
            Every creator is invoiced and paid separately.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030', margin: 0 }}>{error}</p>
      )}

      {/* ── Send ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={send}
          disabled={Boolean(blocked) || pending || sending}
          style={{
            display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 22px',
            borderRadius: 11, border: 'none',
            background: blocked ? 'rgba(24,28,36,.10)' : 'var(--neon, #E8FF66)',
            color: blocked ? 'var(--ink-faint, #8A9099)' : 'var(--ink)',
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5,
            cursor: blocked || pending || sending ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? 'Sending…' : `Send to ${priced.length} creator${priced.length === 1 ? '' : 's'}`}
        </button>
        {blocked && (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint, #8A9099)' }}>{blocked}</span>
        )}
      </div>
    </div>
  )
}

function Line({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-ui)', fontSize: strong ? 14 : 13 }}>
      <span style={{ color: muted ? 'var(--ink-faint, #8A9099)' : 'var(--ink-soft, #565C68)', fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ color: muted ? 'var(--ink-faint, #8A9099)' : 'var(--ink)', fontWeight: strong ? 800 : 600 }}>{value}</span>
    </div>
  )
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <span style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--sec-2, #F7F4FB)', color: 'var(--ink)',
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
    }}>{initials || '?'}</span>
  )
}
