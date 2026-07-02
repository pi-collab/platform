'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveOnboarding } from './actions'
import { PRODUCT_TYPES_BY_PLATFORM } from '@/lib/product-types'

const PLATFORMS = ['Instagram', 'YouTube', 'X', 'LinkedIn']

export default function CreatorOnboardingPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [platform, setPlatform] = useState('')
  const [handle, setHandle] = useState('')
  const [productType, setProductType] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = fullName.trim() && platform && handle.trim() && !loading

  // Get available product types for the selected platform
  const platformKey = platform.toLowerCase()
  const availableTypes = PRODUCT_TYPES_BY_PLATFORM[platformKey] ?? PRODUCT_TYPES_BY_PLATFORM['other'] ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setError(null)
    setLoading(true)

    const pricePaise = productPrice ? Math.round(parseFloat(productPrice) * 100) : undefined

    const result = await saveOnboarding({
      fullName: fullName.trim(),
      platform,
      handle: handle.trim(),
      productType: productType || undefined,
      productPricePaise: pricePaise && pricePaise > 0 ? pricePaise : undefined,
    })

    setLoading(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    router.push(result.redirect)
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Set up your profile</h1>
        <p style={styles.sub}>
          Tell us the basics so brands can find and offer you deals.
        </p>

        {error && <p style={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Name */}
          <div>
            <label style={styles.label}>Full name *</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Primary platform */}
          <div>
            <label style={styles.label}>Primary platform *</label>
            <div style={styles.platformRow}>
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setPlatform(p); setProductType('') }}
                  style={{
                    ...styles.platformBtn,
                    background: platform === p ? '#111' : '#fff',
                    color: platform === p ? '#fff' : '#111',
                    borderColor: platform === p ? '#111' : '#e5e5e5',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Handle */}
          <div>
            <label style={styles.label}>Handle *</label>
            <input
              style={styles.input}
              type="text"
              placeholder="@yourhandle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Divider */}
          <div style={styles.dividerLine} />

          {/* Optional: first product */}
          <p style={styles.optionalLabel}>
            Add your first product (optional — you can add more later)
          </p>

          {platform ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 2 }}>
                <label style={styles.label}>Product type</label>
                <select
                  style={styles.input}
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  disabled={loading}
                >
                  <option value="">Select...</option>
                  {availableTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Price (INR)</label>
                <input
                  style={styles.input}
                  type="number"
                  placeholder="50000"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  disabled={loading}
                  min="0"
                />
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: '#bbb', margin: 0 }}>
              Select a platform above to see product types.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...styles.btn,
              opacity: canSubmit ? 1 : 0.5,
              marginTop: '0.5rem',
            }}
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#fafafa',
    padding: '1rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '2.5rem 2rem',
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 16,
    width: '100%',
    maxWidth: 440,
  },
  heading: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#111',
    margin: 0,
  },
  sub: {
    fontSize: '0.875rem',
    color: '#888',
    margin: 0,
  },
  error: {
    fontSize: '0.875rem',
    color: '#854d0e',
    background: '#fef9c3',
    padding: '0.625rem 1rem',
    borderRadius: 8,
    margin: 0,
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  label: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#555',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  input: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    fontSize: '0.9375rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  platformRow: {
    display: 'flex',
    gap: '0.375rem',
    flexWrap: 'wrap',
  },
  platformBtn: {
    padding: '0.375rem 0.75rem',
    border: '1px solid #e5e5e5',
    borderRadius: 9999,
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    background: '#fff',
  },
  dividerLine: {
    height: 1,
    background: '#e5e5e5',
    margin: '0.25rem 0',
  },
  optionalLabel: {
    fontSize: '0.8125rem',
    color: '#888',
    margin: 0,
  },
  btn: {
    padding: '0.625rem 1rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
}
