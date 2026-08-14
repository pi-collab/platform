'use client'

import { useState } from 'react'
import { approveItem, requestItemRevision } from './review-actions'
import { getSignedUrl } from '@/app/creator/deals/[id]/upload-actions'
import { trackEvent } from '@/lib/analytics'

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
  reel_type: string | null
  boosting_rights: boolean | null
  boosting_duration_months: number | null
  submitted_at: string | null
  updated_at: string | null
  revision_note: string | null
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const day = d.getDate()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${day} ${months[d.getMonth()]}, ${h12}:${m} ${ampm}`
}

export default function ItemReview({
  dealId,
  items,
  revisionsUsed,
  revisionLimit,
  dealStatus,
  pricePerExtraRevisionPaise = 0,
  creatorFirstName = 'Creator',
}: {
  dealId: string
  items: Item[]
  revisionsUsed: number
  revisionLimit: number
  dealStatus: string
  pricePerExtraRevisionPaise?: number
  creatorFirstName?: string
}) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [revisingItemId, setRevisingItemId] = useState<string | null>(null)
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({})
  const [viewingFile, setViewingFile] = useState<string | null>(null)

  const allApproved = items.every((i) => i.item_status === 'approved')
  const submitted = items.filter((i) => i.item_status === 'submitted').length
  const hasRevision = items.some((i) => i.item_status === 'revision')
  const isBeyondLimit = dealStatus === 'delivered' && revisionsUsed >= revisionLimit && submitted > 0

  async function handleApprove(itemId: string) {
    setError(null)
    setLoadingAction(`approve-${itemId}`)
    const result = await approveItem(dealId, itemId)
    if (result.status === 'success') trackEvent('deliverable_approved')
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 22px', borderRadius: 14, background: 'color-mix(in oklab, var(--neon) 14%, var(--card))', border: '1.5px solid var(--neon-deep)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>All deliverables approved.</span>
      </div>
    )
  }

  // Build subtitle
  let subtitle = ''
  if (hasRevision && submitted > 0) subtitle = 'Revised submission \u00B7 waiting on your review'
  else if (submitted > 0) subtitle = `${submitted} deliverable${submitted !== 1 ? 's' : ''} waiting on your review`

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => {
          const isSubmitted = item.item_status === 'submitted'
          const isApproved = item.item_status === 'approved'
          const isRevisionStatus = item.item_status === 'revision'
          const isResubmitted = isSubmitted && item.version > 1 && !!item.revision_note
          const isApproving = loadingAction === `approve-${item.id}`
          const isRevising = loadingAction === `revision-${item.id}`
          const isLoading = isApproving || isRevising
          const showRevisionForm = revisingItemId === item.id

          const details: string[] = []
          if (item.reel_type) details.push(item.reel_type === 'collab' ? 'Collab post' : 'Non-collab')
          if (item.boosting_rights) details.push(`${item.boosting_duration_months ?? '\u221E'}-day boosting rights`)
          if (item.price_paise != null && item.price_paise > 0) details.push(formatRupees(item.price_paise))

          // Status dot + label
          const statusDot = isApproved
            ? 'var(--success, #1F9D6B)'
            : isRevisionStatus
              ? 'var(--warning)'
              : isResubmitted
                ? 'var(--warning)'
                : isSubmitted
                  ? 'var(--info, #5AA9E6)'
                  : 'var(--ink-faint)'
          const statusLabel = isApproved
            ? 'Approved'
            : isRevisionStatus
              ? 'Revision requested'
              : isResubmitted
                ? 'Resubmitted'
                : isSubmitted
                  ? 'Submitted'
                  : 'Pending'

          // File info
          const fileName = item.file_name || (item.external_url ? (item.external_url.length > 40 ? item.external_url.slice(0, 40) + '...' : item.external_url) : null)

          return (
            <div key={item.id} style={{ borderRadius: 16, border: '1.5px solid var(--hairline, #EAEAE3)', background: 'var(--card)', padding: '16px 18px' }}>
              {/* Header: label + details + status */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{item.label}</span>
                  {details.length > 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, maxWidth: 400 }}>
                      {details.join(' \u00B7 ')}
                    </div>
                  )}
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', flexShrink: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot }} />
                  {statusLabel}
                </span>
              </div>

              {/* Resubmission card */}
              {isResubmitted && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 20, borderRadius: 16, marginTop: 14, background: 'var(--sec-2, #f5f5f0)', border: '1px solid var(--sec-mid-2, #e5e5dc)' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--card)', border: '1px solid var(--sec-mid-2, #e5e5dc)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{creatorFirstName} has resubmitted</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-soft)', marginTop: 5, whiteSpace: 'pre-wrap' }}>
                      Your note: &quot;{item.revision_note}&quot;
                    </div>
                    {item.submitted_at && (
                      <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 9 }}>Resubmitted {formatDateTime(item.submitted_at)}</div>
                    )}
                  </div>
                </div>
              )}

              {/* File pill */}
              {(item.storage_path || item.external_url) && fileName && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 'var(--radius-pill, 999px)', background: 'var(--sec-2, #f5f5f0)', border: '1px solid var(--sec-mid-2, #e5e5dc)', marginTop: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    {item.storage_path ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07L11 5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21l1-1" /></svg>
                    )}
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>
                      {item.file_name || item.external_url}
                    </span>
                  </span>
                  {item.storage_path ? (
                    <button
                      onClick={() => handleViewFile(dealId, item.id)}
                      disabled={viewingFile === item.id}
                      style={{ padding: 0, background: 'none', border: 'none', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: viewingFile === item.id ? 'not-allowed' : 'pointer', opacity: viewingFile === item.id ? 0.5 : 1 }}
                    >
                      {viewingFile === item.id ? 'Loading...' : 'View file'}
                    </button>
                  ) : item.external_url ? (
                    <a href={item.external_url} target="_blank" rel="noopener noreferrer" style={{ padding: 0, background: 'none', border: 'none', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      View file
                    </a>
                  ) : null}
                </div>
              )}

              {/* Approve + Revision buttons for submitted items */}
              {isSubmitted && !showRevisionForm && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                  <button
                    onClick={() => setRevisingItemId(item.id)}
                    disabled={isLoading}
                    className="pill"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, padding: '0 18px', borderRadius: 11, background: 'var(--card)', border: '1px solid var(--frost-edge, var(--hairline))', boxShadow: '0 6px 14px -10px rgba(40,45,25,.4)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }}
                  >
                    Request revision
                  </button>
                  <button
                    onClick={() => handleApprove(item.id)}
                    disabled={isLoading}
                    className="neonbtn"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, padding: '0 20px', borderRadius: 11, background: 'var(--neon, var(--lime-400))', border: 'none', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, letterSpacing: '-0.01em', color: 'var(--ink)', cursor: isLoading ? 'not-allowed' : 'pointer', boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)', opacity: isLoading ? 0.5 : 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    {isApproving ? 'Approving...' : 'Approve'}
                  </button>
                </div>
              )}

              {/* Revision feedback form */}
              {isSubmitted && showRevisionForm && (
                <div style={{ marginTop: 14 }}>
                  <textarea
                    value={revisionNotes[item.id] ?? ''}
                    onChange={(e) => setRevisionNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Describe what needs to change…"
                    rows={4}
                    disabled={isRevising}
                    style={{ height: 'auto', minHeight: 120, width: '100%', boxSizing: 'border-box', padding: '16px 18px', fontFamily: 'var(--font-ui)', fontSize: 13.5, lineHeight: 1.6, resize: 'vertical', outline: 'none', border: '1.5px solid var(--sec-mid-2, var(--hairline))', background: 'var(--sec-2, var(--card))', borderRadius: 16, color: 'var(--ink)', boxShadow: 'inset 0 1px 3px rgba(40,45,25,.06)', transition: 'border-color .16s ease, box-shadow .16s ease' }}
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                    <button
                      onClick={() => setRevisingItemId(null)}
                      disabled={isRevising}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 40, padding: '0 16px', borderRadius: 11, background: 'none', border: '1px solid var(--frost-edge, var(--hairline))', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink-soft)', cursor: isRevising ? 'not-allowed' : 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRevision(item.id)}
                      disabled={isRevising}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 40, padding: '0 18px', borderRadius: 11, background: 'var(--ink)', border: 'none', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, color: '#FFFFFF', cursor: isRevising ? 'not-allowed' : 'pointer', opacity: isRevising ? 0.5 : 1 }}
                    >
                      {isRevising ? 'Sending...' : 'Send revision request'}
                    </button>
                  </div>
                </div>
              )}

              {/* Revision sent — waiting on creator */}
              {isRevisionStatus && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 14, background: 'var(--sec-2, #F4F8FC)', border: '1px solid var(--sec-mid-2, var(--hairline))', marginTop: 14 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--sec-mid-2, var(--hairline))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Waiting on {creatorFirstName}&apos;s revision</div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* All approved banner */}
      {allApproved && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '18px 22px', marginTop: 18, borderRadius: 14, background: 'color-mix(in oklab, var(--neon) 14%, var(--card))', border: '1.5px solid var(--neon-deep)' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>All deliverables are approved.</span>
        </div>
      )}

      {/* Revision limit warning */}
      {isBeyondLimit && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 18px', marginTop: 14, borderRadius: 14, background: 'color-mix(in oklab, var(--warning) 10%, var(--card))', border: '1.5px solid var(--warning)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
            <b style={{ fontWeight: 700, color: 'var(--ink)' }}>Beyond revision limit</b> ({revisionsUsed}/{revisionLimit} used). Extra revisions should be discussed with the creator.
            {pricePerExtraRevisionPaise > 0 && <span> Each extra revision adds <b>{formatRupees(pricePerExtraRevisionPaise)}</b>.</span>}
          </div>
        </div>
      )}

      {/* Footer note */}
      <div style={{ paddingTop: 20, marginTop: 20, borderTop: '1px solid var(--border-hairline)' }}>
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
          {revisionLimit > 0 ? `${revisionLimit} revision round${revisionLimit !== 1 ? 's' : ''} included per deliverable if you need changes.` : 'Revisions can be requested if you need changes.'}
        </span>
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--danger, #D2545A)', marginTop: 14, padding: '12px 16px', borderRadius: 12, background: 'color-mix(in oklab, var(--danger, #D2545A) 8%, var(--card))', border: '1px solid color-mix(in oklab, var(--danger, #D2545A) 20%, transparent)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
