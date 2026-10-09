'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { countOf, formatRupees } from '@/lib/experience-request'
import type { BrandItem, BrandQuote, BrandRosterCreator } from '@/lib/experience-brand-server'
import { answerQuote, decideDeliverable, decideRosterCreator, signOffExperience } from '../actions'
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
export function QuoteCard({ experienceId, quote, isAdmin, agreedTotal }: { experienceId: string; quote: BrandQuote | null; isAdmin: boolean; agreedTotal: number | null }) {
  const { pending, error, run } = useRun()
  const [declining, setDeclining] = useState(false)
  const [why, setWhy] = useState('')

  if (!quote) return <p className="bx-note">Guapd is preparing your price. You will get an email when it is ready.</p>
  const lines = (
    <div className="bx-quote">
      <div className="bx-quote-total">{formatRupees(quote.total_paise)}</div>
      <div className="bx-when">
        {quote.deliverable_count} video{quote.deliverable_count === 1 ? '' : 's'} × {formatRupees(quote.per_video_paise)}{quote.misc_paise ? ` + ${formatRupees(quote.misc_paise)} extras` : ''}
        {(quote.shoot_city || quote.shoot_date) ? ` · shoot ${[quote.shoot_city, fmt(quote.shoot_date)].filter(Boolean).join(', ')}` : ''}
      </div>
      {quote.message && <p className="bx-msg">“{quote.message}”</p>}
    </div>
  )

  if (quote.status === 'accepted') return (
    <div>{lines}<p className="bx-note"><span className="bx-chip bx-ok">Agreed</span> {quote.on_guapd ? 'You accepted this' : 'Accepted (recorded by Guapd)'}{quote.decided_at ? ` on ${fmt(quote.decided_at)}` : ''}.{agreedTotal != null && agreedTotal !== quote.total_paise ? ` Agreed total ${formatRupees(agreedTotal)}.` : ''}</p></div>
  )
  if (quote.status === 'rejected') return (
    <div>{lines}<p className="bx-note"><span className="bx-chip bx-chg">Declined</span> You told Guapd: “{quote.brand_note}”. Guapd will send a new price.</p></div>
  )
  if (quote.proposed_by === 'brand') return (
    <div>{lines}<p className="bx-note">Your counter, recorded by Guapd. Waiting for Guapd&rsquo;s answer.</p></div>
  )

  return (
    <div>
      {lines}
      {!isAdmin && <p className="bx-note">An admin on your brand account accepts or declines the price.</p>}
      {isAdmin && !declining && (
        <div className="bx-actions">
          <button type="button" className="bx-btn" disabled={pending} onClick={() => setDeclining(true)}>Decline</button>
          <button type="button" className="neonbtn bx-cta-sm" disabled={pending} onClick={() => run(() => answerQuote(experienceId, quote.quote_id, true, ''))}>
            {pending ? 'Saving…' : `Accept ${formatRupees(quote.total_paise)}`}
          </button>
        </div>
      )}
      {isAdmin && declining && (
        <div className="bx-box">
          <label className="bx-flabel" htmlFor="bx-why">What would work for you?</label>
          <textarea id="bx-why" className="dinput bx-textarea" rows={3} maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Our budget is closer to ₹2.5L; could we do 60 videos?" />
          <div className="bx-actions">
            <button type="button" className="bx-btn" disabled={pending} onClick={() => setDeclining(false)}>Back</button>
            <button type="button" className="bx-btn bx-btn-danger" disabled={pending} onClick={() => run(() => answerQuote(experienceId, quote.quote_id, false, why), () => setDeclining(false))}>
              {pending ? 'Sending…' : 'Decline and send note'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="bx-err" role="alert">{error}</p>}
    </div>
  )
}

// ── The creators ──
export function RosterReview({ experienceId, creators, canDecide }: { experienceId: string; creators: BrandRosterCreator[]; canDecide: boolean }) {
  const { pending, error, run } = useRun()
  const [busy, setBusy] = useState<string | null>(null)
  if (creators.length === 0) return <p className="bx-note">Guapd is choosing creators for you. You will get an email when they are ready to review.</p>
  return (
    <div>
      {creators.map((c) => {
        const initials = c.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
        const plan = (c.planned_deliverables ?? []).map((d) => countOf(Number(d.count), d.type)).join(' · ')
        const act = (d: 'accepted' | 'rejected') => { setBusy(c.roster_id); run(() => decideRosterCreator(experienceId, c.roster_id, d, c.decision), () => setBusy(null)) }
        return (
          <div key={c.roster_id} className="bx-roster-row" style={{ opacity: c.decision === 'rejected' ? 0.6 : 1 }}>
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
                : <span className="bx-chip bx-new">To review</span>}
            </div>
            <div className="bx-roster-actions">
              {canDecide && !c.locked && (
                <>
                  {c.decision !== 'rejected' && <button type="button" className="bx-btn" disabled={pending} onClick={() => act('rejected')}>{busy === c.roster_id && pending ? '…' : 'Reject'}</button>}
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
