'use client'

import { useState } from 'react'
import { openInvoicePdf } from './actions'

export default function InvoicePdf({ invoiceId }: { invoiceId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setError(null); setBusy(true)
    const r = await openInvoicePdf(invoiceId)
    setBusy(false)
    if (!r.ok) { setError(r.message); return }
    window.location.href = r.url
  }
  return (
    <span>
      <button type="button" className="bx-btn" onClick={open} disabled={busy}>{busy ? 'Preparing…' : 'Download PDF'}</button>
      {error && <span className="bx-err" role="alert">{error}</span>}
    </span>
  )
}
