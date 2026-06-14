'use client'

import { useEffect, useRef, useState } from 'react'
import { BRAND_NAME } from '@/lib/content'

interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export default function Logo({ size = 40, showText = true, className }: LogoProps) {
  const crystalRef = useRef<HTMLSpanElement>(null)
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    // Only play entrance animation once per session
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('logo-animated')) {
      setAnimated(true)
      return
    }
    const el = crystalRef.current
    if (!el) return

    el.style.animation = 'crystal-entrance 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards'
    const onEnd = () => {
      el.style.animation = ''
      sessionStorage.setItem('logo-animated', '1')
      setAnimated(true)
    }
    el.addEventListener('animationend', onEnd)
    return () => el.removeEventListener('animationend', onEnd)
  }, [])

  return (
    <span className={`logo ${className ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <span className="logo__crystal" ref={crystalRef}>
        <svg
          width={size}
          height={size * 1.3}
          viewBox="0 0 64 84"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="logo__crystal-svg"
        >
          <defs>
            <linearGradient id="g-s" x1="0" y1="0" x2="64" y2="84" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#b0a0d8" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#c8a0c0" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#d8b8a0" stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id="g-dark" x1="20" y1="30" x2="50" y2="70" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#3a2d50" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#2a1e3a" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="g-mid" x1="15" y1="20" x2="45" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#5a4878" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#3a2d50" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="g-hi" x1="20" y1="5" x2="40" y2="50" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="white" stopOpacity="0.35" />
              <stop offset="60%" stopColor="white" stopOpacity="0.08" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="g-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="45%" stopColor="white" stopOpacity="0" />
              <stop offset="50%" stopColor="white" stopOpacity="0.4" />
              <stop offset="55%" stopColor="white" stopOpacity="0" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
              <animateTransform attributeName="gradientTransform" type="translate" values="-1 0;2 0" dur="3.5s" repeatCount="indefinite" />
            </linearGradient>
            <radialGradient id="g-star">
              <stop offset="0%" stopColor="white" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#dcc8f0" stopOpacity="0.4" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          {/* Dark shadow facets (back faces for 3D) */}
          <polygon points="32,30 52,28 46,60 32,72" fill="url(#g-dark)" />
          <polygon points="32,30 12,28 18,60 32,72" fill="url(#g-mid)" />
          <polygon points="18,60 32,72 46,60 32,52" fill="url(#g-dark)" fillOpacity="0.5" />

          {/* Outline */}
          <polygon points="32,4 54,28 46,60 32,76 18,60 10,28" fill="none" stroke="url(#g-s)" strokeWidth="2" strokeLinejoin="round" />

          {/* Crown table */}
          <polygon points="32,16 44,26 38,32 32,30 26,32 20,26" fill="url(#g-hi)" stroke="url(#g-s)" strokeWidth="1.2" strokeLinejoin="round" />
          <polygon points="32,4 44,26 32,16 20,26" fill="url(#g-hi)" />

          {/* Crown facet lines */}
          <line x1="32" y1="4" x2="20" y2="26" stroke="url(#g-s)" strokeWidth="1.2" />
          <line x1="32" y1="4" x2="44" y2="26" stroke="url(#g-s)" strokeWidth="1.2" />
          <line x1="32" y1="4" x2="32" y2="16" stroke="url(#g-s)" strokeWidth="0.8" />
          <line x1="54" y1="28" x2="44" y2="26" stroke="url(#g-s)" strokeWidth="1.1" />
          <line x1="10" y1="28" x2="20" y2="26" stroke="url(#g-s)" strokeWidth="1.1" />
          <line x1="54" y1="28" x2="38" y2="32" stroke="url(#g-s)" strokeWidth="0.8" />
          <line x1="10" y1="28" x2="26" y2="32" stroke="url(#g-s)" strokeWidth="0.8" />

          {/* Girdle */}
          <line x1="10" y1="28" x2="54" y2="28" stroke="url(#g-s)" strokeWidth="0.6" strokeOpacity="0.4" />

          {/* Pavilion facets */}
          <line x1="32" y1="30" x2="32" y2="76" stroke="url(#g-s)" strokeWidth="1.1" />
          <line x1="38" y1="32" x2="46" y2="60" stroke="url(#g-s)" strokeWidth="1" />
          <line x1="26" y1="32" x2="18" y2="60" stroke="url(#g-s)" strokeWidth="1" />
          <line x1="38" y1="32" x2="32" y2="76" stroke="url(#g-s)" strokeWidth="0.7" />
          <line x1="26" y1="32" x2="32" y2="76" stroke="url(#g-s)" strokeWidth="0.7" />
          <line x1="54" y1="28" x2="46" y2="60" stroke="url(#g-s)" strokeWidth="0.9" />
          <line x1="10" y1="28" x2="18" y2="60" stroke="url(#g-s)" strokeWidth="0.9" />
          <line x1="54" y1="28" x2="32" y2="76" stroke="url(#g-s)" strokeWidth="0.5" strokeOpacity="0.5" />
          <line x1="10" y1="28" x2="32" y2="76" stroke="url(#g-s)" strokeWidth="0.5" strokeOpacity="0.5" />
          <line x1="46" y1="60" x2="18" y2="60" stroke="url(#g-s)" strokeWidth="0.5" strokeOpacity="0.35" />
          <line x1="32" y1="52" x2="46" y2="60" stroke="url(#g-s)" strokeWidth="0.5" strokeOpacity="0.4" />
          <line x1="32" y1="52" x2="18" y2="60" stroke="url(#g-s)" strokeWidth="0.5" strokeOpacity="0.4" />

          {/* Texture curves */}
          <path d="M24,20 Q28,18 32,20" stroke="url(#g-s)" strokeWidth="0.4" strokeOpacity="0.3" fill="none" />
          <path d="M32,20 Q36,18 40,20" stroke="url(#g-s)" strokeWidth="0.4" strokeOpacity="0.3" fill="none" />
          <path d="M28,38 Q30,42 32,50" stroke="url(#g-s)" strokeWidth="0.4" strokeOpacity="0.3" fill="none" />
          <path d="M36,38 Q34,42 32,50" stroke="url(#g-s)" strokeWidth="0.4" strokeOpacity="0.3" fill="none" />
          <path d="M22,36 Q26,44 28,54" stroke="url(#g-s)" strokeWidth="0.35" strokeOpacity="0.25" fill="none" />
          <path d="M42,36 Q38,44 36,54" stroke="url(#g-s)" strokeWidth="0.35" strokeOpacity="0.25" fill="none" />

          {/* Sweep shine */}
          <polygon points="32,4 54,28 46,60 32,76 18,60 10,28" fill="url(#g-sweep)" style={{ mixBlendMode: 'overlay' }} />

          {/* Star sparkles */}
          <g className="logo__sparkle logo__sparkle--1">
            <path d="M8,16 L9,19.5 L10,16 L9,12.5Z" fill="url(#g-star)" />
            <path d="M8,16 L4.5,17 L8,18 L11.5,17Z" fill="url(#g-star)" fillOpacity="0.7" />
          </g>
          <g className="logo__sparkle logo__sparkle--2">
            <path d="M56,18 L57,21 L58,18 L57,15Z" fill="url(#g-star)" />
            <path d="M56,18 L53,19 L56,20 L59,19Z" fill="url(#g-star)" fillOpacity="0.7" />
          </g>
          <g className="logo__sparkle logo__sparkle--3">
            <path d="M6,44 L6.8,46.5 L7.6,44 L6.8,41.5Z" fill="url(#g-star)" />
            <path d="M6,44 L3.5,44.8 L6,45.6 L8.5,44.8Z" fill="url(#g-star)" fillOpacity="0.7" />
          </g>
          <g className="logo__sparkle logo__sparkle--4">
            <path d="M58,48 L58.6,49.8 L59.2,48 L58.6,46.2Z" fill="url(#g-star)" />
            <path d="M58,48 L56.2,48.6 L58,49.2 L59.8,48.6Z" fill="url(#g-star)" fillOpacity="0.7" />
          </g>
          <g className="logo__sparkle logo__sparkle--5">
            <path d="M16,10 L16.5,11.5 L17,10 L16.5,8.5Z" fill="url(#g-star)" />
            <path d="M16,10 L14.5,10.5 L16,11 L17.5,10.5Z" fill="url(#g-star)" fillOpacity="0.6" />
          </g>
          <g className="logo__sparkle logo__sparkle--6">
            <path d="M48,12 L48.5,13.5 L49,12 L48.5,10.5Z" fill="url(#g-star)" />
            <path d="M48,12 L46.5,12.5 L48,13 L49.5,12.5Z" fill="url(#g-star)" fillOpacity="0.6" />
          </g>
        </svg>
      </span>

      {showText && (
        <span className="logo__text">{BRAND_NAME}</span>
      )}
    </span>
  )
}
