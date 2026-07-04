'use client'

import { useState } from 'react'
import { editBrand } from '../../../actions'
import { useRouter } from 'next/navigation'

interface Brand {
  id: string
  name: string
  category: string | null
  company_size: string | null
  website: string | null
  contact_name: string | null
  contact_email: string | null
  social_accounts: Record<string, string> | null
  platform_fee_percent: number
  fee_mode: string
}

export default function EditBrandForm({ brand }: { brand: Brand }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(brand.name)
  const [category, setCategory] = useState(brand.category ?? '')
  const [companySize, setCompanySize] = useState(brand.company_size ?? '')
  const [website, setWebsite] = useState(brand.website ?? '')
  const [contactName, setContactName] = useState(brand.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(brand.contact_email ?? '')
  const [socialJson, setSocialJson] = useState(
    brand.social_accounts && Object.keys(brand.social_accounts).length > 0
      ? JSON.stringify(brand.social_accounts, null, 2)
      : ''
  )
  const [feePercent, setFeePercent] = useState(String(brand.platform_fee_percent ?? 15))
  const [feeMode, setFeeMode] = useState(brand.fee_mode ?? 'on_top')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    let social: Record<string, string> = {}
    if (socialJson.trim()) {
      try {
        social = JSON.parse(socialJson)
      } catch {
        setError('Social accounts must be valid JSON')
        setLoading(false)
        return
      }
    }

    const res = await editBrand({
      id: brand.id,
      name,
      category: category || undefined,
      company_size: companySize || undefined,
      website: website || undefined,
      contact_name: contactName || undefined,
      contact_email: contactEmail || undefined,
      social_accounts: Object.keys(social).length > 0 ? social : undefined,
      platform_fee_percent: parseFloat(feePercent) || 0,
      fee_mode: feeMode as 'on_top' | 'deducted',
    })

    setLoading(false)

    if (res.error) {
      setError(res.error)
    } else {
      router.push('/ops/brands')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && <div style={{ color: '#dc2626', fontSize: '0.8125rem', padding: '0.5rem', background: '#fef2f2', borderRadius: 4 }}>{error}</div>}

      <Field label="Brand name *">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>

      <Field label="Category" hint="e.g. Fintech, D2C, BFSI">
        <input style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)} />
      </Field>

      <Field label="Company size" hint="e.g. 1-10, 11-50, 51-200">
        <input style={inputStyle} value={companySize} onChange={(e) => setCompanySize(e.target.value)} />
      </Field>

      <Field label="Website">
        <input style={inputStyle} type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
      </Field>

      <Field label="Contact name">
        <input style={inputStyle} value={contactName} onChange={(e) => setContactName(e.target.value)} />
      </Field>

      <Field label="Contact email">
        <input style={inputStyle} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="brand@example.com" />
      </Field>

      <Field label="Social accounts (JSON)" hint='e.g. {"instagram": "@groww", "linkedin": "groww-india"}'>
        <textarea
          style={{ ...inputStyle, minHeight: 80, fontFamily: 'monospace', fontSize: '0.8125rem' }}
          value={socialJson}
          onChange={(e) => setSocialJson(e.target.value)}
          placeholder='{"instagram": "@handle"}'
        />
      </Field>

      {/* Platform Fee */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Platform fee</legend>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Field label="Fee %" hint="Applied to deal base price">
            <input style={{ ...inputStyle, width: 100 }} type="number" min="0" max="100" step="0.1" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} />
          </Field>
          <Field label="Fee mode">
            <select style={{ ...inputStyle, width: 160 }} value={feeMode} onChange={(e) => setFeeMode(e.target.value)}>
              <option value="on_top">On top (brand pays more)</option>
              <option value="deducted">Deducted (from creator)</option>
            </select>
          </Field>
        </div>
        <p style={{ fontSize: '0.7rem', color: '#888', margin: '0.5rem 0 0' }}>
          {feeMode === 'on_top'
            ? 'Brand pays base + fee. Creator receives full base.'
            : 'Brand pays base. Creator receives base − fee.'}
        </p>
      </fieldset>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.625rem 1.25rem',
            background: loading ? '#999' : '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Saving...' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/ops/brands')}
          style={{
            padding: '0.625rem 1.25rem',
            background: '#fff',
            color: '#555',
            border: '1px solid #d5d5d5',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{label}</span>
      {hint && <span style={{ fontSize: '0.7rem', color: '#888' }}>{hint}</span>}
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.625rem',
  border: '1px solid #d5d5d5',
  borderRadius: 4,
  fontSize: '0.875rem',
  outline: 'none',
}
const fieldsetStyle: React.CSSProperties = { border: '1px solid #e5e5e5', borderRadius: 6, padding: '1rem', margin: 0 }
const legendStyle: React.CSSProperties = { fontSize: '0.8125rem', fontWeight: 600, padding: '0 0.25rem' }
