'use client'

import { useEffect, useRef } from 'react'

const COLORS = ['#E8FF66', '#F5F7FA', '#7C8471', 'rgba(232,255,102,.6)']
const PIECES = 60
/** Matches the longest possible fall (1.6 + 1.4s) plus the longest delay. */
const CLEANUP_MS = 3600

/**
 * One burst of confetti over the dark band, from the approved design.
 *
 * Built in an effect rather than as 60 rendered elements: their positions,
 * sizes, colours and delays are all random, and generating those during render
 * would produce different markup on the server and the client, which React
 * treats as a hydration error.
 *
 * Removes itself when the animation ends, so 60 absolutely-positioned nodes do
 * not sit in the tree for the rest of the session.
 */
export default function Confetti({ height = 340 }: { height?: number }) {
  const layer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = layer.current
    if (!el) return

    // Respect a reduced-motion preference. This is decoration with no
    // information in it, so the right amount for someone who asked for less
    // motion is none.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    for (let i = 0; i < PIECES; i++) {
      const piece = document.createElement('div')
      const size = 5 + Math.random() * 5
      const round = Math.random() > 0.5

      piece.className = 'confetti__piece'
      piece.style.left = `${Math.random() * 100}%`
      piece.style.width = `${size}px`
      piece.style.height = `${round ? size : size * 1.8}px`
      piece.style.background = COLORS[Math.floor(Math.random() * COLORS.length)]
      piece.style.borderRadius = round ? '50%' : '2px'
      piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`
      piece.style.animationDelay = `${Math.random() * 0.6}s`
      el.appendChild(piece)
    }

    const t = setTimeout(() => { el.innerHTML = '' }, CLEANUP_MS)
    return () => { clearTimeout(t); el.innerHTML = '' }
  }, [])

  return <div ref={layer} className="confetti" style={{ height }} aria-hidden="true" />
}
