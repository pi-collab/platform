'use client'

/**
 * The app's list pager: "Showing 1–8 of 23 …" with a pill of page buttons.
 * Lifted from the campaigns list so every list pages the same way at the same
 * size. Two modes: `onPage` (the list pages itself, as campaigns does) or
 * `hrefFor` (the server pages it: each page is a real URL that keeps the
 * search and filters).
 */
import Link from 'next/link'
import { LIST_PAGE_SIZE } from '@/lib/list-page'

export { LIST_PAGE_SIZE }

const arrowBtn = (on: boolean): React.CSSProperties => ({ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.35, cursor: on ? 'pointer' : 'default', textDecoration: 'none' })
const numBtn = (cur: boolean): React.CSSProperties => ({ minWidth: 34, height: 34, padding: '0 6px', borderRadius: 999, border: 'none', background: cur ? 'var(--ink)' : 'transparent', color: cur ? '#FFFFFF' : 'var(--ink-soft)', fontFamily: 'var(--font-num, var(--font-ui))', fontSize: 13, fontWeight: cur ? 700 : 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' })
const Prev = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
const Next = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>

/**
 * Which page buttons to draw: all of them up to 7 pages; beyond that the first,
 * the last, and the current page with its neighbours, gaps between. A 69-page
 * list drew 69 buttons over three rows before this.
 */
function pageWindow(page: number, last: number): (number | 'gap')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const out: (number | 'gap')[] = [1]
  const start = Math.max(2, Math.min(page - 1, last - 4))
  const end = Math.min(last - 1, Math.max(page + 1, 5))
  if (start > 2) out.push('gap')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < last - 1) out.push('gap')
  out.push(last)
  return out
}

export default function ListPager({ page, total, noun, pageSize = LIST_PAGE_SIZE, onPage, hrefFor, style }: {
  page: number
  total: number
  /** Singular; an "s" is added when there is more than one. */
  noun: string
  pageSize?: number
  onPage?: (n: number) => void
  hrefFor?: (n: number) => string
  style?: React.CSSProperties
}) {
  if (total <= 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const cur = Math.min(Math.max(1, page), totalPages)
  const from = (cur - 1) * pageSize + 1
  const to = Math.min(cur * pageSize, total)

  const Btn = ({ n, label, on, cs, children }: { n: number; label?: string; on: boolean; cs: React.CSSProperties; children: React.ReactNode }) =>
    hrefFor && on
      ? <Link href={hrefFor(n)} scroll={false} aria-label={label} aria-current={label ? undefined : n === cur ? 'page' : undefined} style={cs}>{children}</Link>
      : <button type="button" onClick={() => on && onPage?.(n)} disabled={!on && !!label} aria-label={label} aria-current={label ? undefined : n === cur ? 'page' : undefined} style={cs}>{children}</button>

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22, padding: '0 4px', flexWrap: 'wrap', ...style }}>
      <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Showing {from}&ndash;{to} of {total} {noun}{total !== 1 ? 's' : ''}
      </span>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, background: '#FFFFFF', border: '1px solid var(--border-hairline)', flexWrap: 'nowrap', maxWidth: '100%', overflowX: 'auto' }}>
          <Btn n={cur - 1} label="Previous page" on={cur > 1} cs={arrowBtn(cur > 1)}><Prev /></Btn>
          {pageWindow(cur, totalPages).map((n, i) => n === 'gap'
            ? <span key={`gap-${i}`} aria-hidden="true" style={{ minWidth: 20, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 13 }}>…</span>
            : <Btn key={n} n={n} on={n !== cur} cs={numBtn(n === cur)}>{n}</Btn>)}
          <Btn n={cur + 1} label="Next page" on={cur < totalPages} cs={arrowBtn(cur < totalPages)}><Next /></Btn>
        </div>
      )}
    </div>
  )
}
