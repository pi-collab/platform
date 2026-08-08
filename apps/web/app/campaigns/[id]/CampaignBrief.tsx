'use client'

import { useState, useRef } from 'react'
import { updateCampaignBrief, uploadCampaignBriefAttachment } from './draft-actions'
import PointsInput from '@/app/deals/new/PointsInput'

interface Attachment {
  name: string
  storage_path: string
  size_bytes: number
  content_type: string
}

const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--ink-faint)', paddingTop: 3,
}

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}

export default function CampaignBrief({
  campaignId,
  initialPitch,
  initialGuidelines,
  initialAvoid,
  initialAttachments,
}: {
  campaignId: string
  initialPitch: string | null
  initialGuidelines: string | null
  initialAvoid: string | null
  initialAttachments: Attachment[]
}) {
  const [editing, setEditing] = useState(false)
  const [pitch, setPitch] = useState(initialPitch ?? '')
  const [guidelines, setGuidelines] = useState(initialGuidelines ?? '')
  const [avoid, setAvoid] = useState(initialAvoid ?? '')
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    const result = await updateCampaignBrief(campaignId, pitch, guidelines, avoid, attachments)
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadCampaignBriefAttachment(campaignId, fd)
    setUploading(false)
    if (res.attachment) {
      setAttachments((prev) => [...prev, res.attachment!])
    } else if (res.error) {
      setError(res.error)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((a) => a.storage_path !== path))
  }

  const hasContent = !!(initialPitch || initialGuidelines || initialAvoid || initialAttachments.length > 0)
  const hasChanges = pitch !== (initialPitch ?? '') || guidelines !== (initialGuidelines ?? '') || avoid !== (initialAvoid ?? '') || JSON.stringify(attachments) !== JSON.stringify(initialAttachments)

  const guidelinePoints = (initialGuidelines ?? '').split('\n').filter(Boolean)
  const avoidPoints = (initialAvoid ?? '').split('\n').filter(Boolean)

  // ── Read mode ──
  if (!editing && hasContent) {
    return (
      <div>
        {/* Pitch */}
        {initialPitch && (
          <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 8 }}>
            <div style={LABEL}>The brief</div>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-soft)', margin: 0, maxWidth: 620, whiteSpace: 'pre-wrap' }}>
              {initialPitch}
            </p>
          </div>
        )}

        {/* Attachments */}
        {initialAttachments.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
            <div style={LABEL}>Attachments</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {initialAttachments.map((att) => {
                const ext = att.name.split('.').pop()?.toUpperCase() || 'FILE'
                return (
                  <div key={att.storage_path} className="att-card" style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px',
                    borderRadius: 14, background: 'var(--card)', border: '1px solid var(--hairline)',
                    boxShadow: '0 1px 2px rgba(22,23,15,.03)',
                  }}>
                    <span style={{
                      width: 32, height: 32, borderRadius: 10, flex: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--sec-2)', border: '1px solid var(--sec-mid-2, var(--hairline))',
                      color: 'var(--sec-ink, var(--ink-soft))',
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 2 }}>{ext} · {formatSize(att.size_bytes)}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Creative guidelines */}
        {guidelinePoints.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 36, paddingTop: 34, borderTop: '1px solid var(--border-hairline)' }}>
            <div style={LABEL}>Creative guidelines</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {guidelinePoints.map((point, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 7, flex: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, background: 'var(--ink)', color: '#FFFFFF',
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{point}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Avoid */}
        {avoidPoints.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 30, paddingTop: 28, borderTop: '1px solid var(--border-hairline)' }}>
            <div style={LABEL}>Please avoid</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {avoidPoints.map((point, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" style={{ flex: 'none', marginTop: 4 }}><path d="M18 6 6 18M6 6l12 12" /></svg>
                  <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-soft)' }}>{point}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit button */}
        <div style={{ marginTop: 28, paddingTop: 22, borderTop: '1px solid var(--border-hairline)' }}>
          <button
            className="pill"
            onClick={() => setEditing(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px',
              borderRadius: 10, background: '#FFFFFF', border: '1px solid var(--hairline)',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            Edit brief
          </button>
          {saved && <span style={{ marginLeft: 12, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Saved</span>}
        </div>
      </div>
    )
  }

  // ── Edit mode / empty state ──
  return (
    <div>
      {/* Pitch */}
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 8 }}>
        <div>
          <div style={LABEL}>The brief</div>
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '6px 0 0', lineHeight: 1.45 }}>
            What&apos;s the campaign about? Why should a creator care?
          </p>
        </div>
        <textarea
          className="ffield"
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="Describe the campaign — what it is, who it's for, and why creators should be excited to participate..."
          rows={5}
        />
      </div>

      {/* Attachments */}
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border-hairline)' }}>
        <div>
          <div style={LABEL}>Attachments</div>
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '6px 0 0', lineHeight: 1.45 }}>
            Moodboards, references, brand assets.
          </p>
        </div>
        <div>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {attachments.map((att) => {
                const ext = att.name.split('.').pop()?.toUpperCase() || 'FILE'
                return (
                  <div key={att.storage_path} style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px',
                    borderRadius: 12, background: 'var(--card)', border: '1px solid var(--hairline)',
                  }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 8, flex: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--sec-2)', color: 'var(--ink-soft)',
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.1em' }}>{ext} · {formatSize(att.size_bytes)}</span>
                    </span>
                    <button
                      onClick={() => removeAttachment(att.storage_path)}
                      title="Remove"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 4, flexShrink: 0 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <input ref={fileRef} type="file" onChange={handleUpload} style={{ display: 'none' }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="pill"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px',
              borderRadius: 10, background: '#FFFFFF', border: '1px solid var(--hairline)',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--ink)',
              cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            {uploading ? 'Uploading...' : 'Upload file'}
          </button>
        </div>
      </div>

      {/* Creative Guidelines — points-based */}
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border-hairline)' }}>
        <div>
          <div style={LABEL}>Creative guidelines</div>
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '6px 0 0', lineHeight: 1.45 }}>
            Add one guideline at a time.
          </p>
        </div>
        <PointsInput
          value={guidelines}
          onChange={setGuidelines}
          placeholder="Add a guideline…"
        />
      </div>

      {/* Avoid — points-based */}
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: '0 32px', marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border-hairline)' }}>
        <div>
          <div style={LABEL}>What to avoid</div>
          <p style={{ fontSize: 11, color: 'var(--ink-faint)', margin: '6px 0 0', lineHeight: 1.45 }}>
            Things creators should not do.
          </p>
        </div>
        <PointsInput
          value={avoid}
          onChange={setAvoid}
          placeholder="Add something to avoid…"
        />
      </div>

      {/* Actions */}
      {error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 12 }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
        <button
          className="neonbtn"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{
            display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px',
            borderRadius: 11, background: 'var(--neon)', border: 'none',
            boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)',
            cursor: hasChanges ? 'pointer' : 'not-allowed',
            opacity: hasChanges ? 1 : 0.5,
          }}
        >
          {saving ? 'Saving...' : 'Save brief'}
        </button>
        {hasContent && (
          <button
            className="pill"
            onClick={() => { setEditing(false); setPitch(initialPitch ?? ''); setGuidelines(initialGuidelines ?? ''); setAvoid(initialAvoid ?? ''); setAttachments(initialAttachments) }}
            style={{
              display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 18px',
              borderRadius: 11, background: 'var(--card)',
              border: '1px solid var(--hairline)',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
        {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Saved</span>}
      </div>

      {/* Hint for empty state */}
      {!hasContent && !pitch && !guidelines && !avoid && attachments.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '16px 0 0' }}>
          Once saved, creators in this campaign will see the brief on their deal page.
        </p>
      )}
    </div>
  )
}
