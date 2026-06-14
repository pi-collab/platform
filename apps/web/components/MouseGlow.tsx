'use client'

import { useEffect, useRef, useState } from 'react'

export default function MouseGlow() {
  const ref0 = useRef<HTMLDivElement>(null)
  const ref1 = useRef<HTMLDivElement>(null)
  const ref2 = useRef<HTMLDivElement>(null)
  const [hasPointer, setHasPointer] = useState(false)

  useEffect(() => {
    setHasPointer(window.matchMedia('(pointer: fine)').matches)
  }, [])

  useEffect(() => {
    if (!hasPointer) return
    const refs  = [ref0, ref1, ref2]

    // speed of follow + fixed offset from cursor per blob
    const cfgs = [
      { lerp: 0.04, ox:    0, oy:    0 }, // purple — tracks cursor
      { lerp: 0.03, ox:  200, oy:  150 }, // peach  — lazier, offset right-down
      { lerp: 0.05, ox: -160, oy:  110 }, // rose   — slightly faster, offset left-down
    ]

    const SIZE = 800  // blob diameter
    let mx = window.innerWidth  * 0.5
    let my = window.innerHeight * 0.35

    const pos = cfgs.map((c) => ({
      x: mx + c.ox,
      y: my + c.oy,
    }))

    // paint initial position before any mouse event
    cfgs.forEach((_, i) => {
      const el = refs[i].current
      if (el) el.style.transform = `translate(${pos[i].x - SIZE / 2}px, ${pos[i].y - SIZE / 2}px)`
    })

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    window.addEventListener('mousemove', onMove)

    let raf: number
    const tick = () => {
      cfgs.forEach((c, i) => {
        pos[i].x += (mx + c.ox - pos[i].x) * c.lerp
        pos[i].y += (my + c.oy - pos[i].y) * c.lerp
        const el = refs[i].current
        if (el) el.style.transform = `translate(${pos[i].x - SIZE / 2}px, ${pos[i].y - SIZE / 2}px)`
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [hasPointer])

  if (!hasPointer) return null

  return (
    <div
      style={{
        position:      'fixed',
        inset:         0,
        pointerEvents: 'none',
        zIndex:        9998,
        overflow:      'hidden',
        mixBlendMode:  'multiply',
      }}
    >
      {/* pale blue — tracks cursor */}
      <div ref={ref0} style={{
        position: 'absolute', top: 0, left: 0,
        width: 800, height: 800, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(170,200,240,0.50) 0%, transparent 70%)',
        willChange: 'transform',
      }} />
      {/* light yellow — lazier, offset right-down */}
      <div ref={ref1} style={{
        position: 'absolute', top: 0, left: 0,
        width: 800, height: 800, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(250,240,180,0.40) 0%, transparent 70%)',
        willChange: 'transform',
      }} />
      {/* pale sky blue — slightly faster, offset left-down */}
      <div ref={ref2} style={{
        position: 'absolute', top: 0, left: 0,
        width: 800, height: 800, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(190,220,250,0.38) 0%, transparent 70%)',
        willChange: 'transform',
      }} />
    </div>
  )
}
