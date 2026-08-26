'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { upsertStorefront, checkSlugAvailable, type StorefrontRow } from './actions'

interface Props {
  initial: StorefrontRow | null
  creatorName: string
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

export default function StorefrontEditor({ initial, creatorName }: Props) {
  const router = useRouter()
  const slugLocked = initial?.is_published === true

  const [slug, setSlug] = useState(initial?.slug ?? slugFromName(creatorName))
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '')
  const [headline, setHeadline] = useState(initial?.headline ?? '')
  const [bio, setBio] = useState(initial?.bio ?? '')
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? [])
  const [catInput, setCatInput] = useState('')

  const [followers, setFollowers] = useState<string>(initial?.stats?.followers?.toString() ?? '')
  const [avgViews, setAvgViews] = useState<string>(initial?.stats?.avg_views?.toString() ?? '')
  const [engagementRate, setEngagementRate] = useState<string>(initial?.stats?.engagement_rate?.toString() ?? '')

  const [platformLinks, setPlatformLinks] = useState(initial?.platform_links ?? [])
  const [showRates, setShowRates] = useState(initial?.show_rates ?? true)
  const [showPastCollabs, setShowPastCollabs] = useState(initial?.show_past_collabs ?? false)
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [slugError, setSlugError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const slugTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Debounced slug availability check
  const handleSlugChange = useCallback((val: string) => {
    const normalized = val.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(normalized)
    setSlugStatus('idle')
    setSlugError(null)

    if (slugTimerRef.current) clearTimeout(slugTimerRef.current)

    if (normalized.length === 0) return

    // Client-side pre-validation for immediate feedback
    if (normalized.length < 3 || normalized.length > 30) {
      setSlugStatus('invalid')
      setSlugError('3\u201330 characters')
      return
    }
    if (!/^[a-z0-9]/.test(normalized) || !/[a-z0-9]$/.test(normalized)) {
      setSlugStatus('invalid')
      setSlugError('Must start and end with a letter or number')
      return
    }

    slugTimerRef.current = setTimeout(async () => {
      setSlugStatus('checking')
      const result = await checkSlugAvailable(normalized)
      if (result.available) {
        setSlugStatus('available')
        setSlugError(null)
      } else {
        setSlugStatus('taken')
        setSlugError(result.error ?? 'Not available')
      }
    }, 400)
  }, [])

  // Run initial slug check for pre-filled name
  useEffect(() => {
    if (!initial && slug.length >= 3) {
      handleSlugChange(slug)
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addCategory() {
    const val = catInput.trim()
    if (val && categories.length < 10 && !categories.includes(val)) {
      setCategories([...categories, val])
    }
    setCatInput('')
  }

  function addPlatformLink() {
    if (platformLinks.length >= 10) return
    setPlatformLinks([...platformLinks, { platform: 'instagram', handle: '', url: '' }])
  }

  function updatePlatformLink(i: number, field: string, val: string) {
    const updated = [...platformLinks]
    updated[i] = { ...updated[i], [field]: val }
    setPlatformLinks(updated)
  }

  function removePlatformLink(i: number) {
    setPlatformLinks(platformLinks.filter((_, idx) => idx !== i))
  }

  async function handleCopyLink() {
    const url = `https://guapd.com/c/${slug}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSave() {
    setError(null)
    setSuccess(false)
    setSaving(true)

    const stats: Record<string, number> = {}
    if (followers.trim()) stats.followers = parseInt(followers, 10)
    if (avgViews.trim()) stats.avg_views = parseInt(avgViews, 10)
    if (engagementRate.trim()) stats.engagement_rate = parseFloat(engagementRate)

    const result = await upsertStorefront({
      slug,
      display_name: displayName || undefined,
      headline: headline || undefined,
      bio: bio || undefined,
      categories,
      stats,
      platform_links: platformLinks.filter((pl) => pl.handle.trim() && pl.url.trim()),
      content_items: [],
      show_rates: showRates,
      show_past_collabs: showPastCollabs,
      is_published: isPublished,
    })

    setSaving(false)
    if ('error' in result) {
      setError(result.error ?? 'An error occurred.')
    } else {
      setSuccess(true)
      router.refresh()
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,.85)',
    background: 'rgba(255,255,255,.6)',
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--ink-soft, #555)',
    marginBottom: 6,
  }

  const sectionStyle: React.CSSProperties = {
    padding: 'clamp(20px,2.5vw,32px)',
    borderRadius: 20,
    background: 'rgba(255,255,255,.5)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--frost-edge, rgba(255,255,255,.85))',
    boxShadow: '0 12px 28px -20px rgba(40,52,70,.2)',
    marginBottom: 20,
  }

  const slugStatusColor =
    slugStatus === 'available' ? '#1F9D6B'
    : slugStatus === 'taken' || slugStatus === 'invalid' ? '#D2545A'
    : 'var(--ink-faint, #999)'

  return (
    <div>
      {/* ── SLUG PICKER (prominent, first) ──────────────────── */}
      <div style={{ ...sectionStyle, borderColor: slugLocked ? '#86efac' : undefined }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, marginBottom: 4, color: 'var(--ink)' }}>
          Your Shopfront URL
        </h3>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 16, lineHeight: 1.5 }}>
          {slugLocked
            ? 'Your URL is live. It can\u2019t be changed after publishing.'
            : 'Choose your URL carefully, you\u2019ll put this link in your bio. It can\u2019t be changed once your shopfront is live.'}
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: slugLocked ? '#f8fafc' : 'rgba(255,255,255,.6)',
          border: `1px solid ${slugLocked ? '#e2e8f0' : slugStatus === 'available' ? '#86efac' : slugStatus === 'taken' || slugStatus === 'invalid' ? '#fca5a5' : 'rgba(255,255,255,.85)'}`,
          borderRadius: 14,
          padding: '0 4px 0 16px',
          transition: 'border-color .15s',
        }}>
          <span style={{
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--ink-faint, #999)',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            flexShrink: 0,
          }}>
            guapd.com/c/
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="your-url"
            maxLength={30}
            readOnly={slugLocked}
            disabled={slugLocked}
            style={{
              flex: 1,
              padding: '14px 12px',
              fontSize: 16,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--ink, #181C24)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              minWidth: 0,
            }}
          />
          {/* Slug status indicator */}
          {!slugLocked && slugStatus === 'checking' && (
            <span style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '0 12px', whiteSpace: 'nowrap' }}>Checking...</span>
          )}
          {!slugLocked && slugStatus === 'available' && (
            <span style={{ fontSize: 13, color: '#1F9D6B', padding: '0 12px', whiteSpace: 'nowrap', fontWeight: 600 }}>&#10003; Available</span>
          )}
          {slugLocked && (
            <button
              onClick={handleCopyLink}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 10,
                border: '1px solid #e5e5e5',
                background: copied ? '#dcfce7' : '#fff',
                color: copied ? '#166534' : '#111',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginRight: 4,
                transition: 'background .15s',
              }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          )}
        </div>

        {/* Slug validation message */}
        {!slugLocked && slugError && (
          <p style={{ fontSize: 13, color: slugStatusColor, marginTop: 6, fontWeight: 500 }}>
            {slugError}
          </p>
        )}

        {/* Immutability warning before publish */}
        {!slugLocked && !initial?.is_published && isPublished && slug.length >= 3 && slugStatus === 'available' && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            fontSize: 13,
            color: '#92400e',
            lineHeight: 1.5,
          }}>
            Once you publish, <strong>guapd.com/c/{slug}</strong> becomes permanent and can&apos;t be changed.
          </div>
        )}
      </div>

      {/* Profile */}
      <div style={sectionStyle}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Profile</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Display name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={100} style={fieldStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Headline</label>
          <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Finance creator making money simple" maxLength={200} style={fieldStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell brands about yourself..." maxLength={2000} rows={4} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>

        {/* Categories */}
        <div>
          <label style={labelStyle}>Categories</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {categories.map((cat) => (
              <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: 'rgba(218,254,12,.15)', fontSize: 13, fontWeight: 500 }}>
                {cat}
                <button onClick={() => setCategories(categories.filter((c) => c !== cat))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ink-faint)' }}>&times;</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={catInput}
              onChange={(e) => setCatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
              placeholder="Add category"
              maxLength={50}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button onClick={addCategory} disabled={!catInput.trim() || categories.length >= 10} style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--neon, #DAFE0C)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={sectionStyle}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Stats</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <label style={labelStyle}>Followers</label>
            <input type="number" value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="0" min={0} step={1} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Avg. views</label>
            <input type="number" value={avgViews} onChange={(e) => setAvgViews(e.target.value)} placeholder="0" min={0} step={1} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Engagement rate (%)</label>
            <input type="number" value={engagementRate} onChange={(e) => setEngagementRate(e.target.value)} placeholder="0.0" min={0} max={100} step={0.1} style={fieldStyle} />
          </div>
        </div>
      </div>

      {/* Platform Links */}
      <div style={sectionStyle}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Platform Links</h3>
        {platformLinks.map((pl, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ width: 120 }}>
              <label style={{ ...labelStyle, fontSize: 12 }}>Platform</label>
              <select value={pl.platform} onChange={(e) => updatePlatformLink(i, 'platform', e.target.value)} style={fieldStyle}>
                <option value="instagram">Instagram</option>
                <option value="youtube">YouTube</option>
                <option value="twitter">Twitter/X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ ...labelStyle, fontSize: 12 }}>Handle</label>
              <input type="text" value={pl.handle} onChange={(e) => updatePlatformLink(i, 'handle', e.target.value)} placeholder="@handle" maxLength={100} style={fieldStyle} />
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ ...labelStyle, fontSize: 12 }}>URL</label>
              <input type="url" value={pl.url} onChange={(e) => updatePlatformLink(i, 'url', e.target.value)} placeholder="https://instagram.com/..." maxLength={300} style={fieldStyle} />
            </div>
            <button onClick={() => removePlatformLink(i)} style={{ padding: '10px 12px', borderRadius: 12, background: '#FFF0F0', color: '#9B3030', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
              &times;
            </button>
          </div>
        ))}
        <button onClick={addPlatformLink} disabled={platformLinks.length >= 10} style={{ padding: '10px 16px', borderRadius: 12, background: 'rgba(218,254,12,.15)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          + Add platform
        </button>
      </div>

      {/* Toggles */}
      <div style={sectionStyle}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Visibility</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={showRates} onChange={(e) => setShowRates(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 15 }}>Show package rates publicly</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={showPastCollabs} onChange={(e) => setShowPastCollabs(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 15 }}>Show past collaborations (only brands that opted in)</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Publish shopfront</span>
        </label>
        <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginTop: 6 }}>
          {isPublished ? `Live at guapd.com/c/${slug || '...'}` : 'Your shopfront is currently hidden.'}
        </p>
      </div>

      {/* Save */}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: '#FFF0F0', color: '#9B3030', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: '#F0FFF4', color: '#1F9D6B', fontSize: 14, marginBottom: 16 }}>
          Storefront saved!{isPublished && slug && ` Live at guapd.com/c/${slug}`}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        {initial && slug && (
          <a
            href={`/c/${slug}`}
            target="_blank"
            rel="noopener"
            style={{
              padding: '14px 24px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.7)',
              border: '1px solid var(--frost-edge)',
              color: 'var(--ink)',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Preview
          </a>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !slug || slug.length < 3 || slugStatus === 'taken' || slugStatus === 'invalid'}
          style={{
            padding: '14px 32px',
            borderRadius: 999,
            background: saving ? '#ccc' : 'var(--neon, #DAFE0C)',
            color: 'var(--ink)',
            fontWeight: 700,
            fontSize: 16,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save storefront'}
        </button>
      </div>
    </div>
  )
}
