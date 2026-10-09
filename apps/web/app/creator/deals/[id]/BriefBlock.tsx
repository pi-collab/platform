'use client'

import BriefDetailsToggle from '@/app/deals/[id]/BriefDetailsToggle'

/**
 * The brief a creator reads: the brief, what is attached, then creative
 * guidelines and what to avoid behind a toggle. Lifted out of the creator deal
 * page (0546) so a campaign deal and an Experience leg render the SAME brief
 * the same way; only the data source differs.
 *
 * Pure display. Attachment links are signed by the page with a short expiry,
 * after the page has established the deal is this creator's own.
 */
export interface BriefBlockAttachment { name: string; storage_path: string; size_bytes: number | null }

const metaLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)',
}

export default function BriefBlock({ pitch, guidelines, avoid, attachments, attachmentUrls, defaultOpen, middle = null, attachedLabel = 'What they\u2019ve attached' }: {
  pitch: string | null
  guidelines: string | null
  avoid: string | null
  attachments: BriefBlockAttachment[]
  attachmentUrls: Record<string, string>
  defaultOpen: boolean
  /** Rendered between the attachments and the guidelines (the campaign page puts the product kit here). */
  middle?: React.ReactNode
  attachedLabel?: string
}) {
  const briefAttachments = attachments
  const guidelinePoints: string[] = guidelines ? guidelines.split('\n').filter(Boolean) : []
  const avoidPoints: string[] = avoid ? avoid.split('\n').filter(Boolean) : []
  const glParts: string[] = []
  if (guidelinePoints.length > 0) glParts.push(`${guidelinePoints.length} guideline${guidelinePoints.length !== 1 ? 's' : ''}`)
  if (avoidPoints.length > 0) glParts.push(`${avoidPoints.length} to avoid`)
  return (
    <div className="brief-block">
      {/* The brief */}
      {pitch && (
        <div data-brief-row style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
          <div style={metaLabel}>The brief</div>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0, maxWidth: 620, whiteSpace: 'pre-wrap' }}>{pitch}</p>
        </div>
      )}

      {/* Attachments */}
      {briefAttachments.length > 0 && (
        <div data-brief-row style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
          <div style={metaLabel}>{attachedLabel}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {briefAttachments.map((att) => {
              const signedUrl = attachmentUrls[att.storage_path]
              const ext = att.name.split('.').pop()?.toUpperCase() || 'FILE'
              const sizeMB = ((att.size_bytes ?? 0) / (1024 * 1024)).toFixed(1)
              return (
                <a key={att.storage_path} href={signedUrl || '#'} target="_blank" rel="noopener noreferrer" className="att-card" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--hairline)', boxShadow: '0 1px 2px rgba(22,23,15,.03)', cursor: 'pointer', textDecoration: 'none' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 10, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sec-2)', border: '1px solid var(--sec-mid-2, var(--hairline))', color: 'var(--sec-ink, var(--ink-soft))' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 2 }}>{ext} · {sizeMB} MB</span>
                  </span>
                  {/* Said out loud, the way a deliverable's file
                      says it. The whole card was the link, which
                      is only discoverable by trying it. */}
                  <span style={{ flex: 'none', fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>View</span>
                </a>
              )
            })}
          </div>
        </div>
      )}
      {middle}
      {/* Creative guidelines — toggle */}
      {(guidelinePoints.length > 0 || avoidPoints.length > 0) && (
        <BriefDetailsToggle label="Creative guidelines" subtitle={glParts.join(' · ')} defaultOpen={defaultOpen}>
          {guidelinePoints.length > 0 && (
            <div data-brief-row style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 28 }}>
              <div style={metaLabel}>Creative guidelines</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {guidelinePoints.map((point: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 7, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: 'var(--ink)', color: '#FFFFFF' }}>{i + 1}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {avoidPoints.length > 0 && (
            <div data-brief-row style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 30, paddingTop: 28, borderTop: guidelinePoints.length > 0 ? '1px solid var(--border-hairline)' : 'none' }}>
              <div style={metaLabel}>Please avoid</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {avoidPoints.map((point: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" style={{ flex: 'none', marginTop: 4 }}><path d="M18 6 6 18M6 6l12 12" /></svg>
                    <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </BriefDetailsToggle>
      )}
      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 640px) { .brief-block [data-brief-row] { grid-template-columns: 1fr !important; row-gap: 10px !important; } }' }} />
    </div>
  )
}
