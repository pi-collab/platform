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

        {/* Only worth the space once the window starts hiding pages. Below that
            every page already has its own link. */}
        {lastPage > 7 && <PageJump basePath={basePath} lastPage={lastPage} />}
      </div>
    </nav>
  )
}

/**
 * Go straight to a page.
 *
 * The window above shows the first, the last and the current page's
 * neighbours, so on a list of 40 pages most of them cannot be reached without
 * stepping. This is the way to page 23.
 *
 * A plain GET form, so it works with no JavaScript and lands on a real URL like
 * every other control here. The filters currently applied are re-submitted as
 * hidden fields: a GET form REPLACES the query string of its action, so without
 * them, jumping a page would silently clear the band and status filters and
 * quietly show a different set of creators than the one being worked through.
 */
function PageJump({ basePath, lastPage }: { basePath: string; lastPage: number }) {
  const [path, queryString] = basePath.split('?')
  const carried = new URLSearchParams(queryString ?? '')
  carried.delete('page')

  return (
    <form
      action={path}
      method="get"
      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.4rem' }}
    >
      {Array.from(carried.entries()).map(([k, v], i) => (
        <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="ops-page-jump" style={{ color: '#777' }}>Go to</label>
      <input
        id="ops-page-jump"
        name="page"
        type="number"
        min={1}
        max={lastPage}
        placeholder={String(lastPage)}
        aria-label={`Go to page, 1 to ${lastPage}`}
        style={{
          width: 58,
          padding: '0.3rem 0.4rem',
          borderRadius: 6,
          border: '1px solid #e5e7eb',
          fontSize: '0.8125rem',
          textAlign: 'center',
        }}
      />
      <button
        type="submit"
        style={{
          padding: '0.35rem 0.6rem',
          borderRadius: 6,
          border: '1px solid #e5e7eb',
          background: '#fff',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Go
      </button>
    </form>
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
