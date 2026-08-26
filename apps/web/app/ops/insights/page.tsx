import { verifyOpsAccess } from '@/lib/ops-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { QUESTIONS, labelFor, type QuestionKey } from '@/lib/creator-onboarding'
import { GROWTH_QUESTIONS } from '@/lib/growth-quiz-labels'

export const metadata = { title: 'Creator insights · Ops' }

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
  const user = await verifyOpsAccess()
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
