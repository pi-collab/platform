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
  /* This draft's OWN resolved fee. Usually 30, but an ops pair rate outranks
     the growth rung, so a flat 30 in the footer would misreport a creator the
     founders have agreed a different rate with — and the footer would then
     disagree with the deal the send creates. */
  feePercent: number
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
  campaignId, drafts, minimum, uniformType, sentCount,
}: {
  campaignId: string
  drafts: GrowthDraft[]
  minimum: GrowthMinimumView
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

  /* ── DEDUCTED, always, on this track ──────────────────────────────────────
     The brand pays the sum of the creators' own rates and NOTHING is added on
     top. The fee is Guapd's cut out of the creator's side. It is shown rather
     than folded away, because "no markup on the brand" only reads as true when
     the arithmetic is on screen — but it must never be shown as a line the
     brand's total is built UP from.

     Summed per draft rather than taken off the total, so an ops pair rate on
     one creator is reported correctly instead of being averaged away. */
  const feeTotal = priced.reduce((sum, d) => sum + Math.round(d.pricePaise * d.feePercent / 100), 0)
  const creatorsReceive = creatorsTotal - feeTotal

  /* One percentage only when every creator carries the same one. With a mixed
     set, naming a single number would be a claim about rows it is not true of. */
  const sharedPercent = priced.length > 0 && priced.every((d) => d.feePercent === priced[0].feePercent)
    ? priced[0].feePercent
    : null

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
  /* drafts.length === 0 is not listed: the send row is not rendered at all in
     that state, so a reason for it would never be read. */
  const blocked =
    unpriced > 0 ? `${unpriced} creator${unpriced === 1 ? ' has' : 's have'} no package chosen`
    : !progress.met ? `Below the minimum. ${progress.label} ${progress.hint}`
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
      {/* ── The minimum, first ───────────────────────────────────────────
          Not shown on an empty roster: a bar at zero measures nothing, and it
          would be the second thing on screen telling a brand to add creators. */}
      {drafts.length > 0 && (
      <div style={{
        borderRadius: 14, padding: '14px 18px',
        background: progress.met ? 'rgba(31,157,107,.07)' : 'var(--sec-2, #F7F4FB)',
        border: `1px solid ${progress.met ? 'rgba(31,157,107,.24)' : 'var(--hairline, #EAEAE3)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="t-meta" style={{ color: progress.met ? '#1F8A5B' : 'var(--ink-2, #565C68)' }}>
            {progress.met ? 'Minimum met' : 'Campaign minimum'}
          </span>
          <span className="t-data" style={{ fontSize: 14, color: progress.met ? '#1F8A5B' : 'var(--ink)' }}>
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
      )}

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

            {/* ── Uniform: nothing to choose. Mixed: their packages. ──────
                Laid out rather than hidden in a <select>. A creator has one to
                three packages and the PRICE is most of the decision, so a
                dropdown makes the brand open something to find out what their
                options cost, then close it again to compare the next creator.
                Side by side, a roster of ten can be read down a column.

                Falls back to a select past four, where chips would wrap into a
                block taller than the row. */}
            {uniformType ? (
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft, #565C68)' }}>
                {uniformType}
              </span>
            ) : d.products.length === 0 ? (
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030' }}>
                No packages listed yet
              </span>
            ) : d.products.length > 4 ? (
              <select
                value={d.productId ?? ''}
                disabled={pending}
                onChange={(e) => choose(d.id, e.target.value)}
                aria-label={`Package for ${d.creatorName}`}
                style={{
                  minWidth: 210, padding: '8px 10px', borderRadius: 9, fontSize: 13,
                  border: `1px solid ${d.productId ? 'rgba(24,28,36,.18)' : 'rgba(210,84,90,.55)'}`,
                  background: '#fff', color: 'var(--ink)',
                }}
              >
                <option value="">Choose a package</option>
                {d.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_type} &middot; {inr(p.price_paise)}
                  </option>
                ))}
              </select>
            ) : (
              <span role="radiogroup" aria-label={`Package for ${d.creatorName}`}
                    style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {d.products.map((p) => {
                  const on = d.productId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={pending}
                      /* Clicking the chosen one clears it, so a brand who picked
                         the wrong package is not stuck with a control that only
                         ever moves forward. */
                      onClick={() => choose(d.id, on ? '' : p.id)}
                      className="pkgchip"
                      style={{
                        display: 'inline-flex', alignItems: 'baseline', gap: 6,
                        padding: '7px 12px', borderRadius: 10, cursor: pending ? 'wait' : 'pointer',
                        background: on ? 'var(--ink, #181C24)' : '#fff',
                        border: `1px solid ${on ? 'var(--ink, #181C24)' : 'rgba(24,28,36,.16)'}`,
                        color: on ? '#fff' : 'var(--ink-soft, #565C68)',
                        fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.product_type}
                      <span style={{ fontSize: 11.5, fontWeight: 700, opacity: on ? 0.85 : 0.65 }}>
                        {inr(p.price_paise)}
                      </span>
                    </button>
                  )
                })}
              </span>
            )}

            <span style={{
              minWidth: 92, textAlign: 'right',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14,
              color: d.pricePaise > 0 ? 'var(--ink)' : 'var(--ink-faint, #8A9099)',
            }}>
              {d.pricePaise > 0 ? inr(d.pricePaise) : '\u2013'}
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
              : uniformType
                ? `No creators yet. Add Growth creators who offer ${uniformType}.`
                : 'No creators yet. Add Growth creators to build the campaign.'}
          </p>
        )}
      </div>

      {/* ── What it costs, written out ───────────────────────────────────── */}
      {priced.length > 0 && (
        <div style={{ borderTop: '1px solid var(--hairline, #EAEAE3)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {/* What the brand pays, FIRST and on its own. The fee breakdown sits
              below it as an explanation of where that money goes — never above
              it as a line the total is built up from. A brand should not have
              to read three rows to find out what this costs them. */}
          <Line label={`You pay (${priced.length} creator${priced.length === 1 ? '' : 's'})`} value={inr(creatorsTotal)} strong />

          <div style={{ height: 1, background: 'var(--hairline, #EAEAE3)', margin: '4px 0' }} />

          <Line label="Creator rates, as they set them" value={inr(creatorsTotal)} muted />
          <Line
            label={`Guapd fee${sharedPercent != null ? ` (${sharedPercent}%)` : ''}, from the creator's side`}
            value={'\u2212' + inr(feeTotal)}
            muted
          />
          <Line label="Creators receive" value={inr(creatorsReceive)} muted />

          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint, #8A9099)', margin: '4px 0 0', lineHeight: 1.5 }}>
            Nothing is added on top. You pay each creator the rate they set, and our fee comes out of
            their side, so your total is the rates above and no more. Every creator is invoiced and
            paid separately.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030', margin: 0 }}>{error}</p>
      )}

      {/* ── Send ───────────────────────────────────────────────────────────
          Hidden entirely while the roster is empty. A disabled "Send to 0
          creators" next to "Add creators to this campaign" under "No creators
          yet" is the same sentence three times, and the Add creators button is
          already the brightest thing on the panel. */}
      {drafts.length > 0 && (
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
      )}
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
