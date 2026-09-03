'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recheckPostInsights } from '../insight-actions'

/**
 * Try the match again.
 *
 * The two common reasons a post has no numbers are both fixable by the creator:
 * they had not connected Instagram when they marked it posted, or they pasted
 * the wrong link. Without this they would have to un-post and re-post a
 * deliverable to get a second attempt, which is not something the deal flow
 * lets them do.
 */
export default function RecheckInsights({ dealId, itemId }: { dealId: string; itemId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function run() {
    start(async () => {
      const res = await recheckPostInsights(dealId, itemId)
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? 'Found it.' : 'Still no match.') })
      // The numbers live on the server, so a success only reaches this screen
      // on a refetch.
      if (res.ok) router.refresh()
    })
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        style={{
          minHeight: 34, padding: '0 14px', borderRadius: 999,
          border: '1px solid var(--hairline,rgba(24,28,36,.14))', background: '#fff',
          fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700,
          color: 'var(--ink)', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.55 : 1,
        }}
      >
        {pending ? 'Checking…' : 'Check again'}
      </button>
      {msg && (
        <p role="status" style={{
          margin: '8px 0 0', fontFamily: 'var(--font-ui)', fontSize: 12,
          lineHeight: 1.5, color: msg.ok ? '#166534' : 'var(--ink-soft)',
        }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
