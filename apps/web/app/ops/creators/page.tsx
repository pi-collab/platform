import { createAdminClient } from '@/lib/supabase/admin'
import VettingActions from '@/components/ops/VettingActions'
import { opsSearchTerm, opsSearchFilter, stripLeadingAt } from '@/lib/ops-search'
import VettingBadge from '@/components/ops/VettingBadge'
import { VETTING_STATUSES, VETTING_LABEL, type VettingStatus } from '@/lib/vetting-status'
import OpsPagination, { opsRange, OpsTableScroll } from '@/components/ops/OpsPagination'
import { primaryAccount, socialProfileUrl } from '@/lib/social-url'

/** Must match FOLLOWER_RANGES in the creator onboarding form. */
const BANDS = ['Under 20k', '20k \u2013 50k', '50k \u2013 100k', '100k \u2013 500k', '500k \u2013 1M', '1M+']
const NOT_ANSWERED = 'none'
/** A uuid that cannot exist, for "match nothing": .in() rejects an empty list. */
const NO_MATCH = '00000000-0000-0000-0000-000000000000'
import { followerRangeOf } from '@/lib/follower-range'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OpsCreatorsPage({ searchParams }: {
  searchParams: { page?: string; band?: string | string[]; status?: string | string[]; shopfront?: string; q?: string }
}) {
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
  // Vetting status. Multi-select like the bands, and validated against the same
  // list the badge renders from so a hand-edited URL cannot reach the database.
  const rawStatus = searchParams?.status
  const statuses = (Array.isArray(rawStatus) ? rawStatus : rawStatus ? [rawStatus] : [])
    .filter((v): v is VettingStatus => (VETTING_STATUSES as string[]).includes(v))

  // Shopfront: yes, no, or unset. A tri-state radio rather than a checkbox,
  // because "no" is a real question here and an unchecked box cannot ask it.
  const shopfront = searchParams?.shopfront === 'yes' ? 'yes'
    : searchParams?.shopfront === 'no' ? 'no' : ''

  // Name or handle. A leading @ is stripped because that is how ops will type a
  // handle and how the creator writes it, but handles are stored bare.
  const term = stripLeadingAt(opsSearchTerm(searchParams?.q))

  const filterQuery = [
    ...(term ? [`q=${encodeURIComponent(term)}`] : []),
    ...selected.map((b) => `band=${encodeURIComponent(b)}`),
    ...statuses.map((v) => `status=${encodeURIComponent(v)}`),
    ...(shopfront ? [`shopfront=${shopfront}`] : []),
  ].join('&')
  const anyFilter = selected.length > 0 || statuses.length > 0 || shopfront !== '' || term !== ''

  const admin = createAdminClient()

  // Resolved BEFORE anything is filtered: the per-page storefront lookup further
  // down runs on the ids this page returned, which is too late to filter by, and
  // the summary counts need the same set. One id-only sweep of a small table.
  let shopfrontIds: string[] = []
  if (shopfront) {
    const { data: withShopfront } = await admin
      .from('creator_storefronts').select('creator_id')
    shopfrontIds = Array.from(new Set((withShopfront ?? []).map((r) => r.creator_id).filter(Boolean)))
  }

  // One definition per filter, applied to BOTH the list and the summary counts.
  // The counts previously carried only the bands, so filtering by status or
  // shopfront produced a breakdown that did not add up to the total above it.
  //
  // Unanswered is NULL, which .in() cannot express, so the two band cases are
  // separate filters rather than one clever OR. "Not answered" alongside bands
  // is not supported: a mixed selection would need an or() carrying quoted
  // values with spaces and an en dash inside a comma-separated filter string,
  // which fails at runtime, not at build.
  type Q = { is: Function; in: Function; not: Function; eq: Function; or: Function }
  const applyBands = <T extends Q>(q: T): T =>
    wantsUnanswered ? (q.is('follower_band', null) as T)
      : wantsBands.length ? (q.in('follower_band', wantsBands) as T)
        : q
  const applyStatus = <T extends Q>(q: T): T =>
    statuses.length ? (q.in('vetting_status', statuses) as T) : q
  const applyShopfront = <T extends Q>(q: T): T => {
    if (!shopfront) return q
    if (shopfront === 'yes') {
      // No storefronts at all means nothing can match, and .in() with an empty
      // list is a syntax error rather than an empty result.
      return shopfrontIds.length ? (q.in('id', shopfrontIds) as T) : (q.eq('id', NO_MATCH) as T)
    }
    return shopfrontIds.length ? (q.not('id', 'in', `(${shopfrontIds.join(',')})`) as T) : q
  }
  const applySearch = <T extends Q>(q: T): T =>
    term ? (q.or(opsSearchFilter(['full_name', 'handle'], term)) as T) : q
  const applyAll = <T extends Q>(q: T): T => applySearch(applyShopfront(applyStatus(applyBands(q))))

  const listQuery = applyAll(
    admin
      .from('creators')
      .select('id, full_name, phone, niches, handle, social_accounts, is_vetted, is_rejected, vetting_status, rate_card, created_at', { count: 'exact' })
      .order('created_at', { ascending: false }),
  )

  const { data: creators, error, count } = await listQuery.range(from, to)

  // Shopfronts for the creators on THIS page only. The list query is already
  // paginated and filtered, so a second lookup keyed to the ids we actually
  // have is cheaper than widening it into a join.
  const pageIds = (creators ?? []).map((c) => c.id)
  const { data: shopfronts } = pageIds.length
    ? await admin
        .from('creator_storefronts')
        .select('creator_id, slug, is_published')
        .in('creator_id', pageIds)
    : { data: [] as { creator_id: string; slug: string; is_published: boolean }[] }

  const shopfrontByCreator = new Map((shopfronts ?? []).map((sf) => [sf.creator_id, sf]))

  if (error) return <p style={{ color: 'red' }}>Error loading creators: {error.message}</p>

  const all = creators ?? []

  // Counted across the whole filtered set, not the page. `all` used to be every
  // creator, so counting it was right; once pagination landed it became the 50
  // rows on screen and the line read "50 total" against a table of 378.
  // Every filter, applied to the summary counts too. They previously carried
  // only the bands, so filtering by status or shopfront gave a breakdown that
  // did not add up to the total above it.
  const [vettedRes, rejectedRes, growthRes] = await Promise.all([
    applyAll(admin.from('creators').select('id', { count: 'exact', head: true }).eq('vetting_status', 'deals_approved')),
    applyAll(admin.from('creators').select('id', { count: 'exact', head: true }).eq('vetting_status', 'rejected')),
    applyAll(admin.from('creators').select('id', { count: 'exact', head: true }).eq('vetting_status', 'growth')),
  ])
  const total = count ?? 0
  const vetted = vettedRes.count ?? 0
  const rejected = rejectedRes.count ?? 0
  const growth = growthRes.count ?? 0
  // Growth counted separately rather than left inside pending: a Growth creator
  // HAS been reviewed, and pending is the queue ops actually works from.
  const pending = total - vetted - rejected - growth

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Creators</h1>
          <p style={{ color: '#666', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
            {total} total &middot; {vetted} for deals &middot; {growth} for growth &middot; {pending} pending &middot; {rejected} rejected
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
        {/* Inside the same form as the filters, so searching keeps them and a
            filter keeps the search. Carrying no `page` is deliberate: a new
            search must land on page one, or it lands on page 4 of 2 and looks
            like it found nothing. */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>Search</span>
          <input
            type="search"
            name="q"
            defaultValue={term}
            placeholder="Name or handle"
            aria-label="Search creators by name or handle"
            style={{ width: 190, padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: '0.8125rem' }}
          />
        </label>
        <span style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} aria-hidden="true" />
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
        {/* Break, so each filter reads as its own question rather than one long
            row of unrelated checkboxes. */}
        <span style={{ flexBasis: '100%', height: 0 }} />

        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>Status</span>
        {VETTING_STATUSES.map((v) => (
          <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8125rem' }}>
            <input type="checkbox" name="status" value={v} defaultChecked={statuses.includes(v)} />
            {VETTING_LABEL[v]}
          </label>
        ))}

        <span style={{ flexBasis: '100%', height: 0 }} />

        {/* Radios, not a checkbox: "no shopfront" is a question worth asking, and an
            unchecked box cannot distinguish it from "do not care". */}
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>Shopfront</span>
        {([['', 'Any'], ['yes', 'Has one'], ['no', 'None']] as [string, string][]).map(([val, label]) => (
          <label key={val || 'any'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8125rem' }}>
            <input type="radio" name="shopfront" value={val} defaultChecked={shopfront === val} />
            {label}
          </label>
        ))}

        <span style={{ flexBasis: '100%', height: 0 }} />


        <button type="submit" style={{ padding: '0.3rem 0.8rem', borderRadius: 6, border: '1px solid #111', background: '#111', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>Apply</button>
        {anyFilter && (
          <Link href="/ops/creators" style={{ fontSize: '0.8125rem', color: '#2563eb', textDecoration: 'none' }}>Clear</Link>
        )}
        {wantsUnanswered && wantsBands.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
            &ldquo;Not answered&rdquo; cannot be combined with bands, showing unanswered only.
          </span>
        )}
      </form>

      {all.length === 0 ? (
        // "No creators yet" is wrong when a search or filter is what emptied the
        // list, and it reads as though the table is broken.
        <p style={{ color: '#888', fontSize: '0.875rem' }}>
          {term
            ? `No creators match “${term}”${anyFilter && (selected.length || statuses.length || shopfront) ? ' with these filters' : ''}.`
            : anyFilter ? 'No creators match these filters.' : 'No creators yet.'}
        </p>
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
              <th style={thStyle}>Shopfront</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                {/* Vetting from the row. The detail page keeps its own copy: opening a
                    profile first is right when the decision is not obvious, and this is
                    for when it is. */}
                <th style={thStyle}>Decide</th>
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
                        if (!label) return '-'
                        const url = socialProfileUrl(acct.platform, label)
                        return url
                          ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>@{label}</a>
                          : <>@{label}</>
                      })()}
                    </td>
                    <td style={tdStyle}>{(c.niches as string[] | null)?.join(', ') || '-'}</td>
                    <td style={tdStyle}>{followerRangeOf(c.social_accounts) || '-'}</td>
                    <td style={tdStyle}>
                      {/* Links to the live page, so a shopfront can be looked at
                          without leaving the queue. A draft is named but not
                          linked — the public URL 404s until it is published. */}
                      {(() => {
                        const sf = shopfrontByCreator.get(c.id)
                        if (!sf) return <span style={{ color: '#bbb' }}>-</span>
                        if (!sf.is_published) {
                          return <span style={{ color: '#92400e', fontSize: '0.75rem', fontWeight: 600 }}>Draft</span>
                        }
                        return (
                          <a href={`/c/${sf.slug}`} target="_blank" rel="noopener noreferrer"
                             style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                            /c/{sf.slug}
                          </a>
                        )
                      })()}
                    </td>
                    <td style={tdStyle} data-ph-mask>{c.phone || '-'}</td>
                    <td style={tdStyle}>
                      <VettingBadge row={c} />
                    </td>
                    <td style={tdStyle}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={tdStyle}><VettingActions creator={c} /></td>
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
