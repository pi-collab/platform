/**
 * The Guapd logo: the glossy orb as a standalone mark, then the wordmark.
 *
 *     ● guapd.
 *
 * The orb is a mark in its own right, not a replacement for the full stop the
 * wordmark already ends in — both are present, as in the brand lockup.
 *
 * Sizes are derived from one number so the lockup holds its proportions at any
 * height: the orb is slightly taller than the wordmark's box, which is what
 * makes it read as a mark rather than as a stray bullet, and the gap scales
 * with it. The wordmark SVG's own 392x104 box is declared as an aspect-ratio so
 * the two sit on a shared baseline without either being measured at runtime.
 *
 * The orb is decorative — the wordmark's alt text already names the brand, so
 * announcing it twice would read "Guapd Guapd" on a screen reader.
 */

const VIEW_W = 392
const VIEW_H = 104

/** Orb size and gap, as multiples of the wordmark height. */
const ORB_SCALE = 1.15
const GAP_SCALE = 0.4

export default function Wordmark({
  height = 24,
  tone = 'dark',
  className,
}: {
  height?: number
  /** 'dark' = ink on light surfaces; 'light' = white ink on the footer. */
  tone?: 'dark' | 'light'
  className?: string
}) {
  const src = tone === 'light' ? '/guapd-wordmark-light.svg' : '/guapd-wordmark.svg'
  const orb = Math.round(height * ORB_SCALE)

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${Math.round(height * GAP_SCALE)}px`,
        flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/guapd-orb.webp"
        alt=""
        aria-hidden="true"
        style={{ width: `${orb}px`, height: `${orb}px`, display: 'block', flexShrink: 0 }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Guapd"
        style={{ height: `${height}px`, aspectRatio: `${VIEW_W} / ${VIEW_H}`, display: 'block', flexShrink: 0 }}
      />
    </span>
  )
}
