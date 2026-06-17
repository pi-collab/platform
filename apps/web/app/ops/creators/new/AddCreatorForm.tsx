'use client'

import { useState } from 'react'
import { addCreator } from '../../actions'
import { useRouter } from 'next/navigation'
import { NICHES } from '@/lib/niches'

interface SocialEntry {
  platform: string
  handle: string
  url: string
  follower_count: string
}

const PLATFORMS = ['instagram', 'youtube', 'twitter', 'linkedin', 'other'] as const

function emptySocial(): SocialEntry {
  return { platform: 'instagram', handle: '', url: '', follower_count: '' }
}

export default function AddCreatorForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Basics
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [niches, setNiches] = useState<string[]>([])
  const [handle, setHandle] = useState('')

  // Profile
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')

  // Social accounts (repeatable)
  const [socials, setSocials] = useState<SocialEntry[]>([])

  // Worked with (repeatable strings)
  const [workedWith, setWorkedWith] = useState<string[]>([])

  // Portfolio links (repeatable strings)
  const [portfolioLinks, setPortfolioLinks] = useState<string[]>([])

  // Rate card in rupees
  const [reelPrice, setReelPrice] = useState('')
  const [storyPrice, setStoryPrice] = useState('')
  const [postPrice, setPostPrice] = useState('')
  const [ytShortPrice, setYtShortPrice] = useState('')

  function updateSocial(i: number, field: keyof SocialEntry, value: string) {
    setSocials((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Rate card → paise
    const rateCard: Record<string, number> = {}
    if (reelPrice.trim()) rateCard.reel = Math.round(parseFloat(reelPrice) * 100)
    if (storyPrice.trim()) rateCard.story = Math.round(parseFloat(storyPrice) * 100)
    if (postPrice.trim()) rateCard.post = Math.round(parseFloat(postPrice) * 100)
    if (ytShortPrice.trim()) rateCard.yt_short = Math.round(parseFloat(ytShortPrice) * 100)

    // Build social_accounts array
    const socialAccounts = socials
      .filter((s) => s.handle.trim() || s.url.trim())
      .map((s) => ({
        platform: s.platform,
        handle: s.handle.trim(),
        url: s.url.trim() || null,
        follower_count: s.follower_count.trim() ? parseInt(s.follower_count, 10) : null,
        verified: false,
      }))

    const worked = workedWith.map((w) => w.trim()).filter(Boolean)
    const portfolio = portfolioLinks.map((l) => l.trim()).filter(Boolean)

    const res = await addCreator({
      full_name: fullName,
      phone: phone || undefined,
      niches: niches.length > 0 ? niches : undefined,
      handle: handle || undefined,
      bio: bio || undefined,
      profile_photo_url: photoUrl || undefined,
      social_accounts: socialAccounts.length > 0 ? socialAccounts : undefined,
      worked_with: worked.length > 0 ? worked : undefined,
      portfolio_links: portfolio.length > 0 ? portfolio : undefined,
      rate_card: Object.keys(rateCard).length > 0 ? rateCard : undefined,
    })

    setLoading(false)

    if (res.error) {
      setError(res.error)
    } else {
      router.push('/ops/creators')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 540, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && <div style={{ color: '#dc2626', fontSize: '0.8125rem', padding: '0.5rem', background: '#fef2f2', borderRadius: 4 }}>{error}</div>}

      {/* ── Basics ──────────────────────────────────────────── */}
      <Field label="Full name *">
        <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </Field>

      <Field label="Phone" hint="Include country code, e.g. +919876543210">
        <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>

      <Field label="Niches">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {NICHES.map((n) => (
            <label key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={niches.includes(n)}
                onChange={(e) => {
                  if (e.target.checked) setNiches((prev) => [...prev, n])
                  else setNiches((prev) => prev.filter((x) => x !== n))
                }}
              />
              {n}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Handle" hint="e.g. @rohanfinance">
        <input style={inputStyle} value={handle} onChange={(e) => setHandle(e.target.value)} />
      </Field>

      {/* ── Profile ─────────────────────────────────────────── */}
      <Field label="Bio" hint="Short creator bio">
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Finance creator focused on mutual funds and insurance..."
        />
      </Field>

      <Field label="Profile photo URL" hint="Direct link to a photo">
        <input style={inputStyle} type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://" />
      </Field>

      {/* ── Social Accounts ─────────────────────────────────── */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Social accounts</legend>
        <p style={hintStyle}>Add each platform the creator is active on.</p>

        {socials.map((s, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: '#fafafa', borderRadius: 6, border: '1px solid #eee', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#666' }}>Account {i + 1}</span>
              <button type="button" onClick={() => setSocials((prev) => prev.filter((_, idx) => idx !== i))} style={removeBtnStyle}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <Field label="Platform">
                <select style={inputStyle} value={s.platform} onChange={(e) => updateSocial(i, 'platform', e.target.value)}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="Handle">
                <input style={inputStyle} value={s.handle} onChange={(e) => updateSocial(i, 'handle', e.target.value)} placeholder="@handle" />
              </Field>
              <Field label="Profile URL">
                <input style={inputStyle} type="url" value={s.url} onChange={(e) => updateSocial(i, 'url', e.target.value)} placeholder="https://" />
              </Field>
              <Field label="Followers">
                <input style={inputStyle} type="number" min="0" step="1" value={s.follower_count} onChange={(e) => updateSocial(i, 'follower_count', e.target.value)} placeholder="e.g. 180000" />
              </Field>
            </div>
          </div>
        ))}

        <button type="button" onClick={() => setSocials((prev) => [...prev, emptySocial()])} style={addBtnStyle}>
          + Add social account
        </button>
      </fieldset>

      {/* ── Worked With ─────────────────────────────────────── */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Worked with</legend>
        <p style={hintStyle}>Brands they've collaborated with (self-entered).</p>

        {workedWith.map((w, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={w}
              onChange={(e) => setWorkedWith((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
              placeholder="e.g. Groww"
            />
            <button type="button" onClick={() => setWorkedWith((prev) => prev.filter((_, idx) => idx !== i))} style={removeBtnStyle}>×</button>
          </div>
        ))}

        <button type="button" onClick={() => setWorkedWith((prev) => [...prev, ''])} style={addBtnStyle}>
          + Add brand
        </button>
      </fieldset>

      {/* ── Portfolio Links ─────────────────────────────────── */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Portfolio links</legend>
        <p style={hintStyle}>Links to work samples, YouTube videos, etc.</p>

        {portfolioLinks.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.375rem' }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              type="url"
              value={l}
              onChange={(e) => setPortfolioLinks((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
              placeholder="https://"
            />
            <button type="button" onClick={() => setPortfolioLinks((prev) => prev.filter((_, idx) => idx !== i))} style={removeBtnStyle}>×</button>
          </div>
        ))}

        <button type="button" onClick={() => setPortfolioLinks((prev) => [...prev, ''])} style={addBtnStyle}>
          + Add link
        </button>
      </fieldset>

      {/* ── Rate Card ───────────────────────────────────────── */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Rate card (optional — enter amounts in ₹)</legend>
        <p style={hintStyle}>Leave blank to skip. Stored as paise internally.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <Field label="Reel price (₹)">
            <input style={inputStyle} type="number" step="1" min="0" placeholder="e.g. 50000" value={reelPrice} onChange={(e) => setReelPrice(e.target.value)} />
          </Field>
          <Field label="Story price (₹)">
            <input style={inputStyle} type="number" step="1" min="0" placeholder="e.g. 15000" value={storyPrice} onChange={(e) => setStoryPrice(e.target.value)} />
          </Field>
          <Field label="Post price (₹)">
            <input style={inputStyle} type="number" step="1" min="0" placeholder="e.g. 30000" value={postPrice} onChange={(e) => setPostPrice(e.target.value)} />
          </Field>
          <Field label="YT Short price (₹)">
            <input style={inputStyle} type="number" step="1" min="0" placeholder="e.g. 80000" value={ytShortPrice} onChange={(e) => setYtShortPrice(e.target.value)} />
          </Field>
        </div>
      </fieldset>

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
          alignSelf: 'flex-start',
        }}
      >
        {loading ? 'Adding...' : 'Add creator'}
      </button>
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

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 6,
  padding: '1rem',
  margin: 0,
}

const legendStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  padding: '0 0.25rem',
}

const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#888',
  marginBottom: '0.75rem',
}

const addBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px dashed #ccc',
  borderRadius: 4,
  padding: '0.375rem 0.75rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: '#666',
  cursor: 'pointer',
  width: '100%',
}

const removeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #e5e5e5',
  borderRadius: 4,
  padding: '0.25rem 0.5rem',
  fontSize: '0.875rem',
  fontWeight: 700,
  color: '#999',
  cursor: 'pointer',
  lineHeight: 1,
}
