'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setDealFeeOverride } from '../../actions'

interface FeeOverrideFormProps {
  dealId: string
  dealStatus: string
  pricePaise: number
  feePercent: number
  feeMode: string
  feePctOverride: number | null
  brandFeePercent: number
}

function formatRupees(paise: number): string {
  return `\u20B9${(paise / 100).toLocaleString('en-IN')}`
}

export default function FeeOverrideForm({
  dealId, dealStatus, pricePaise, feePercent, feeMode, feePctOverride, brandFeePercent,
}: FeeOverrideFormProps) {
  const router = useRouter()
  const [newFee, setNewFee] = useState(feePctOverride != null ? String(feePctOverride) : '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isNegotiating = dealStatus === 'negotiating'

  // Preview calculations
  const previewPercent = newFee !== '' ? parseFloat(newFee) : null
  const effectivePercent = previewPercent ?? brandFeePercent
  const previewFeePaise = Math.round(pricePaise * effectivePercent / 100)
  const currentFeePaise = Math.round(pricePaise * feePercent / 100)

  const previewCreatorReceives = feeMode === 'deducted'
    ? pricePaise - previewFeePaise
    : pricePaise
  const currentCreatorReceives = feeMode === 'deducted'
    ? pricePaise - currentFeePaise
    : pricePaise
  const previewBrandPays = feeMode === 'on_top'
    ? pricePaise + previewFeePaise
    : pricePaise
  const currentBrandPays = feeMode === 'on_top'
    ? pricePaise + currentFeePaise
    : pricePaise

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const feeValue = newFee.trim() === '' ? null : parseFloat(newFee)
    if (feeValue != null && (isNaN(feeValue) || feeValue < 0 || feeValue > 100)) {
      setError('Fee must be between 0 and 100.')
      setSaving(false)
      return
    }

    const result = await setDealFeeOverride(dealId, feeValue, reason.trim())
    setSaving(false)

    if ('error' in result && result.error) {
      setError(result.error)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      setSuccess(false)
      router.refresh()
    }, 1500)
  }

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 8, padding: '1rem', background: '#fafafa' }}>
      <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#555', margin: '0 0 0.75rem' }}>
        Platform Fee Override
      </h3>

      {/* Current state */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
        <div>
          <span style={{ color: '#888', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>Brand standard rate</span>
          <p style={{ margin: '0.1rem 0 0', fontFamily: 'monospace' }}>{brandFeePercent}%</p>
        </div>
        <div>
          <span style={{ color: '#888', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>
            Effective rate on deal
          </span>
          <p style={{ margin: '0.1rem 0 0', fontFamily: 'monospace', fontWeight: 700 }}>
            {feePercent}%
            {feePctOverride != null && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.6875rem', color: '#b45309', background: '#fef3c7', padding: '0.1rem 0.4rem', borderRadius: 4 }}>
                overridden
              </span>
            )}
          </p>
        </div>
        <div>
          <span style={{ color: '#888', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>Gross (deal price)</span>
          <p style={{ margin: '0.1rem 0 0', fontFamily: 'monospace' }}>{formatRupees(pricePaise)}</p>
        </div>
        <div>
          <span style={{ color: '#888', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase' }}>Creator receives (current)</span>
          <p style={{ margin: '0.1rem 0 0', fontFamily: 'monospace', fontWeight: 700 }}>{formatRupees(currentCreatorReceives)}</p>
        </div>
      </div>

      {!isNegotiating ? (
        <p style={{ fontSize: '0.8125rem', color: '#991b1b', background: '#fee2e2', padding: '0.5rem 0.75rem', borderRadius: 6, margin: 0 }}>
          Fee is immutable — deal is &quot;{dealStatus}&quot;. Overrides can only be set while negotiating.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ flex: '0 0 120px' }}>
              <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: '#555', marginBottom: '0.25rem' }}>
                Override fee %
              </span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder={`${brandFeePercent} (default)`}
                value={newFee}
                onChange={(e) => setNewFee(e.target.value)}
                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: '#555', marginBottom: '0.25rem' }}>
                Reason (required)
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder="e.g. Creator brought this brand to platform"
                style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' }}
              />
            </label>
          </div>

          {/* Preview */}
          {newFee !== '' && previewPercent != null && !isNaN(previewPercent) && (
            <div style={{ fontSize: '0.8125rem', padding: '0.5rem 0.75rem', background: '#eff6ff', borderRadius: 6, marginBottom: '0.75rem' }}>
              <strong>Preview at {previewPercent}%:</strong>{' '}
              Brand pays {formatRupees(previewBrandPays)}, creator receives {formatRupees(previewCreatorReceives)}
              {currentCreatorReceives !== previewCreatorReceives && (
                <span style={{ color: previewCreatorReceives > currentCreatorReceives ? '#166534' : '#991b1b' }}>
                  {' '}({previewCreatorReceives > currentCreatorReceives ? '+' : ''}{formatRupees(previewCreatorReceives - currentCreatorReceives)})
                </span>
              )}
            </div>
          )}

          {error && (
            <p style={{ fontSize: '0.8125rem', color: '#991b1b', background: '#fee2e2', padding: '0.4rem 0.75rem', borderRadius: 6, marginBottom: '0.75rem' }}>
              {error}
            </p>
          )}

          {success && (
            <p style={{ fontSize: '0.8125rem', color: '#166534', background: '#dcfce7', padding: '0.4rem 0.75rem', borderRadius: 6, marginBottom: '0.75rem' }}>
              Fee override saved.
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !reason.trim()}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: 6,
              border: 'none',
              background: saving || !reason.trim() ? '#d1d5db' : '#111',
              color: '#fff',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: saving || !reason.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : newFee.trim() === '' ? 'Clear override (restore brand rate)' : 'Set override'}
          </button>
        </form>
      )}
    </div>
  )
}
