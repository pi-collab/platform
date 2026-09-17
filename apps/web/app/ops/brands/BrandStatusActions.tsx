'use client'

import { useState } from 'react'
import { approveBrand, rejectBrand } from '../actions'
import { useRouter } from 'next/navigation'

/* `canReject` defaults true so every existing call site keeps its current
   behaviour. Only the outreach role passes false, and `rejectBrand` refuses
   them server-side regardless — this just stops a button that would always
   fail. */
export default function BrandStatusActions({ brandId, currentStatus, canReject = true }: { brandId: string; currentStatus: string; canReject?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // Reject opens an inline box rather than a browser confirm: it needs an
  // optional reason, and the brand sees whatever is typed here.
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [rejectError, setRejectError] = useState('')

  async function handleApprove() {
    setLoading(true)
    const res = await approveBrand(brandId)
    if (res?.error) alert(res.error)
    else router.refresh()
    setLoading(false)
  }

  async function handleReject() {
    setLoading(true)
    setRejectError('')
    const res = await rejectBrand(brandId, reason)
    setLoading(false)
    // Shown in place, not in an alert: the refusal for live deals is an
    // instruction ops needs to read, not a blip to dismiss.
    if (res?.error) { setRejectError(res.error); return }
    setRejecting(false)
    setReason('')
    router.refresh()
  }

  function openReject() { setRejecting(true); setRejectError('') }

  if (rejecting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 240, maxWidth: 320 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#333' }} htmlFor={`reject-reason-${brandId}`}>
          Reason <span style={{ fontWeight: 400, color: '#888' }}>(optional, the brand sees this)</span>
        </label>
        <textarea
          id={`reject-reason-${brandId}`}
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="e.g. We could not verify this business."
          style={{ fontSize: '0.8125rem', padding: '0.375rem 0.5rem', border: '1px solid #ddd', borderRadius: 4, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <p style={{ fontSize: '0.6875rem', color: '#888', margin: 0 }}>
          They are locked out of their dashboard and emailed that they were not approved.
        </p>
        {rejectError && <p role="alert" style={{ fontSize: '0.75rem', color: '#991b1b', margin: 0 }}>{rejectError}</p>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleReject} disabled={loading} style={{ ...btn, background: '#991b1b', color: '#fff' }}>
            {loading ? '...' : 'Confirm reject'}
          </button>
          <button onClick={() => { setRejecting(false); setRejectError('') }} disabled={loading} style={{ ...btn, background: '#f3f4f6', color: '#333' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (currentStatus === 'approved') {
    if (!canReject) return <span style={{ fontSize: '0.75rem', color: '#888' }}>&mdash;</span>
    return (
      <button onClick={openReject} disabled={loading} style={{ ...btn, background: '#fee2e2', color: '#991b1b' }}>
        {loading ? '...' : 'Reject'}
      </button>
    )
  }

  if (currentStatus === 'rejected') {
    return (
      <button onClick={handleApprove} disabled={loading} style={{ ...btn, background: '#dcfce7', color: '#166534' }}>
        {loading ? '...' : 'Approve'}
      </button>
    )
  }

  // pending — show both
  return (
    <>
      <button onClick={handleApprove} disabled={loading} style={{ ...btn, background: '#dcfce7', color: '#166534' }}>
        {loading ? '...' : 'Approve'}
      </button>
      {canReject && (
        <button onClick={openReject} disabled={loading} style={{ ...btn, background: '#fee2e2', color: '#991b1b' }}>
          {loading ? '...' : 'Reject'}
        </button>
      )}
    </>
  )
}

const btn: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  padding: '0.25rem 0.625rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
