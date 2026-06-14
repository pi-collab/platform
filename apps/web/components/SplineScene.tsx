'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const Spline = dynamic(() => import('@splinetool/react-spline'), { ssr: false })

interface SplineSceneProps {
  scene: string
  className?: string
}

const isValidUrl = (s: string) => {
  try { return Boolean(new URL(s)) } catch { return false }
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  if (!isValidUrl(scene)) {
    return (
      <div className="spline-loader">
        <div className="spline-loader__dot" />
        <div className="spline-loader__dot" />
        <div className="spline-loader__dot" />
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="spline-loader">
          <div className="spline-loader__dot" />
          <div className="spline-loader__dot" />
          <div className="spline-loader__dot" />
        </div>
      }
    >
      <Spline
        scene={scene}
        className={className}
      />
    </Suspense>
  )
}
