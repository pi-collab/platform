'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { setPublished } from './actions'

/** Publish/unpublish in place, so the list is the control surface. */
export default function PublishToggle({ id, published }: { id: string; published: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await setPublished(id, !published)
        setBusy(false)
        router.refresh()
      }}
      style={{ padding: '0.2rem 0.6rem', borderRadius: 6, border: '1px solid #d4d4d8', background: '#fff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
    >
      {published ? 'Unpublish' : 'Publish'}
    </button>
  )
}
