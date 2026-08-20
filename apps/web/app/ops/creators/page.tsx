import { createAdminClient } from '@/lib/supabase/admin'
import OpsPagination, { opsRange, OpsTableScroll } from '@/components/ops/OpsPagination'
import { primaryAccount, socialProfileUrl } from '@/lib/social-url'

/** Must match FOLLOWER_RANGES in the creator onboarding form. */
const BANDS = ['Under 20k', '20k \u2013 50k', '50k \u2013 100k', '100k \u2013 500k', '500k \u2013 1M', '1M+']
const NOT_ANSWERED = 'none'
import { followerRangeOf } from '@/lib/follower-range'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OpsCreatorsPage({ searchParams }: { searchParams: { page?: string; band?: string | string[] } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const { page, from, to } = opsRange(searchParams?.page)

  // Multi-select over follower_band. Repeated ?band= params, so the filter is a
  // plain GET form with no client JavaScript and every result is a shareable
  // URL. Unknown values are dropped rather than handed to the database.
  const rawBand = searchParams?.band
  const selected = (Array.isArray(rawBand) ? rawBand : rawBand ? [rawBand] : [])
    .filter((b) => b === NOT_ANSWERED || BANDS.includes(b))
  const wantsUnanswered = selected.includes(NOT_ANSWERED)
  const wantsBands = selected.filter((b) => b !== NOT_ANSWERED)
  const filterQuery = selected.map((b) => `band=${encodeURIComponent(b)}`).join('&')

  const admin = createAdminClient()
  let listQuery = admin
    .from('creators')
    .select('id, full_name, phone, niches, handle, social_accounts, is_vetted, is_rejected, rate_card, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  // Unanswered is NULL, which .in() cannot express, so the two cases are
  // separate filters rather than one clever OR. "Not answered" alongside bands
  // is not supported and the form prevents choosing both — a mixed selection
  // would need an or() carrying quoted values with spaces and an en-dash inside
  // a comma-separated filter string, which fails at runtime, not at build.
  if (wantsUnanswered) {
    listQuery = listQuery.is('follower_band', null)
  } else if (wantsBands.length) {
    listQuery = listQuery.in('follower_band', wantsBands)
  }

  const { data: creators, error, count } = await listQuery.range(from, to)

  if (error) return <p style={{ color: 'red' }}>Error loading creators: {error.message}</p>

  const all = creators ?? []
  const vetted = all.filter((c) => c.is_vetted).length
  const rejected = all.filter((c) => c.is_rejected).length
  const pending = all.length - vetted - rejected

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Creators</h1>
          <p style={{ color: '#666', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
            {all.length} total &middot; {vetted} vetted &middot; {pending} pending &middot; {rejected} rejected
          </p>
        </div>
        <Link
          href="/ops/creators/new"
          style={{
            padding: '0.5rem 1rem',
            background: '#111',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: '0.8125rem',
            textDecoration: 'none',
          }}
        >
          + Add Creator
        </Link>
      </div>

      {/* A GET form: no client component, no state, and the resulting URL is
          the filter itself. Checkboxes because the question is "any of these". */}
      <form method="get" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', margin: '0 0 1rem', padding: '0.7rem 0.85rem', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>Followers</span>
        {BANDS.map((b) => (
          <label key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8125rem' }}>
            <input type="checkbox" name="band" value={b} defaultChecked={wantsBands.includes(b)} />
            {b}
          </label>
        ))}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8125rem', color: '#6b7280' }}>
          <input type="checkbox" name="band" value={NOT_ANSWERED} defaultChecked={wantsUnanswered} />
          Not answered
        </label>
        <button type="submit" style={{ padding: '0.3rem 0.8rem', borderRadius: 6, border: '1px solid #111', background: '#111', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>Apply</button>
        {selected.length > 0 && (
          <Link href="/ops/creators" style={{ fontSize: '0.8125rem', color: '#2563eb', textDecoration: 'none' }}>Clear</Link>
        )}
        {wantsUnanswered && wantsBands.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
            &ldquo;Not answered&rdquo; cannot be combined with bands &mdash; showing unanswered only.
          </span>
        )}
      </form>

      {all.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>No creators yet.</p>
      ) : (
        <>
          <OpsTableScroll>
            <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Handle</th>
                <th style={thStyle}>Niches</th>
                <th style={thStyle}>Audience</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {all.map((c) => {
                return (
                  <tr key={c.id}>
                    <td style={tdStyle}>
                      <Link href={`/ops/creators/${c.id}`} style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none', fontSize: '0.8125rem' }}>
                        {/* 89 creators verified a phone and never finished the
                            profile, so full_name is empty for them. Rendered raw
                            it produced an empty link — nothing to click, and a row
                            that reads as broken. The record still has to be
                            reachable: these are exactly the ones worth looking at. */}
                        {c.full_name?.trim()
                          || (c.handle ? `@${c.handle}` : null)
                          || <span style={{ color: '#9ca3af', fontStyle: 'italic', fontWeight: 500 }}>Signup incomplete</span>}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      {/* Opens the real profile, so a handle can be checked without
                          retyping it. Platform comes from social_accounts — primary_platform
                          is null on every row. An unknown platform renders plain text rather
                          than a link that would 404. */}
                      {(() => {
                        const acct = primaryAccount(c.social_accounts)
                        const label = c.handle || acct.handle
                        if (!label) return '—'
                        const url = socialProfileUrl(acct.platform, label)
                        return url
                          ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>@{label}</a>
                          : <>@{label}</>
                      })()}
                    </td>
                    <td style={tdStyle}>{(c.niches as string[] | null)?.join(', ') || '—'}</td>
                    <td style={tdStyle}>{followerRangeOf(c.social_accounts) || '—'}</td>
                    <td style={tdStyle} data-ph-mask>{c.phone || '—'}</td>
                    <td style={tdStyle}>
                      {c.is_vetted ? (
                        <span style={vettedBadge}>Vetted</span>
                      ) : c.is_rejected ? (
                        <span style={rejectedBadge}>Rejected</span>
                      ) : (
                        <span style={pendingBadge}>Pending</span>
                      )}
                    </td>
                    <td style={tdStyle}>{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                )
              })}
            </tbody>
        </table>
          </OpsTableScroll>
        <OpsPagination page={page} total={count ?? 0} basePath={filterQuery ? `/ops/creators?${filterQuery}` : '/ops/creators'} />
        </>
      )}
    </div>
  )
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #e5e5e5', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }
const tdStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0' }
const vettedBadge: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }
const pendingBadge: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }
const rejectedBadge: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }
