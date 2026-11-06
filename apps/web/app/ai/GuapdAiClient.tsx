'use client'

import Link from 'next/link'
import MetaSection, { type MetaState } from './MetaSection'
import { CARD_NOT_VERIFIED, CARD_SELF_REPORTED } from '@/lib/ai/search-visibility-copy'
import { useEffect, useState } from 'react'
import { trackEvent } from '@/lib/analytics'
import { fmtCount } from '@/lib/ai/rank-creators'
import { applyEdit, chipsFor, editText, withoutFilter } from '@/lib/ai/filter-chips'
import {
  CONTENT_LANGUAGES,
  MAX_BRIEF,
  SEARCH_NICHES,
  type BriefFilters,
  type Chip,
  type ChipGroup,
  type CreatorSearchError,
  type CreatorSearchResponse,
  type CreatorSearchPage,
  type CreatorSearchResult,
  PAGE_SIZE,
} from '@/lib/ai/creator-search-types'

/**
 * Guapd AI: one box for the brief (a sentence or a full campaign brief), how it
 * was read, the filters it became (four chip groups the brand can remove or
 * edit, which re-runs without the model), and the ranked creators.
 */

const EXAMPLES = [
  'Luxury home-styling creators in India, aesthetic, home fragrance reels',
  'Fitness creators in Mumbai with 10k to 100k followers, under ₹30k per reel',
  'Food creators who make recipe reels, at least 3% engagement',
]

const GROUPS: { id: ChipGroup; title: string }[] = [
  { id: 'hard', title: 'Must match' },
  { id: 'must', title: 'Must have' },
  { id: 'nice', title: 'Nice to have' },
  { id: 'exclude', title: 'Exclude' },
]

type Outcome = CreatorSearchResponse | CreatorSearchError

export default function GuapdAiClient({ initial, meta }: { initial: CreatorSearchResponse | null; meta: MetaState | null }) {
  const [brief, setBrief] = useState(initial?.brief ?? '')
  const [data, setData] = useState<CreatorSearchResponse | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState<{ chip: Chip; text: string } | null>(null)
  const [chipError, setChipError] = useState<string | null>(null)
  const [source, setSource] = useState<'guapd' | 'instagram' | 'both'>('guapd')
  const [loadingMore, setLoadingMore] = useState(false)
  const [pagedOnce, setPagedOnce] = useState(false)

  // Load more: the next page of the stored order (server-side, no repeats).
  async function loadMore() {
    if (!data || loadingMore || !data.hasMore) return
    setLoadingMore(true); setError(null)
    const res = await fetch('/api/creators/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searchId: data.searchId, more: true }) }).catch(() => null)
    const j = (await res?.json().catch(() => null)) as CreatorSearchPage | CreatorSearchError | null
    setLoadingMore(false)
    if (!j || !j.ok) { setError(j && !j.ok ? j.message : 'Could not load more just now. Try again.'); return }
    const seen = new Set(data.results.map((r) => r.id))
    setData({ ...data, results: [...data.results, ...j.results.filter((r) => !seen.has(r.id))], hasMore: j.hasMore })
    setPagedOnce(true)
    trackEvent('search_load_more', { shown: j.shown })
  }

  // After a Facebook login round trip (?meta=...): the connect outcome event.
  useEffect(() => {
    if (!meta?.connectResult) return
    if (meta.connectResult.startsWith('connected')) trackEvent('ai_connect_completed')
    else trackEvent('ai_connect_failed', { reason: meta.connectResult })
  }, [meta?.connectResult])

  const length = brief.trim().length
  const over = length > MAX_BRIEF

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
    if (b.length < 3 || b.length > MAX_BRIEF || pending) return
    setPending(true); setError(null); setEditing(null); setChipError(null)
    const out = await call({ brief: b })
    setPending(false)
    if (!out.ok) { setError(out.message); return }
    setData(out); setPagedOnce(false)
    try { window.history.replaceState(null, '', `/ai?s=${out.searchId}`) } catch { /* the URL is a convenience */ }
    trackEvent('search_run', { source: 'brief', result_count: out.results.length, filter_count: chipsFor(out.filters).length, brief_chars: b.length, asked_question: !!out.filters.question })
  }

  async function rerun(filters: BriefFilters, chip: Chip, action: 'remove' | 'edit' | 'loosen') {
    if (!data || pending) return
    setPending(true); setError(null); setChipError(null)
    const out = await call({ searchId: data.searchId, filters })
    setPending(false)
    if (!out.ok) { setError(out.message); return }
    setData(out); setEditing(null); setPagedOnce(false)
    trackEvent('filter_edited', { group: chip.group, field: chip.key.split(':')[1] ?? chip.key, action, result_count: out.results.length })
  }

  function commitEdit() {
    if (!data || !editing) return
    if (editing.text.trim() === editText(data.filters, editing.chip)) { setEditing(null); return }
    const next = applyEdit(data.filters, editing.chip.key, editing.text)
    if (!next) { setChipError('That could not be read. For followers or budget, try 10k-50k, 50k+ or under 1L.'); return }
    void rerun(next, editing.chip, 'edit')
  }

  const chips = data ? chipsFor(data.filters) : []
  const ctx = data?.filters.context
  const contextLine = ctx ? [
    ctx.productCategory ? `Product: ${ctx.productCategory}` : null,
    ctx.deliverables.length ? `Deliverables: ${ctx.deliverables.join(', ')}` : null,
    ctx.tone.length ? `Tone: ${ctx.tone.join(', ')}` : null,
    ctx.timeline ? `Timeline: ${ctx.timeline}` : null,
  ].filter(Boolean).join(' · ') : ''

  return (
    <div className="gai">
      <header className="gai-head">
        <h1 className="gai-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>
          Guapd AI
        </h1>
        <p className="gai-sub">Find creators for your brief</p>
        <Link href="/ai?intro=1" className="gai-whatis">What is Guapd AI?</Link>
      </header>

      <form className="gai-box" onSubmit={(e) => { e.preventDefault(); void search(brief) }}>
        <textarea
          className="gai-input"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void search(brief) } }}
          placeholder="Describe the creators you want"
          aria-label="Describe the creators you want"
          aria-describedby="gai-count"
          rows={data ? 4 : 5}
        />
        <div className="gai-box-foot">
          <span id="gai-count" className={`gai-count${over ? ' gai-count--over' : ''}`} aria-live="polite">
            {over
              ? `${(length - MAX_BRIEF).toLocaleString('en-IN')} characters over the ${MAX_BRIEF.toLocaleString('en-IN')} limit. Shorten the brief to search.`
              : `${length.toLocaleString('en-IN')} / ${MAX_BRIEF.toLocaleString('en-IN')}`}
          </span>
          <button type="submit" className="gai-submit" disabled={pending || length < 3 || over}>
            {pending ? 'Searching…' : 'Find creators'}
          </button>
        </div>
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

      {/* Instagram Creator Marketplace: only when it is on in this environment. */}
      {meta?.notice && <p className="gai-notes" role="status">{meta.notice}</p>}
      {meta && !meta.connected && !meta.eligibility && (
        <div className="gai-banner">
          <span>Showing creators on Guapd. Connect Instagram to also search Instagram&apos;s Creator Marketplace</span>
          <a className="gai-loosen" href={`/api/meta/connect${data ? `?s=${data.searchId}` : ''}`} onClick={() => trackEvent('ai_connect_clicked', { from: 'banner' })}>
            {meta.needsReconnect ? 'Reconnect' : 'Connect'}
          </a>
        </div>
      )}
      {meta?.connected && (
        <div className="gai-source" role="group" aria-label="Search">
          {([['guapd', 'Guapd'], ['instagram', 'Instagram'], ['both', 'Both']] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={source === id} onClick={() => { setSource(id); trackEvent('ai_source_changed', { source: id }) }}>{label}</button>
          ))}
        </div>
      )}

      {data && (
        <div className="gai-reading">
          <p className="gai-summary"><strong>How I read your brief:</strong> {data.filters.summary}</p>
          {data.filters.question && <p className="gai-question" role="status">{data.filters.question}</p>}
          {contextLine && <p className="gai-context">{contextLine}</p>}
        </div>
      )}

      {data && chips.length > 0 && GROUPS.map(({ id, title }) => {
        const group = chips.filter((c) => c.group === id)
        if (!group.length) return null
        return (
          <div key={id} className={`gai-group gai-group--${id}`}>
            <div className="gai-group-title">{title}</div>
            <div className="gai-chips">
              {group.map((chip) => editing?.chip.key === chip.key ? (
                <span key={chip.key} className="gai-chip gai-chip--edit">
                  {chip.edit === 'niche' || chip.edit === 'language' ? (
                    <select autoFocus value={editing.text} onChange={(e) => setEditing({ chip, text: e.target.value })} onBlur={commitEdit} aria-label={`Edit ${chip.label}`}>
                      {(chip.edit === 'niche' ? SEARCH_NICHES : CONTENT_LANGUAGES).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <input
                      autoFocus
                      value={editing.text}
                      onChange={(e) => setEditing({ chip, text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } if (e.key === 'Escape') { setEditing(null); setChipError(null) } }}
                      onBlur={commitEdit}
                      aria-label={`Edit ${chip.label}`}
                      size={Math.max(6, editing.text.length + 1)}
                    />
                  )}
                </span>
              ) : (
                <span key={chip.key} className="gai-chip">
                  <button type="button" className="gai-chip-label" disabled={pending} title="Tap to edit" onClick={() => setEditing({ chip, text: editText(data.filters, chip) })}>
                    {id === 'exclude' ? `Not ${chip.label}` : chip.label}
                  </button>
                  <button type="button" className="gai-chip-x" disabled={pending} aria-label={`Remove ${chip.label}`} onClick={() => void rerun(withoutFilter(data.filters, chip.key), chip, 'remove')}>×</button>
                </span>
              ))}
            </div>
          </div>
        )
      })}
      {chipError && <p className="gai-error" role="alert">{chipError}</p>}
      {data && data.notChecked.length > 0 && (
        <ul className="gai-notes">{data.notChecked.map((n) => <li key={n}>{n}</li>)}</ul>
      )}

      {pending && <p className="gai-loading" aria-live="polite">Finding creators...</p>}

      {data && !pending && source !== 'instagram' && (
        <section className="gai-results" aria-label="Creators">
          {data.notice && (
            <div className="gai-notice">
              <p>{data.notice}</p>
              {data.loosen && (() => {
                const hint = data.loosen
                const chip = chips.find((c) => c.key === hint.key)
                return chip ? (
                  <button type="button" className="gai-loosen" onClick={() => void rerun(withoutFilter(data.filters, hint.key), chip, 'loosen')}>
                    Remove “{hint.label}” to see {hint.wouldShow}
                  </button>
                ) : null
              })()}
            </div>
          )}
          <ol className="gai-list">
            {data.results.map((r, i) => <ResultCard key={r.id} r={r} position={i + 1} searchId={data.searchId} />)}
          </ol>
          {data.hasMore ? (
            <button type="button" className="gai-loosen gai-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
          ) : (pagedOnce || data.results.length >= PAGE_SIZE) ? (
            <p className="gai-end">That&apos;s everyone who matches. Try loosening a filter.</p>
          ) : null}
        </section>
      )}
      {data && !pending && meta?.connected && source !== 'guapd' && <MetaSection key={data.searchId} searchId={data.searchId} meta={meta} />}
    </div>
  )
}

function ResultCard({ r, position, searchId }: { r: CreatorSearchResult; position: number; searchId: string }) {
  const initials = r.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  // Also recorded on the server for the creator's "Your visibility" counts
  // (PostHog is consent-gated and has no creator id). keepalive: the page is
  // navigating away as this is sent.
  const record = (kind: 'profile_open' | 'offer_started') => {
    fetch('/api/creators/search/interaction', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searchId, creatorId: r.id, kind }) }).catch(() => {})
  }
  const clicked = () => { trackEvent('result_clicked', { position, verified: !!r.verified }); record('profile_open') }
  return (
    <li className="gai-card">
      <Link href={`/browse/${r.id}`} className="gai-card-top" onClick={clicked}>
        <span className="gai-photo">
          {r.photoUrl ? <img src={r.photoUrl} alt="" /> : <span aria-hidden="true">{initials}</span>}
        </span>
        <span className="gai-who">
          <span className="gai-name">{r.name}</span>
          <span className="gai-meta">{r.handle ? `@${r.handle}` : ''}</span>
        </span>
      </Link>

      {r.nicheTags.length > 0 && (
        <div className="gai-tags">{r.nicheTags.map((t) => <span key={t} className="gai-tag">{t}</span>)}</div>
      )}

      {r.verified ? (
        <div className="gai-stats">
          <span className="gai-badge gai-badge--verified">Verified</span>
          <span>
            {r.verified.followers !== null ? `${fmtCount(r.verified.followers)} followers` : 'Verified account'}
          </span>
        </div>
      ) : (
        <div className="gai-stats gai-stats--self">
          <span className="gai-badge">{CARD_NOT_VERIFIED}</span>
          <span>
            {r.selfReported?.followers ? `${fmtCount(r.selfReported.followers)} followers, ${CARD_SELF_REPORTED}` : 'No follower count on file'}
          </span>
        </div>
      )}

      <p className="gai-reason">{r.reason}</p>
      {r.gaps.length > 0 && <p className="gai-gaps">Not checked: {r.gaps.join(', ')}</p>}

      <Link
        href={`/deals/new?creator=${r.id}&back=ai&s=${searchId}`}
        className="gai-offer"
        onClick={() => { trackEvent('offer_started_from_search', { position, verified: !!r.verified }); record('offer_started') }}
      >
        Send offer
      </Link>
    </li>
  )
}
