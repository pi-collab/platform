'use client'

import { useEffect } from 'react'

export default function AnimationProvider() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-animate]')

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            const delay = el.dataset.delay ? parseInt(el.dataset.delay, 10) : 0
            if (delay) {
              setTimeout(() => el.classList.add('in-view'), delay)
            } else {
              el.classList.add('in-view')
            }
            observer.unobserve(el)
          }
        })
      },
      { threshold: 0, rootMargin: '0px' }
    )

    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return null
}
