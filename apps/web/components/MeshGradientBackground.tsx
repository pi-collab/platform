'use client'

import { MeshGradient } from '@paper-design/shaders-react'
import { useEffect, useRef, useState } from 'react'

// Default palette — cool pastels (home + creator)
const DEFAULT_COLORS = [
  '#b8dde8', // soft teal
  '#c8b8e8', // soft lavender
  '#f0c0d0', // soft rose
  '#ffd4b0', // soft peach
  '#b8e8cc', // soft mint
  '#d4f0b0', // soft lime
]

interface MeshGradientBackgroundProps {
  colors?: string[]
}

export default function MeshGradientBackground({ colors = DEFAULT_COLORS }: MeshGradientBackgroundProps) {
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 })
  const [mounted, setMounted] = useState(false)
  const xRef = useRef(0.08)
  const yRef = useRef(0.0)
  const [offset, setOffset] = useState({ x: 0.08, y: 0.0 })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    setMounted(true)

    const updateSize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)

    // Lerp cursor position each frame for smooth tracking
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      setOffset((prev) => {
        const nx = prev.x + (xRef.current - prev.x) * 0.05
        const ny = prev.y + (yRef.current - prev.y) * 0.05
        if (Math.abs(nx - prev.x) < 0.0001 && Math.abs(ny - prev.y) < 0.0001) return prev
        return { x: nx, y: ny }
      })
    }
    rafRef.current = requestAnimationFrame(tick)

    const handleMouseMove = (e: MouseEvent) => {
      xRef.current = (e.clientX / window.innerWidth) * 0.28 - 0.14
      yRef.current = (e.clientY / window.innerHeight) * 0.20 - 0.10
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('resize', updateSize)
      window.removeEventListener('mousemove', handleMouseMove)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (!mounted) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <MeshGradient
        width={dimensions.width}
        height={dimensions.height}
        colors={colors}
        distortion={1.0}
        swirl={0.55}
        grainMixer={0}
        grainOverlay={0}
        speed={0.5}
        offsetX={offset.x}
        offsetY={offset.y}
      />
      {/* Soft white veil so glass sections stay readable */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(255, 255, 255, 0.30)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
