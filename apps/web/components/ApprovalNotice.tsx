'use client'

import { useState } from 'react'
import { acknowledgeApproval } from '@/app/dashboard/actions'

/**
 * Shown once, after a brand's first-send review clears.
 *
 * The counterpart to HeldNotice, which promised "we'll notify you as soon as
 * you're cleared". Without this that notice just vanishes, and the brand is
 * left to guess whether the deal they queued ever went out.
 */
export default function ApprovalNotice() {
  const [hidden, setHidden] = useState(false)

  function handleOkay() {
    // Hide first, then record it. The write is durable across devices, but
    // waiting on the round trip to dismiss a congratulation would make the
    // button feel broken on a slow connection.
    setHidden(true)
    void acknowledgeApproval()
  }

  if (hidden) return null

  return (
    <div className="heldnotice heldnotice--approved" role="status">
      <div className="heldnotice__title">You&rsquo;re approved</div>
      <p className="heldnotice__body">
        Your account has been reviewed and cleared. Everything you had queued has gone out to
        the creators, and from now on every deal you send goes straight through.
      </p>
      <button type="button" onClick={handleOkay} className="heldnotice__ok">
        Okay
      </button>
    </div>
  )
}
