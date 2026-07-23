'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createDealFromStorefront } from './actions'
import { trackEvent } from '@/lib/analytics'

interface PitchPanelProps {
  open: boolean
  onClose: () => void
  slug: string
  creatorName: string
  initialDeliverables?: string
}

const SESSION_KEY = 'guapd_pitch_draft'

export default function PitchPanel({ open, onClose, slug, creatorName, initialDeliverables }: PitchPanelProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [deliverables, setDeliverables] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Restore draft from sessionStorage (survives signup redirect)
  useEffect(() => {
    if (!open) return
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const draft = JSON.parse(saved)
        if (draft.slug === slug) {
          setTitle(draft.title || '')
          setDeliverables(draft.deliverables || '')
          setMessage(draft.message || '')
        }
        sessionStorage.removeItem(SESSION_KEY)
      }
    } catch { /* ignore parse errors */ }
  }, [open, slug])

  // Pre-fill deliverables when opened from a package "+" button
  useEffect(() => {
    if (open && initialDeliverables && !deliverables) {
      setDeliverables(initialDeliverables)
    }
  }, [open, initialDeliverables])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)

    trackEvent('pitch_send_attempted', { slug })

    const result = await createDealFromStorefront({
      slug,
      title: title.trim(),
      deliverables: deliverables.trim(),
      message: message.trim() || undefined,
    })

    setSending(false)

    if ('error' in result) {
      if (result.error === 'not_authenticated') {
        // Save draft to sessionStorage, redirect to login
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({ slug, title, deliverables, message }))
        } catch { /* storage full / disabled */ }
        router.push(`/login?next=/c/${slug}`)
        return
      }
      setError(result.error ?? 'An error occurred.')
      return
    }

    trackEvent('deal_created_from_storefront', { slug })
    setSuccess(true)
    setTitle('')
    setDeliverables('')
    setMessage('')
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(24,28,36,.4)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'rgba(255,255,255,.92)',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          borderRadius: 24,
          padding: 'clamp(24px,3vw,40px)',
          border: '1px solid rgba(255,255,255,.85)',
          boxShadow: '0 34px 66px -34px rgba(40,52,70,.42)',
          animation: 'modalIn .35s cubic-bezier(.68,-0.4,.32,1.4)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display, Sora, sans-serif)',
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
              margin: 0,
            }}>
              Pitch {creatorName}
            </h2>
            <p style={{ color: 'var(--ink-faint)', fontSize: 14, marginTop: 4 }}>
              Describe what you have in mind. They'll receive your pitch as a deal offer.
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-faint)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, marginBottom: 8 }}>
              Pitch sent!
            </h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 24 }}>
              {creatorName} will see your pitch in their deal inbox. You can track it from your deals page.
            </p>
            <button
              onClick={() => router.push('/deals')}
              style={{
                padding: '12px 28px',
                borderRadius: 999,
                background: 'var(--neon, #DAFE0C)',
                color: 'var(--ink)',
                fontWeight: 700,
                fontSize: 15,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Go to deals
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Title */}
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--ink-soft)', marginBottom: 6 }}>
                Campaign / project title
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer product launch"
                required
                maxLength={200}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,.85)',
                  background: 'rgba(255,255,255,.6)',
                  fontSize: 15,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            {/* Deliverables */}
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--ink-soft)', marginBottom: 6 }}>
                What you're looking for
              </span>
              <textarea
                value={deliverables}
                onChange={(e) => setDeliverables(e.target.value)}
                placeholder="e.g. 1 Instagram Reel + 2 Stories about our new product"
                required
                maxLength={1000}
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,.85)',
                  background: 'rgba(255,255,255,.6)',
                  fontSize: 15,
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            {/* Message */}
            <label style={{ display: 'block', marginBottom: 24 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--ink-soft)', marginBottom: 6 }}>
                Message <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}>(optional)</span>
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Any extra context, budget range, timeline..."
                maxLength={2000}
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,.85)',
                  background: 'rgba(255,255,255,.6)',
                  fontSize: 15,
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: '#FFF0F0',
                color: '#9B3030',
                fontSize: 14,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 16px', lineHeight: 1.5 }}>
              By sending this pitch you agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-soft)', textDecoration: 'underline' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-soft)', textDecoration: 'underline' }}>Privacy Policy</a>.
            </p>

            <button
              type="submit"
              disabled={sending}
              style={{
                width: '100%',
                padding: '14px 28px',
                borderRadius: 999,
                background: sending ? '#ccc' : 'var(--neon, #DAFE0C)',
                color: 'var(--ink)',
                fontWeight: 700,
                fontSize: 16,
                border: 'none',
                cursor: sending ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-ui, Inter, sans-serif)',
              }}
            >
              {sending ? 'Sending...' : 'Send pitch'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
