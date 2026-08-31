import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import OpsPagination, { opsRange, OpsTableScroll } from '@/components/ops/OpsPagination'
import { vettingStatusOf, VETTING_LABEL, type VettingStatus } from '@/lib/vetting-status'

export const dynamic = 'force-dynamic'

/**
 * Appeals from rejected creators.
 *
 * An appeal is an `events` row of type creator.appeal_submitted carrying the
 * creator id and the note. It was already mailed to ops and already visible on
 * the creator's own page, but there was no list — so working the queue meant
 * finding the emails, and an appeal that arrived while nobody was watching had
 * nowhere to be seen.
 *
 * The note is shown IN FULL on this page rather than behind a second click. It
 * is a few sentences someone wrote about being rejected, and the decision is
 * usually made from reading it; hiding it behind an expander only adds a step to
 * the one thing this page exists for. The link through to the profile is for
 * acting on it, which is where the vetting buttons live.
 *
 * Ordered oldest FIRST. Someone who has waited a fortnight should not be pushed
 * down the page by someone who wrote this morning.
 */
export default async function OpsAppealsPage({ searchParams }: {
  searchParams: { page?: string; show?: string }
}) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const admin = createAdminClient()
  const { page, from, to } = opsRange(searchParams?.page)

  // Open means the creator is still rejected. An appeal that was granted leaves
  // the row behind as a record, and it should not sit in the queue looking like
  // work.
  const showAll = searchParams?.show === 'all'

  const { data: rows, count, error } = await admin
    .from('events')
    .select('id, detail, created_at', { count: 'exact' })
    .eq('event_type', 'creator.appeal_submitted')
    .order('created_at', { ascending: true })
    .range(from, to)

  if (error) return <p style={{ color: 'red' }}>Error loading appeals: {error.message}</p>

  const appeals = (rows ?? []).map((r) => {
    const d = (r.detail ?? {}) as Record<string, unknown>
    return {
      id: r.id as string,
      creatorId: typeof d.creator_id === 'string' ? d.creator_id : '',
      note: typeof d.note === 'string' ? d.note : '',
      createdAt: r.created_at as string,
    }
  }).filter((a) => a.creatorId)

  // One lookup for the creators on THIS page. The appeal row carries only an id,
  // and a list of ids is not something anyone can action.
  const ids = Array.from(new Set(appeals.map((a) => a.creatorId)))
  const { data: creatorRows } = ids.length
    ? await admin
        .from('creators')
        .select('id, full_name, handle, vetting_status, is_vetted, is_rejected')
        .in('id', ids)
    : { data: [] as Record<string, unknown>[] }

  const byId = new Map(
    (creatorRows ?? []).map((c) => [c.id as string, c as Record<string, unknown>]),
  )

  const visible = showAll
    ? appeals
    : appeals.filter((a) => {
        const c = byId.get(a.creatorId)
        return c ? vettingStatusOf(c as never) === 'rejected' : true
      })

  const hiddenCount = appeals.length - visible.length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Appeals</h1>
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8125rem' }}>
          <Link
            href="/ops/appeals"
            style={{ color: showAll ? '#2563eb' : '#111', fontWeight: showAll ? 400 : 700, textDecoration: 'none' }}
          >
            Open
          </Link>
          <Link
            href="/ops/appeals?show=all"
            style={{ color: showAll ? '#111' : '#2563eb', fontWeight: showAll ? 700 : 400, textDecoration: 'none' }}
          >
            All
          </Link>
        </div>
      </div>

      {visible.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>
          {appeals.length === 0
            ? 'No appeals yet.'
            : 'No open appeals. Every appeal here has already been decided.'}
        </p>
      ) : (
        <>
          {!showAll && hiddenCount > 0 && (
            <p style={{ color: '#888', fontSize: '0.8125rem', margin: '0 0 0.75rem' }}>
              {hiddenCount} already decided and hidden. <Link href="/ops/appeals?show=all" style={{ color: '#2563eb' }}>Show all</Link>
            </p>
          )}

          <OpsTableScroll>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 520 }}>
              {visible.map((a) => {
                const c = byId.get(a.creatorId)
                const status: VettingStatus | null = c ? vettingStatusOf(c as never) : null
                const name = (c?.full_name as string) || 'Unknown creator'
                const handle = c?.handle as string | undefined

                return (
                  <article
                    key={a.id}
                    style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.85rem 1rem', background: '#fff' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <Link
                        href={`/ops/creators/${a.creatorId}`}
                        style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111', textDecoration: 'none' }}
                      >
                        {name}
                      </Link>
                      {handle && <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>@{handle}</span>}
                      {status && (
                        <span style={{
                          fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase',
                          padding: '0.1rem 0.45rem', borderRadius: 999,
                          background: status === 'rejected' ? '#fee2e2' : '#dcfce7',
                          color: status === 'rejected' ? '#991b1b' : '#166534',
                        }}>
                          {VETTING_LABEL[status]}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    {/* preserveWhitespace: they wrote paragraphs, and collapsing
                        them turns an argument into a wall. */}
                    <p style={{
                      margin: '0.6rem 0 0', fontSize: '0.875rem', lineHeight: 1.65, color: '#374151',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {a.note || <em style={{ color: '#9ca3af' }}>No note was written.</em>}
                    </p>

                    <div style={{ marginTop: '0.7rem' }}>
                      <Link
                        href={`/ops/creators/${a.creatorId}`}
                        style={{ fontSize: '0.8125rem', color: '#2563eb', textDecoration: 'none' }}
                      >
                        Open profile to decide &rarr;
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </OpsTableScroll>

          <OpsPagination
            page={page}
            total={count ?? 0}
            basePath={showAll ? '/ops/appeals?show=all' : '/ops/appeals'}
          />
        </>
      )}
    </div>
  )
}
