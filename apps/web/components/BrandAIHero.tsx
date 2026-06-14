'use client'

import { useState, useRef, useEffect } from 'react'

interface AIHeroProps {
  headline?: string
  subtitle?: string
  badge?: string
  buttonText?: string
  suggestions?: string[]
  placeholders?: string[]
}

const BRAND_SUGGESTIONS = [
  '1 Reel · Groww · Finance · ₹45K',
  '3 Stories · Zerodha · 7 days',
  'YouTube Short · ₹80K · 14 days',
  'IG Post · Fi · ₹30K · usage 30d',
]

const BRAND_PLACEHOLDERS = [
  'e.g. 1 Reel with Rohan Mehta, ₹50K, 14 days...',
  'e.g. Finance creator, 180K followers, 2 revisions...',
  'e.g. Zerodha campaign, 3 posts, ₹1.2L total...',
  'e.g. Groww · Instagram Reel · 30-day usage rights...',
]

export default function AIHero({
  headline = 'Create your next deal',
  subtitle = 'Describe the deal you want to run. We\u2019ll structure the brief, terms, and timeline instantly.',
  badge = 'AI-powered deal builder',
  buttonText = 'Create →',
  suggestions = BRAND_SUGGESTIONS,
  placeholders = BRAND_PLACEHOLDERS,
}: AIHeroProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (focused || value) return
    const t = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % placeholders.length)
    }, 3000)
    return () => clearInterval(t)
  }, [focused, value, placeholders.length])

  return (
    <section className="brand-ai-hero">
      <div className="brand-ai-hero__inner">

        <div className="brand-ai-hero__badge">
          <span className="brand-ai-hero__badge-star">✦</span>
          {badge}
        </div>

        <h1 className="brand-ai-hero__headline">{headline}</h1>

        <p className="brand-ai-hero__sub">{subtitle}</p>

        <div
          className={`brand-ai-hero__input-wrap${focused ? ' focused' : ''}`}
          onClick={() => inputRef.current?.focus()}
        >
          <span className="brand-ai-hero__spark" aria-hidden="true">✦</span>
          <input
            ref={inputRef}
            className="brand-ai-hero__input"
            placeholder={placeholders[placeholderIdx]}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          <button
            className="brand-ai-hero__submit"
            disabled={!value.trim()}
          >
            {buttonText}
          </button>
        </div>

        <div className="brand-ai-hero__suggestions">
          <span className="brand-ai-hero__try">Try:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              className="brand-ai-hero__chip"
              onClick={() => { setValue(s); inputRef.current?.focus() }}
            >
              {s}
            </button>
          ))}
        </div>

      </div>
    </section>
  )
}
