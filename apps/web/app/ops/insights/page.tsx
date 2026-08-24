import { verifyOpsAccess } from '@/lib/ops-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { QUESTIONS, labelFor, type QuestionKey } from '@/lib/creator-onboarding'

export const metadata = { title: 'Creator insights · Ops' }

interface ResponseRow {
  creator_id: string
  biggest_pain: string
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
      .select('creator_id, biggest_pain, pain_other, deal_handling, monthly_deals, anything_else, created_at')
      .order('created_at', { ascending: false }),
    admin.from('creators').select('id', { count: 'exact', head: true }).eq('is_vetted', true),
  ])

  const responses = (rows ?? []) as ResponseRow[]
  const total = responses.length

  // Names for the free-text section, so a comment is attributable without
  // pasting creator ids around.
  const names: Record<string, string> = {}
  if (total > 0) {
    const { data: creators } = await admin
      .from('creators').select('id, full_name').in('id', responses.map(r => r.creator_id))
    for (const c of creators ?? []) names[c.id] = c.full_name ?? '—'
  }

  const freeText = responses.filter(r => r.pain_other || r.anything_else)

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
          No responses yet. The questions only appear for creators approved from now on — the
          existing roster was deliberately left alone, so this fills up as you approve people.
        </div>
      ) : (
        <>
          {QUESTIONS.map(q => (
            <Distribution
              key={q.key}
              title={q.prompt}
              rows={tally(responses, q.key as QuestionKey).map(([code, n]) => ({
                label: labelFor(q.key as QuestionKey, code),
                count: n,
                pct: Math.round((n / total) * 100),
              }))}
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
                      {names[r.creator_id] ?? '—'}
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
    </div>
  )
}

/** Counts per code, largest first — the ordering the question is asked to answer. */
function tally(rows: ResponseRow[], key: QuestionKey): [string, number][] {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const code = String((r as unknown as Record<string, unknown>)[key] ?? '')
    if (code) counts[code] = (counts[code] ?? 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

function Distribution({ title, rows }: { title: string; rows: { label: string; count: number; pct: number }[] }) {
  return (
    <section style={{ marginBottom: '1.75rem' }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.75rem' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.map(r => (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px', gap: '0.75rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8125rem', color: '#111', marginBottom: 4 }}>{r.label}</div>
              {/* A bar as well as a number: a column of percentages hides the
                  shape of the answer, which is the thing worth seeing. */}
              <div style={{ height: 8, borderRadius: 20, background: '#EFEFEA', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${r.pct}%`, background: '#C9EB3C', borderRadius: 20 }} />
              </div>
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {r.pct}% <span style={{ color: '#888', fontWeight: 500 }}>({r.count})</span>
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
