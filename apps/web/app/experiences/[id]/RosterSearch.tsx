'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ListPager from '@/components/ListPager'

/**
 * 0569: search and page the brand's creators. Only ever the creators Guapd has
 * shared with this brand on this Experience: the search runs in the database
 * over that list (brand_experience_roster_page), never over the directory.
 * `?rq=` and `?rpage=` keep it a real URL.
 */
export function RosterSearchBox({ initial }: { initial: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, start] = useTransition()
  const [q, setQ] = useState(initial)
  useEffect(() => {
    if (q.trim() === initial) return
    const t = setTimeout(() => {
      const sp = new URLSearchParams(params?.toString() ?? '')
      if (q.trim()) sp.set('rq', q.trim()); else sp.delete('rq')
      sp.delete('rpage')
      start(() => router.replace(`${pathname}?${sp.toString()}#bx-creators`, { scroll: false }))
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  return (
    <input className="dinput" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100}
      placeholder="Search your creators by name or @handle" aria-label="Search your creators" style={{ height: 40, marginTop: 14, width: '100%', maxWidth: 360 }} />
  )
}

export function RosterPager({ page, total }: { page: number; total: number }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const hrefFor = (n: number) => {
    const sp = new URLSearchParams(params?.toString() ?? '')
    if (n > 1) sp.set('rpage', String(n)); else sp.delete('rpage')
    return `${pathname}?${sp.toString()}#bx-creators`
  }
  return <ListPager page={page} total={total} noun="creator" hrefFor={hrefFor} />
}
