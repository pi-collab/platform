'use client'

import { useState } from 'react'
import { bulkSendCampaignDrafts } from './draft-actions'
import type { DraftPlacement } from './draft-actions'
import { useRouter } from 'next/navigation'

interface SelectedDraft {
  id: string
  creator: { full_name: string; niches?: string[] | null }
  placements: DraftPlacement[]
  total_brand_paise: number
}

interface SendResult {
  creatorName: string
  success: boolean
  dealId?: string
  error?: string
}

function formatINR(paise: number): string {
  const rupees = Math.round(paise / 100)
  const s = String(rupees)
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function placementLabel(placements: DraftPlacement[]): string {
  if (placements.length === 0) return 'No placements'
  const counts = new Map<string, number>()
  for (const p of placements) counts.set(p.label, (counts.get(p.label) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([k, n]) => (n > 1 ? `${n} ${k}s` : `${n} ${k}`))
    .join(', ')
    .toUpperCase()
}

export default function SendProposalsModal({
  campaignId,
  drafts,
  briefPitch,
  briefGuidelines,
  onClose,
}: {
  campaignId: string
  drafts: SelectedDraft[]
  briefPitch: string | null
  briefGuidelines: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<SendResult[] | null>(null)
  const hasBrief = Boolean(briefPitch || briefGuidelines)
  const [includeBrief, setIncludeBrief] = useState(hasBrief)

  const totalBrandPaise = drafts.reduce((s, d) => s + d.total_brand_paise, 0)

  async function handleSend() {
    setSending(true)

    let fullMessage = message.trim()
    if (includeBrief && hasBrief) {
      const briefParts: string[] = []
      if (briefPitch) briefParts.push(`Pitch:\n${briefPitch}`)
      if (briefGuidelines) briefParts.push(`Creative Guidelines:\n${briefGuidelines}`)
      const briefText = briefParts.join('\n\n')
      fullMessage = fullMessage
        ? `${fullMessage}\n\n---\n\n${briefText}`
        : briefText
    }

    const res = await bulkSendCampaignDrafts(
      campaignId,
      drafts.map((d) => d.id),
      fullMessage || undefined,
    )
    setResults(res.results)
    setSending(false)
  }

  const successCount = results?.filter((r) => r.success).length ?? 0
  const failCount = results ? results.length - successCount : 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(22,23,15,.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose() }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: 24, padding: '32px 32px 26px',
        width: '92%', maxWidth: 540, maxHeight: '82vh', overflowY: 'auto',
        boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 10px 20px rgba(22,23,15,.045), 0 40px 80px rgba(22,23,15,.06)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', margin: 0 }}>
            {results ? 'Send Results' : 'Send Proposals'}
          </h2>
          {!sending && (
            <button
              onClick={onClose}
              style={{ width: 34, height: 34, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Pre-send view */}
        {!results && (
          <>
            {/* Recipient list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {drafts.map((d, i) => {
                const niche = d.creator.niches?.length ? d.creator.niches[0] : null
                return (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 0',
                    borderBottom: i < drafts.length - 1 ? '1px solid var(--hairline)' : 'none',
                  }}>
                    {/* Avatar */}
                    <span style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14,
                      color: 'var(--ink-soft)', background: '#F0EDF5',
                    }}>
                      {getInitials(d.creator.full_name)}
                    </span>

                    {/* Name + placements */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>
                        {d.creator.full_name}{niche && <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}> ({niche})</span>}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 10.5,
                        letterSpacing: '.08em', textTransform: 'uppercase',
                        color: 'var(--ink-faint)', marginTop: 3,
                      }}>
                        {placementLabel(d.placements)}
                      </div>
                    </div>

                    {/* Price */}
                    <span className="t-data" style={{ fontSize: 20, flexShrink: 0 }}>
                      {formatINR(d.total_brand_paise)}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Message */}
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--hairline)' }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--ink-faint)', marginBottom: 10,
              }}>
                Message
              </div>
              <textarea
                className="ffield"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a note for these creators..."
                rows={4}
                disabled={sending}
              />
            </div>

            {/* Include brief toggle */}
            <label style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 16,
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--ink)', cursor: 'pointer',
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: includeBrief ? 'var(--neon)' : '#FFFFFF',
                  border: `1.5px solid ${includeBrief ? 'var(--neon-deep)' : 'var(--ink-faint)'}`,
                  transition: 'background .15s, border-color .15s',
                }}>
                  {includeBrief && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  )}
                </span>
                <input type="checkbox" checked={includeBrief} onChange={(e) => setIncludeBrief(e.target.checked)} disabled={sending} style={{ display: 'none' }} />
                Include campaign brief in message
              </label>

            {/* Summary */}
            <div style={{
              marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--hairline)',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11,
              letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-soft)',
            }}>
              Sending {drafts.length} proposal{drafts.length !== 1 ? 's' : ''} · Total{' '}
              <span className="t-data" style={{ fontSize: 16, textTransform: 'none', letterSpacing: '-0.045em' }}>{formatINR(totalBrandPaise)}</span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button
                className="pill"
                onClick={onClose}
                disabled={sending}
                style={{
                  display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 22px',
                  borderRadius: 12, background: '#FFFFFF', border: '1px solid var(--hairline)',
                  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                className="neonbtn"
                onClick={handleSend}
                disabled={sending}
                style={{
                  display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 24px',
                  borderRadius: 12, background: 'var(--neon)', border: 'none',
                  boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)',
                  cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.5 : 1,
                }}
              >
                {sending ? 'Sending...' : `Send ${drafts.length} proposal${drafts.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}

        {/* Results view */}
        {results && (
          <>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: '0 0 16px' }}>
              {successCount} sent{failCount > 0 ? `, ${failCount} failed` : ''}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                  borderBottom: i < results.length - 1 ? '1px solid var(--hairline)' : 'none',
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: r.success ? 'var(--lime-50)' : '#FEE2E2',
                  }}>
                    {r.success ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--lime-700)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    )}
                  </span>
                  <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{r.creatorName}</span>
                  {!r.success && r.error && (
                    <span style={{ fontSize: 11, color: '#dc2626' }}>{r.error}</span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
              <button
                className="neonbtn"
                onClick={() => { onClose(); router.refresh() }}
                style={{
                  display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 24px',
                  borderRadius: 12, background: 'var(--neon)', border: 'none',
                  boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)', cursor: 'pointer',
                }}
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
