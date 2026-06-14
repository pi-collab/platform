'use client'

import { useEffect, useRef, useState } from 'react'

export default function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const [hasPointer, setHasPointer] = useState(false)

  useEffect(() => {
    setHasPointer(window.matchMedia('(pointer: fine)').matches)
  }, [])

  useEffect(() => {
    if (!hasPointer) return
    const dot  = dotRef.current
    const glow = glowRef.current
    if (!dot || !glow) return

    // Direct DOM updates — no React re-renders, stays at 60fps
    const move = (e: MouseEvent) => {
      const x = e.clientX + 'px'
      const y = e.clientY + 'px'
      dot.style.left  = x
      dot.style.top   = y
      glow.style.left = x
      glow.style.top  = y
    }

    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [hasPointer])

  if (!hasPointer) return null

  const base: React.CSSProperties = {
    position:      'fixed',
    borderRadius:  '50%',
    pointerEvents: 'none',
    transform:     'translate(-50%, -50%)',
    top:           '-120px',
    left:          '-120px',
    willChange:    'left, top',
  }

  return (
    <>
      {/* Water bubble */}
      <div
        ref={glowRef}
        style={{
          ...base,
          width:      40,
          height:     40,
          background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.65) 0%, rgba(220,235,255,0.20) 30%, rgba(200,225,255,0.14) 60%, rgba(180,210,245,0.08) 100%)',
          border:     '2px solid rgba(255,255,255,0.65)',
          boxShadow:  '0 2px 14px rgba(100,160,220,0.25), inset 0 -6px 14px rgba(200,225,255,0.18), inset 0 2px 4px rgba(255,255,255,0.40)',
          zIndex:     99997,
          backdropFilter: 'blur(1px)',
          WebkitBackdropFilter: 'blur(1px)',
        }}
      />
      {/* Specular highlight — small bright spot top-left like a real water bubble */}
      <div
        ref={dotRef}
        style={{
          ...base,
          width:      10,
          height:     7,
          background: 'rgba(255,255,255,0.75)',
          borderRadius: '50%',
          filter:     'blur(2px)',
          zIndex:     99998,
          transform:  'translate(calc(-50% - 6px), calc(-50% - 8px))',
        }}
      />
    </>
  )
}
