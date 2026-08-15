'use client'

import { useEffect, useState } from 'react'

/**
 * Bottom-centre toast — dark pill with a neon tick, per the paged-flow design.
 *
 * Used for confirmations that survive a redirect, where the thing being
 * confirmed happened on the PREVIOUS page and there is nowhere sensible to put
 * it on this one. Password reset is the case it was built for: the reset
 * completes, the session is revoked, and the user arrives at login needing to
 * know it worked.
 *
 * `param` strips itself from the URL once shown. Without that, the message is
 * part of the address: refresh, back, or a shared link re-announces a password
 * change that happened once, minutes ago. Uses history.replaceState rather than
 * router.replace so removing it does not re-render the page underneath.
 */
export default function Toast({
  message,
  duration = 4000,
  param,
}: {
  message: string
  /** The design auto-dismisses at 2.8s. Longer here by default: these messages
   *  ask the reader to do something next, not just acknowledge a click. */
  duration?: number
  /** Query param to strip from the URL once shown. */
  param?: string
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (param && typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param)
        window.history.replaceState({}, '', url.pathname + url.search + url.hash)
      }
    }
  }, [param])

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(t)
  }, [duration])

  if (!visible) return null

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast__badge" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#181C24"
             strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="toast__text">{message}</span>
    </div>
  )
}
