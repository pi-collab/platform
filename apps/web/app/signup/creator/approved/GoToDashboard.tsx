'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acknowledgeCreatorApproval } from './actions'

/** Records that the screen was seen, then moves on. */
export default function GoToDashboard() {
  const router = useRouter()
  const [going, setGoing] = useState(false)

  async function handleGo() {
    if (going) return
    setGoing(true)
    // Awaited, not fire-and-forget: navigating first can outrun the write and
    // leave the screen to reappear on the very next page load.
    await acknowledgeCreatorApproval()
    // The questions sit between here and the dashboard. /creator/welcome sends
    // anyone who has already answered — or who predates the questions — onward
    // without showing anything.
    router.push('/creator/welcome')
    router.refresh()
  }

  return (
    <button type="button" onClick={handleGo} disabled={going} className="approved-cta cta">
      {going ? 'Opening…' : 'Go to dashboard'}
    </button>
  )
}
