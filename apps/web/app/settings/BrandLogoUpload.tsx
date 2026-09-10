'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadBrandLogo, removeBrandLogo } from './logo-actions'

/**
 * The brand's logo, on the settings Profile tab.
 *
 * This row already existed and looked complete: a 72px initials square, an
 * "Upload photo" pill and a "Remove" pill. Both were plain spans. The upload
 * pill called markDirty() and nothing else, so it dirtied the form and opened
 * no file picker, and Remove did nothing at all. Nothing wrote brands.logo_url
 * and nothing rendered it.
 *
 * The markup below is the original row, unchanged visually, with the two pills
 * now driving the real actions. Same behaviour as the creator's AvatarUpload:
 * the error shows in place and the control stays live, so a rejected file can
 * be swapped without a reload.
 */
export default function BrandLogoUpload({ currentUrl, initials }: { currentUrl: string | null; initials: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(currentUrl)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    /* Cleared straight away, or picking the SAME file after an error fires no
       change event and the retry silently does nothing. */
    e.target.value = ''
    if (!file) return

    setError(null)
    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await uploadBrandLogo(formData)
    setLoading(false)

    if ('error' in res && res.error) { setError(res.error); return }
    setLogoUrl((res as { url: string }).url)
    router.refresh()
  }

  async function handleRemove() {
    setError(null)
    setLoading(true)
    const res = await removeBrandLogo()
    setLoading(false)
    if ('error' in res && res.error) { setError(res.error); return }
    setLogoUrl(null)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22, paddingBottom: 22, borderBottom: '1px solid var(--border-hairline)' }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          style={{
            width: 72, height: 72, borderRadius: 20, flexShrink: 0,
            objectFit: 'cover', background: 'var(--card)',
            border: '1px solid var(--frost-edge)',
          }}
        />
      ) : (
        <span style={{
          width: 72, height: 72, borderRadius: 20, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26,
          color: 'var(--ink)', background: 'linear-gradient(135deg,var(--sec-2),var(--sec-2))',
          border: '1px solid var(--frost-edge)', boxShadow: 'inset 0 1px 0 var(--card)',
        }}>{initials}</span>
      )}
      <div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <span
            className="pill"
            role="button"
            tabIndex={0}
            onClick={() => { if (!loading) fileRef.current?.click() }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!loading) fileRef.current?.click() } }}
            style={{ ...pillBtn, opacity: loading ? 0.6 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
            {loading ? 'Uploading...' : logoUrl ? 'Change photo' : 'Upload photo'}
          </span>
          {logoUrl && (
            <span
              className="pill"
              role="button"
              tabIndex={0}
              onClick={() => { if (!loading) handleRemove() }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!loading) handleRemove() } }}
              style={{ ...pillBtn, color: 'var(--ink-soft)', opacity: loading ? 0.6 : 1 }}
            >
              Remove
            </span>
          )}
        </div>
        {error
          ? <div role="alert" style={{ fontSize: 11.5, color: '#B4262A', marginTop: 8 }}>{error}</div>
          : <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 8 }}>JPG, PNG, WebP or SVG. At least 400x400px.</div>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}

const pillBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px',
  borderRadius: 11, background: 'var(--card)', border: '1px solid var(--frost-edge)',
  fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer',
  boxShadow: '0 6px 16px -12px rgba(40,45,25,.4)',
}
