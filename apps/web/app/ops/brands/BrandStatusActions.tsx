'use client'

import { useState } from 'react'
import { approveBrand, rejectBrand } from '../actions'
import { useRouter } from 'next/navigation'

export default function BrandStatusActions({ brandId, currentStatus }: { brandId: string; currentStatus: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleApprove() {
    setLoading(true)
    const res = await approveBrand(brandId)
    if (res?.error) alert(res.error)
    else router.refresh()
    setLoading(false)
  }

  async function handleReject() {
    if (!confirm('Reject this brand?')) return
    setLoading(true)
    const res = await rejectBrand(brandId)
    if (res?.error) alert(res.error)
    else router.refresh()
    setLoading(false)
  }

  if (currentStatus === 'approved') {
    return (
      <button onClick={handleReject} disabled={loading} style={{ ...btn, background: '#fee2e2', color: '#991b1b' }}>
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
      <button onClick={handleReject} disabled={loading} style={{ ...btn, background: '#fee2e2', color: '#991b1b' }}>
        {loading ? '...' : 'Reject'}
      </button>
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
