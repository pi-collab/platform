'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setGrowthDraftItems, removeCampaignDraft, bulkSendCampaignDrafts } from './draft-actions'
import TrackTag from '@/components/track/TrackTag'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

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
  /** How many of that package. Stored as repeated placements. */
  qty: number
  pricePaise: number
  /* This draft's OWN resolved fee. Usually 30, but an ops pair rate outranks
     the growth rung, so a flat 30 in the footer would misreport a creator the
     founders have agreed a different rate with — and the footer would then
     disagree with the deal the send creates. */
  feePercent: number
  products: GrowthProduct[]
}

/** A deal already sent from this campaign. The page builds these for the
 *  Deals roster too; the same rows, so a campaign looks like a campaign
 *  whichever track it is on. */
export interface GrowthSentDeal {
  dealId: string
  creatorName: string
  creatorPhoto: string | null
  deliverables: string
  brandPaysPaise: number
  statusLabel: string
}

export interface GrowthMinimumView {
  metric: 'creators' | 'value'
  minCreators: number | null
  minValuePaise: number | null
}

const inr = (paise: number) =>
  '₹' + Math.round(paise / 100).toLocaleString('en-IN')

export default function GrowthRoster({
  campaignId, drafts, minimum, uniformType, sent,
}: {
  campaignId: string
  drafts: GrowthDraft[]
  minimum: GrowthMinimumView
  /** Set when the campaign is "same for everyone". */
  uniformType: string | null
  /** Deals already sent from this campaign. */
  sent: GrowthSentDeal[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)

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
    /* Counts everyone ON the roster, not just those with a package chosen.
       "0 of 2 creators" after adding two creators is wrong by any reading —
       the brand added them, they are there. Whether each has been priced is a
       separate condition, and it blocks the send on its own below. */
    const need = minimum.minCreators ?? 0
    return {
      met: drafts.length >= need,
      label: `${drafts.length} of ${need}`,
      hint: need === 1 ? 'creator' : 'creators',
      pct: need > 0 ? Math.min(100, Math.round((priced.length / need) * 100)) : 100,
    }
  }, [minimum, drafts.length, creatorsTotal])

  /* Three separate reasons a send is refused, named separately. "Cannot send"
     with one message covering all of them is how a brand ends up re-reading a
     roster looking for what is wrong. */
  /* drafts.length === 0 is not listed: the send row is not rendered at all in
     that state, so a reason for it would never be read. */
  const blocked =
    unpriced > 0 ? `${unpriced} creator${unpriced === 1 ? ' has' : 's have'} no package chosen`
    : !progress.met ? `Below the minimum. ${progress.label} ${progress.hint}`
    : null

  /* One writer for both controls. The package select and the stepper are two
     halves of the same answer — which deliverable, and how many — so sending
     them separately would let a half-saved row exist between two round trips. */
  function setItem(draftId: string, productId: string | null, qty: number) {
    setError(null)
    startTransition(async () => {
      const res = await setGrowthDraftItems(
        campaignId,
        draftId,
        productId && qty > 0 ? [{ productId, qty }] : [],
      )
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
    setError(null)
    setSending(true)
    setConfirming(false)
    startTransition(async () => {
      const { results } = await bulkSendCampaignDrafts(campaignId, priced.map((d) => d.id))
      const failed = results.filter((r) => !r.success)
      setSending(false)
      if (failed.length > 0) setError(failed.map((f) => f.error).filter(Boolean).join(' · '))
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>
      {/* ── The minimum, first ───────────────────────────────────────────
          Not shown on an empty roster: a bar at zero measures nothing, and it
          would be the second thing on screen telling a brand to add creators. */}
      {drafts.length > 0 && (
      <div style={{
        borderRadius: 14, padding: '14px 18px',
        background: progress.met ? 'var(--lime-50, #F6FCE6)' : 'var(--sec-2, #F7F4FB)',
        border: `1px solid ${progress.met ? 'rgba(210,240,74,.55)' : 'var(--hairline, #EAEAE3)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="t-meta" style={{ color: progress.met ? 'var(--lime-700, #4F6B12)' : 'var(--ink-2, #565C68)' }}>
            {progress.met ? 'Minimum met' : 'Campaign minimum'}
          </span>
          <span className="t-data" style={{ fontSize: 14, color: progress.met ? 'var(--lime-700, #4F6B12)' : 'var(--ink)' }}>
            {progress.label} {progress.hint}
          </span>
        </div>
        <div style={{ marginTop: 10, height: 6, borderRadius: 20, background: 'rgba(24,28,36,.08)', overflow: 'hidden' }}
             role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{
            height: '100%', width: `${progress.pct}%`, borderRadius: 20,
            /* One colour, ours. The bar being full is what says the minimum
               is met; swapping to the invoice-paid green made it look like a
               different system's control. */
            background: 'var(--neon-deep, #D2F04A)',
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

      {/* ── Sent ─────────────────────────────────────────────────────────
          A campaign does not empty itself when it is sent. Growth drafts are
          deleted as they become deals, exactly as Deals drafts are, so without
          this the roster went blank at the moment the brand most wanted to see
          what had gone out. Same rows as the Deals roster: avatar with a stage
          dot, name, status, deliverable, what you pay. */}
      {sent.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="t-meta" style={{ color: 'var(--ink-2, #565C68)' }}>Sent</span>
            <span className="t-meta" style={{ color: 'var(--ink-faint, #8A9099)' }}>
              {sent.length} offer{sent.length === 1 ? '' : 's'}
            </span>
          </div>
          {sent.map((d, i) => (
            <Link
              key={d.dealId}
              href={`/deals/${d.dealId}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
                borderTop: i === 0 ? '1px solid var(--hairline, #EAEAE3)' : '1px solid var(--hairline, #EAEAE3)',
                textDecoration: 'none', color: 'inherit', flexWrap: 'wrap',
              }}
            >
              <span style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar name={d.creatorName} photo={d.creatorPhoto} />
                <span aria-hidden="true" style={{
                  position: 'absolute', right: -1, bottom: -1, width: 11, height: 11,
                  borderRadius: '50%', background: 'var(--neon-deep, #D2F04A)', border: '2px solid #fff',
                }} />
              </span>

              <span style={{ flex: 1, minWidth: 160 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                    {d.creatorName}
                  </span>
                  <span style={{ color: 'var(--ink-faint, #8A9099)', fontSize: 13 }}>&middot;</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 12, color: 'var(--ink-faint, #8A9099)' }}>
                    {d.statusLabel}
                  </span>
                </span>
                {d.deliverables && (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-faint, #8A9099)', marginTop: 2 }}>
                    {d.deliverables}
                  </span>
                )}
              </span>

              <span style={{
                minWidth: 92, textAlign: 'right',
                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)',
              }}>
                {inr(d.brandPaysPaise)}
              </span>

              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint, #8A9099)"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {/* ── Still to send ────────────────────────────────────────────────── */}
      {drafts.length > 0 && sent.length > 0 && (
        <div className="t-meta" style={{ color: 'var(--ink-2, #565C68)' }}>Still to send</div>
      )}
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
            ) : d.products.length === 0 ? (
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#9B3030' }}>
                No packages listed yet
              </span>
            ) : (
              /* A select, styled rather than left native. The chevron is ours
                 and the field carries the app's radius, hairline and type;
                 appearance:none is what stops the platform drawing its own. */
              <span className="pkgselect">
                <select
                  value={d.productId ?? ''}
                  disabled={pending}
                  onChange={(e) => setItem(d.id, e.target.value || null, e.target.value ? Math.max(1, d.qty) : 0)}
                  aria-label={`Package for ${d.creatorName}`}
                  data-empty={d.productId ? undefined : 'true'}
                >
                  <option value="">Choose a package</option>
                  {d.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.product_type} &middot; {inr(p.price_paise)}
                    </option>
                  ))}
                </select>
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            )}

            {/* Quantity, for both modes. A brand wanting two reels from one
                creator had to add them twice or settle for one; the Deals
                editor has always allowed it and there is no reason Growth
                should not. Hidden until a package is chosen, since there is
                nothing yet to count. */}
            {(uniformType ? d.products[0] : d.products.find((p) => p.id === d.productId)) && (
              <Stepper
                qty={d.qty}
                disabled={pending}
                onChange={(next) => {
                  const productId = uniformType ? d.products[0]?.id ?? null : d.productId
                  setItem(d.id, productId, next)
                }}
              />
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
            {sent.length > 0
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
          onClick={() => setConfirming(true)}
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

      {/* Deliberately plain. The totals are on the panel directly behind this
          dialog, and restating them here made an ordinary confirmation read
          like an invoice needing approval. */}
      <ConfirmDialog
        open={confirming}
        title={`Send to ${priced.length} creator${priced.length === 1 ? '' : 's'}?`}
        body="Each creator gets their own offer at their own rate, and can accept or decline it. Offers cannot be unsent."
        confirmLabel={`Send ${priced.length} offer${priced.length === 1 ? '' : 's'}`}
        busy={sending}
        onConfirm={send}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}

/**
 * A quantity stepper, in the Deals editor's shape: minus, count, plus.
 *
 * Zero removes the deliverable rather than leaving a row booked for nothing,
 * which is what "set it to none" means. Capped at 20, matching the server —
 * a UI that lets you reach a number the action refuses is a UI that lies.
 */
function Stepper({ qty, disabled, onChange }: {
  qty: number; disabled: boolean; onChange: (next: number) => void
}) {
  const btn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid rgba(24,28,36,.16)', background: '#fff', color: 'var(--ink)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700, lineHeight: 1, padding: 0,
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <button type="button" style={btn} disabled={disabled || qty <= 0}
              aria-label="One fewer" onClick={() => onChange(Math.max(0, qty - 1))}>&minus;</button>
      <span className="tnum" style={{ minWidth: 14, textAlign: 'center', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
        {qty}
      </span>
      <button type="button" style={btn} disabled={disabled || qty >= 20}
              aria-label="One more" onClick={() => onChange(Math.min(20, qty + 1))}>+</button>
    </span>
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
