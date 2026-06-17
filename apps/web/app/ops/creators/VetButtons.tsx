'use client'

import { vetCreator, rejectCreator } from '../actions'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function VetButton({ creatorId }: { creatorId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      disabled={loading}
      style={{ ...btnStyle, background: '#16a34a', color: '#fff' }}
      onClick={async () => {
        setLoading(true)
        const res = await vetCreator(creatorId)
        if (res.error) alert(res.error)
        else router.refresh()
        setLoading(false)
      }}
    >
      {loading ? '...' : 'Approve'}
    </button>
  )
}

export function RejectButton({ creatorId }: { creatorId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      disabled={loading}
      style={{ ...btnStyle, background: '#dc2626', color: '#fff' }}
      onClick={async () => {
        if (!confirm('Reject this creator? (They stay in the database but marked not vetted.)')) return
        setLoading(true)
        const res = await rejectCreator(creatorId)
        if (res.error) alert(res.error)
        else router.refresh()
        setLoading(false)
      }}
    >
      {loading ? '...' : 'Reject'}
    </button>
  )
}

const btnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  padding: '0.3rem 0.75rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
}
