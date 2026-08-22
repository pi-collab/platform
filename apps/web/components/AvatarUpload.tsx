'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadAvatar, removeAvatar } from '@/app/creator/avatar/actions'
import CreatorAvatar from './CreatorAvatar'

/**
 * Profile photo upload.
 *
 * Wired to real upload/remove actions, but until now rendered nowhere: the
 * settings screen drew two inert <span>s labelled "Upload photo" and "Remove",
 * so a creator could tap them forever and nothing happened. There was no
 * working way to set a photo anywhere in the app.
 */
interface AvatarUploadProps {
  currentUrl: string | null
  name: string
}

export default function AvatarUpload({ currentUrl, name }: AvatarUploadProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setLoading(true)

    const formData = new FormData()
    formData.append('file', file)

    const res = await uploadAvatar(formData)

    if (res.error) {
      setLoading(false)
      setError(res.error)
      return
    }

    setPreviewUrl(res.url!)
    setLoading(false)
    router.refresh()
  }

  async function handleRemove() {
    setError(null)
    setLoading(true)
    const res = await removeAvatar()
    if (res.error) {
      setLoading(false)
      setError(res.error)
      return
    }
    setPreviewUrl(null)
    setLoading(false)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <CreatorAvatar url={previewUrl} name={name} size={56} borderRadius={14} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            style={btnStyle}
          >
            {loading ? 'Uploading...' : previewUrl ? 'Change photo' : 'Upload photo'}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={loading}
              style={{ ...btnStyle, color: 'var(--ink-soft, #555)', background: 'none', border: '1px solid var(--line, #e5e5e5)' }}
            >
              Remove
            </button>
          )}
        </div>
        {error && <p role="alert" style={{ fontSize: 12, color: '#B4262A', margin: 0 }}>{error}</p>}
        <p style={{ fontSize: 11.5, color: 'var(--ink-faint, #999)', margin: 0 }}>
          JPEG, PNG, WebP, or GIF. Max 5 MB.
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}

// Pill + brand green, matching every other control in the creator app. The
// original #111 rounded-rect predates the design system.
const btnStyle: React.CSSProperties = {
  padding: '9px 15px',
  // 13px keeps it a button rather than a field — Safari's zoom-on-focus rule
  // applies to inputs, and the file input itself is hidden.
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 999,
  border: 'none',
  background: 'var(--neon, #E8FF66)',
  color: 'var(--lime-950, #161B08)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui, inherit)',
  minHeight: 38,
}
