'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { CreatorLegItem } from '@/lib/creator-leg-money'
import { openLegItemFile, startLegItemUpload, submitLegItem } from './leg-actions'

/**
 * The creator's deliverables on a creator-submit shoot (0538): submit a link
 * or a file per deliverable, see Guapd's review and any change asked for.
 * Guapd reviews before the brand sees anything; the creator is never shown
 * what was shared with the brand or the brand's answer.
 */
const LABEL: Record<string, string> = {
  pending: 'To submit',
  submitted: 'With Guapd for review',
  revision: 'Changes asked',
  approved: 'Approved',
}

export default function LegDeliverables({ dealId, items, canSubmit }: { dealId: string; items: CreatorLegItem[]; canSubmit: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = (item: CreatorLegItem) => {
    setError(null)
    start(async () => {
      if (file) {
        const slot = await startLegItemUpload(dealId, item.id, file.name)
        if (!slot.ok) { setError(slot.message); return }
        const { error: upErr } = await createBrowserClient().storage.from('deliverables')
          .uploadToSignedUrl(slot.data.path, slot.data.token, file, { contentType: file.type || undefined })
        if (upErr) { setError('The upload did not finish. Please try again.'); return }
        const r = await submitLegItem(dealId, item.id, { storagePath: slot.data.path, fileName: file.name })
        if (!r.ok) { setError(r.message); return }
      } else {
        const r = await submitLegItem(dealId, item.id, { url: link })
        if (!r.ok) { setError(r.message); return }
      }
      setOpen(null); setLink(''); setFile(null); router.refresh()
    })
  }

  const view = async (item: CreatorLegItem) => {
    const w = window.open('', '_blank')
    const r = await openLegItemFile(dealId, item.id)
    if (!r.ok) { w?.close(); setError(r.message); return }
    if (w) w.location.href = r.data; else window.location.href = r.data
  }

  return (
    <div className="leg-items">
      {items.map((i) => {
        const editable = canSubmit && i.item_status !== 'approved'
        return (
          <div key={i.id} className="leg-item">
            <div className="leg-item-row">
              <div style={{ minWidth: 0 }}>
                <div className="leg-item-name">{i.label}{i.affiliate_link ? ' · affiliate link' : ''}</div>
                <div className={`leg-item-status leg-st-${i.item_status}`}>{LABEL[i.item_status] ?? i.item_status}{i.version > 1 ? ` · version ${i.version}` : ''}</div>
              </div>
              {editable && (
                <button type="button" className="leg-decline" style={{ height: 38 }} onClick={() => { setError(null); setOpen(open === i.id ? null : i.id); setLink(''); setFile(null) }}>
                  {i.external_url || i.file_name ? 'Replace' : 'Submit'}
                </button>
              )}
            </div>
            {i.external_url && <a className="leg-item-link" href={i.external_url} target="_blank" rel="noreferrer noopener">{i.external_url}</a>}
            {i.file_name && <button type="button" className="leg-item-link leg-linkbtn" onClick={() => view(i)}>{i.file_name}</button>}
            {i.item_status === 'revision' && i.revision_note && <p className="leg-item-note">Guapd asked: {i.revision_note}</p>}
            {open === i.id && (
              <div className="leg-decline-box" style={{ marginTop: 10 }}>
                <label className="leg-label" htmlFor={`l-${i.id}`}>Link (Drive, Instagram, YouTube…)</label>
                <input id={`l-${i.id}`} className="leg-textarea" value={link} disabled={!!file} placeholder="https://" onChange={(e) => setLink(e.target.value)} />
                <label className="leg-label" htmlFor={`f-${i.id}`}>Or upload a file</label>
                <input id={`f-${i.id}`} type="file" accept="video/*,image/*,application/pdf,audio/*,.zip" disabled={!!link.trim()} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <div className="leg-actions">
                  <button type="button" className="leg-accept" disabled={pending || (!file && !link.trim())} onClick={() => submit(i)}>{pending ? 'Sending…' : 'Send to Guapd'}</button>
                  <button type="button" className="leg-decline" onClick={() => setOpen(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {error && <p className="leg-error" role="alert">{error}</p>}
    </div>
  )
}
