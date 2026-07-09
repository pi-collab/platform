'use client'

import { useState } from 'react'
import { approveItem, requestItemRevision } from './review-actions'
import { getSignedUrl } from '@/app/creator/deals/[id]/upload-actions'

interface Item {
  id: string
  label: string
  platform: string
  handle: string
  item_status: string
  external_url: string | null
  storage_path: string | null
  file_name: string | null
  version: number
  price_paise: number | null
}

const ITEM_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#f3f4f6', color: '#6b7280' },
  submitted: { bg: '#fef9c3', color: '#854d0e' },
  revision:  { bg: '#ffedd5', color: '#9a3412' },
  approved:  { bg: '#dcfce7', color: '#166534' },
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

export default function ItemReview({
  dealId,
  items,
  revisionsUsed,
  revisionLimit,
  dealStatus,
  pricePerExtraRevisionPaise = 0,
}: {
  dealId: string
  items: Item[]
  revisionsUsed: number
  revisionLimit: number
  dealStatus: string
  pricePerExtraRevisionPaise?: number
}) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [revisingItemId, setRevisingItemId] = useState<string | null>(null)
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({})
  const [viewingFile, setViewingFile] = useState<string | null>(null)

  const reviewed = items.filter((i) => i.item_status === 'approved' || i.item_status === 'revision').length
  const submitted = items.filter((i) => i.item_status === 'submitted').length

  // Revision reminder logic:
  // - "next round is the last included" when deal is delivered and revisionsUsed + 1 === revisionLimit
  // - "beyond the limit" when deal is delivered and revisionsUsed >= revisionLimit
  // Only relevant when deal is 'delivered' (a new round would increment revisions_used)
  const isLastIncluded = dealStatus === 'delivered' && revisionsUsed + 1 === revisionLimit && submitted > 0
  const isBeyondLimit = dealStatus === 'delivered' && revisionsUsed >= revisionLimit && submitted > 0

  function displayHandle(h: string) {
    return h.startsWith('@') ? h : `@${h}`
  }

  async function handleApprove(itemId: string) {
    setError(null)
    setLoadingAction(`approve-${itemId}`)
    const result = await approveItem(dealId, itemId)
    setLoadingAction(null)
    if (result.status === 'error') setError(result.message)
    else if (items.filter((i) => i.item_status === 'submitted').length === 1) {
      setDoneMessage('All deliverables approved!')
    }
  }

  async function handleViewFile(dealId: string, itemId: string) {
    setViewingFile(itemId)
    const result = await getSignedUrl(dealId, itemId)
    setViewingFile(null)
    if (result.status === 'success') {
      window.open(result.url, '_blank')
    } else {
      setError(result.message)
    }
  }

  async function handleRevision(itemId: string) {
    setError(null)
    setLoadingAction(`revision-${itemId}`)
    const note = revisionNotes[itemId]?.trim() || undefined
    const result = await requestItemRevision(dealId, itemId, note)
    setLoadingAction(null)
    if (result.status === 'error') setError(result.message)
    else {
      setRevisingItemId(null)
      setRevisionNotes((prev) => ({ ...prev, [itemId]: '' }))
    }
  }

  if (doneMessage) {
    return (
      <div style={successBox}>
        <p style={{ fontWeight: 700, fontSize: '0.9375rem', margin: '0 0 0.25rem' }}>All deliverables approved</p>
        <p style={{ fontSize: '0.8125rem', color: '#555', margin: 0 }}>
          The deal has been marked as approved. The creator has been notified.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--color-border, #e5e5e5)', overflow: 'hidden' }}>
          <div style={{ width: `${(reviewed / items.length) * 100}%`, height: '100%', background: '#16a34a', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
          {reviewed} of {items.length} reviewed
        </span>
      </div>

      {/* Revision count */}
      <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 400, margin: '0 0 0.75rem' }}>
        Revisions: {revisionsUsed} / {revisionLimit} used
      </p>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item) => {
          const sc = ITEM_STATUS_COLORS[item.item_status] ?? ITEM_STATUS_COLORS.pending
          const isSubmitted = item.item_status === 'submitted'
          const isApproving = loadingAction === `approve-${item.id}`
          const isRevising = loadingAction === `revision-${item.id}`
          const isLoading = isApproving || isRevising
          const showRevisionForm = revisingItemId === item.id

          return (
            <div key={item.id} style={itemCard}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-heading)' }}>{item.label}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginLeft: '0.375rem' }}>
                    {item.platform} {displayHandle(item.handle)}
                  </span>
                  {item.price_paise != null && item.price_paise > 0 && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-heading)', marginLeft: '0.5rem' }}>
                      {formatRupees(item.price_paise)}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 9999,
                  background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {item.item_status}{item.version > 1 ? ` v${item.version}` : ''}
                </span>
              </div>

              {/* Link or uploaded file */}
              {item.external_url && (
                <a
                  href={item.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.8125rem', color: '#2563eb', wordBreak: 'break-all', display: 'block', marginBottom: '0.5rem' }}
                >
                  {item.external_url.length > 55 ? item.external_url.slice(0, 55) + '...' : item.external_url}
                </a>
              )}
              {item.storage_path && item.file_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-heading)', fontWeight: 500 }}>
                    {item.file_name}
                  </span>
                  <button
                    onClick={() => handleViewFile(dealId, item.id)}
                    disabled={viewingFile === item.id}
                    style={{ ...viewFileBtn, opacity: viewingFile === item.id ? 0.5 : 1, cursor: viewingFile === item.id ? 'not-allowed' : 'pointer' }}
                  >
                    {viewingFile === item.id ? 'Loading...' : 'View file'}
                  </button>
                </div>
              )}

              {/* Actions for submitted items */}
              {isSubmitted && !showRevisionForm && (
                <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleApprove(item.id)}
                    disabled={isLoading}
                    style={{ ...approveBtn, opacity: isLoading ? 0.5 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {isApproving ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => setRevisingItemId(item.id)}
                    disabled={isLoading}
                    style={{ ...revisionBtn, opacity: isLoading ? 0.5 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                  >
                    Request Revision
                  </button>
                </div>
              )}

              {/* Revision feedback form */}
              {isSubmitted && showRevisionForm && (
                <div style={{ marginTop: '0.25rem' }}>
                  <textarea
                    value={revisionNotes[item.id] ?? ''}
                    onChange={(e) => setRevisionNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="What needs to change? e.g. at 0:14 fix the transition, increase brightness, change music..."
                    rows={3}
                    disabled={isRevising}
                    style={noteTextarea}
                  />
                  <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem' }}>
                    <button
                      onClick={() => setRevisingItemId(null)}
                      disabled={isRevising}
                      style={{ ...cancelBtn, cursor: isRevising ? 'not-allowed' : 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRevision(item.id)}
                      disabled={isRevising}
                      style={{ ...sendRevisionBtn, opacity: isRevising ? 0.5 : 1, cursor: isRevising ? 'not-allowed' : 'pointer' }}
                    >
                      {isRevising ? 'Sending...' : 'Send revision request'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Revision reminders — gentle, informative tone */}
      {isLastIncluded && !isBeyondLimit && (
        <div style={reminderBox}>
          <p style={{ fontSize: '0.8125rem', color: '#555', margin: 0 }}>
            This is the final revision included in the agreed terms.
          </p>
        </div>
      )}
      {isBeyondLimit && (
        <div style={warningBox}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#92400e', margin: 0 }}>
            ⚠ Beyond revision limit ({revisionsUsed}/{revisionLimit} used)
          </p>
          <p style={{ fontSize: '0.8125rem', color: '#92400e', margin: '0.25rem 0 0' }}>
            Extra revisions should be discussed with the creator.
            {pricePerExtraRevisionPaise > 0 && <span style={{ fontWeight: 700 }}> Each extra revision adds {formatRupees(pricePerExtraRevisionPaise)}.</span>}
          </p>
        </div>
      )}

      {error && (
        <p style={{ fontSize: '0.8125rem', color: '#dc2626', margin: '0.75rem 0 0', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          {error}
        </p>
      )}
    </div>
  )
}

const itemCard: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 8,
  background: 'var(--glass-bg, #fafafa)',
}

const approveBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'var(--accent, #DAFE0C)',
  color: 'var(--accent-text, #181C24)',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 700,
}

const revisionBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: '#fff',
  color: '#9a3412',
  border: '1px solid #fed7aa',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 600,
}

const noteTextarea: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border, #d5d5d5)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-body, inherit)',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
}

const cancelBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'transparent',
  color: 'var(--color-muted, #888)',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 600,
}

const sendRevisionBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: '#9a3412',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 700,
}

const reminderBox: React.CSSProperties = {
  marginTop: '0.75rem',
  padding: '0.625rem 0.875rem',
  background: 'var(--glass-bg, #f9fafb)',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 8,
}

const warningBox: React.CSSProperties = {
  marginTop: '0.75rem',
  padding: '0.75rem 1rem',
  background: '#fffbeb',
  border: '2px solid #f59e0b',
  borderRadius: 8,
}

const viewFileBtn: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: '#eff6ff',
  color: '#2563eb',
  border: '1px solid #bfdbfe',
  borderRadius: 5,
  fontSize: '0.6875rem',
  fontWeight: 600,
}

const successBox: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #bbf7d0',
  borderRadius: 12,
  background: '#f0fdf4',
}
