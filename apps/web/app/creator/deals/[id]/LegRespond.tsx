'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { respondToLeg } from './leg-actions'

/** Accept / decline for a Guapd Experience creator leg. No counter in this stage. */
export default function LegRespond({ dealId, netLabel }: { dealId: string; netLabel: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const answer = (accept: boolean) => {
    setError(null)
    start(async () => {
      const r = await respondToLeg(dealId, accept, accept ? undefined : reason)
      if (!r.ok) { setError(r.message); return }
      router.refresh()
    })
  }

  return (
    <div className="leg-respond">
      {!declining ? (
        <div className="leg-actions">
          <button type="button" className="neonbtn leg-accept" disabled={pending} onClick={() => answer(true)}>
            {pending ? 'Saving…' : netLabel ? `Accept · ${netLabel} to you` : 'Accept'}
          </button>
          <button type="button" className="leg-decline" disabled={pending} onClick={() => setDeclining(true)}>Decline</button>
        </div>
      ) : (
        <div className="leg-decline-box">
          <label htmlFor="leg-reason" className="leg-label">Anything Guapd should know? (optional)</label>
          <textarea id="leg-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Dates don't work, rate, anything else" className="leg-textarea" />
          <div className="leg-actions">
            <button type="button" className="leg-decline" disabled={pending} onClick={() => setDeclining(false)}>Back</button>
            <button type="button" className="leg-decline leg-decline-confirm" disabled={pending} onClick={() => answer(false)}>
              {pending ? 'Saving…' : 'Decline this offer'}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="leg-error">{error}</p>}
    </div>
  )
}
