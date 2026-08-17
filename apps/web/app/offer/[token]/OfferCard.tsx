'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import OtpInput from '@/components/OtpInput'
import FormError from '@/components/FormError'
import { trackEvent } from '@/lib/analytics'
import { sendOfferOTP, verifyOfferOTP } from './otp-actions'

interface Deal {
  id: string
  title: string | null
  deliverables: string | null
  price_paise: number | null
  currency: string
  timeline_date: string | null
  revision_limit: number
  price_per_extra_revision_paise: number
  fee_percent: number
  fee_mode: 'on_top' | 'deducted'
  usage_rights: string | null
  payment_terms: string | null
  brand_name: string
  creator_name: string
  brief_has_pitch: boolean
  brief_has_guidelines: boolean
  brief_has_avoid: boolean
  brief_attachment_count: number
}

interface ItemInfo {
  id: string
  label: string
  platform: string
  handle: string
  price_paise: number | null
}

type ViewState =
  | { step: 'offer' }
  | { step: 'code'; masked: string }

function formatINR(paise: number | null): string {
  if (paise == null) return '—'
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN')
}

function formatDate(d: string | null): string {
  if (!d) return 'To be agreed'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The web accept-page — a creator's first contact, opened from a WhatsApp
 * link before they have an account.
 *
 * It shows the offer and opens the door; it does not decide anything. Both
 * actions lead to the same place: verify the number, then the deal page, where
 * accept, decline AND counter all live. Countering was impossible here, so an
 * "Accept or Decline" choice was a false one — the third answer, the one most
 * negotiations actually need, had no button.
 */
export default function OfferCard({ deal, token, items = [] }: { deal: Deal; token: string; items?: ItemInfo[] }) {
  const router = useRouter()
  const [view, setView] = useState<ViewState>({ step: 'offer' })
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const firstName = deal.creator_name?.split(' ')[0] || 'there'

  async function handleRespond(intent: 'accept' | 'decline') {
    if (busy) return
    setBusy(true)
    setError('')
    trackEvent('offer_respond_started', { intent, surface: 'web' })

    const res = await sendOfferOTP(token)
    setBusy(false)
    if (res.status === 'error') { setError(res.message); return }
    setCode('')
    setView({ step: 'code', masked: res.masked })
  }

  async function handleVerify(submitted: string) {
    if (busy) return
    setBusy(true)
    setError('')

    const res = await verifyOfferOTP(token, submitted)
    if (res.status === 'error') {
      setBusy(false)
      setError(res.message)
      return
    }
    // Stays busy — the page navigates away and unmounts this.
    router.push(`/creator/deals/${res.dealId}`)
    router.refresh()
  }

  // ── Verify ─────────────────────────────────────────────────────────────────
  if (view.step === 'code') {
    return (
      <div className="offer-card">
        <h1 className="offer-card__title">Verify it&rsquo;s you.</h1>
        <p className="offer-card__sub">Code sent to {view.masked}</p>

        <form onSubmit={(e) => { e.preventDefault(); handleVerify(code) }}>
          <OtpInput
            value={code}
            onChange={(v) => { setCode(v); setError('') }}
            onComplete={handleVerify}
            error={Boolean(error)}
            disabled={busy}
            autoFocus
          />

          {error && <FormError>{error}</FormError>}

          <button type="submit" disabled={busy || code.length < 6} className="offer-cta cta">
            {busy ? 'Verifying…' : error ? 'Try again' : 'Verify & continue'}
          </button>

          <div className="otp-resend-row">
            <button
              type="button"
              onClick={() => handleRespond('accept')}
              disabled={busy}
              className="otp-resend lnk"
            >
              Resend code
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ── The offer ──────────────────────────────────────────────────────────────
  // Named contents, never the contents themselves.
  const briefParts = [
    deal.brief_has_pitch && 'a pitch',
    deal.brief_has_guidelines && 'guidelines',
    deal.brief_has_avoid && 'things to avoid',
    deal.brief_attachment_count > 0 &&
      `${deal.brief_attachment_count} attachment${deal.brief_attachment_count > 1 ? 's' : ''}`,
  ].filter(Boolean) as string[]

  const rows: [string, string][] = [
    ['Deliverables', deal.deliverables || items.map((i) => i.label).join(', ') || '—'],
    ['Timeline', formatDate(deal.timeline_date)],
    ['Revisions', `${deal.revision_limit} included`],
    ['Usage rights', deal.usage_rights || 'To be agreed'],
    ['Payment', deal.payment_terms || 'To be agreed'],
  ]

  return (
    <div className="offer-card">
      <span className="offer-card__eyebrow">New offer</span>
      <h1 className="offer-card__title">
        {deal.brand_name} wants to work with you, {firstName}.
      </h1>

      <div className="offer-amount">
        <span className="offer-amount__value">{formatINR(deal.price_paise)}</span>
        <span className="offer-amount__note">
          {deal.fee_mode === 'deducted' ? 'before platform fee' : 'you receive in full'}
        </span>
      </div>

      <dl className="offer-terms">
        {rows.map(([k, v]) => (
          <div key={k} className="offer-terms__row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {briefParts.length > 0 && (
        /* Says a brief exists and what is in it, not what it says. The brand's
           campaign is unreleased and this link travels over WhatsApp, so the
           contents wait until a verified number is on the other side. */
        <div className="offer-brief">
          <div className="offer-brief__head">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            Campaign brief
          </div>
          <p className="offer-brief__body">
            {deal.brand_name} has shared {briefParts.join(', ')}. You&rsquo;ll see it in full on
            the deal once you&rsquo;re in.
          </p>
        </div>
      )}

      {error && <FormError>{error}</FormError>}

      {/* Both lead to the same place. The label is the creator's intent, not a
          decision — the deal page is where it is actually made, and where
          countering is possible. */}
      <div className="offer-actions">
        <button
          type="button"
          onClick={() => handleRespond('accept')}
          disabled={busy}
          className="offer-cta cta"
        >
          {busy ? 'One moment…' : 'Accept this offer'}
        </button>

        <button
          type="button"
          onClick={() => handleRespond('decline')}
          disabled={busy}
          className="offer-cta offer-cta--ghost ghost"
        >
          Decline
        </button>
      </div>

      <p className="offer-card__foot">
        You&rsquo;ll confirm your number first, then you can accept, counter or decline.
      </p>
    </div>
  )
}
