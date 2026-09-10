/**
 * A brand's picture, wherever a creator sees that brand.
 *
 * Every creator surface drew the brand as initials in a circle: the deals list,
 * the inbox list and thread, payments, the dashboard. Brands can upload a logo
 * now, and it should be the same picture in all of them, so this is the one
 * place that decides between the logo and the fallback.
 *
 * The caller keeps its own box - the deals list uses a 44px white circle, the
 * inbox a CSS class, payments a shared avatar() helper - and passes it in.
 * A logo fills that same box; nothing about the layout moves when one appears.
 *
 * Two of these screens (the inbox list and thread) are shared with the brand
 * side, where the mark is a creator rather than a brand. Nothing here is
 * brand-specific: with no picture it draws the initials it was given.
 */
export default function BrandMark({
  name, logoUrl, initials, style, className,
}: {
  name: string
  logoUrl?: string | null
  /* The letters this surface already computed. Two of these screens are shared
     with the brand side, where the mark is a CREATOR and the initials come from
     a different helper, so the caller's own value wins over ours. */
  initials?: string
  /** The box the caller already draws. Used for both the logo and the initials. */
  style?: React.CSSProperties
  className?: string
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={className}
        /* objectFit last so a caller cannot accidentally letterbox a logo, and
           a white ground so a transparent PNG does not sit on the tint. */
        style={{ ...style, objectFit: 'cover', background: '#FFFFFF' }}
      />
    )
  }
  return <span className={className} style={style} aria-hidden="true">{initials ?? brandInitials(name)}</span>
}

/** Two letters, the way every one of these surfaces already derived them. */
export function brandInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (name || '').slice(0, 2).toUpperCase() || 'BR'
}
