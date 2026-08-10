'use client'

import { useState, useTransition } from 'react'
import { submitCreatorReview } from './actions'

interface Props {
  dealId: string
  brandName: string
  existingRating?: number | null
  existingNote?: string | null
}

export default function CreatorReviewCard({ dealId, brandName, existingRating, existingNote }: Props) {
  const [rating, setRating] = useState(existingRating ?? 0)
  const [note, setNote] = useState(existingNote ?? '')
  const [submitted, setSubmitted] = useState(!!existingRating)
  const [saving, startSave] = useTransition()
  const [hoveredStar, setHoveredStar] = useState(0)

  const initials = brandName.slice(0, 1).toUpperCase()

  const handleSubmit = () => {
    if (rating === 0) return
    startSave(async () => {
      const result = await submitCreatorReview(dealId, rating, note || null)
      if (result?.success) setSubmitted(true)
    })
  }

  if (submitted) {
    return (
      <div className="surface" style={{ padding: 'clamp(22px,2.6vw,30px) clamp(24px,3vw,34px)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,var(--sec),var(--sec-mid))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink)', flexShrink: 0 }}>{initials}</span>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, margin: '12px 0 0', color: 'var(--ink)', textAlign: 'center' }}>Thanks for your feedback!</h3>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} style={{ fontSize: 32, lineHeight: 1, color: n <= rating ? 'var(--neon-deep)' : 'rgba(120,130,150,.28)' }}>&#9733;</span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 14, fontFamily: 'var(--font-ui)' }}>
            Your rating is private and not shared directly with the brand.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="surface" style={{ padding: 'clamp(22px,2.6vw,30px) clamp(24px,3vw,34px)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,var(--sec),var(--sec-mid))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink)', flexShrink: 0 }}>{initials}</span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, margin: '12px 0 0', color: 'var(--ink)', textAlign: 'center' }}>
          How was working with <span className="t-accent">{brandName}</span>?
        </h3>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <span
              key={n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoveredStar(n)}
              onMouseLeave={() => setHoveredStar(0)}
              style={{ fontSize: 32, lineHeight: 1, cursor: 'pointer', color: n <= (hoveredStar || rating) ? 'var(--neon-deep)' : 'rgba(120,130,150,.28)', transition: 'color .12s ease' }}
            >
              &#9733;
            </span>
          ))}
        </div>
        <textarea
          placeholder="Add a note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 16, padding: '14px 16px', borderRadius: 14, border: '1px solid var(--border-hairline, #EAEAE3)', background: 'var(--card)', fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)', resize: 'vertical', minHeight: 64 }}
        />
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 10, fontFamily: 'var(--font-ui)' }}>
          This is not shared directly with the brand.
        </p>
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || saving}
          style={{ marginTop: 10, width: '100%', height: 48, borderRadius: 'var(--radius-pill, 999px)', background: rating === 0 ? 'var(--ink-faint)' : 'var(--ink)', color: '#fff', border: 'none', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13.5, cursor: rating === 0 ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, transition: 'background .16s ease, opacity .16s ease' }}
        >
          {saving ? 'Submitting...' : 'Submit review'}
        </button>
      </div>
    </div>
  )
}
