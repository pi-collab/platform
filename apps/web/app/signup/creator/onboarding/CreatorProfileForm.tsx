'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FormError from '@/components/FormError'
import { saveOnboarding } from './actions'

/**
 * Where you post. Two options, per the design.
 *
 * Deliberately not a longer list: a creator picks their PRIMARY platform here
 * and adds the rest on the storefront afterwards. The stored value is the
 * lowercased key on creators.social_accounts, so these strings are data.
 */
const PLATFORMS = [
  {
    key: 'Instagram',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5.5" /><circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
  {
    key: 'YouTube',
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="4.5" /><path d="m10 9 5 3-5 3z" fill="currentColor" />
      </svg>
    ),
  },
]

/**
 * Creator signup step 2 — design "Creator Signup Profile - Paged Flow".
 *
 * The design's rate-card fields are gone: it now says storefront details come
 * later, which is the better trade. Asking a creator to price their work
 * before they have seen a single offer is the heaviest question in the flow
 * and the easiest place to abandon it.
 */
export default function CreatorProfileForm() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [handle, setHandle] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [terms, setTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)

    const res = await saveOnboarding({
      fullName: fullName.trim(),
      platform,
      handle: handle.trim().replace(/^@/, ''),
      termsAccepted: terms,
    })

    if (res.status === 'error') {
      setLoading(false)
      setError(res.message)
      return
    }
    // Stays loading — the page navigates away and unmounts this.
    router.push(res.redirect)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="onboard-form">
      {error && <FormError>{error}</FormError>}

      <div className="onboard-field">
        <label className="onboard-label">Full name</label>
        <div className="fld-box onboard-box">
          <input
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); setError('') }}
            placeholder="Jordan Reyes"
            aria-label="Full name"
            autoComplete="name"
            required
            className="onboard-input"
          />
        </div>
      </div>

      <div className="onboard-field">
        <label className="onboard-label">Handle</label>
        <div className="fld-box onboard-box">
          <span className="onboard-prefix">@</span>
          <input
            value={handle}
            onChange={(e) => { setHandle(e.target.value.replace(/^@/, '')); setError('') }}
            placeholder="jordanreyes"
            aria-label="Handle"
            required
            className="onboard-input"
          />
        </div>
      </div>

      <div className="onboard-field onboard-field--wide">
        {/* "Primary platform", not the design's "Where you post". This is
            single-select, and a creator on both Instagram and YouTube reads
            "where you post" as a question about all of them, tries to tick
            both, and finds they cannot. Single-select is still right: each
            platform carries its own handle, so a real multi-select means a
            handle field per platform — exactly the weight this step avoids.
            The rest go on the storefront. */}
        <label className="onboard-label">
          Primary platform
          <span className="onboard-label__optional">you can add others later</span>
        </label>
        {/* Buttons rather than a select: two options are faster to hit than to
            open, and the choice is visible without interacting. */}
        <div className="seg-row">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPlatform(p.key)}
              aria-pressed={platform === p.key}
              className="seg"
            >
              {p.icon}
              {p.key}
            </button>
          ))}
        </div>
      </div>

      <label className="onboard-terms">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          required
        />
        <span>
          I agree to the{' '}
          <Link href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
        </span>
      </label>

      <button type="submit" disabled={loading} className="onboard-cta cta">
        {loading ? 'Setting up…' : 'Complete setup'}
      </button>
      <p className="onboard-foot">You can set up your storefront and add more details later.</p>
    </form>
  )
}
