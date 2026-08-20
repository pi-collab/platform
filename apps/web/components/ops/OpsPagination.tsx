import Link from 'next/link'

/** Rows per ops page. Big enough to scan, small enough to render. */
export const OPS_PAGE_SIZE = 50

/**
 * Turn `?page=` into a validated page number and a Postgres range.
 *
 * Tolerant on purpose: a hand-edited or stale URL should show page one, not an
 * error. Anything not a positive integer is treated as page one, and a page
 * past the end simply renders an empty table with working Previous link.
 */
export function opsRange(pageParam: string | string[] | undefined) {
  const raw = Array.isArray(pageParam) ? pageParam[0] : pageParam
  const parsed = Number.parseInt(raw ?? '1', 10)
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  const from = (page - 1) * OPS_PAGE_SIZE
  return { page, from, to: from + OPS_PAGE_SIZE - 1 }
}

/**
 * Previous / next for an ops table.
 *
 * Links rather than buttons: each page is a real URL, so it can be shared,
 * bookmarked and reloaded, and the back button behaves. That matters here
 * because these lists are worked through over a session rather than glanced at.
 *
 * `total` comes from a count on the same query, so the last page is known and
 * Next can be disabled rather than leading somewhere empty.
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginTop: '1rem',
        fontSize: '0.8125rem',
        color: '#555',
      }}
    >
      <span>
        {first}&ndash;{last} of {total}
      </span>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <PageLink href={`${basePath}?page=${page - 1}`} disabled={page <= 1}>
          Previous
        </PageLink>
        <span style={{ alignSelf: 'center' }}>
          Page {page} of {lastPage}
        </span>
        <PageLink href={`${basePath}?page=${page + 1}`} disabled={page >= lastPage}>
          Next
        </PageLink>
      </div>
    </div>
  )
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  const style: React.CSSProperties = {
    padding: '0.35rem 0.75rem',
    borderRadius: 6,
    border: '1px solid #e5e7eb',
    fontWeight: 600,
    textDecoration: 'none',
    color: disabled ? '#bbb' : '#111',
    background: disabled ? '#fafafa' : '#fff',
    pointerEvents: disabled ? 'none' : undefined,
  }
  // A disabled control must not be a link at all, or it stays keyboard
  // focusable and reachable despite pointer-events.
  if (disabled) return <span style={style} aria-disabled="true">{children}</span>
  return <Link href={href} style={style}>{children}</Link>
}
