'use client'

/**
 * Avatar — circle with specular edge, initials fallback rotating through pastels.
 * Sizes: sm 32 · md 40 · lg 48 · xl 64px.
 */

const SIZES = { sm: 32, md: 40, lg: 48, xl: 64 } as const
const FONT_SIZES = { sm: 12, md: 14, lg: 16, xl: 22 } as const
const PASTELS = ['#EEF6FD', '#F4F0FF', '#ECFBF5', '#FFF3EC'] as const // sky, lavender, mint, peach

function nameHash(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

interface AvatarProps {
  name: string
  src?: string | null
  size?: keyof typeof SIZES
  className?: string
}

export default function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const px = SIZES[size]
  const fontSize = FONT_SIZES[size]
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const pastel = PASTELS[nameHash(name) % PASTELS.length]

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={className}
        style={{
          width: px,
          height: px,
          borderRadius: '9999px',
          border: '1px solid rgba(255,255,255,0.85)',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <span
      className={className}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: px,
        height: px,
        borderRadius: '9999px',
        border: '1px solid rgba(255,255,255,0.85)',
        background: pastel,
        color: '#181C24',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        fontWeight: 600,
        fontSize: `${fontSize}px`,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {initials}
    </span>
  )
}
