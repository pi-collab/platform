'use client'

import { useState } from 'react'
import { submitItem, submitForReview } from './actions'

interface Item {
  id: string
  label: string
  platform: string
  handle: string
  item_status: string
  external_url: string | null
  version: number
  submitted_at: string | null
  revision_note: string | null
}

const ITEM_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#f3f4f6', color: '#6b7280' },
  submitted: { bg: '#fef9c3', color: '#854d0e' },
  revision:  { bg: '#ffedd5', color: '#9a3412' },
  approved:  { bg: '#dcfce7', color: '#166534' },
}

export default function DeliverableItems({
  dealId,
  items,
  canSubmit,
}: {
  dealId: string
  items: Item[]
  canSubmit: boolean
}) {
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const item of items) {
      if (item.external_url) init[item.id] = item.external_url
    }
    return init
  })
  const [loadingItem, setLoadingItem] = useState<string | null>(null)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const submitted = items.filter((i) => i.item_status === 'submitted' || i.item_status === 'approved').length
  const total = items.length
  const allReady = items.every((i) => i.item_status === 'submitted' || i.item_status === 'approved')
  const needsAction = items.filter((i) => i.item_status === 'pending' || i.item_status === 'revision')

  function displayHandle(h: string) {
    return h.startsWith('@') ? h : `@${h}`
  }

  async function handleSubmitItem(itemId: string) {
    const url = urls[itemId]?.trim()
    if (!url) return
    setError(null)
    setLoadingItem(itemId)

    const result = await submitItem(dealId, itemId, url)
    setLoadingItem(null)

    if (result.status === 'error') {
      setError(result.message)
    }
  }

  async function handleSubmitForReview() {
    setError(null)
    setSubmittingAll(true)

    const result = await submitForReview(dealId)
    setSubmittingAll(false)

    if (result.status === 'error') {
      setError(result.message)
    } else {
      setSuccessMsg('Submitted for review! The brand has been notified.')
    }
  }

  if (successMsg) {
    return (
      <div style={successBox}>
        <p style={{ fontWeight: 700, fontSize: '0.9375rem', margin: '0 0 0.25rem' }}>Submitted for review</p>
        <p style={{ fontSize: '0.8125rem', color: '#555', margin: 0 }}>
          The brand has been notified and will review your work.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e5e5e5', overflow: 'hidden' }}>
          <div style={{ width: `${(submitted / total) * 100}%`, height: '100%', background: '#16a34a', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', whiteSpace: 'nowrap' }}>
          {submitted} of {total}
        </span>
      </div>

      {/* Items list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item) => {
          const sc = ITEM_STATUS_COLORS[item.item_status] ?? ITEM_STATUS_COLORS.pending
          const editable = canSubmit && (item.item_status === 'pending' || item.item_status === 'revision')
          const isLoading = loadingItem === item.id

          return (
            <div key={item.id} style={itemCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: editable ? '0.5rem' : 0 }}>
                <div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111' }}>{item.label}</span>
                  <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: '0.375rem' }}>
                    {item.platform} {displayHandle(item.handle)}
                  </span>
                </div>
                <span style={{
                  fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 9999,
                  background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {item.item_status}{item.version > 1 ? ` v${item.version}` : ''}
                </span>
              </div>

              {/* Revision feedback from brand */}
              {item.item_status === 'revision' && item.revision_note && (
                <div style={{ margin: '0.375rem 0', padding: '0.5rem 0.625rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6 }}>
                  <p style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#9a3412', margin: '0 0 0.2rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Revision feedback</p>
                  <p style={{ fontSize: '0.8125rem', color: '#78350f', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.revision_note}</p>
                </div>
              )}

              {/* Show existing link for submitted/approved items */}
              {item.external_url && (item.item_status === 'submitted' || item.item_status === 'approved') && (
                <a
                  href={item.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', color: '#2563eb', wordBreak: 'break-all', display: 'block', marginTop: '0.25rem' }}
                >
                  {item.external_url.length > 55 ? item.external_url.slice(0, 55) + '...' : item.external_url}
                </a>
              )}

              {/* Link input for pending/revision items */}
              {editable && (
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={urls[item.id] ?? ''}
                    onChange={(e) => setUrls((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    disabled={isLoading}
                    style={linkInput}
                  />
                  <button
                    type="button"
                    onClick={() => handleSubmitItem(item.id)}
                    disabled={isLoading || !(urls[item.id]?.trim())}
                    style={{
                      ...submitItemBtn,
                      opacity: isLoading || !(urls[item.id]?.trim()) ? 0.5 : 1,
                      cursor: isLoading || !(urls[item.id]?.trim()) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isLoading ? '...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: '0.8125rem', color: '#dc2626', margin: '0.75rem 0 0', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          {error}
        </p>
      )}

      {/* Submit for review — prominent CTA once all items have links */}
      {canSubmit && allReady && (
        <div style={reviewCta}>
          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111', margin: '0 0 0.375rem' }}>
            All deliverables ready
          </p>
          <p style={{ fontSize: '0.75rem', color: '#555', margin: '0 0 0.75rem' }}>
            Review your links above, then submit for brand review.
          </p>
          <button
            type="button"
            onClick={handleSubmitForReview}
            disabled={submittingAll}
            style={{
              ...reviewBtn,
              opacity: submittingAll ? 0.6 : 1,
              cursor: submittingAll ? 'not-allowed' : 'pointer',
            }}
          >
            {submittingAll ? 'Submitting...' : 'Submit all for review'}
          </button>
        </div>
      )}

      {/* Hint when some items still need links */}
      {canSubmit && !allReady && needsAction.length > 0 && (
        <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.75rem 0 0' }}>
          {needsAction.length} item{needsAction.length !== 1 ? 's' : ''} still need a delivery link before you can submit for review.
        </p>
      )}
    </div>
  )
}

const itemCard: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  background: '#fafafa',
}

const linkInput: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 0.625rem',
  border: '1px solid #d5d5d5',
  borderRadius: 6,
  fontSize: '0.8125rem',
  outline: 'none',
  minWidth: 0,
}

const submitItemBtn: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 700,
  flexShrink: 0,
}

const reviewCta: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  border: '2px solid #16a34a',
  borderRadius: 12,
  background: '#f0fdf4',
  textAlign: 'center',
}

const reviewBtn: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  fontSize: '0.9375rem',
  fontWeight: 700,
  fontFamily: 'var(--font-body, inherit)',
}

const successBox: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #bbf7d0',
  borderRadius: 12,
  background: '#f0fdf4',
}
