'use client'

import Link from 'next/link'
import { useState } from 'react'
import { trackEvent } from '@/lib/analytics'
import { filterKeys, fmtCount, withoutFilter } from '@/lib/ai/rank-creators'
import {
  SEARCH_NICHES,
  type BriefFilters,
  type CreatorSearchError,
  type CreatorSearchResponse,
  type CreatorSearchResult,
  type FilterKey,
} from '@/lib/ai/creator-search-types'

/**
 * Guapd AI: one box for the brief, the filters it was read as (chips the brand
 * can remove or edit, which re-runs without the model), and the ranked
 * creators. Everything shown comes from /api/creators/search.
 */

const EXAMPLES = [
  'Luxury home-styling creators in India, aesthetic, home fragrance reels',
  'Fitness creators in Mumbai with 10k to 100k followers, under ₹30k per reel',
  'Food creators who make recipe reels, at least 3% engagement',
]

type Outcome = CreatorSearchResponse | CreatorSearchError

/** "50k", "1.5L", "2 lakh", "1cr" → a whole number. */
function amount(s: string): number | null {
  const m = s.trim().toLowerCase().replace(/[₹,\s]/g, '').match(/^(\d+(?:\.\d+)?)(k|m|l|lakh|lakhs|cr|crore)?$/)
  if (!m) return null
  const mult = { k: 1e3, m: 1e6, l: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7 }[m[2] as 'k'] ?? 1
  return Math.round(Number(m[1]) * mult)
}

/** "10k-50k", "50k+", "under 1L" → [min, max]. A lone number is `lone`. */
function range(s: string, lone: 'min' | 'max'): [number | null, number | null] | null {
  const t = s.toLowerCase().replace(/followers|budget|per reel|rupees/g, '').trim()
  const under = t.match(/^(?:under|below|upto|up to|<)\s*(.+)$/)
  if (under) { const v = amount(under[1]); return v === null ? null : [null, v] }
  const plus = t.match(/^(.+?)\s*\+$/) ?? t.match(/^(?:over|above|>)\s*(.+)$/)
  if (plus) { const v = amount(plus[1]); return v === null ? null : [v, null] }
  const pair = t.split(/\s*(?:-|–|to)\s*/)
  if (pair.length === 2) { const a = amount(pair[0]), b = amount(pair[1]); return a === null || b === null || a > b ? null : [a, b] }
  const v = amount(t)
  return v === null ? null : lone === 'min' ? [v, null] : [null, v]
}

/** A chip's edited text applied to the filters. Null = could not read it. */
function applyEdit(f: BriefFilters, key: FilterKey, text: string): BriefFilters | null {
  const v = text.trim()
  if (!v) return withoutFilter(f, key)
  const [kind, ...rest] = key.split(':')
  const old = rest.join(':')
  const swap = (xs: string[]) => Array.from(new Set(xs.map((x) => (x === old ? v.toLowerCase() : x))))
  switch (kind) {
    case 'niche': return SEARCH_NICHES.includes(v) ? { ...f, niches: Array.from(new Set(f.niches.map((n) => (n === old ? v : n)))) } : null
    case 'keyword': return { ...f, keywords: swap(f.keywords) }
    case 'city': return { ...f, cities: swap(f.cities) }
    case 'language': return { ...f, languages: swap(f.languages) }
    case 'country': return { ...f, country: v }
    case 'followers': { const r = range(v, 'min'); return r ? { ...f, followersMin: r[0], followersMax: r[1] } : null }
    case 'budget': { const r = range(v, 'max'); return r ? { ...f, budgetMinRupees: r[0], budgetMaxRupees: r[1] } : null }
    case 'engagement': { const n = Number(v.replace('%', '').replace('+', '').trim()); return Number.isFinite(n) && n >= 0 && n <= 100 ? { ...f, minEngagementPct: n } : null }
    default: return null
  }
}

/** The editable text for a chip: what a brand would type. */
function editText(f: BriefFilters, key: FilterKey, label: string): string {
  if (key === 'engagement') return String(f.minEngagementPct ?? '')
  if (key === 'followers') return label.replace(/ followers$/, '')
  if (key === 'budget') return label.replace(/ budget$/, '').replace(/₹/g, '')
  return label
}

export default function GuapdAiClient({ initial }: { initial: CreatorSearchResponse | null }) {
  const [brief, setBrief] = useState(initial?.brief ?? '')
  const [data, setData] = useState<CreatorSearchResponse | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState<{ key: FilterKey; text: string } | null>(null)
  const [chipError, setChipError] = useState<string | null>(null)

  async function call(body: object): Promise<Outcome> {
    try {
      const res = await fetch('/api/creators/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => null)
      if (json && typeof json.ok === 'boolean') return json as Outcome
      return { ok: false, kind: 'failed', message: res.status === 401 ? 'Sign in again to search.' : 'Could not search just now. Try again.' }
    } catch {
      return { ok: false, kind: 'failed', message: 'Could not reach Guapd. Check your connection and try again.' }
    }
  }

  async function search(text: string) {
    const b = text.trim()
    if (b.length < 3 || pending) return
    setPending(true); setError(null); setEditing(null); setChipError(null)
    const out = await call({ brief: b })
    setPending(false)
    if (!out.ok) { setError(out.message); return }
    setData(out)
    try { window.history.replaceState(null, '', `/ai?s=${out.searchId}`) } catch { /* the URL is a convenience */ }
    trackEvent('search_run', { source: 'brief', result_count: out.results.length, filter_count: filterKeys(out.filters).length })
  }

  async function rerun(filters: BriefFilters, field: string, action: 'remove' | 'edit' | 'loosen') {
    if (!data || pending) return
    setPending(true); setError(null); setChipError(null)
    const out = await call({ searchId: data.searchId, filters })
    setPending(false)
    if (!out.ok) { setError(out.message); return }
    setData(out); setEditing(null)
    trackEvent('filter_edited', { field, action, result_count: out.results.length })
  }

  function commitEdit() {
    if (!data || !editing) return
    const next = applyEdit(data.filters, editing.key, editing.text)
    if (!next) { setChipError('That could not be read. Try something like 10k-50k, 50k+ or under 1L.'); return }
    void rerun(next, editing.key.split(':')[0], 'edit')
  }

  const chips = data ? filterKeys(data.filters) : []

  return (
    <div className="gai">
      <header className="gai-head">
        <h1 className="gai-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>
          Guapd AI
        </h1>
        <p className="gai-sub">Find creators for your brief</p>
      </header>

      <form className="gai-box" onSubmit={(e) => { e.preventDefault(); void search(brief) }}>
        <textarea
          className="gai-input"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void search(brief) } }}
          placeholder="Describe the creators you want"
          aria-label="Describe the creators you want"
          maxLength={500}
          rows={3}
        />
        <button type="submit" className="gai-submit" disabled={pending || brief.trim().length < 3}>
          {pending ? 'Searching…' : 'Find creators'}
        </button>
      </form>

      {!data && !pending && (
        <div className="gai-examples" aria-label="Example briefs">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="gai-example" onClick={() => { setBrief(ex); void search(ex) }}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <p className="gai-error" role="alert">{error}</p>}

      {data && chips.length > 0 && (
        <div className="gai-chips" aria-label="Filters read from your brief">
          {chips.map(({ key, label }) => {
            const lang = key.startsWith('language:')
            if (editing?.key === key) {
              return (
                <span key={key} className="gai-chip gai-chip--edit">
                  {key.startsWith('niche:') ? (
                    <select autoFocus value={editing.text} onChange={(e) => setEditing({ key, text: e.target.value })} onBlur={commitEdit} aria-label="Niche">
                      {SEARCH_NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <input
                      autoFocus
                      value={editing.text}
                      onChange={(e) => setEditing({ key, text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } if (e.key === 'Escape') { setEditing(null); setChipError(null) } }}
                      onBlur={commitEdit}
                      aria-label={`Edit ${label}`}
                      size={Math.max(6, editing.text.length + 1)}
                    />
                  )}
                </span>
              )
            }
            return (
              <span key={key} className={`gai-chip gai-chip--${key.split(':')[0]}${lang ? ' gai-chip--unchecked' : ''}`} title={lang ? 'Not on file for creators yet, so not used' : 'Tap to edit'}>
                <button type="button" className="gai-chip-label" disabled={pending} onClick={() => setEditing({ key, text: editText(data.filters, key, label) })}>
                  {label}{lang && <em> · not checked</em>}
                </button>
                <button type="button" className="gai-chip-x" disabled={pending} aria-label={`Remove ${label}`} onClick={() => void rerun(withoutFilter(data.filters, key), key.split(':')[0], 'remove')}>×</button>
              </span>
            )
          })}
        </div>
      )}
      {chipError && <p className="gai-error" role="alert">{chipError}</p>}
      {data && data.notChecked.length > 0 && (
        <ul className="gai-notes">{data.notChecked.map((n) => <li key={n}>{n}</li>)}</ul>
      )}

      {pending && <p className="gai-loading" aria-live="polite">Finding creators...</p>}

      {data && !pending && (
        <section className="gai-results" aria-label="Creators">
          {data.notice && (
            <div className="gai-notice">
              <p>{data.notice}</p>
              {data.loosen && (
                <button type="button" className="gai-loosen" onClick={() => void rerun(withoutFilter(data.filters, data.loosen!.key), data.loosen!.key.split(':')[0], 'loosen')}>
                  Remove “{data.loosen.label}” to see {data.loosen.wouldShow}
                </button>
              )}
            </div>
          )}
          <ol className="gai-list">
            {data.results.map((r, i) => <ResultCard key={r.id} r={r} position={i + 1} searchId={data.searchId} />)}
          </ol>
        </section>
      )}
    </div>
  )
}

function ResultCard({ r, position, searchId }: { r: CreatorSearchResult; position: number; searchId: string }) {
  const initials = r.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  const clicked = () => trackEvent('result_clicked', { position, verified: !!r.verified })
  return (
    <li className="gai-card">
      <Link href={`/browse/${r.id}`} className="gai-card-top" onClick={clicked}>
        <span className="gai-photo">
          {r.photoUrl ? <img src={r.photoUrl} alt="" /> : <span aria-hidden="true">{initials}</span>}
        </span>
        <span className="gai-who">
          <span className="gai-name">{r.name}</span>
          <span className="gai-meta">{[r.handle ? `@${r.handle}` : null, r.city].filter(Boolean).join(' · ')}</span>
        </span>
      </Link>

      {r.nicheTags.length > 0 && (
        <div className="gai-tags">{r.nicheTags.map((t) => <span key={t} className="gai-tag">{t}</span>)}</div>
      )}

      {r.verified ? (
        <div className="gai-stats">
          <span className="gai-badge gai-badge--verified">Verified</span>
          <span>
            {[r.verified.followers !== null ? `${fmtCount(r.verified.followers)} followers` : null,
              r.verified.engagementPct !== null ? `${r.verified.engagementPct}% engagement` : null].filter(Boolean).join(' · ') || 'Instagram connected'}
          </span>
        </div>
      ) : (
        <div className="gai-stats gai-stats--self">
          <span className="gai-badge">Not verified</span>
          <span>
            {r.selfReported?.followers ? `${fmtCount(r.selfReported.followers)} followers, self-reported`
              : r.selfReported?.band ? `${r.selfReported.band} followers, self-reported` : 'No follower count on file'}
          </span>
        </div>
      )}

      <p className="gai-reason">{r.reason}</p>
      {r.gaps.length > 0 && <p className="gai-gaps">Not checked: {r.gaps.join(', ')}</p>}

      <Link
        href={`/deals/new?creator=${r.id}&back=ai&s=${searchId}`}
        className="gai-offer"
        onClick={() => trackEvent('offer_started_from_search', { position, verified: !!r.verified })}
      >
        Send offer
      </Link>
    </li>
  )
}
