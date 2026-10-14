'use client'

import { useState } from 'react'
import { openReleasedFile } from './actions'

export default function ViewFile({ releaseId, fileName }: { releaseId: string; fileName: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setError(null); setBusy(true)
    const w = window.open('', '_blank')
    const r = await openReleasedFile(releaseId)
    setBusy(false)
    if (!r.ok) { w?.close(); setError(r.message); return }
    if (w) w.location.href = r.url; else window.location.href = r.url
  }
  return (
    <span>
      <button type="button" className="bx-btn" onClick={open} disabled={busy}>{busy ? 'Opening…' : 'View file'}</button>
      {fileName && <span className="bx-file">{fileName}</span>}
      {error && <span className="bx-err" role="alert">{error}</span>}
    </span>
  )
}
