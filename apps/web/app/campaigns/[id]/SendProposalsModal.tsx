'use client'

import { useState } from 'react'
import { bulkSendCampaignDrafts } from './draft-actions'
import type { DraftPlacement } from './draft-actions'
import { useRouter } from 'next/navigation'

interface SelectedDraft {
  id: string
  creator: { full_name: string }
  placements: DraftPlacement[]
  total_brand_paise: number
}

interface SendResult {
  creatorName: string
  success: boolean
  dealId?: string
  error?: string
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

function placementSummary(placements: DraftPlacement[]): string {
  if (placements.length === 0) return 'No placements'
  const counts = new Map<string, number>()
  for (const p of placements) {
    const h = p.handle ?? ''
    const key = `${p.label} (${p.platform} ${h.startsWith('@') ? h : `@${h}`})`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([k, n]) => (n > 1 ? `${n}× ${k}` : k))
    .join(' + ')
}

export default function SendProposalsModal({
  campaignId,
  drafts,
  onClose,
}: {
  campaignId: string
  drafts: SelectedDraft[]
  onClose: () => void
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<SendResult[] | null>(null)

  const totalBrandPaise = drafts.reduce((s, d) => s + d.total_brand_paise, 0)

  async function handleSend() {
    setSending(true)
    setProgress(0)
    const res = await bulkSendCampaignDrafts(
      campaignId,
      drafts.map((d) => d.id),
      message.trim() || undefined,
    )
    setResults(res.results)
    setSending(false)
  }

  const successCount = results?.filter((r) => r.success).length ?? 0
  const failCount = results ? results.length - successCount : 0

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose() }}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
            {results ? 'Send Results' : 'Send Proposals'}
          </h3>
          {!sending && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#888', padding: 0 }}>×</button>
          )}
        </div>

        {/* Pre-send view */}
        {!results && (
          <>
            {/* Recipient list */}
            <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: '1rem', border: '1px solid #e5e5e5', borderRadius: 6 }}>
              {drafts.map((d) => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderBottom: '1px solid #f5f5f5', fontSize: '0.8125rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{d.creator.full_name}</span>
                    <p style={{ fontSize: '0.7rem', color: '#888', margin: '0.1rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {placementSummary(d.placements)}
                    </p>
                  </div>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--color-heading)', flexShrink: 0, marginLeft: '0.75rem' }}>
                    {formatRupees(d.total_brand_paise)}
                  </span>
                </div>
              ))}
            </div>

            {/* Shared message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message for all creators (optional)"
              rows={3}
              disabled={sending}
              style={{ ...inputStyle, marginBottom: '1rem', resize: 'vertical' }}
            />

            {/* Summary */}
            <p style={{ fontSize: '0.8125rem', color: '#888', margin: '0 0 1rem' }}>
              Sending <strong>{drafts.length}</strong> proposal{drafts.length !== 1 ? 's' : ''} · Total: <strong style={{ fontFamily: 'monospace' }}>{formatRupees(totalBrandPaise)}</strong>
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
              <button onClick={onClose} disabled={sending} style={cancelBtn}>Cancel</button>
              <button onClick={handleSend} disabled={sending} style={{ ...sendBtn, opacity: sending ? 0.5 : 1 }}>
                {sending ? `Sending...` : `Send ${drafts.length} proposal${drafts.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {/* Results view */}
        {results && (
          <>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-heading)', margin: '0 0 0.75rem' }}>
              {successCount} sent{failCount > 0 ? `, ${failCount} failed` : ''}
            </p>

            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: '1rem' }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0', borderBottom: '1px solid #f5f5f5', fontSize: '0.8125rem' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700, flexShrink: 0, background: r.success ? '#dcfce7' : '#fee2e2', color: r.success ? '#166534' : '#991b1b' }}>
                    {r.success ? '✓' : '✗'}
                  </span>
                  <span style={{ flex: 1, color: 'var(--color-heading)' }}>{r.creatorName}</span>
                  {!r.success && r.error && (
                    <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>{r.error}</span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { onClose(); router.refresh() }}
                style={sendBtn}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modal: React.CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  padding: '1.5rem',
  width: '100%',
  maxWidth: 480,
  maxHeight: '80vh',
  overflowY: 'auto',
  boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border, #d5d5d5)',
  borderRadius: 6,
  fontSize: '0.875rem',
  outline: 'none',
  boxSizing: 'border-box',
}

const cancelBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: 'transparent',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  cursor: 'pointer',
  color: 'var(--color-muted)',
}

const sendBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
}
