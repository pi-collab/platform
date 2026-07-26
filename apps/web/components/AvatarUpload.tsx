'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadAvatar, removeAvatar } from '@/app/creator/avatar/actions'
import CreatorAvatar from './CreatorAvatar'

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
              style={{ ...btnStyle, color: '#888', background: 'none', border: '1px solid #e5e5e5' }}
            >
              Remove
            </button>
          )}
        </div>
        {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: 0 }}>{error}</p>}
        <p style={{ fontSize: '0.6875rem', color: '#999', margin: 0 }}>
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

const btnStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
