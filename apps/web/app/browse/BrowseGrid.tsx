'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { BrowseCreator } from './page'
import { NICHES } from '@/lib/niches'

/**
 * Client-side filtering is appropriate at pilot scale (tens to low hundreds of creators).
 * TODO: Move to server-side filtering + pagination if the vetted roster grows past ~500.
 */

/* ── Bracket definitions ───────────────────────────────────────── */

interface Bracket { label: string; min?: number; max?: number }

// Follower brackets — values are actual follower counts
const FOLLOWER_BRACKETS: Bracket[] = [
  { label: '< 50K', max: 50_000 },
  { label: '50K – 100K', min: 50_000, max: 100_000 },
  { label: '100K – 500K', min: 100_000, max: 500_000 },
  { label: '500K – 1M', min: 500_000, max: 1_000_000 },
  { label: '1M+', min: 1_000_000 },
]

// Rate brackets — values are in PAISE (₹ × 100)
const RATE_BRACKETS: Bracket[] = [
  { label: '< ₹10K', max: 10_000_00 },
  { label: '₹10K – ₹25K', min: 10_000_00, max: 25_000_00 },
  { label: '₹25K – ₹50K', min: 25_000_00, max: 50_000_00 },
  { label: '₹50K – ₹1L', min: 50_000_00, max: 1_00_000_00 },
  { label: '₹1L – ₹3L', min: 1_00_000_00, max: 3_00_000_00 },
  { label: '₹3L+', min: 3_00_000_00 },
]

// Budget brackets — values are in PAISE. Compared against creator's LOWEST rate.
const BUDGET_BRACKETS: Bracket[] = [
  { label: '< ₹25K', max: 25_000_00 },
  { label: '₹25K – ₹50K', min: 25_000_00, max: 50_000_00 },
  { label: '₹50K – ₹1L', min: 50_000_00, max: 1_00_000_00 },
  { label: '₹1L – ₹3L', min: 1_00_000_00, max: 3_00_000_00 },
  { label: '₹3L+', min: 3_00_000_00 },
]

/* ── Helpers ────────────────────────────────────────────────────── */

function rateRange(rc: Record<string, number> | null): { min: number; max: number } | null {
  if (!rc) return null
  const values = Object.values(rc).filter((v) => v > 0)
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

function bestFollowers(sa: Array<{ follower_count: number | null }> | null): number {
  if (!sa || sa.length === 0) return 0
  return Math.max(0, ...sa.map((s) => s.follower_count ?? 0))
}

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return n.toLocaleString('en-IN')
}

function primarySocial(sa: Array<{ platform: string; handle: string; follower_count: number | null }> | null) {
  if (!sa || sa.length === 0) return null
  return sa.reduce((best, cur) =>
    (cur.follower_count ?? 0) > (best.follower_count ?? 0) ? cur : best
  , sa[0])
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

/* ── Component ──────────────────────────────────────────────────── */

export default function BrowseGrid({ creators }: { creators: BrowseCreator[] }) {
  const [search, setSearch] = useState('')
  const [nicheFilter, setNicheFilter] = useState('')
  const [followerBracket, setFollowerBracket] = useState('')
  const [rateBracket, setRateBracket] = useState('')
  const [budgetBracket, setBudgetBracket] = useState('')

  const filtered = useMemo(() => {
    const fb = followerBracket ? FOLLOWER_BRACKETS[parseInt(followerBracket, 10)] : null
    const rb = rateBracket ? RATE_BRACKETS[parseInt(rateBracket, 10)] : null
    const bb = budgetBracket ? BUDGET_BRACKETS[parseInt(budgetBracket, 10)] : null

    return creators.filter((c) => {
      // Search
      if (search) {
        const q = search.toLowerCase()
        const nameMatch = c.full_name.toLowerCase().includes(q)
        const handleMatch = c.handle?.toLowerCase().includes(q)
        if (!nameMatch && !handleMatch) return false
      }

      // Niche — creator's niches array contains the selected niche
      if (nicheFilter && !(c.niches ?? []).includes(nicheFilter)) return false

      // Followers — compare against creator's highest follower count
      if (fb) {
        const followers = bestFollowers(c.social_accounts)
        if (fb.min !== undefined && followers < fb.min) return false
        if (fb.max !== undefined && followers > fb.max) return false
      }

      // Rate range — show creator if ANY rate falls within the bracket
      if (rb) {
        if (!c.rate_card) return false
        const rates = Object.values(c.rate_card).filter((v) => v > 0)
        if (rates.length === 0) return false
        const anyInRange = rates.some((r) => {
          if (rb.min !== undefined && r < rb.min) return false
          if (rb.max !== undefined && r > rb.max) return false
          return true
        })
        if (!anyInRange) return false
      }

      // Budget — show creators whose LOWEST rate ≤ budget bracket max
      // "Can I afford to work with them at all?"
      if (bb) {
        if (!c.rate_card) return false
        const rates = Object.values(c.rate_card).filter((v) => v > 0)
        if (rates.length === 0) return false
        const lowestRate = Math.min(...rates)
        if (bb.max !== undefined && lowestRate > bb.max) return false
        if (bb.min !== undefined && lowestRate < bb.min) return false
      }

      return true
    })
  }, [creators, search, nicheFilter, followerBracket, rateBracket, budgetBracket])

  const hasFilters = search || nicheFilter || followerBracket || rateBracket || budgetBracket

  return (
    <div>
      {/* Filters */}
      <div style={filterBar}>
        <input
          style={{ ...filterInput, flex: 2 }}
          placeholder="Search by name or handle..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={{ ...filterInput, flex: 1 }} value={nicheFilter} onChange={(e) => setNicheFilter(e.target.value)}>
          <option value="">All niches</option>
          {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select style={filterInput} value={followerBracket} onChange={(e) => setFollowerBracket(e.target.value)}>
          <option value="">Followers</option>
          {FOLLOWER_BRACKETS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
        </select>
      </div>
      <div style={{ ...filterBar, marginTop: '0.5rem' }}>
        <select style={filterInput} value={rateBracket} onChange={(e) => setRateBracket(e.target.value)}>
          <option value="">Rate range</option>
          {RATE_BRACKETS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
        </select>
        <select style={{ ...filterInput, flex: 1.5 }} value={budgetBracket} onChange={(e) => setBudgetBracket(e.target.value)}>
          <option value="">My budget</option>
          {BUDGET_BRACKETS.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setNicheFilter(''); setFollowerBracket(''); setRateBracket(''); setBudgetBracket('') }}
            style={clearBtn}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Results count */}
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '1.25rem 0 1rem' }}>
        {filtered.length} creator{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== creators.length && ` (of ${creators.length})`}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-subtle)' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>No creators match your filters</p>
          <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div style={gridStyle}>
          {filtered.map((c) => (
            <CreatorCard key={c.id} creator={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function CreatorCard({ creator: c }: { creator: BrowseCreator }) {
  const range = rateRange(c.rate_card)
  const primary = primarySocial(c.social_accounts)
  const workedCount = c.worked_with?.length ?? 0

  return (
    <Link href={`/browse/${c.id}`} style={cardStyle}>
      {/* Avatar */}
      <div style={avatarArea}>
        {c.profile_photo_url ? (
          <img src={c.profile_photo_url} alt={c.full_name} style={avatarImg} />
        ) : (
          <div style={avatarFallback}>{initials(c.full_name)}</div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={cardName}>{c.full_name}</p>
        {(c.niches ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            {c.niches.map((n) => <span key={n} style={nicheBadge}>{n}</span>)}
          </div>
        )}

        {/* Primary social */}
        {primary && (
          <p style={cardMeta}>
            <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{primary.platform}</span>
            {primary.handle && <> · {primary.handle}</>}
            {primary.follower_count != null && primary.follower_count > 0 && (
              <> · {formatFollowers(primary.follower_count)} followers</>
            )}
          </p>
        )}

        {/* Rate range */}
        {range && (
          <p style={{ ...cardMeta, fontWeight: 600, color: 'var(--color-heading)' }}>
            {range.min === range.max
              ? formatRupees(range.min)
              : `${formatRupees(range.min)} – ${formatRupees(range.max)}`
            }
          </p>
        )}

        {/* Worked with */}
        {workedCount > 0 && (
          <p style={{ ...cardMeta, fontSize: '0.7rem' }}>
            Worked with {workedCount} brand{workedCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </Link>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const filterBar: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
}

const filterInput: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.8125rem',
  outline: 'none',
  background: 'var(--glass-bg)',
  minWidth: 120,
  flex: 1,
}

const clearBtn: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.8125rem',
  fontWeight: 600,
  background: 'var(--section-bg-alt)',
  color: 'var(--color-muted)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '1rem',
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  padding: '1.25rem',
  background: 'var(--glass-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  textDecoration: 'none',
  color: 'inherit',
  transition: 'box-shadow 0.15s, border-color 0.15s',
}

const avatarArea: React.CSSProperties = {
  flexShrink: 0,
}

const avatarImg: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 'var(--radius-sm)',
  objectFit: 'cover',
  border: '1px solid var(--color-border)',
}

const avatarFallback: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--section-bg-alt)',
  border: '1px solid var(--color-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: '1rem',
  color: 'var(--color-muted)',
  fontFamily: 'var(--font-heading)',
}

const cardName: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: '1rem',
  color: 'var(--color-heading)',
  margin: '0 0 0.25rem',
}

const nicheBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '0.6875rem',
  fontWeight: 600,
  padding: '0.125rem 0.5rem',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--section-bg-alt)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-body)',
  marginBottom: '0.375rem',
}

const cardMeta: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--color-muted)',
  margin: '0.2rem 0 0',
  lineHeight: 1.4,
}
