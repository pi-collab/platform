'use client'

interface CreatorAvatarProps {
  url: string | null
  name: string
  size?: number
  borderRadius?: number
  source?: 'upload' | 'instagram'
}

export default function CreatorAvatar({
  url,
  name,
  size = 36,
  borderRadius = 8,
}: CreatorAvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius,
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius,
        background: '#ede9fe',
        color: '#6d28d9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.3,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}
