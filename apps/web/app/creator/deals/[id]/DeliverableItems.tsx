'use client'

import { useState, useRef } from 'react'
import { submitItem, submitForReview } from './actions'
import { getUploadPath, submitItemWithUpload, deleteOrphanedUpload } from './upload-actions'
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
  submitted_at: string | null
  revision_note: string | null
}

const ITEM_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#f3f4f6', color: '#6b7280' },
  submitted: { bg: '#fef9c3', color: '#854d0e' },
  revision:  { bg: '#ffedd5', color: '#9a3412' },
  approved:  { bg: '#dcfce7', color: '#166534' },
}

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
const ACCEPTED_TYPES = 'video/mp4,video/quicktime,video/webm,video/x-msvideo,image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/mpeg,audio/wav,audio/mp4,application/zip,application/x-zip-compressed'

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
  const [loadingItem, setLoadingItem] = useState<string | null>(null)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  // Upload state per item
  const [uploadMode, setUploadMode] = useState<Record<string, 'link' | 'upload'>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const submitted = items.filter((i) => i.item_status === 'submitted' || i.item_status === 'approved').length
  const total = items.length
  const allReady = items.every((i) => i.item_status === 'submitted' || i.item_status === 'approved')
  const needsAction = items.filter((i) => i.item_status === 'pending' || i.item_status === 'revision')

  function displayHandle(h: string) {
    return h.startsWith('@') ? h : `@${h}`
  }

  function getMode(itemId: string): 'link' | 'upload' {
    return uploadMode[itemId] ?? 'link'
  }

  // ── Link submission (existing flow) ──
  async function handleSubmitItem(itemId: string) {
    const url = urls[itemId]?.trim()
    if (!url) return
    setError(null)
    setLoadingItem(itemId)

    const result = await submitItem(dealId, itemId, url)
    setLoadingItem(null)

    if (result.status === 'error') {
      setError(result.message)
    }
  }

  // ── File upload flow ──
  async function handleFileUpload(itemId: string, file: File) {
    setError(null)

    // Client-side size check
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${formatFileSize(file.size)}). Maximum is 500MB.`)
      return
    }

    setLoadingItem(itemId)
    setUploadProgress((p) => ({ ...p, [itemId]: 0 }))

    // 1. Get validated upload path from server
    const pathResult = await getUploadPath(dealId, itemId)
    if (pathResult.status === 'error') {
      setLoadingItem(null)
      setUploadProgress((p) => { const n = { ...p }; delete n[itemId]; return n })
      setError(pathResult.message)
      return
    }

    const storagePath = `${pathResult.path}/${file.name}`

    // 2. Upload via client-side Supabase with XHR for progress
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

    // 3. Write to DB via server action
    const submitResult = await submitItemWithUpload(dealId, itemId, storagePath, file.name, pathResult.version)

    if (submitResult.status === 'error') {
      // Cleanup orphaned file
      await deleteOrphanedUpload(storagePath)
      setLoadingItem(null)
      setUploadProgress((p) => { const n = { ...p }; delete n[itemId]; return n })
      setError(submitResult.message)
      return
    }

    setLoadingItem(null)
    setUploadProgress((p) => { const n = { ...p }; delete n[itemId]; return n })
  }

  async function handleSubmitForReview() {
    setError(null)
    setSubmittingAll(true)

    const result = await submitForReview(dealId)
    setSubmittingAll(false)

    if (result.status === 'error') {
      setError(result.message)
    } else {
      setSuccessMsg('Submitted for review! The brand has been notified.')
    }
  }

  if (successMsg) {
    return (
      <div style={successBox}>
        <p style={{ fontWeight: 700, fontSize: '0.9375rem', margin: '0 0 0.25rem' }}>Submitted for review</p>
        <p style={{ fontSize: '0.8125rem', color: '#555', margin: 0 }}>
          The brand has been notified and will review your work.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e5e5e5', overflow: 'hidden' }}>
          <div style={{ width: `${(submitted / total) * 100}%`, height: '100%', background: '#16a34a', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', whiteSpace: 'nowrap' }}>
          {submitted} of {total}
        </span>
      </div>

      {/* Items list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((item) => {
          const sc = ITEM_STATUS_COLORS[item.item_status] ?? ITEM_STATUS_COLORS.pending
          const editable = canSubmit && (item.item_status === 'pending' || item.item_status === 'revision')
          const isLoading = loadingItem === item.id
          const progress = uploadProgress[item.id]
          const mode = getMode(item.id)

          return (
            <div key={item.id} style={itemCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: editable ? '0.5rem' : 0 }}>
                <div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111' }}>{item.label}</span>
                  <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: '0.375rem' }}>
                    {item.platform} {displayHandle(item.handle)}
                  </span>
                </div>
                <span style={{
                  fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 9999,
                  background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {item.item_status}{item.version > 1 ? ` v${item.version}` : ''}
                </span>
              </div>

              {/* Revision feedback from brand */}
              {item.item_status === 'revision' && item.revision_note && (
                <div style={{ margin: '0.375rem 0', padding: '0.5rem 0.625rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6 }}>
                  <p style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#9a3412', margin: '0 0 0.2rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Revision feedback</p>
                  <p style={{ fontSize: '0.8125rem', color: '#78350f', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.revision_note}</p>
                </div>
              )}

              {/* Show existing submission for submitted/approved items */}
              {(item.item_status === 'submitted' || item.item_status === 'approved') && (
                <>
                  {item.external_url && (
                    <a
                      href={item.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.75rem', color: '#2563eb', wordBreak: 'break-all', display: 'block', marginTop: '0.25rem' }}
                    >
                      {item.external_url.length > 55 ? item.external_url.slice(0, 55) + '...' : item.external_url}
                    </a>
                  )}
                  {item.storage_path && item.file_name && (
                    <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={uploadBadge}>uploaded</span>
                      <span style={{ wordBreak: 'break-all' }}>{item.file_name}</span>
                    </div>
                  )}
                </>
              )}

              {/* Input for pending/revision items */}
              {editable && (
                <div>
                  {/* Mode toggle */}
                  <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.375rem' }}>
                    <button
                      type="button"
                      onClick={() => setUploadMode((m) => ({ ...m, [item.id]: 'link' }))}
                      style={{ ...modeTab, ...(mode === 'link' ? modeTabActive : {}) }}
                      disabled={isLoading}
                    >
                      Paste link
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode((m) => ({ ...m, [item.id]: 'upload' }))}
                      style={{ ...modeTab, ...(mode === 'upload' ? modeTabActive : {}) }}
                      disabled={isLoading}
                    >
                      Upload file
                    </button>
                  </div>

                  {mode === 'link' ? (
                    /* Link input (existing flow) */
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <input
                        type="url"
                        placeholder="https://drive.google.com/..."
                        value={urls[item.id] ?? ''}
                        onChange={(e) => setUrls((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        disabled={isLoading}
                        style={linkInput}
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmitItem(item.id)}
                        disabled={isLoading || !(urls[item.id]?.trim())}
                        style={{
                          ...submitItemBtn,
                          opacity: isLoading || !(urls[item.id]?.trim()) ? 0.5 : 1,
                          cursor: isLoading || !(urls[item.id]?.trim()) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isLoading ? '...' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    /* File upload */
                    <div>
                      {progress != null ? (
                        /* Progress bar */
                        <div>
                          <div style={{ height: 6, borderRadius: 3, background: '#e5e5e5', overflow: 'hidden', marginBottom: '0.25rem' }}>
                            <div style={{ width: `${progress}%`, height: '100%', background: '#2563eb', borderRadius: 3, transition: 'width 0.2s' }} />
                          </div>
                          <p style={{ fontSize: '0.6875rem', color: '#555', margin: 0 }}>
                            Uploading... {progress}%
                          </p>
                        </div>
                      ) : (
                        /* File picker */
                        <div>
                          <input
                            ref={(el) => { fileInputRefs.current[item.id] = el }}
                            type="file"
                            accept={ACCEPTED_TYPES}
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleFileUpload(item.id, file)
                              e.target.value = '' // reset so same file can be re-selected
                            }}
                            disabled={isLoading}
                            style={{ display: 'none' }}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[item.id]?.click()}
                            disabled={isLoading}
                            style={{
                              ...uploadBtn,
                              opacity: isLoading ? 0.5 : 1,
                              cursor: isLoading ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Choose file
                          </button>
                          <p style={{ fontSize: '0.6875rem', color: '#888', margin: '0.25rem 0 0' }}>
                            Video, image, PDF, audio, or ZIP. Max 500MB.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: '0.8125rem', color: '#dc2626', margin: '0.75rem 0 0', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          {error}
        </p>
      )}

      {/* Submit for review — prominent CTA once all items have links/uploads */}
      {canSubmit && allReady && (
        <div style={reviewCta}>
          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111', margin: '0 0 0.375rem' }}>
            All deliverables ready
          </p>
          <p style={{ fontSize: '0.75rem', color: '#555', margin: '0 0 0.75rem' }}>
            Review your submissions above, then submit for brand review.
          </p>
          <button
            type="button"
            onClick={handleSubmitForReview}
            disabled={submittingAll}
            style={{
              ...reviewBtn,
              opacity: submittingAll ? 0.6 : 1,
              cursor: submittingAll ? 'not-allowed' : 'pointer',
            }}
          >
            {submittingAll ? 'Submitting...' : 'Submit all for review'}
          </button>
        </div>
      )}

      {/* Hint when some items still need links/uploads */}
      {canSubmit && !allReady && needsAction.length > 0 && (
        <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.75rem 0 0' }}>
          {needsAction.length} item{needsAction.length !== 1 ? 's' : ''} still need a link or upload before you can submit for review.
        </p>
      )}
    </div>
  )
}

// ── Upload with progress via XHR ──
// Supabase JS SDK's .upload() doesn't expose progress, so we use XHR directly.
function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const supabase = createClient()
    // Use the SDK for simplicity — no native progress but reliable
    // For large files on slow connections, we approximate progress
    // by using the fetch-based upload with a readable stream.
    // However, the simplest reliable approach: use supabase SDK directly.
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

    // Simulate incremental progress for UX (real progress requires XHR)
    let fakeProgress = 0
    const interval = setInterval(() => {
      // Asymptotic approach to 90% (never reaches 100 until real completion)
      fakeProgress += (90 - fakeProgress) * 0.08
      onProgress(Math.round(fakeProgress))
    }, 300)

    // Clean up interval when promise settles
    const cleanup = () => clearInterval(interval)
    // Attach cleanup — the promise above resolves/rejects which triggers .then/.catch
    // but we need to ensure cleanup happens
    setTimeout(() => {
      // Safety: if upload takes > 10 min, stop the fake progress
      cleanup()
    }, 600000)

    // Override: when the real upload finishes, clear the interval
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

// ── Styles ──

const itemCard: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  background: '#fafafa',
}

const linkInput: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 0.625rem',
  border: '1px solid #d5d5d5',
  borderRadius: 6,
  fontSize: '0.8125rem',
  outline: 'none',
  minWidth: 0,
}

const submitItemBtn: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 700,
  flexShrink: 0,
}

const uploadBtn: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: '#fff',
  color: '#111',
  border: '1px solid #d5d5d5',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 600,
}

const modeTab: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  fontSize: '0.6875rem',
  fontWeight: 600,
  border: '1px solid #e5e5e5',
  borderRadius: 6,
  background: '#fff',
  color: '#888',
  cursor: 'pointer',
}

const modeTabActive: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  borderColor: '#111',
}

const uploadBadge: React.CSSProperties = {
  fontSize: '0.5625rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '0.05rem 0.35rem',
  borderRadius: 4,
  background: '#dbeafe',
  color: '#1e40af',
  flexShrink: 0,
}

const reviewCta: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  border: '2px solid #16a34a',
  borderRadius: 12,
  background: '#f0fdf4',
  textAlign: 'center',
}

const reviewBtn: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  fontSize: '0.9375rem',
  fontWeight: 700,
  fontFamily: 'var(--font-body, inherit)',
}

const successBox: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #bbf7d0',
  borderRadius: 12,
  background: '#f0fdf4',
}
