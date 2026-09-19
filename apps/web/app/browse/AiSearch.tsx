'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { aiCreatorSearch, rerankWithFilters } from './ai-search-actions'
import type { SearchFilters, SearchOutcome, SearchResult } from '@/lib/ai-search/types'

/**
 * Describe the creators you want, in a sentence.
 *
 * Three things this screen is careful about, all for the same reason - a brand
 * cannot check the AI's work, so the screen has to show it:
 *   1. WHAT IT UNDERSTOOD is displayed as chips before the results, and every
 *      chip is removable. A misread query is then visibly a misread query
 *      rather than a thin list, and correcting it costs nothing.
 *   2. WHY EACH CREATOR MATCHED is a line of stored facts under their name.
 *   3. WHAT COULD NOT BE CHECKED is said out loud, per creator and per filter.
 *      Most creators have no city and no verified audience data today, and a
 *      search that quietly ignored that would look like an answer.
 */

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 10px', borderRadius: 999,
  border: '1px solid var(--border-hairline)', background: '#fff',
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink)',
}

const strengthLabel = { strong: 'Strong match', good: 'Good match', possible: 'Possible match' } as const
const strengthColour = { strong: '#4F6B12', good: '#6A6C5F', possible: '#8A8C7E' } as const

export default function AiSearch({ configured }: { configured: boolean }) {
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    const q = query.trim()
    if (!q || pending) return
    startTransition(async () => setOutcome(await aiCreatorSearch(q)))
  }

  /** Editing a chip re-ranks in code. It never spends another model call, so a
   *  brand can correct the parse as often as they like. */
  function dropFilter(mutate: (f: SearchFilters) => SearchFilters) {
    if (!outcome?.ok || pending) return
    const next = mutate(structuredClone(outcome.filters))
    startTransition(async () => setOutcome(await rerankWithFilters(next)))
  }

  if (!configured) return null

  const chips: { label: string; drop: (f: SearchFilters) => SearchFilters }[] = []
  if (outcome?.ok) {
    const f = outcome.filters
    for (const n of f.niches) chips.push({ label: n, drop: x => ({ ...x, niches: x.niches.filter(v => v !== n) }) })
    for (const p of f.platforms) chips.push({ label: p === 'instagram' ? 'Instagram' : 'YouTube', drop: x => ({ ...x, platforms: x.platforms.filter(v => v !== p) }) })
    for (const l of f.locations) chips.push({ label: l, drop: x => ({ ...x, locations: x.locations.filter(v => v !== l) }) })
    if (f.followersMin !== null || f.followersMax !== null) {
      const label = f.followersMin && f.followersMax
        ? `${Math.round(f.followersMin / 1000)}k to ${Math.round(f.followersMax / 1000)}k followers`
        : f.followersMin ? `${Math.round(f.followersMin / 1000)}k+ followers`
          : `up to ${Math.round((f.followersMax ?? 0) / 1000)}k followers`
      chips.push({ label, drop: x => ({ ...x, followersMin: null, followersMax: null }) })
    }
    if (f.budgetRupees !== null) {
      chips.push({ label: `₹${f.budgetRupees.toLocaleString('en-IN')} budget`, drop: x => ({ ...x, budgetRupees: null }) })
    }
    if (f.audience.genderSkew) chips.push({ label: `audience mostly ${f.audience.genderSkew}`, drop: x => ({ ...x, audience: { ...x.audience, genderSkew: null } }) })
    for (const a of f.audience.ageBands) chips.push({ label: `audience ${a}`, drop: x => ({ ...x, audience: { ...x.audience, ageBands: x.audience.ageBands.filter(v => v !== a) } }) })
    for (const c of f.audience.cities) chips.push({ label: `audience in ${c}`, drop: x => ({ ...x, audience: { ...x.audience, cities: x.audience.cities.filter(v => v !== c) } }) })
    for (const b of f.pastBrandCategories) chips.push({ label: `worked with ${b}`, drop: x => ({ ...x, pastBrandCategories: x.pastBrandCategories.filter(v => v !== b) } as SearchFilters) })
  }

  return (
    <section style={{ maxWidth: 1080, margin: '0 auto 26px' }}>
      <div style={{
        background: '#fff', border: '1px solid var(--border-hairline)', borderRadius: 16,
        padding: '16px 18px',
      }}>
        <label htmlFor="ai-search" style={{
          display: 'block', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700,
          letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 8,
        }}>
          Describe who you are looking for
        </label>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            id="ai-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') run() }}
            maxLength={400}
            placeholder="Fitness creators in Mumbai, 50k+ followers, budget ₹40,000"
            style={{
              flex: '1 1 320px', minWidth: 0,
              fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)',
              padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border-hairline)', background: '#FBFBF8',
            }}
          />
          <button
            type="button"
            onClick={run}
            disabled={pending || query.trim().length === 0}
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700,
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: query.trim() && !pending ? 'var(--lime-400, #E8FF66)' : '#EDEDE6',
              color: 'var(--lime-950, #161B08)',
              cursor: query.trim() && !pending ? 'pointer' : 'default',
            }}
          >
            {pending ? 'Searching…' : 'Search'}
          </button>
        </div>

        {outcome && !outcome.ok && (
          <p role="status" style={{ margin: '12px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
            {outcome.message}
          </p>
        )}

        {outcome?.ok && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 14 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)' }}>Understood as</span>
              {chips.length === 0 && (
                <span style={{ ...chipStyle, color: 'var(--ink-soft)' }}>no filters — showing everyone</span>
              )}
              {chips.map(c => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => dropFilter(c.drop)}
                  title="Remove this filter"
                  style={{ ...chipStyle, cursor: 'pointer' }}
                >
                  {c.label}
                  <span aria-hidden="true" style={{ color: 'var(--ink-faint)', fontWeight: 700 }}>×</span>
                </button>
              ))}
            </div>

            {outcome.filters.unusedTerms.length > 0 && (
              <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                Not used: {outcome.filters.unusedTerms.join(', ')}. We only match on what creators have actually filled in or verified.
              </p>
            )}

            {outcome.softened.map(s => (
              <p key={s.label} style={{ margin: '6px 0 0', fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                <strong style={{ color: 'var(--ink)' }}>{s.label}:</strong> {s.reason}.
              </p>
            ))}
          </>
        )}
      </div>

      {outcome?.ok && (
        <div style={{ marginTop: 16 }}>
          {outcome.results.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)' }}>
              No creators matched. Remove a filter above, or use the filters below.
            </p>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 10px' }}>
                {outcome.results.length} creator{outcome.results.length === 1 ? '' : 's'}, best first
                {outcome.excludedCount > 0 && ` · ${outcome.excludedCount} ruled out by your filters`}
              </p>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {outcome.results.map(r => <ResultRow key={r.candidate.id} result={r} />)}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function ResultRow({ result }: { result: SearchResult }) {
  const c = result.candidate
  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: '#fff', border: '1px solid var(--border-hairline)', borderRadius: 14, padding: '12px 14px',
    }}>
      {c.photoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={c.photoUrl} alt="" width={44} height={44} style={{ borderRadius: 11, objectFit: 'cover', flexShrink: 0 }} />
        : <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 11, background: '#EDEDE6', flexShrink: 0 }} />}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{c.fullName}</span>
          {c.handle && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>@{c.handle}</span>}
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 700, color: strengthColour[result.strength] }}>
            {strengthLabel[result.strength]}
          </span>
        </div>

        {/* Every item here was read from a stored field a moment ago. */}
        <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)' }}>
          {result.reasons.length > 0 ? result.reasons.join(' · ') : 'Matches your search on what is on file'}
        </p>

        {result.gaps.length > 0 && (
          <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)' }}>
            {result.gaps.join(' · ')}
          </p>
        )}
      </div>

      <Link
        href={`/browse/${c.id}`}
        style={{
          fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          color: 'var(--ink)', textDecoration: 'none',
          border: '1px solid var(--border-hairline)', borderRadius: 999, padding: '7px 14px',
        }}
      >
        View
      </Link>
    </li>
  )
}
