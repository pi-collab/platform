'use client'

import { useState, useRef } from 'react'
import { submitItem, submitForReview } from './actions'
import { getUploadPath, submitItemWithUpload, getSignedUrl, deleteOrphanedUpload } from './upload-actions'
import { createClient } from '@/lib/supabase/client'

interface Item {
  id: string
  label: string
  platform: string
  handle: string
  item_status: string
  external_url: string | null
  storage_path: string | null
  file_name: string | null
  version: number
  price_paise: number | null
  submitted_at: string | null
  revision_note: string | null
}

const MAX_FILE_SIZE = 500 * 1024 * 1024
const ACCEPTED_TYPES = 'video/mp4,video/quicktime,video/webm,video/x-msvideo,image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/mpeg,audio/wav,audio/mp4,application/zip,application/x-zip-compressed'

function formatINR(paise: number): string {
  const rupees = paise / 100
  const s = String(Math.round(rupees))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

export default function DeliverableItems({
  dealId,
  items,
  canSubmit,
}: {
  dealId: string
  items: Item[]
  canSubmit: boolean
}) {
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const item of items) {
      if (item.external_url) init[item.id] = item.external_url
    }
    return init
  })
  const [savedItems, setSavedItems] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const item of items) {
      if (item.item_status === 'submitted' || item.item_status === 'approved') init[item.id] = true
    }
    return init
  })
  const [loadingItem, setLoadingItem] = useState<string | null>(null)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [uploadMode, setUploadMode] = useState<Record<string, 'link' | 'upload'>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [viewingFile, setViewingFile] = useState<string | null>(null)

  const savedCount = items.filter((i) => i.item_status === 'submitted' || i.item_status === 'approved' || savedItems[i.id]).length
  const total = items.length
  const allReady = savedCount === total
  const remaining = total - savedCount

  function getMode(itemId: string): 'link' | 'upload' {
    return uploadMode[itemId] ?? 'link'
  }

  async function handleSubmitItem(itemId: string) {
    const url = urls[itemId]?.trim()
    if (!url) return
    setError(null)
    setLoadingItem(itemId)
    const result = await submitItem(dealId, itemId, url)
    setLoadingItem(null)
    if (result.status === 'error') {
      setError(result.message)
    } else {
      setSavedItems((s) => ({ ...s, [itemId]: true }))
    }
  }

  async function handleFileUpload(itemId: string, file: File) {
    setError(null)
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${formatFileSize(file.size)}). Maximum is 500MB.`)
      return
    }
    setLoadingItem(itemId)
    setUploadProgress((p) => ({ ...p, [itemId]: 0 }))

    const pathResult = await getUploadPath(dealId, itemId)
    if (pathResult.status === 'error') {
      setLoadingItem(null)
      setUploadProgress((p) => { const n = { ...p }; delete n[itemId]; return n })
      setError(pathResult.message)
      return
    }

    const storagePath = `${pathResult.path}/${file.name}`
    try {
      await uploadWithProgress(storagePath, file, (pct) => {
        setUploadProgress((p) => ({ ...p, [itemId]: pct }))
      })
    } catch (err: any) {
      setLoadingItem(null)
      setUploadProgress((p) => { const n = { ...p }; delete n[itemId]; return n })
      setError(err?.message || 'Upload failed. Please try again.')
      return
    }

    const submitResult = await submitItemWithUpload(dealId, itemId, storagePath, file.name, pathResult.version)
    if (submitResult.status === 'error') {
      await deleteOrphanedUpload(storagePath)
      setLoadingItem(null)
      setUploadProgress((p) => { const n = { ...p }; delete n[itemId]; return n })
      setError(submitResult.message)
      return
    }

    setLoadingItem(null)
    setUploadProgress((p) => { const n = { ...p }; delete n[itemId]; return n })
    setSavedItems((s) => ({ ...s, [itemId]: true }))
  }

  async function handleSubmitForReview() {
    setError(null)
    setSubmittingAll(true)
    const result = await submitForReview(dealId)
    setSubmittingAll(false)
    if (result.status === 'error') {
      setError(result.message)
    } else {
      setSuccessMsg('All deliverables submitted for review.')
    }
  }

  async function handleViewFile(itemId: string) {
    setViewingFile(itemId)
    const result = await getSignedUrl(dealId, itemId)
    setViewingFile(null)
    if (result.status === 'success') {
      window.open(result.url, '_blank')
    } else {
      setError(result.message)
    }
  }

  if (successMsg) {
    return (
      <div style={{ padding: '22px 24px', borderRadius: 14, border: '1.5px solid var(--neon-deep)', background: 'color-mix(in oklab, var(--neon) 14%, var(--card))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Submitted for review</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
          The brand has been notified and will review your work.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Progress summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{savedCount} of {total} ready</span>
      </div>

      {/* Items list */}
      <div style={{ marginTop: 12 }}>
        {items.map((item, idx) => {
          const editable = canSubmit && (item.item_status === 'pending' || item.item_status === 'revision')
          const isSaved = savedItems[item.id] || item.item_status === 'submitted' || item.item_status === 'approved'
          const isLoading = loadingItem === item.id
          const progress = uploadProgress[item.id]
          const mode = getMode(item.id)

          const statusLabel = item.item_status === 'approved' ? 'Approved'
            : item.item_status === 'revision' ? 'Revision requested'
            : isSaved ? 'Ready to submit'
            : 'Pending'
          const statusDot = item.item_status === 'approved' ? 'var(--neon-deep)'
            : item.item_status === 'revision' ? 'var(--warning)'
            : isSaved ? 'var(--neon-deep)'
            : 'var(--warning)'

          return (
            <div key={item.id} style={{ display: 'flex', gap: 14, padding: '16px 0', borderBottom: idx < items.length - 1 ? '1px solid var(--border-hairline, #EAEAE3)' : 'none' }}>
              {/* Icon */}
              <span style={itemIcon}>
                {item.platform?.toLowerCase().includes('youtube') ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m10 8 6 4-6 4V8z" /><rect x="2" y="3" width="20" height="18" rx="4" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                )}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title + price */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 }}>
                  <h4 style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>{item.label}</h4>
                  {item.price_paise != null && item.price_paise > 0 && (
                    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatINR(item.price_paise)}</span>
                  )}
                </div>

                {/* Status chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>
                  <span style={chipStyle}>
                    {item.platform?.toLowerCase().includes('youtube') ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m10 8 6 4-6 4V8z" /><rect x="2" y="3" width="20" height="18" rx="4" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="12" cy="12" r="4.5" /><circle cx="17.5" cy="6.5" r="1" /></svg>
                    )}
                    {item.handle?.startsWith('@') ? item.handle : `@${item.handle}`}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--ink-soft)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot }} />
                    {statusLabel}
                  </span>
                </div>

                {/* Revision feedback */}
                {item.item_status === 'revision' && item.revision_note && (
                  <div style={{ margin: '12px 0 0', padding: '10px 14px', background: 'var(--danger-soft, #fef2f2)', border: '1px solid var(--danger, #dc2626)', borderRadius: 12, opacity: 0.9 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--danger, #dc2626)', margin: '0 0 4px' }}>Revision feedback</p>
                    <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.revision_note}</p>
                  </div>
                )}

                {/* Editable: mode toggle + input */}
                {editable && !isSaved && (
                  <>
                    {/* Segmented toggle */}
                    <div style={{ display: 'flex', gap: 6, padding: 5, borderRadius: 12, background: 'var(--sec-2, #f5f5f0)', border: '1px solid var(--sec-mid-2, #e5e5dc)', width: 'max-content', marginTop: 14 }}>
                      <span
                        onClick={() => setUploadMode((m) => ({ ...m, [item.id]: 'link' }))}
                        style={segStyle(mode === 'link')}
                      >
                        Paste link
                      </span>
                      <span
                        onClick={() => setUploadMode((m) => ({ ...m, [item.id]: 'upload' }))}
                        style={segStyle(mode === 'upload')}
                      >
                        Upload file
                      </span>
                    </div>

                    {mode === 'link' ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                        <input
                          className="dinput"
                          type="url"
                          placeholder="Paste a link (Google Drive, Dropbox, Frame.io\u2026)"
                          value={urls[item.id] ?? ''}
                          onChange={(e) => setUrls((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          disabled={isLoading}
                          style={{ flex: 1, minWidth: 240 }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSubmitItem(item.id)}
                          disabled={isLoading || !(urls[item.id]?.trim())}
                          style={{
                            ...saveBtn,
                            background: urls[item.id]?.trim() ? 'var(--card)' : 'rgba(255,255,255,.55)',
                            opacity: isLoading || !(urls[item.id]?.trim()) ? 0.5 : 1,
                            cursor: isLoading || !(urls[item.id]?.trim()) ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isLoading ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ marginTop: 12 }}>
                        {progress != null ? (
                          <div>
                            <div style={{ height: 6, borderRadius: 3, background: 'var(--border-hairline, #EAEAE3)', overflow: 'hidden', marginBottom: 6 }}>
                              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--neon-deep)', borderRadius: 3, transition: 'width 0.2s' }} />
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--ink-soft)', margin: 0 }}>Uploading... {progress}%</p>
                          </div>
                        ) : (
                          <div>
                            <input
                              ref={(el) => { fileInputRefs.current[item.id] = el }}
                              type="file"
                              accept={ACCEPTED_TYPES}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleFileUpload(item.id, file)
                                e.target.value = ''
                              }}
                              disabled={isLoading}
                              style={{ display: 'none' }}
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRefs.current[item.id]?.click()}
                              disabled={isLoading}
                              style={{ ...saveBtn, opacity: isLoading ? 0.5 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                            >
                              Choose file
                            </button>
                            <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '6px 0 0' }}>
                              Video, image, PDF, audio, or ZIP. Max 500MB.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Saved state: show link/file in pill */}
                {isSaved && (item.external_url || urls[item.id] || item.storage_path) && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
                    padding: '12px 16px', borderRadius: 999,
                    background: 'var(--sec-2, #f5f5f0)', border: '1px solid var(--sec-mid-2, #e5e5dc)',
                    marginTop: 14,
                  }}>
                    {item.storage_path && item.file_name ? (
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>{item.file_name}</span>
                    ) : (
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>
                        {(item.external_url || urls[item.id] || '').length > 60
                          ? (item.external_url || urls[item.id] || '').slice(0, 60) + '...'
                          : (item.external_url || urls[item.id] || '')}
                      </span>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {item.storage_path && (
                        <button
                          type="button"
                          onClick={() => handleViewFile(item.id)}
                          disabled={viewingFile === item.id}
                          className="viewlink"
                          style={{ padding: 0, background: 'none', border: 'none', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}
                        >
                          {viewingFile === item.id ? 'Loading...' : 'View'}
                        </button>
                      )}
                      {editable && (
                        <button
                          type="button"
                          onClick={() => setSavedItems((s) => ({ ...s, [item.id]: false }))}
                          className="viewlink"
                          style={{ padding: 0, background: 'none', border: 'none', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}
                        >
                          Replace
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: 12.5, color: 'var(--danger, #dc2626)', background: 'var(--danger-soft, #fef2f2)', padding: '10px 14px', borderRadius: 12, margin: '14px 0 0' }}>
          {error}
        </p>
      )}

      {/* Footer: helper text + submit button */}
      {canSubmit && (
        <div style={{ padding: '20px 0 0', marginTop: 20, borderTop: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 440 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            <span style={{ fontSize: 11.5, lineHeight: 1.45, color: allReady ? 'var(--ink)' : 'var(--ink-soft)' }}>
              {allReady
                ? 'All items are attached \u2014 submit when you are ready.'
                : `${remaining} ${remaining === 1 ? 'item' : 'items'} still ${remaining === 1 ? 'needs' : 'need'} a link or file before you can submit.`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="neonbtn"
              onClick={handleSubmitForReview}
              disabled={submittingAll || !allReady}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                height: 54, padding: '0 30px', borderRadius: 14,
                background: 'var(--neon)', border: 'none',
                fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 15.5, letterSpacing: '-0.01em', color: 'var(--ink)',
                boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                opacity: submittingAll || !allReady ? 0.45 : 1,
                cursor: submittingAll || !allReady ? 'not-allowed' : 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m21 15-9-9-9 9" /></svg>
              {submittingAll ? 'Submitting...' : 'Submit for review'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Upload with progress via Supabase SDK ──
function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const supabase = createClient()
    supabase.storage
      .from('deliverables')
      .upload(path, file, { upsert: false })
      .then(({ error }) => {
        if (error) {
          reject(new Error(error.message))
        } else {
          onProgress(100)
          resolve()
        }
      })
      .catch((err) => reject(err))

    let fakeProgress = 0
    const interval = setInterval(() => {
      fakeProgress += (90 - fakeProgress) * 0.08
      onProgress(Math.round(fakeProgress))
    }, 300)

    const cleanup = () => clearInterval(interval)
    setTimeout(() => { cleanup() }, 600000)

    const origResolve = resolve
    const origReject = reject
    resolve = (...args) => { cleanup(); origResolve(...args) }
    reject = (...args) => { cleanup(); origReject(...args) }
  })
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${bytes}B`
}

function segStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 8,
    fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer',
    ...(active
      ? { background: 'var(--card)', color: 'var(--ink)', boxShadow: '0 3px 8px -4px rgba(40,45,25,.5)' }
      : { background: 'transparent', color: 'var(--ink-soft)' }),
  }
}

// ── Styles ──

const itemIcon: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 11,
  background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 11px', borderRadius: 999,
  background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
  fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)',
}

const saveBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  height: 46, padding: '0 20px', borderRadius: 12,
  background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
  boxShadow: '0 8px 18px -12px rgba(40,45,25,.42)',
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)',
}
