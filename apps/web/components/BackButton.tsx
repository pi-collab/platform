'use client'

import { useRouter } from 'next/navigation'

/**
 * Back chevron for a step in a flow.
 *
 * Uses history rather than a fixed href on purpose. By this point in creator
 * signup the account already exists — the OTP created it — so there is no
 * earlier STATE to return to, and linking at /signup/creator would bounce
 * straight back here through the already-signed-in redirect. History is the
 * one thing that reliably means "where I just came from".
 */
export default function BackButton({ className }: { className?: string }) {
  const router = useRouter()
  return (
    <button type="button" onClick={() => router.back()} className={className} aria-label="Back">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  )
}
