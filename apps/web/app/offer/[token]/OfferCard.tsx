'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { acceptOffer, declineOffer } from './actions'
import { trackEvent } from '@/lib/analytics'

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
}

type ViewState =
  | { step: 'offer' }
  | { step: 'auth' }
  | { step: 'declining'; reason: string }
  | { step: 'loading'; action: 'accept' | 'decline' }
  | { step: 'done'; action: 'accepted' | 'declined' }
  | { step: 'error'; message: string }

interface ItemInfo {
  id: string
  label: string
  platform: string
  handle: string
  price_paise: number | null
}

export default function OfferCard({ deal, token, items = [] }: { deal: Deal; token: string; items?: ItemInfo[] }) {
  const [view, setView] = useState<ViewState>({ step: 'offer' })
  const [pendingAction, setPendingAction] = useState<'accept' | 'decline' | null>(null)

  async function handleAction(action: 'accept' | 'decline', reason?: string) {
    setView({ step: 'loading', action })

    const result = action === 'accept'
      ? await acceptOffer(token)
      : await declineOffer(token, reason)

    if (result.status === 'auth_required') {
      setPendingAction(action)
      setView({ step: 'auth' })
      return
    }

    if (result.status === 'error') {
      setView({ step: 'error', message: result.message })
      return
    }

    trackEvent(action === 'accept' ? 'offer_accepted' : 'offer_declined', { surface: 'web' })
    setView({ step: 'done', action: action === 'accept' ? 'accepted' : 'declined' })
  }

  function handleSignIn() {
    const supabase = createClient()
    // Redirect back to this offer page after auth
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/creator/callback?next=${encodeURIComponent(window.location.pathname)}`,
      },
    })
  }

  // -- Done state --
  if (view.step === 'done') {
    const accepted = view.action === 'accepted'
    return (
      <div style={card}>
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{accepted ? '\u2705' : '\u274C'}</div>
          <h2 style={headingStyle}>
            {accepted ? 'Offer Accepted' : 'Offer Declined'}
          </h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
            {accepted
              ? 'The deal terms are locked. Sign in to manage deliverables and chat.'
              : 'The brand has been notified.'}
          </p>
          {accepted && (
            <a
              href="/login/creator"
              style={{ display: 'inline-block', marginTop: '1rem', padding: '0.5rem 1.25rem', background: '#111', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}
            >
              Go to my deals
            </a>
          )}
        </div>
      </div>
    )
  }

  // -- Error state --
  if (view.step === 'error') {
    return (
      <div style={card}>
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <h2 style={headingStyle}>Something went wrong</h2>
          <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: '0.5rem 0 1.5rem' }}>
            {view.message}
          </p>
          <button onClick={() => setView({ step: 'offer' })} style={secondaryBtn}>
            Go back
          </button>
        </div>
      </div>
    )
  }

  // -- Auth step --
  if (view.step === 'auth') {
    return (
      <div style={card}>
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <h2 style={headingStyle}>Verify your identity</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 1.5rem' }}>
            Sign in to {pendingAction === 'accept' ? 'accept' : 'decline'} this offer. This links your account to your creator profile.
          </p>
          <button onClick={handleSignIn} style={primaryBtn}>
            Continue with Google
          </button>
          <button
            onClick={() => setView({ step: 'offer' })}
            style={{ ...secondaryBtn, marginTop: '0.75rem' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // -- Decline reason step --
  if (view.step === 'declining') {
    return (
      <div style={card}>
        <div style={{ padding: '1.5rem' }}>
          <h2 style={{ ...headingStyle, textAlign: 'left' }}>Decline this offer?</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.8125rem', margin: '0.25rem 0 1rem' }}>
            Optionally share a reason with the brand.
          </p>
          <textarea
            value={view.reason}
            onChange={(e) => setView({ step: 'declining', reason: e.target.value })}
            placeholder="e.g. Budget too low, timeline doesn't work..."
            style={textArea}
            rows={3}
          />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              onClick={() => setView({ step: 'offer' })}
              style={{ ...secondaryBtn, flex: 1 }}
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction('decline', view.reason)}
              style={{ ...declineBtn, flex: 1 }}
            >
              Decline offer
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isLoading = view.step === 'loading'

  // -- Main offer view --
  return (
    <div style={card}>
      {/* Header */}
      <div style={cardHeader}>
        <p style={fromLabel}>Offer from</p>
        <h1 style={brandName}>{deal.brand_name}</h1>
        <p style={forLabel}>for {deal.creator_name}</p>
      </div>

      {/* Title */}
      {deal.title && (
        <div style={section}>
          <h2 style={titleStyle}>{deal.title}</h2>
        </div>
      )}

      {/* Terms */}
      <div style={termsGrid}>
        {items.length > 0 ? (
          <div>
            <p style={termLabel}>Deliverables</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {items.map((item) => {
                const displayHandle = item.handle.startsWith('@') ? item.handle : `@${item.handle}`
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-heading, #111)' }}>
                      {item.label} <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.8125rem' }}>({item.platform} {displayHandle})</span>
                    </span>
                    {item.price_paise != null && item.price_paise > 0 && (
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-heading, #111)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                        {formatMoney(item.price_paise, deal.currency)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          deal.deliverables && <Term label="Deliverables" value={deal.deliverables} />
        )}
        {deal.price_paise != null && deal.price_paise > 0 && (() => {
          const isDeducted = deal.fee_mode === 'deducted' && deal.fee_percent > 0
          if (isDeducted) {
            const feePaise = Math.round(deal.price_paise * deal.fee_percent / 100)
            const netPaise = deal.price_paise - feePaise
            return (
              <div>
                <p style={termLabel}>You receive</p>
                <p style={{ ...termValue, fontSize: '1.0625rem', fontWeight: 700, fontFamily: 'monospace' }}>
                  {formatMoney(netPaise, deal.currency)}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-muted, #888)', margin: '0.15rem 0 0' }}>
                  {formatMoney(deal.price_paise, deal.currency)} deal value − {formatMoney(feePaise, deal.currency)} platform fee ({deal.fee_percent}%)
                </p>
              </div>
            )
          }
          return <Term label="Total Price" value={formatMoney(deal.price_paise, deal.currency)} />
        })()}
        {deal.timeline_date && (
          <Term
            label="Delivery by"
            value={new Date(deal.timeline_date + 'T00:00:00').toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          />
        )}
        <Term label="Revisions included" value={String(deal.revision_limit)} />
        {deal.price_per_extra_revision_paise > 0 && (
          <Term label="Per extra revision" value={formatMoney(deal.price_per_extra_revision_paise, deal.currency)} />
        )}
        {deal.usage_rights && <Term label="Usage rights" value={deal.usage_rights} />}
        {deal.payment_terms && <Term label="Payment terms" value={deal.payment_terms} />}
      </div>

      {/* Actions */}
      <div style={actionsArea}>
        <button
          onClick={() => handleAction('accept')}
          disabled={isLoading}
          style={{
            ...primaryBtn,
            width: '100%',
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading && view.action === 'accept' ? 'Accepting...' : 'Accept offer'}
        </button>
        <button
          onClick={() => setView({ step: 'declining', reason: '' })}
          disabled={isLoading}
          style={{
            ...secondaryBtn,
            width: '100%',
            marginTop: '0.5rem',
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading && view.action === 'decline' ? 'Declining...' : 'Decline'}
        </button>
      </div>
    </div>
  )
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={termLabel}>{label}</p>
      <p style={termValue}>{value}</p>
    </div>
  )
}

function formatMoney(paise: number, currency: string): string {
  const major = paise / 100
  if (currency === 'INR') {
    if (major >= 100000) return `\u20B9${(major / 100000).toFixed(1)}L`
    if (major >= 1000) return `\u20B9${(major / 1000).toFixed(0)}K`
    return `\u20B9${major.toLocaleString('en-IN')}`
  }
  return `${major.toLocaleString()} ${currency}`
}

/* ── Styles ─────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: 'var(--section-bg, #fff)',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 16,
  maxWidth: 440,
  width: '100%',
  margin: '0 auto',
  overflow: 'hidden',
}

const cardHeader: React.CSSProperties = {
  padding: '2rem 1.5rem 1.25rem',
  textAlign: 'center',
  borderBottom: '1px solid var(--color-border, #e5e5e5)',
}

const fromLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-muted, #888)',
  margin: '0 0 0.25rem',
}

const brandName: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.5rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: 0,
}

const forLabel: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: 'var(--color-muted, #888)',
  margin: '0.25rem 0 0',
}

const section: React.CSSProperties = {
  padding: '1rem 1.5rem 0',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.25rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: 0,
  textAlign: 'center',
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.125rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: 0,
}

const termsGrid: React.CSSProperties = {
  padding: '1.25rem 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.875rem',
}

const termLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-muted, #888)',
  margin: '0 0 0.15rem',
}

const termValue: React.CSSProperties = {
  fontSize: '0.9375rem',
  fontWeight: 500,
  color: 'var(--color-heading, #111)',
  margin: 0,
}

const actionsArea: React.CSSProperties = {
  padding: '0.75rem 1.5rem 1.5rem',
}

const primaryBtn: React.CSSProperties = {
  padding: '0.75rem 1.5rem',
  background: 'var(--brand-primary, #111)',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  fontSize: '0.9375rem',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--font-body, inherit)',
}

const secondaryBtn: React.CSSProperties = {
  padding: '0.625rem 1.5rem',
  background: 'transparent',
  color: 'var(--color-muted, #888)',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 9999,
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font-body, inherit)',
}

const declineBtn: React.CSSProperties = {
  padding: '0.625rem 1.5rem',
  background: '#fee2e2',
  color: '#991b1b',
  border: 'none',
  borderRadius: 9999,
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font-body, inherit)',
}

const textArea: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 8,
  fontSize: '0.875rem',
  fontFamily: 'var(--font-body, inherit)',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
}
