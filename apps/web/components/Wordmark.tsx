/**
 * The Guapd wordmark with the glossy orb standing in for its full stop.
 *
 * The wordmark SVG ends in a flat lime circle. Rather than sit the orb beside
 * the word — which would leave the logo carrying two dots — the flat circle is
 * stripped from the SVG (guapd-wordmark-nodot.svg) and the orb is positioned
 * exactly where it used to be.
 *
 * Those positions are the dot's own geometry inside the 392×104 viewBox: a
 * circle of radius 12 centred on (380, 64.5), so x 368→392 and y 52.5→76. They
 * are expressed as percentages of the box, which means the orb tracks the
 * wordmark at any height without a second set of numbers to keep in sync.
 *
 * The orb is decorative — the alt text on the wordmark already names the brand,
 * so announcing it again would just read "Guapd Guapd" on a screen reader.
 */

const VIEW_W = 392
const VIEW_H = 104

/** The dot's box inside the viewBox, as a share of each axis. */
const DOT = {
  left: `${(368 / VIEW_W) * 100}%`,
  top: `${(52.5 / VIEW_H) * 100}%`,
  width: `${(24 / VIEW_W) * 100}%`,
  height: `${(23.5 / VIEW_H) * 100}%`,
}

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
  const src = tone === 'light' ? '/guapd-wordmark-light-nodot.svg' : '/guapd-wordmark-nodot.svg'

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        height: `${height}px`,
        aspectRatio: `${VIEW_W} / ${VIEW_H}`,
        flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Guapd" style={{ height: '100%', width: '100%', display: 'block' }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/guapd-orb.webp"
        alt=""
        aria-hidden="true"
        style={{ position: 'absolute', ...DOT, display: 'block' }}
      />
    </span>
  )
}
