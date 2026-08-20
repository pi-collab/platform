'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/** How long a navigation may take before it is worth saying anything. */
const QUIET_MS = 150

/** Give up and hide, so a cancelled or failed navigation cannot strand the bar. */
const MAX_MS = 8000

/**
 * A thin progress bar for navigations between marketing pages.
 *
 * The pages render fast enough that a click can feel like nothing happened —
 * the old page stays on screen for a beat, and on a slow connection for longer.
 *
 * Deliberately NOT a loading.tsx skeleton or a blocking overlay. A skeleton
 * flashes on every fast navigation, which reads as jank on exactly the
 * transitions that were already fine; an overlay hides a page that is still
 * perfectly usable. This says "something is happening" and nothing more.
 *
 * Nothing appears for the first QUIET_MS, so the common case — a navigation
 * that completes almost immediately — shows no bar at all. Only the ones slow
 * enough to be noticed get feedback.
 *
 * Next 14 has no navigation-start event (useLinkStatus is 15+), so the start is
 * inferred from a click on an internal link and the end from the pathname
 * actually changing.
 */
export default function NavProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const showTimer = useRef<ReturnType<typeof setTimeout>>()
  const giveUpTimer = useRef<ReturnType<typeof setTimeout>>()

  const stop = () => {
    clearTimeout(showTimer.current)
    clearTimeout(giveUpTimer.current)
    setVisible(false)
  }

  // The new page has rendered. Whatever was pending is done.
  useEffect(() => {
    stop()
  }, [pathname])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Let the browser have the ones it should handle: modified clicks open a
      // new tab, and a handler that already called preventDefault is doing
      // something other than navigating.
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = (e.target as HTMLElement | null)?.closest?.('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      // Internal paths only. Not "//host", not "https://", not "#anchor" — an
      // in-page anchor navigates nothing and would leave the bar running until
      // it timed out.
      if (!href || !href.startsWith('/') || href.startsWith('//')) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return
      if (href.split('?')[0].split('#')[0] === pathname) return

      clearTimeout(showTimer.current)
      clearTimeout(giveUpTimer.current)
      showTimer.current = setTimeout(() => setVisible(true), QUIET_MS)
      giveUpTimer.current = setTimeout(() => setVisible(false), MAX_MS)
    }

    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
      clearTimeout(showTimer.current)
      clearTimeout(giveUpTimer.current)
    }
  }, [pathname])

  if (!visible) return null

  return (
    <div className="navprog" role="presentation">
      <span className="navprog__bar" />
    </div>
  )
}
