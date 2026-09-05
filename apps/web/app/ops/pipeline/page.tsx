import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOps } from '@/lib/ops-capabilities'
import {
  LEAD_STAGES, FUNNEL_STAGES, STAGE_LABEL, STAGE_TONE, SOURCE_LABEL, LEAD_SOURCES,
  ACTIVATION_STEPS, isLeadStage, type LeadRow,
} from '@/lib/pipeline'
import {
  BRAND_ACTIVATION_STEPS, activationForCreators, activationForBrands,
} from '@/lib/pipeline-activation'
import PipelineBoard from './PipelineBoard'
import FeedbackLog from './FeedbackLog'
import Link from 'next/link'

export const metadata = { title: 'Pipeline · Ops', robots: { index: false, follow: false } }

/**
 * The outreach pipeline board — what replaced the spreadsheet.
 *
 * Server-rendered with GET-form filters, matching the other ops list pages: the
 * result is a shareable URL, which matters when three people are working the
 * same list and need to point at the same view.
 */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: { tab?: string; stage?: string; owner?: string; source?: string }
}) {
  const actor = await requireOps('pipeline.read')
  if (!actor) redirect('/login/brand')

  const tab = searchParams?.tab === 'creators' ? 'creators'
    : searchParams?.tab === 'feedback' ? 'feedback'
    : 'brands'
  const kind: 'brand' | 'creator' = tab === 'creators' ? 'creator' : 'brand'

  const admin = createAdminClient()

  // ── Feedback tab is its own query and returns early ───────────────────────
  if (tab === 'feedback') {
    const { data: feedback } = await admin
      .from('pipeline_feedback')
      .select('id, kind, source_name, category, body, status, logged_by, created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    return (
      <div>
        <Header tab={tab} />
        <FeedbackLog rows={(feedback ?? []) as never} />
      </div>
    )
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  // Unknown values are dropped rather than passed to the database — the same
  // rule the creators page follows.
  const stageFilter = isLeadStage(searchParams?.stage) ? searchParams.stage : null
  const ownerFilter = searchParams?.owner?.trim() || null
  const sourceFilter = (LEAD_SOURCES as readonly string[]).includes(searchParams?.source ?? '')
    ? searchParams!.source!
    : null

  let query = admin
    .from('pipeline_leads')
    .select('id, kind, name, handle, contact_email, contact_phone, platform, followers, niche, notes, stage, owner_email, source, brand_id, creator_id, last_touch_at, created_at')
    .eq('kind', kind)
    .order('last_touch_at', { ascending: false })
    .limit(500)

  if (stageFilter) query = query.eq('stage', stageFilter)
  if (ownerFilter) query = query.eq('owner_email', ownerFilter)
  if (sourceFilter) query = query.eq('source', sourceFilter)

  const { data: rows, error } = await query
  if (error) {
    return (
      <div>
        <Header tab={tab} />
        <p style={{ color: '#b91c1c', fontSize: '0.875rem' }}>Error loading pipeline: {error.message}</p>
      </div>
    )
  }
  const leads = (rows ?? []) as LeadRow[]

  /* The funnel is counted on the UNFILTERED set. A funnel that responded to the
     stage filter would always read 100% at the selected stage and zero
     everywhere else, which looks like data and is not. */
  const { data: allForCounts } = await admin
    .from('pipeline_leads')
    .select('stage')
    .eq('kind', kind)
  const counts = new Map<string, number>()
  for (const r of (allForCounts ?? []) as { stage: string }[]) {
    counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1)
  }
  const total = (allForCounts ?? []).length

  // Owner list for the filter dropdown, from the data rather than a hardcoded
  // list of three names that goes stale the moment someone joins or leaves.
  const { data: ownerRows } = await admin
    .from('pipeline_leads').select('owner_email').eq('kind', kind)
  const owners = Array.from(
    new Set(((ownerRows ?? []) as { owner_email: string | null }[])
      .map((r) => r.owner_email).filter((e): e is string => Boolean(e))),
  ).sort()

  // ── Activation, derived live ──────────────────────────────────────────────
  const creatorIds = leads.map((l) => l.creator_id).filter((v): v is string => Boolean(v))
  const brandIds = leads.map((l) => l.brand_id).filter((v): v is string => Boolean(v))
  const [creatorActivation, brandActivation] = await Promise.all([
    kind === 'creator' ? activationForCreators(admin as never, creatorIds) : Promise.resolve(new Map()),
    kind === 'brand' ? activationForBrands(admin as never, brandIds) : Promise.resolve(new Map()),
  ])

  const activation: Record<string, { label: string; ok: boolean }[]> = {}
  for (const lead of leads) {
    if (kind === 'creator' && lead.creator_id) {
      const a = creatorActivation.get(lead.creator_id)
      if (a) activation[lead.id] = ACTIVATION_STEPS.map((s) => ({ label: s.label, ok: Boolean(a[s.key]) }))
    } else if (kind === 'brand' && lead.brand_id) {
      const a = brandActivation.get(lead.brand_id)
      if (a) activation[lead.id] = BRAND_ACTIVATION_STEPS.map((s) => ({ label: s.label, ok: Boolean(a[s.key]) }))
    }
  }

  return (
    <div>
      <Header tab={tab} />

      {/* ── Funnel ── */}
      <section style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {FUNNEL_STAGES.map((s) => (
          <FunnelCard
            key={s}
            label={STAGE_LABEL[s]}
            count={counts.get(s) ?? 0}
            total={total}
            tone={STAGE_TONE[s]}
          />
        ))}
        <FunnelCard label="Lost" count={counts.get('lost') ?? 0} total={total} tone={STAGE_TONE.lost} muted />
      </section>

      {/* ── Filters ── */}
      <form method="get" style={filterBar}>
        <input type="hidden" name="tab" value={tab} />
        <span style={filterLabel}>Stage</span>
        <select name="stage" defaultValue={stageFilter ?? ''} style={select}>
          <option value="">All</option>
          {LEAD_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>

        <span style={filterLabel}>Owner</span>
        <select name="owner" defaultValue={ownerFilter ?? ''} style={select}>
          <option value="">Anyone</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>

        <span style={filterLabel}>Source</span>
        <select name="source" defaultValue={sourceFilter ?? ''} style={select}>
          <option value="">Any</option>
          {LEAD_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </select>

        <button type="submit" style={submitBtn}>Filter</button>
        {(stageFilter || ownerFilter || sourceFilter) && (
          <Link href={`/ops/pipeline?tab=${tab}`} style={{ fontSize: '0.8125rem', color: '#2563eb', textDecoration: 'none' }}>
            Clear
          </Link>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#6b7280' }}>
          {leads.length} shown &middot; {total} total
        </span>
      </form>

      <PipelineBoard
        kind={kind}
        leads={leads}
        activation={activation}
        owners={owners}
        currentUserEmail={actor.user.email ?? ''}
      />
    </div>
  )
}

function Header({ tab }: { tab: string }) {
  const tabs = [
    { key: 'brands', label: 'Brands' },
    { key: 'creators', label: 'Creators' },
    { key: 'feedback', label: 'Feedback & requests' },
  ]
  return (
    <>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Pipeline</h1>
      <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 1rem', maxWidth: 560, lineHeight: 1.5 }}>
        Outreach tracking for brands and creators. Stages are set by hand; everything after
        signup is read live from the platform, so it cannot drift.
      </p>
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e5e5', marginBottom: '1.25rem' }}>
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/ops/pipeline?tab=${t.key}`}
            style={{
              padding: '0.5rem 1rem',
              borderBottom: tab === t.key ? '2px solid #111' : '2px solid transparent',
              marginBottom: -2,
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: '0.8125rem',
              color: tab === t.key ? '#111' : '#888',
              textDecoration: 'none',
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </>
  )
}

function FunnelCard({
  label, count, total, tone, muted = false,
}: {
  label: string; count: number; total: number; tone: { bg: string; fg: string }; muted?: boolean
}) {
  /* Percentage of ALL leads, not of the previous stage. Stage-to-stage
     conversion needs to know the order each lead actually passed through, and
     a lead that jumps straight to signed_up never sat in `replied` — so a
     step-conversion figure here would be arithmetic on a history we do not
     record. Share-of-total is a claim the data supports. */
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div style={{
      minWidth: 122, padding: '0.65rem 0.85rem', borderRadius: 10,
      background: muted ? '#fafafa' : tone.bg,
      border: `1px solid ${muted ? '#e5e7eb' : 'transparent'}`,
      opacity: muted ? 0.85 : 1,
    }}>
      <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: tone.fg }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111', lineHeight: 1.2 }}>{count}</div>
      <div style={{ fontSize: '0.6875rem', color: '#6b7280' }}>{pct}% of all</div>
    </div>
  )
}

const filterBar: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.55rem',
  margin: '0 0 1rem', padding: '0.7rem 0.85rem',
  border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa',
}
const filterLabel: React.CSSProperties = {
  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: '#6b7280',
}
const select: React.CSSProperties = {
  padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #e5e7eb',
  fontSize: '0.8125rem', background: '#fff',
}
const submitBtn: React.CSSProperties = {
  padding: '0.3rem 0.8rem', borderRadius: 6, border: '1px solid #111',
  background: '#111', color: '#fff', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
}
