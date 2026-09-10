'use client'

/**
 * The New Campaign form, in one place.
 *
 * Two screens create a campaign: the campaigns page, in an inline panel, and
 * browse, in a dialog over a selection of creators. They were about to be two
 * copies of the same three fields, which is how a field added on one screen
 * goes missing on the other.
 *
 * The CONTAINER stays with each caller - a panel is not a dialog - and only the
 * fields and their actions live here.
 */
export interface CampaignDraft {
  name: string
  description: string
  budget: string
}

export const EMPTY_CAMPAIGN_DRAFT: CampaignDraft = { name: '', description: '', budget: '' }

/**
 * Rupees as typed to integer paise, or an error.
 *
 * Shared for the same reason the fields are: the two screens would otherwise
 * each decide what "1,50,000" means.
 */
export function parseBudget(raw: string): { paise?: number; error?: string } {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const paise = Math.round(parseFloat(trimmed.replace(/[,\s₹]/g, '')) * 100)
  if (!Number.isFinite(paise) || paise < 0) return { error: 'Budget must be a positive number.' }
  return { paise }
}

export default function NewCampaignFields({
  draft, onChange, error, busy, submitLabel = 'Create', onSubmit, onCancel, autoFocus = true,
}: {
  draft: CampaignDraft
  onChange: (next: CampaignDraft) => void
  error?: string | null
  busy?: boolean
  submitLabel?: string
  onSubmit: () => void
  onCancel: () => void
  autoFocus?: boolean
}) {
  const set = (patch: Partial<CampaignDraft>) => onChange({ ...draft, ...patch })

  return (
    <>
      {error && (
        <div role="alert" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#C2402A', marginTop: 12 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
        <div>
          <div className="t-meta" style={{ marginBottom: 7 }}>Campaign name</div>
          <input
            className="ffield"
            type="text"
            placeholder="e.g. Winter capsule"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            autoFocus={autoFocus}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.name.trim() && !busy) onSubmit() }}
          />
        </div>
        <div>
          <div className="t-meta" style={{ marginBottom: 7 }}>Description / brief (optional)</div>
          <textarea
            className="ffield"
            rows={3}
            placeholder="What is this campaign about?"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            style={{ height: 'auto', padding: '11px 14px', lineHeight: 1.55, resize: 'vertical' }}
          />
        </div>
        <div style={{ maxWidth: 260 }}>
          <div className="t-meta" style={{ marginBottom: 7 }}>Budget in &#8377; (optional)</div>
          <input
            className="ffield"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 150000"
            value={draft.budget}
            onChange={(e) => set({ budget: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.name.trim() && !busy) onSubmit() }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <button
          className="neonbtn"
          onClick={onSubmit}
          disabled={busy || !draft.name.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 20px',
            borderRadius: 11, background: 'var(--neon)', border: 'none',
            boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, color: 'var(--ink)',
            cursor: busy || !draft.name.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !draft.name.trim() ? 0.5 : 1,
          }}
        >
          {busy ? 'Creating...' : submitLabel}
        </button>
        <button
          className="pill"
          onClick={onCancel}
          style={{
            display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 20px',
            borderRadius: 11, background: 'var(--card)',
            border: '1px solid var(--hairline)',
            fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </>
  )
}
