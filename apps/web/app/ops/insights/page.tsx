import { requireOps } from '@/lib/ops-capabilities'
import { createAdminClient } from '@/lib/supabase/admin'
import { QUESTIONS, labelFor, type QuestionKey } from '@/lib/creator-onboarding'
import { GROWTH_QUESTIONS } from '@/lib/growth-quiz-labels'
import { BRAND_QUESTIONS, BRAND_QUESTIONS_DUE_EVENT } from '@/lib/brand-onboarding'

export const metadata = { title: 'Insights · Ops' }

interface BrandResponseRow {
  brand_id: string
  challenges: string[]
  challenge_other: string | null
  current_approach: string
  monthly_campaigns: string
  anything_else: string | null
  created_at: string
}

interface GrowthRow {
  creator_id: string
  posting_frequency: string
  growth_goal: string
  niche: string
  niche_other: string | null
  anything_else: string | null
  created_at: string
}

interface ResponseRow {
  creator_id: string
  biggest_pains: string[]
  pain_other: string | null
  deal_handling: string
  monthly_deals: string
  anything_else: string | null
  created_at: string
}

/**
 * What creators told us on the way in, in aggregate.
 *
 * The reason the answers are stored as codes: this page counts them. Display
 * strings would have made every copy edit a break in the series.
 */
export default async function OpsInsightsPage() {
  const user = await requireOps('insights.read')
  if (!user) return <p style={{ padding: '2rem' }}>Not authorised.</p>

  const admin = createAdminClient()
  const [{ data: rows }, { count: approvedCount }] = await Promise.all([
    admin
      .from('creator_onboarding_responses')
      .select('creator_id, biggest_pains, pain_other, deal_handling, monthly_deals, anything_else, created_at')
      .order('created_at', { ascending: false }),
    admin.from('creators').select('id', { count: 'exact', head: true }).eq('is_vetted', true),
  ])

  // The Guapd Growth quiz, counted separately. Growth creators are is_vetted
  // false by construction (0487), so they are not in approvedCount above, and
  // folding the two sets together would report a response rate against the
  // wrong denominator.
  const [{ data: growthRows }, { count: growthCount }] = await Promise.all([
    admin
      .from('creator_growth_quiz_responses')
      .select('creator_id, posting_frequency, growth_goal, niche, niche_other, anything_else, created_at')
      .order('created_at', { ascending: false }),
    admin.from('creators').select('id', { count: 'exact', head: true }).eq('vetting_status', 'growth'),
  ])
  const growth = (growthRows ?? []) as GrowthRow[]

  const responses = (rows ?? []) as ResponseRow[]
  const total = responses.length

  // Names for the free-text section, so a comment is attributable without
  // pasting creator ids around.
  const names: Record<string, string> = {}
  if (total > 0) {
    const { data: creators } = await admin
      .from('creators').select('id, full_name').in('id', responses.map(r => r.creator_id))
    for (const c of creators ?? []) names[c.id] = c.full_name ?? '-'
  }

  if (growth.length > 0) {
    const { data: creators } = await admin
      .from('creators').select('id, full_name').in('id', growth.map(r => r.creator_id))
    for (const c of creators ?? []) names[c.id] = c.full_name ?? '-'
  }

  const freeText = responses.filter(r => r.pain_other || r.anything_else)
  const growthFreeText = growth.filter(r => r.niche_other || r.anything_else)

  // Brands: the demand side, its own section. The denominator is brands that
  // were ASKED (the due event) and still exist. Counting every brand would
  // include ones created before the questions, and counting events alone would
  // keep deleted brands in the rate forever.
  const [{ data: brandRows }, { data: dueEvents }] = await Promise.all([
    admin
      .from('brand_onboarding_responses')
      .select('brand_id, challenges, challenge_other, current_approach, monthly_campaigns, anything_else, created_at')
      .order('created_at', { ascending: false }),
    admin.from('events').select('detail').eq('event_type', BRAND_QUESTIONS_DUE_EVENT),
  ])
  const brandResponses = (brandRows ?? []) as BrandResponseRow[]
  const dueIds = Array.from(new Set(
    (dueEvents ?? [])
      .map(e => (e.detail as { brand_id?: string } | null)?.brand_id)
      .filter((id): id is string => Boolean(id)),
  ))
  const brandNames: Record<string, string> = {}
  const idsToName = Array.from(new Set([...dueIds, ...brandResponses.map(r => r.brand_id)]))
  if (idsToName.length > 0) {
    const { data: brands } = await admin.from('brands').select('id, name').in('id', idsToName)
    for (const b of brands ?? []) brandNames[b.id] = b.name ?? '-'
  }
  const brandsAsked = dueIds.filter(id => id in brandNames).length
  const brandTotal = brandResponses.length
  const brandFreeText = brandResponses.filter(r => r.challenge_other || r.anything_else)

  // What brands typed into AI creator search. The most direct statement of
  // demand we have: not what they answered when asked, but what they went
  // looking for. Raw text, newest first, with the cost of answering it.
  const { data: searchRows } = await admin
    .from('ai_search_queries')
    .select('id, brand_id, query_raw, result_count, cache_hit, input_tokens, output_tokens, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  const searches = (searchRows ?? []) as {
    id: string; brand_id: string; query_raw: string; result_count: number
    cache_hit: boolean; input_tokens: number | null; output_tokens: number | null; created_at: string
  }[]
  if (searches.length > 0) {
    const missing = Array.from(new Set(searches.map(s => s.brand_id))).filter(id => !(id in brandNames))
    if (missing.length > 0) {
      const { data: more } = await admin.from('brands').select('id, name').in('id', missing)
      for (const b of more ?? []) brandNames[b.id] = b.name ?? '-'
    }
  }
  const searchesPaid = searches.filter(s => !s.cache_hit).length

  return (
    <div style={{ padding: '1.5rem', maxWidth: 980 }}>
      <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0 }}>Creator insights</h1>
      <p style={{ fontSize: '0.8125rem', color: '#666', margin: '0.4rem 0 1.5rem' }}>
        Answers to the one-time questions asked just after approval.{' '}
        <strong>{total}</strong> response{total === 1 ? '' : 's'}
        {approvedCount ? ` of ${approvedCount} approved creators` : ''}
        {total > 0 && approvedCount ? ` (${Math.round((total / approvedCount) * 100)}%)` : ''}.
      </p>

      {total === 0 ? (
        <div style={emptyStyle}>
          No responses yet. The questions only appear for creators approved from now on. The
          existing roster was deliberately left alone, so this fills up as you approve people.
        </div>
      ) : (
        <>
          {QUESTIONS.map(q => (
            <Distribution
              key={q.key}
              title={q.prompt}
              // Said out loud, because a column of percentages adding to 180
              // otherwise reads as a bug in this page.
              note={q.multi ? 'Multi-select, a creator can pick several, so these add to more than 100%.' : undefined}
              // EVERY option, including ones nobody picked. A distribution that
              // silently omits the unchosen reads as "not offered" rather than
              // "offered and refused" — and which options fall flat is half of
              // what the question was asked to find out.
              rows={(() => {
                const counts = Object.fromEntries(tally(responses, q.key as QuestionKey))
                return q.options
                  .map(o => {
                    const c = counts[o.code] ?? 0
                    return { label: o.label, count: c, pct: total ? Math.round((c / total) * 100) : 0 }
                  })
                  .sort((a, b) => b.count - a.count)
              })()}
            />
          ))}

          {freeText.length > 0 && (
            <section style={{ marginTop: '2rem' }}>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
                In their own words ({freeText.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {freeText.map(r => (
                  <div key={r.creator_id} style={quoteStyle}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111' }}>
                      {names[r.creator_id] ?? '-'}
                    </div>
                    {r.pain_other && (
                      <p style={quoteBody}><span style={quoteTag}>pain</span> {r.pain_other}</p>
                    )}
                    {r.anything_else && (
                      <p style={quoteBody}><span style={quoteTag}>anything else</span> {r.anything_else}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

        {/* Guapd Growth, its own section rather than merged in. These are
            different questions asked of a different cohort; one combined
            distribution would be an average of two populations. */}
        <section style={{ marginTop: '2.5rem', paddingTop: '1.75rem', borderTop: '2px solid #eee' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0 }}>Guapd Growth</h1>
          <p style={{ fontSize: '0.8125rem', color: '#666', margin: '0.4rem 0 1.5rem' }}>
            Answers to the one-time quiz asked when a creator lands in Guapd Growth.{' '}
            <strong>{growth.length}</strong> response{growth.length === 1 ? '' : 's'}
            {growthCount ? ` of ${growthCount} Growth creators` : ''}
            {growth.length > 0 && growthCount ? ` (${Math.round((growth.length / growthCount) * 100)}%)` : ''}.
          </p>

          {growth.length === 0 ? (
            <div style={emptyStyle}>
              No responses yet. This fills up as creators are moved to Guapd Growth and answer the
              quiz on their first visit.
            </div>
          ) : (
            <>
              {GROWTH_QUESTIONS.filter(q => q.kind !== 'text').map(q => (
                <Distribution
                  key={q.key}
                  title={q.prompt}
                  /* EVERY option, including ones nobody picked. Silently omitting
                     the unchosen reads as "not offered" rather than "offered and
                     refused", and which options fall flat is half of what the
                     question was asked to find out. */
                  rows={(() => {
                    const counts: Record<string, number> = {}
                    for (const r of growth) {
                      const code = String((r as unknown as Record<string, unknown>)[q.key] ?? '')
                      if (code) counts[code] = (counts[code] ?? 0) + 1
                    }
                    return q.options
                      .map(o => {
                        const c = counts[o.code] ?? 0
                        return { label: o.label, count: c, pct: growth.length ? Math.round((c / growth.length) * 100) : 0 }
                      })
                      .sort((a, b) => b.count - a.count)
                  })()}
                />
              ))}

              {growthFreeText.length > 0 && (
                <section style={{ marginTop: '2rem' }}>
                  <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
                    In their own words ({growthFreeText.length})
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {growthFreeText.map(r => (
                      <div key={r.creator_id} style={quoteStyle}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111' }}>
                          {names[r.creator_id] ?? '-'}
                        </div>
                        {r.niche_other && (
                          <p style={quoteBody}><span style={quoteTag}>niche</span> {r.niche_other}</p>
                        )}
                        {r.anything_else && (
                          <p style={quoteBody}><span style={quoteTag}>anything else</span> {r.anything_else}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </section>

        {/* Brands, its own section: a different cohort answering different
            questions. This is the demand side, what brands say is hard. */}
        <section style={{ marginTop: '2.5rem', paddingTop: '1.75rem', borderTop: '2px solid #eee' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0 }}>Brand insights</h1>
          <p style={{ fontSize: '0.8125rem', color: '#666', margin: '0.4rem 0 1.5rem' }}>
            Answers to the one-time questions asked on a brand&rsquo;s first dashboard visit. One answer per brand.{' '}
            <strong>{brandTotal}</strong> response{brandTotal === 1 ? '' : 's'}
            {brandsAsked ? ` of ${brandsAsked} brands asked` : ''}
            {brandTotal > 0 && brandsAsked ? ` (${Math.round((brandTotal / brandsAsked) * 100)}%)` : ''}.
          </p>

          {brandTotal === 0 ? (
            <div style={emptyStyle}>
              No responses yet. Brands are asked on their first dashboard visit after creating their
              profile. Brands that existed before the questions are only asked once marked as due.
            </div>
          ) : (
            <>
              {BRAND_QUESTIONS.map(q => (
                <Distribution
                  key={q.key}
                  title={q.prompt}
                  note={q.multi ? 'Multi-select, a brand can pick several, so these add to more than 100%.' : undefined}
                  /* EVERY option, including ones nobody picked: which options
                     fall flat is half of what the question is asked to find out. */
                  rows={(() => {
                    const counts: Record<string, number> = {}
                    for (const r of brandResponses) {
                      const raw = (r as unknown as Record<string, unknown>)[q.key]
                      const codes = Array.isArray(raw) ? raw.map(String) : [String(raw ?? '')]
                      for (const code of codes) if (code) counts[code] = (counts[code] ?? 0) + 1
                    }
                    return q.options
                      .map(o => {
                        const c = counts[o.code] ?? 0
                        return { label: o.label, count: c, pct: brandTotal ? Math.round((c / brandTotal) * 100) : 0 }
                      })
                      .sort((a, b) => b.count - a.count)
                  })()}
                />
              ))}

              {brandFreeText.length > 0 && (
                <section style={{ marginTop: '2rem' }}>
                  <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
                    In their own words ({brandFreeText.length})
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {brandFreeText.map(r => (
                      <div key={r.brand_id} style={quoteStyle}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111' }}>
                          {brandNames[r.brand_id] ?? '-'}
                        </div>
                        {r.challenge_other && (
                          <p style={quoteBody}><span style={quoteTag}>challenge</span> {r.challenge_other}</p>
                        )}
                        {r.anything_else && (
                          <p style={quoteBody}><span style={quoteTag}>anything else</span> {r.anything_else}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </section>

        {/* AI creator search. Kept as raw queries rather than a distribution:
            the wording is the finding. A brand asking for something we cannot
            filter on is a gap in the data, not a failed search. */}
        <section style={{ marginTop: '2.5rem', paddingTop: '1.75rem', borderTop: '2px solid #eee' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0 }}>What brands search for</h1>
          <p style={{ fontSize: '0.8125rem', color: '#666', margin: '0.4rem 0 1.5rem' }}>
            The last {searches.length} AI creator searches, newest first.{' '}
            <strong>{searchesPaid}</strong> of them called the model; the rest were answered from the cache.
          </p>

          {searches.length === 0 ? (
            <div style={emptyStyle}>
              No searches yet. This fills up as brands use the search box on Browse.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {searches.map(s => (
                <div key={s.id} style={quoteStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111' }}>
                      {brandNames[s.brand_id] ?? '-'}
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: '#888' }}>
                      {s.result_count} result{s.result_count === 1 ? '' : 's'}
                      {s.cache_hit
                        ? ' · from cache'
                        : s.input_tokens != null ? ` · ${s.input_tokens}+${s.output_tokens ?? 0} tokens` : ''}
                      {' · '}{new Date(s.created_at).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                  <p style={quoteBody}>{s.query_raw}</p>
                </div>
              ))}
            </div>
          )}
        </section>

    </div>
  )
}

/**
 * Counts per code, largest first — the ordering the question is asked to answer.
 *
 * Handles both shapes: one question stores a set, the rest store a single code.
 * A multi-select tally counts RESPONDENTS per option, so its percentages sum to
 * more than 100 — which is correct, and labelled as such where it is shown.
 */
function tally(rows: ResponseRow[], key: QuestionKey): [string, number][] {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const raw = (r as unknown as Record<string, unknown>)[key]
    const codes = Array.isArray(raw) ? raw.map(String) : [String(raw ?? '')]
    for (const code of codes) {
      if (code) counts[code] = (counts[code] ?? 0) + 1
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

function Distribution({ title, note, rows }: {
  title: string
  note?: string
  rows: { label: string; count: number; pct: number }[]
}) {
  return (
    <section style={{ marginBottom: '1.75rem' }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.25rem' }}>{title}</h2>
      {note && <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.75rem' }}>{note}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px', gap: '0.75rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8125rem', color: r.count === 0 ? '#999' : '#111', marginBottom: 4 }}>{r.label}</div>
              {/* A bar as well as a number: a column of percentages hides the
                  shape of the answer, which is the thing worth seeing. */}
              <div style={{ height: 8, borderRadius: 20, background: '#EFEFEA', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${r.pct}%`, background: '#C9EB3C', borderRadius: 20 }} />
              </div>
            </div>
            {/* Zero rows are greyed rather than hidden — the fact that nobody
                picked an option is a result, not an absence. */}
            <div style={{
              fontSize: '0.8125rem', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap',
              color: r.count === 0 ? '#bbb' : '#111',
            }}>
              {r.pct}% <span style={{ color: '#aaa', fontWeight: 500 }}>({r.count})</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const emptyStyle: React.CSSProperties = {
  padding: '1.25rem', borderRadius: 10, border: '1px solid #e5e5e5',
  background: '#fafafa', fontSize: '0.8125rem', color: '#666', lineHeight: 1.6,
}
const quoteStyle: React.CSSProperties = {
  padding: '0.75rem 0.875rem', borderRadius: 10, border: '1px solid #e5e5e5', background: '#fff',
}
const quoteBody: React.CSSProperties = {
  margin: '0.375rem 0 0', fontSize: '0.8125rem', color: '#333', lineHeight: 1.5,
}
const quoteTag: React.CSSProperties = {
  display: 'inline-block', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#888', marginRight: 6,
}
