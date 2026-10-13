'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { countOf, formatRupees } from '@/lib/experience-request'
import type { BrandAddon, BrandItem, BrandQuote, BrandRosterCreator } from '@/lib/experience-brand-server'
import type { BrandSuggestion } from '@/lib/experience-brand-server'
import Link from 'next/link'
import { suggestCreator, answerAddon, answerQuote, decideDeliverable, decideRosterCreator, acceptRosterCreators, signOffExperience } from '../actions'
import ViewFile from './ViewFile'

/**
 * The brand's own decisions on an Experience (0544). Each button calls a
 * server action that calls a brand_experience_* function with the member's
 * session; the database checks membership, admin-only steps, the point of no
 * return and that the screen is not stale (each call carries what this screen
 * showed). Guapd still records decisions the brand gives them by WhatsApp or
 * email; whichever is latest stands, and both stay in the history.
 */
type Res = { ok: boolean; error?: string }

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<Res>, after?: () => void) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong. Refresh and try again.'); return }
      after?.(); router.refresh()
    })
  }
  return { pending, error, run }
}

const fmt = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

// ── The price ──
// The deal page's look (NegotiationCard / the money card): the big price with
// its make-up beside it, the lines, then a footer with Decline as a pill and
// Accept in neon. Decline opens the same overlay a deal's Counter does.
const metaLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }
const sideValue: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 5 }
const lineRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--border-hairline, #EAEAE3)', fontFamily: 'var(--font-ui)' }
export const neonBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 48, padding: '0 26px', borderRadius: 12,
  background: 'var(--neon)', border: 'none', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--ink)',
  boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)', cursor: 'pointer', whiteSpace: 'nowrap',
}
export const pillBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 48, padding: '0 22px', borderRadius: 12,
  background: 'var(--card)', border: '1px solid var(--hairline, #EAEAE3)', boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)',
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap',
}
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(22,23,15,.45)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
}
const Tick = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>

export function QuoteCard({ experienceId, quote, isAdmin, agreedTotal }: { experienceId: string; quote: BrandQuote | null; isAdmin: boolean; agreedTotal: number | null }) {
  const { pending, error, run } = useRun()
  const [declining, setDeclining] = useState(false)
  const [why, setWhy] = useState('')

  if (!quote) return <p className="bx-note">Guapd is preparing your price. You will get an email when it is ready.</p>
  const extras = quote.extras ?? []
  const videos = `${quote.deliverable_count} video${quote.deliverable_count === 1 ? '' : 's'}`
  const shoot = [quote.shoot_city, fmt(quote.shoot_date)].filter(Boolean).join(', ')
  const open = quote.status === 'open' && quote.proposed_by === 'guapd'
  const heading = quote.status === 'accepted' ? 'Agreed price' : quote.proposed_by === 'brand' ? 'Your counter' : 'Guapd’s price'

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', gap: 20 }}>
        <div style={{ flex: '1.3 1 220px' }}>
          <div style={metaLabel}>{heading}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8 }}>{formatRupees(quote.total_paise)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>For the whole Experience. Guapd pays the creators and runs the shoot.</div>
        </div>
        <div style={{ flex: '1 1 200px', paddingLeft: 20, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', display: 'grid', gap: 14, alignContent: 'center' }}>
          <div><div style={metaLabel}>Videos</div><div style={sideValue}>{quote.deliverable_count} × {formatRupees(quote.per_video_paise)}</div></div>
          {shoot && <div><div style={metaLabel}>Shoot</div><div style={sideValue}>{shoot}</div></div>}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={lineRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{videos} × {formatRupees(quote.per_video_paise)}</span><b style={{ fontSize: 14 }}>{formatRupees(quote.per_video_paise * quote.deliverable_count)}</b></div>
        {/* 0553: what each extra is for. */}
        {extras.length > 0
          ? extras.map((x, i) => (
              <div key={i} style={lineRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{x.label}</span><b style={{ fontSize: 14 }}>{formatRupees(Number(x.amount_paise))}</b></div>
            ))
          : quote.misc_paise > 0 && <div style={lineRow}><span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Extras</span><b style={{ fontSize: 14 }}>{formatRupees(quote.misc_paise)}</b></div>}
        <div style={{ ...lineRow, borderBottom: 'none' }}><span style={{ fontSize: 13, fontWeight: 600 }}>Total</span><b style={{ fontSize: 16 }}>{formatRupees(quote.total_paise)}</b></div>
      </div>

      {quote.message && <p className="bx-msg" style={{ marginTop: 6 }}>“{quote.message}”</p>}
    </>
  )

  const footer = (children: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>{children}</div>
  )
  const helper = (t: React.ReactNode) => <div style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 420, lineHeight: 1.5 }}>{t}</div>

  if (!open) return (
    <div>
      {body}
      {footer(helper(
        quote.status === 'accepted'
          ? <><span className="bx-chip bx-ok">Agreed</span> {quote.on_guapd ? 'You accepted this' : 'Accepted (recorded by Guapd)'}{quote.decided_at ? ` on ${fmt(quote.decided_at)}` : ''}.{agreedTotal != null && agreedTotal !== quote.total_paise ? ` Agreed total ${formatRupees(agreedTotal)}.` : ''}</>
          : quote.status === 'rejected'
            ? <><span className="bx-chip bx-chg">Declined</span> You told Guapd: “{quote.brand_note}”. Guapd will send a new price.</>
            : 'Your counter, recorded by Guapd. Waiting for Guapd’s answer.'))}
    </div>
  )

  return (
    <div>
      {body}
      {error && !declining && <p className="bx-err" role="alert">{error}</p>}
      {footer(<>
        {helper(isAdmin
          ? 'Accepting agrees this price and Guapd starts choosing your creators. Declining sends Guapd a note so it can send a new price.'
          : 'An admin on your brand account accepts or declines the price.')}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="pill-hover" style={pillBtn} disabled={pending} onClick={() => setDeclining(true)}>Decline</button>
            <button type="button" className="neonbtn" style={{ ...neonBtn, opacity: pending ? 0.6 : 1 }} disabled={pending}
              onClick={() => run(() => answerQuote(experienceId, quote.quote_id, true, ''))}>
              <Tick />{pending ? 'Accepting…' : `Accept ${formatRupees(quote.total_paise)}`}
            </button>
          </div>
        )}
      </>)}

      {isAdmin && declining && (
        <div style={overlayStyle} onClick={(ev) => { if (ev.target === ev.currentTarget && !pending) setDeclining(false) }}>
          <div className="surface" role="dialog" aria-modal="true" aria-labelledby="bx-decline-h" style={{ width: '100%', maxWidth: 520, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border-hairline, #EAEAE3)' }}>
              <h3 id="bx-decline-h" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Decline the price</h3>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 5 }}>Tell Guapd what would work; it sends a new price.</div>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 10 }}>
              <label style={metaLabel} htmlFor="bx-why">What would work for you?</label>
              <textarea id="bx-why" className="dinput bx-textarea" rows={4} maxLength={1000} value={why} onChange={(ev) => setWhy(ev.target.value)} placeholder="Our budget is closer to ₹2.5L; could we do 60 videos?" />
              {error && <p className="bx-err" role="alert">{error}</p>}
            </div>
            <div style={{ padding: '14px 22px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="pill-hover" style={pillBtn} disabled={pending} onClick={() => setDeclining(false)}>Back</button>
              <button type="button" className="neonbtn" style={{ ...neonBtn, opacity: pending ? 0.6 : 1 }} disabled={pending}
                onClick={() => run(() => answerQuote(experienceId, quote.quote_id, false, why), () => setDeclining(false))}>
                {pending ? 'Sending…' : 'Decline and send note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 0554: an add-on to the agreed price ──
// One clear card, separate from the original price: what it adds, its own
// total, and what the agreed total becomes if accepted.
function addonLines(a: BrandAddon) {
  return (
    <ul className="bx-addon-lines" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
      {a.deliverables.map((d) => (
        <li key={d.type} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-ui)', fontSize: 13.5 }}>
          <span>+ {countOf(Number(d.count), d.type)}{['UGC video', 'Reel'].includes(d.type) && a.per_video_paise ? ` × ${formatRupees(Number(a.per_video_paise))}` : ''}</span>
          <span style={{ fontWeight: 600 }}>{['UGC video', 'Reel'].includes(d.type) && a.per_video_paise ? formatRupees(Number(d.count) * Number(a.per_video_paise)) : ''}</span>
        </li>
      ))}
      {a.extras.map((x, i) => (
        <li key={`x${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-ui)', fontSize: 13.5 }}>
          <span>+ {x.label}</span><span style={{ fontWeight: 600 }}>{formatRupees(Number(x.amount_paise))}</span>
        </li>
      ))}
    </ul>
  )
}

export function AddonCard({ experienceId, addon, agreedTotal, isAdmin }: { experienceId: string; addon: BrandAddon; agreedTotal: number | null; isAdmin: boolean }) {
  const { pending, error, run } = useRun()
  const [declining, setDeclining] = useState(false)
  const [why, setWhy] = useState('')
  const total = Number(addon.total_paise)
  return (
    <div>
      <p className="bx-note" style={{ marginTop: 0 }}>Guapd is offering more on top of the price you agreed. Nothing changes unless you accept.</p>
      {addonLines(addon)}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)', fontFamily: 'var(--font-ui)' }}>
        <span style={{ fontWeight: 700 }}>Add-on total</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>{formatRupees(total)}</span>
      </div>
      {agreedTotal != null && (
        <p className="bx-note">Your agreed total goes from {formatRupees(agreedTotal)} to <b>{formatRupees(agreedTotal + total)}</b> if you accept.</p>
      )}
      {addon.message && <p className="bx-msg">“{addon.message}”</p>}
      {!isAdmin && <p className="bx-note">An admin on your brand account accepts or declines it.</p>}
      {isAdmin && !declining && (
        <div className="bx-actions">
          <button type="button" className="pill-hover" style={pillBtn} disabled={pending} onClick={() => setDeclining(true)}>Decline</button>
          <button type="button" className="neonbtn" style={{ ...neonBtn, opacity: pending ? 0.6 : 1 }} disabled={pending} onClick={() => run(() => answerAddon(experienceId, addon.id, true, '', total))}>
            <Tick />{pending ? 'Accepting…' : `Accept add-on (${formatRupees(total)})`}
          </button>
        </div>
      )}
      {isAdmin && declining && (
        <div className="bx-box">
          <label className="bx-flabel" htmlFor="bx-addon-why">What would work for you?</label>
          <textarea id="bx-addon-why" className="dinput bx-textarea" rows={3} maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="We only need 5 more videos" />
          <div className="bx-actions">
            <button type="button" className="bx-btn" disabled={pending} onClick={() => setDeclining(false)}>Back</button>
            <button type="button" className="bx-btn bx-btn-danger" disabled={pending} onClick={() => run(() => answerAddon(experienceId, addon.id, false, why, total), () => setDeclining(false))}>
              {pending ? 'Sending…' : 'Decline and send note'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="bx-err" role="alert">{error}</p>}
    </div>
  )
}

/** 0554: with accepted add-ons, the agreed total leads and shows what makes it up. */
export function AgreedTotal({ quoteTotal, agreedTotal, addons }: { quoteTotal: number | null; agreedTotal: number | null; addons: BrandAddon[] }) {
  const accepted = addons.filter((a) => a.status === 'accepted').sort((x, y) => x.number - y.number)
  if (accepted.length === 0 || agreedTotal == null || quoteTotal == null) return null
  return (
    <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--hairline)' }}>
      <div className="bx-flabel" style={{ marginBottom: 4 }}>Agreed total</div>
      <div className="bx-quote-total">{formatRupees(agreedTotal)}</div>
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 4, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
        <li style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Original price</span><span>{formatRupees(quoteTotal)}</span></li>
        {accepted.map((a) => (
          <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>+ Add-on #{a.number}</span><span>{formatRupees(Number(a.total_paise))}</span></li>
        ))}
      </ul>
    </div>
  )
}

/** Answered add-ons, under the price. */
export function AddonHistory({ addons }: { addons: BrandAddon[] }) {
  const done = addons.filter((a) => a.status === 'accepted' || a.status === 'declined')
  if (done.length === 0) return null
  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      {done.map((a) => (
        <div key={a.id} style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }}>
            <span>Add-on #{a.number}</span><span>{formatRupees(Number(a.total_paise))}</span>
          </div>
          {addonLines(a)}
          <p className="bx-note">
            {a.status === 'accepted'
              ? <><span className="bx-chip bx-ok">Accepted</span> {a.on_guapd ? 'You accepted this' : 'Accepted (recorded by Guapd)'}{a.decided_at ? ` on ${fmt(a.decided_at)}` : ''}.</>
              : <><span className="bx-chip bx-chg">Declined</span> {a.brand_note ? `You told Guapd: “${a.brand_note}”.` : 'Declined.'}</>}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── The creators ──
export function RosterReview({ experienceId, creators, canDecide }: { experienceId: string; creators: BrandRosterCreator[]; canDecide: boolean }) {
  const { pending, error, run } = useRun()
  const [busy, setBusy] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  if (creators.length === 0) return <p className="bx-note">Guapd is choosing creators for you. You will get an email when they are ready to review.</p>
  // 0548: several can be accepted at once; reject (final) and hold stay one at a time.
  const open = creators.filter((c) => canDecide && !c.locked && (c.decision === 'pending' || c.decision === 'on_hold'))
  const acceptPicked = () => run(() => acceptRosterCreators(experienceId, open.filter((c) => picked.includes(c.roster_id)).map((c) => ({ rosterId: c.roster_id, expected: c.decision }))), () => setPicked([]))
  return (
    <div>
      {open.length > 1 && (
        <div className="bx-bulk">
          <label className="bx-bulk-all">
            <input type="checkbox" checked={picked.length === open.length} onChange={(e) => setPicked(e.target.checked ? open.map((c) => c.roster_id) : [])} />
            Select all to review ({open.length})
          </label>
          <button type="button" className="neonbtn bx-cta-sm" disabled={pending || picked.length === 0} onClick={acceptPicked}>
            {pending && !busy ? 'Accepting…' : `Accept selected${picked.length ? ` (${picked.length})` : ''}`}
          </button>
        </div>
      )}
      {creators.map((c) => {
        const initials = c.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
        const plan = (c.planned_deliverables ?? []).map((d) => countOf(Number(d.count), d.type)).join(' · ')
        const act = (d: 'accepted' | 'rejected' | 'on_hold') => { setBusy(c.roster_id); run(() => decideRosterCreator(experienceId, c.roster_id, d, c.decision), () => setBusy(null)) }
        const selectable = open.length > 1 && open.some((o) => o.roster_id === c.roster_id)
        return (
          <div key={c.roster_id} className={`bx-roster-row${open.length > 1 ? ' bx-has-pick' : ''}`} style={{ opacity: c.decision === 'rejected' ? 0.6 : 1 }}>
            {open.length > 1 && (selectable
              ? <input type="checkbox" className="bx-pick" aria-label={`Select ${c.full_name}`} checked={picked.includes(c.roster_id)}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, c.roster_id] : picked.filter((x) => x !== c.roster_id))} />
              : <span aria-hidden="true" />)}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {c.photo_url ? <img src={c.photo_url} alt="" className="bx-avatar" /> : <span className="bx-avatar">{initials}</span>}
            <div style={{ minWidth: 0 }}>
              <div className="bx-label">{c.full_name}</div>
              <div className="bx-when">
                {c.profile_url ? <a href={c.profile_url} target="_blank" rel="noreferrer noopener" className="bx-link">@{c.handle}</a> : null}
                {c.added_by === 'brand' ? ' · your pick' : ''}
              </div>
              {plan && <div className="bx-when">Makes {plan}</div>}
            </div>
            <div className="bx-roster-state">
              {c.locked ? <span className="bx-chip bx-ok">Confirmed</span>
                : c.decision === 'accepted' ? <span className="bx-chip bx-ok">Accepted{c.decided_on_guapd === false ? ' · via Guapd' : ''}</span>
                : c.decision === 'rejected' ? <span className="bx-chip bx-chg">Rejected{c.decided_on_guapd === false ? ' · via Guapd' : ''}</span>
                : c.decision === 'on_hold' ? <span className="bx-chip bx-hold">On hold{c.decided_on_guapd === false ? ' · via Guapd' : ''}</span>
                : <span className="bx-chip bx-new">To review</span>}
            </div>
            <div className="bx-roster-actions">
              {/* Rejected is final on this roster: no buttons after it. */}
              {canDecide && !c.locked && c.decision !== 'rejected' && (
                <>
                  <button type="button" className="bx-btn" disabled={pending} onClick={() => act('rejected')} title="Final for this creator on this Experience">{busy === c.roster_id && pending ? '…' : 'Reject'}</button>
                  {c.decision !== 'on_hold' && <button type="button" className="bx-btn" disabled={pending} onClick={() => act('on_hold')}>{busy === c.roster_id && pending ? '…' : 'Hold'}</button>}
                  {c.decision !== 'accepted' && <button type="button" className="neonbtn bx-cta-sm" disabled={pending} onClick={() => act('accepted')}>{busy === c.roster_id && pending ? '…' : 'Accept'}</button>}
                </>
              )}
            </div>
          </div>
        )
      })}
      {error && <p className="bx-err" role="alert">{error}</p>}
    </div>
  )
}

// ── The deliverables ──
export function DeliverableReview({ experienceId, items }: { experienceId: string; items: BrandItem[] }) {
  const { pending, error, run } = useRun()
  const [asking, setAsking] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  if (items.length === 0) return <p className="bx-empty">Nothing shared yet. Guapd will email you when the first deliverables are ready.</p>
  const groups = new Map<string, BrandItem[]>()
  for (const i of items) groups.set(i.creator_name ?? 'Creator', [...(groups.get(i.creator_name ?? 'Creator') ?? []), i])
  return (
    <div>
      {Array.from(groups.entries()).map(([creator, list]) => (
        <div key={creator} className="bx-group">
          <div className="bx-creator">{creator}</div>
          {list.map((i) => (
            <div key={i.release_id} className="bx-item">
              <div className="bx-row">
                <div>
                  <div className="bx-label">{i.label}</div>
                  <div className="bx-when">Shared {fmt(i.shared_at)}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  {i.kind === 'link' && i.url
                    ? <a className="bx-link" href={i.url} target="_blank" rel="noreferrer noopener">{i.url}</a>
                    : <ViewFile releaseId={i.release_id} fileName={i.file_name} />}
                </div>
                <div className="bx-item-state">
                  {i.decision === 'approved' ? <span className="bx-chip bx-ok">Approved</span>
                    : i.decision === 'changes_requested' ? <span className="bx-chip bx-chg">Changes asked</span>
                    : <span className="bx-chip bx-new">To review</span>}
                </div>
              </div>
              {i.decision === 'changes_requested' && i.changes_asked && <p className="bx-when bx-item-note">{i.decided_on_guapd ? 'You asked' : 'Asked (via Guapd)'}: “{i.changes_asked}”</p>}
              {i.can_decide && asking !== i.release_id && (
                <div className="bx-actions bx-item-actions">
                  <button type="button" className="bx-btn" disabled={pending} onClick={() => { setWhy(''); setAsking(i.release_id) }}>Ask for changes</button>
                  <button type="button" className="neonbtn bx-cta-sm" disabled={pending}
                    onClick={() => run(() => decideDeliverable(experienceId, i.release_id, 'approved', '', i.decision ?? 'new'))}>Approve</button>
                </div>
              )}
              {asking === i.release_id && (
                <div className="bx-box">
                  <label className="bx-flabel" htmlFor={`bx-ch-${i.release_id}`}>What should change?</label>
                  <textarea id={`bx-ch-${i.release_id}`} className="dinput bx-textarea" rows={3} maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Show the product label in the first 3 seconds" />
                  <div className="bx-actions">
                    <button type="button" className="bx-btn" disabled={pending} onClick={() => setAsking(null)}>Back</button>
                    <button type="button" className="neonbtn bx-cta-sm" disabled={pending}
                      onClick={() => run(() => decideDeliverable(experienceId, i.release_id, 'changes_requested', why, i.decision ?? 'new'), () => setAsking(null))}>
                      {pending ? 'Sending…' : 'Send to Guapd'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <p className="bx-note">Approving is final for that deliverable.</p>
      {error && <p className="bx-err" role="alert">{error}</p>}
    </div>
  )
}

// ── Sign-off ──
export function SignOffCard({ experienceId, isAdmin, signedAt, signedOnGuapd, open }: { experienceId: string; isAdmin: boolean; signedAt: string | null; signedOnGuapd: boolean | null; open: boolean }) {
  const { pending, error, run } = useRun()
  const [why, setWhy] = useState('')
  if (signedAt) return <p className="bx-note"><span className="bx-chip bx-ok">Signed off</span> {signedOnGuapd ? 'You signed off' : 'Signed off (recorded by Guapd)'} on {fmt(signedAt)}.</p>
  if (!open) return <p className="bx-note">You sign off once the deliverables are with you.</p>
  if (!isAdmin) return <p className="bx-note">An admin on your brand account signs off when you have everything you need.</p>
  return (
    <div>
      <p className="bx-note">Sign off when you have everything you need from this Experience. Guapd then closes it and your report appears here.</p>
      <label className="bx-flabel" htmlFor="bx-so">Anything to add? (optional)</label>
      <input id="bx-so" className="dinput" maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="All good, thank you" />
      <div className="bx-actions">
        <button type="button" className="neonbtn bx-cta-sm" disabled={pending} onClick={() => run(() => signOffExperience(experienceId, why))}>{pending ? 'Saving…' : 'Sign off'}</button>
      </div>
      {error && <p className="bx-err" role="alert">{error}</p>}
    </div>
  )
}

// ── 0557 / 0558: the brand adds creators while the roster is open ──
// "Add from Guapd" opens the brand's creator pool (/experiences/[id]/pool), the
// Growth campaign pool's cards without a price: each pick joins the roster accepted. "Suggest someone not on Guapd" sends Guapd a
// name and handle; Guapd reaches out, and the list below says where each stands.
const SUGGESTION_STATE: Record<BrandSuggestion['status'], { label: string; cls: string }> = {
  open: { label: 'Sent to Guapd', cls: 'bx-new' },
  prospect: { label: 'Guapd is reaching out', cls: 'bx-new' },
  on_roster: { label: 'Joined Guapd: on your roster', cls: 'bx-ok' },
  not_possible: { label: 'Not possible', cls: 'bx-chg' },
}

export function RosterAdd({ experienceId, suggestions, canAdd }: {
  experienceId: string; suggestions: BrandSuggestion[]; canAdd: boolean
}) {
  const { pending, error, run } = useRun()
  const [suggesting, setSuggesting] = useState(false)
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [why, setWhy] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div style={{ margin: '14px 0 4px' }}>
      {canAdd && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '16px 18px', borderRadius: 14, border: '1px dashed var(--hairline, #DADAD2)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }}>Have creators in mind?</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3, maxWidth: 520 }}>
              {notice ?? 'Pick creators on Guapd, or suggest someone who isn’t on Guapd yet. Guapd checks they are free on your shoot date and confirms them.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="pill" style={{ ...pillBtn, height: 44, fontSize: 12.5 }} onClick={() => { setSuggesting(true); setNotice(null) }}>Suggest someone not on Guapd</button>
            <Link href={`/experiences/${experienceId}/pool`} className="neonbtn" style={{ ...neonBtn, height: 44, fontSize: 12.5, textDecoration: 'none' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add from Guapd
            </Link>
          </div>
        </div>
      )}

      {canAdd && suggesting && (
        <div className="surface" style={{ padding: 18, marginTop: 12, boxShadow: 'none', border: '1px solid var(--hairline, #EAEAE3)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>Suggest a creator who isn’t on Guapd</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Guapd reaches out to them and gets them onto Guapd; you’ll see them here and then on your roster.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
            <div><label style={metaLabel} htmlFor="bx-sg-name">Their name</label>
              <input id="bx-sg-name" className="dinput" style={{ marginTop: 7 }} maxLength={120} value={name} onChange={(ev) => setName(ev.target.value)} placeholder="Ananya Rao" /></div>
            <div><label style={metaLabel} htmlFor="bx-sg-handle">Instagram handle</label>
              <input id="bx-sg-handle" className="dinput" style={{ marginTop: 7 }} maxLength={200} value={handle} onChange={(ev) => setHandle(ev.target.value)} placeholder="@ananya.makes" /></div>
          </div>
          <div style={{ marginTop: 12 }}><label style={metaLabel} htmlFor="bx-sg-why">Note for Guapd (optional)</label>
            <input id="bx-sg-why" className="dinput" style={{ marginTop: 7 }} maxLength={500} value={why} onChange={(ev) => setWhy(ev.target.value)} placeholder="We loved her skincare reels" /></div>
          {error && <p className="bx-err" role="alert">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button type="button" className="pill-hover" style={{ ...pillBtn, height: 42 }} disabled={pending} onClick={() => setSuggesting(false)}>Cancel</button>
            <button type="button" className="neonbtn" style={{ ...neonBtn, height: 42, opacity: pending ? 0.6 : 1 }} disabled={pending}
              onClick={() => run(() => suggestCreator(experienceId, name, handle, why), () => {
                setSuggesting(false); setNotice(`Sent ${name.trim()} to Guapd. Guapd will reach out to them.`); setName(''); setHandle(''); setWhy('')
              })}>
              {pending ? 'Sending…' : 'Send to Guapd'}
            </button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={metaLabel}>Your suggestions, not on Guapd yet</div>
          {suggestions.map((g) => {
            const st = SUGGESTION_STATE[g.status] ?? SUGGESTION_STATE.open
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 0', borderBottom: '1px solid var(--border-hairline, #EAEAE3)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{g.full_name}</div>
                  <a href={`https://instagram.com/${g.handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>@{g.handle}</a>
                  {g.status === 'not_possible' && g.reason && <div className="bx-when" style={{ marginTop: 3 }}>Guapd: “{g.reason}”</div>}
                </div>
                <span className={`bx-chip ${st.cls}`}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
