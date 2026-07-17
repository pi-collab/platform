'use client'

import { useState } from 'react'
import { updateCampaignBrief } from './draft-actions'

export default function CampaignBrief({
  campaignId,
  initialPitch,
  initialGuidelines,
}: {
  campaignId: string
  initialPitch: string | null
  initialGuidelines: string | null
}) {
  const [pitch, setPitch] = useState(initialPitch ?? '')
  const [guidelines, setGuidelines] = useState(initialGuidelines ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    const result = await updateCampaignBrief(campaignId, pitch, guidelines)
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const hasChanges = pitch !== (initialPitch ?? '') || guidelines !== (initialGuidelines ?? '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Pitch */}
      <div>
        <label style={labelStyle}>Pitch</label>
        <p style={subtitleStyle}>What&apos;s the campaign about? Why should a creator care?</p>
        <textarea
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="Describe the campaign — what it is, who it's for, and why creators should be excited to participate..."
          rows={6}
          style={textareaStyle}
        />
      </div>

      {/* Creative Guidelines */}
      <div>
        <label style={labelStyle}>Creative Guidelines</label>
        <p style={subtitleStyle}>References, voice, do&apos;s and don&apos;ts — the playbook for creators making the content.</p>
        <textarea
          value={guidelines}
          onChange={(e) => setGuidelines(e.target.value)}
          placeholder="Include tone of voice, key messages, visual references, things to avoid, hashtags, mentions..."
          rows={8}
          style={textareaStyle}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{
            padding: '0.5rem 1.25rem',
            background: hasChanges ? '#111' : '#e5e5e5',
            color: hasChanges ? '#fff' : '#999',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: hasChanges ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving...' : 'Save brief'}
        </button>
        {saved && <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>Saved</span>}
        {error && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{error}</span>}
      </div>

      {/* Preview hint */}
      {!pitch && !guidelines && (
        <p style={{ fontSize: '0.75rem', color: '#aaa', margin: 0 }}>
          Once saved, creators in this campaign will see the brief on their deal page.
        </p>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  marginBottom: '0.15rem',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#888',
  margin: '0 0 0.5rem',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  fontSize: '0.875rem',
  lineHeight: 1.5,
  color: '#111',
  background: '#fff',
  resize: 'vertical',
  fontFamily: 'inherit',
  outline: 'none',
}
