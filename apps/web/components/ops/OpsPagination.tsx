import Link from 'next/link'

/** Rows per ops page. Big enough to scan, small enough to render. */
export const OPS_PAGE_SIZE = 50

/**
 * Turn `?page=` into a validated page number and a Postgres range.
 *
 * Tolerant on purpose: a hand-edited or stale URL should show page one, not an
 * error. Anything not a positive integer is treated as page one, and a page
 * past the end simply renders an empty table with a working Previous link.
 */
export function opsRange(pageParam: string | string[] | undefined) {
  const raw = Array.isArray(pageParam) ? pageParam[0] : pageParam
  const parsed = Number.parseInt(raw ?? '1', 10)
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  const from = (page - 1) * OPS_PAGE_SIZE
  return { page, from, to: from + OPS_PAGE_SIZE - 1 }
}

/**
 * Which page numbers to show.
 *
 * Always the first and last, always the current and its neighbours, with gaps
 * elsewhere. Paging one step at a time through a list of 150 creators is the
 * complaint this answers — you can jump.
 */
function pageWindow(page: number, lastPage: number): (number | 'gap')[] {
  if (lastPage <= 7) {
    return Array.from({ length: lastPage }, (_, i) => i + 1)
  }
  const out: (number | 'gap')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(lastPage - 1, page + 1)
  if (start > 2) out.push('gap')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < lastPage - 1) out.push('gap')
  out.push(lastPage)
  return out
}

/**
 * Pagination for an ops table.
 *
 * Links rather than buttons: each page is a real URL, so it can be shared,
 * bookmarked and reloaded, and the back button behaves. These lists get worked
 * through over a session rather than glanced at.
 */
export default function OpsPagination({
  page,
  total,
  basePath,
}: {
  page: number
  total: number
  basePath: string
}) {
  const lastPage = Math.max(1, Math.ceil(total / OPS_PAGE_SIZE))
  if (total <= OPS_PAGE_SIZE) return null

  const first = (page - 1) * OPS_PAGE_SIZE + 1
  const last = Math.min(page * OPS_PAGE_SIZE, total)

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginTop: '1rem',
        fontSize: '0.8125rem',
        color: '#555',
      }}
    >
      <span>
        {first}&ndash;{last} of {total}
      </span>

      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <PageLink href={`${basePath}?page=${page - 1}`} disabled={page <= 1}>
          Previous
        </PageLink>

        {pageWindow(page, lastPage).map((n, i) =>
          n === 'gap' ? (
            <span key={`gap-${i}`} style={{ padding: '0 0.25rem', color: '#bbb' }}>
              &hellip;
            </span>
          ) : (
            <PageLink
              key={n}
              href={`${basePath}?page=${n}`}
              disabled={false}
              current={n === page}
            >
              {n}
            </PageLink>
          ),
        )}

        <PageLink href={`${basePath}?page=${page + 1}`} disabled={page >= lastPage}>
          Next
        </PageLink>
      </div>
    </nav>
  )
}

function PageLink({
  href,
  disabled,
  current,
  children,
}: {
  href: string
  disabled: boolean
  current?: boolean
  children: React.ReactNode
}) {
  const style: React.CSSProperties = {
    minWidth: 32,
    padding: '0.35rem 0.6rem',
    borderRadius: 6,
    border: `1px solid ${current ? '#111' : '#e5e7eb'}`,
    background: current ? '#111' : disabled ? '#fafafa' : '#fff',
    color: current ? '#fff' : disabled ? '#bbb' : '#111',
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
  }
  // A disabled or current control is not a link. Rendering one anyway leaves it
  // keyboard focusable and announces a destination that is where you already
  // are, which is worse than it looking right.
  if (disabled || current) {
    return (
      <span style={style} aria-current={current ? 'page' : undefined} aria-disabled={disabled || undefined}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} style={style}>
      {children}
    </Link>
  )
}

/**
 * Horizontal scroll for a wide table.
 *
 * The ops tables carry seven or more columns and had no container, so on
 * anything narrower than a desktop they pushed the whole page sideways rather
 * than scrolling themselves.
 */
export function OpsTableScroll({ children }: { children: React.ReactNode }) {
  return <div style={{ overflowX: 'auto', width: '100%' }}>{children}</div>
}
