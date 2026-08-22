import { createClient } from '@/lib/supabase/server'
import { verifyBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { calculateFee } from '@/lib/fee'
import { deriveDisplayStatus } from '@/lib/deal-status'
import CampaignActions from './CampaignActions'
import AddCreatorsModal from './AddCreatorsModal'
import CampaignRoster from './CampaignRoster'
import CampaignBrief from './CampaignBrief'
import type { DraftPlacement } from './draft-actions'

function formatINR(paise: number): string {
  const rupees = Math.round(paise / 100)
  const s = String(rupees)
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

const STATUS_MAP: Record<string, { label: string; bg: string; fg: string }> = {
  active:    { label: 'Active',    bg: 'var(--lime-50)',  fg: 'var(--lime-700)' },
  completed: { label: 'Completed', bg: 'var(--sec-2)',    fg: 'var(--ink-soft)' },
  archived:  { label: 'Archived',  bg: 'var(--sec-2)',    fg: 'var(--ink-faint)' },
}

const POSTABLE = new Set(['approved', 'paid', 'complete'])
const PAID_INVOICE_STATUSES = new Set(['paid'])

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  await verifyBrand()
  const supabase = createClient()

  const [{ data: campaign, error: campErr }, { data: deals }, { data: invoices }, { data: drafts }, { data: allCreators }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, description, status, budget_paise, brief_pitch, brief_guidelines, brief_avoid, brief_attachments, created_at, updated_at')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('deals')
      .select('id, title, deliverables, price_paise, fee_percent, fee_mode, price_per_extra_revision_paise, revisions_used, revision_limit, status, is_posted, internal_note, created_at, creators(id, full_name, profile_photo_url)')
      .eq('campaign_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('deal_id, status, due_date, brand_pays_paise'),
    supabase
      .from('campaign_drafts')
      .select('id, campaign_id, creator_id, placements, total_price_paise, fee_percent, fee_mode, total_brand_paise, note, creators(id, full_name, handle, profile_photo_url, niches)')
      .eq('campaign_id', params.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('creators')
      .select('id, full_name, handle, profile_photo_url, niches')
      .order('full_name'),
  ])

  if (campErr || !campaign) notFound()

  const st = STATUS_MAP[campaign.status] ?? STATUS_MAP.active
  const allDeals = deals ?? []
  const allDrafts = (drafts ?? []).map((d) => {
    const rawCreator = d.creators as unknown
    const creator = (Array.isArray(rawCreator) ? rawCreator[0] : rawCreator) as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null; niches: string[] | null } | null
    return {
      id: d.id,
      campaign_id: d.campaign_id,
      creator_id: d.creator_id,
      placements: (typeof d.placements === 'string' ? JSON.parse(d.placements) : d.placements ?? []) as DraftPlacement[],
      total_price_paise: d.total_price_paise,
      fee_percent: d.fee_percent,
      fee_mode: d.fee_mode as 'on_top' | 'deducted',
      total_brand_paise: d.total_brand_paise,
      note: (d as Record<string, unknown>).note as string | null ?? null,
      creator: creator ?? { id: d.creator_id, full_name: 'Unknown', handle: null, profile_photo_url: null, niches: null },
    }
  })

  // Fetch products for all drafted creators
  const draftCreatorIds = allDrafts.map((d) => d.creator_id)
  let productsMap: Record<string, { id: string; platform: string; handle: string; product_type: string; description: string | null; price_paise: number; display_price: boolean; is_active: boolean }[]> = {}
  if (draftCreatorIds.length > 0) {
    const { data: products } = await supabase
      .from('creator_products')
      .select('id, creator_id, platform, handle, product_type, description, price_paise, price_mode, price_max_paise, display_price, is_active')
      .in('creator_id', draftCreatorIds)
      .eq('is_active', true)
    for (const p of products ?? []) {
      if (!productsMap[p.creator_id]) productsMap[p.creator_id] = []
      productsMap[p.creator_id].push(p)
    }
  }

  // Index invoices
  const invoiceMap = new Map<string, { status: string; due_date: string | null; brand_pays_paise: number }>()
  for (const inv of invoices ?? []) {
    invoiceMap.set(inv.deal_id, inv)
  }

  // ── ROLLUP ──
  const nonCancelled = allDeals.filter((d) => !['declined', 'cancelled'].includes(d.status))
  let dealsBrandPaise = 0
  for (const d of nonCancelled) {
    if (d.price_paise != null && d.price_paise > 0) {
      const fee = calculateFee(d.price_paise, d.fee_percent ?? 0, (d.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
      dealsBrandPaise += fee.brand_pays_paise
    }
  }
  const draftsBrandPaise = allDrafts.reduce((s, d) => s + d.total_brand_paise, 0)
  const estSpendPaise = draftsBrandPaise + dealsBrandPaise

  let paidPaise = 0
  for (const d of allDeals) {
    const inv = invoiceMap.get(d.id)
    if (inv && PAID_INVOICE_STATUSES.has(inv.status)) {
      paidPaise += inv.brand_pays_paise ?? 0
    }
  }
  const toAllocatePaise = campaign.budget_paise != null ? campaign.budget_paise - estSpendPaise : null

  // Counts
  const creatorIds = new Set<string>()
  for (const d of allDeals) {
    const c = (Array.isArray(d.creators) ? d.creators[0] : d.creators) as { id: string } | null
    if (c) creatorIds.add(c.id)
  }
  for (const d of allDrafts) creatorIds.add(d.creator_id)

  const readyCount = allDrafts.filter((d) => d.placements.length > 0 && d.total_price_paise > 0).length
  const draftCount = allDrafts.filter((d) => d.placements.length === 0 || d.total_price_paise <= 0).length
  const sentCount = allDeals.length

  const existingDraftCreatorIds = allDrafts.map((d) => d.creator_id)

  // Campaign deals for roster
  const campaignDeals = allDeals.map((d) => {
    const raw = d.creators as unknown
    const creator = (Array.isArray(raw) ? raw[0] : raw) as { id: string; full_name: string; profile_photo_url: string | null } | null
    const inv = invoiceMap.get(d.id)
    const derived = deriveDisplayStatus(d.status, inv?.status ?? null, inv?.due_date ?? null)
    const fee = d.price_paise > 0 ? calculateFee(d.price_paise, d.fee_percent ?? 0, (d.fee_mode as 'on_top' | 'deducted') ?? 'on_top') : null
    const extra = Math.max(0, (d.revisions_used ?? 0) - (d.revision_limit ?? 0))
    const overage = extra * (d.price_per_extra_revision_paise ?? 0)
    return {
      dealId: d.id,
      creatorId: creator?.id ?? '',
      creatorName: creator?.full_name ?? 'Unknown',
      creatorPhoto: creator?.profile_photo_url ?? null,
      deliverables: d.deliverables ?? '',
      pricePaise: d.price_paise,
      brandPaysPaise: fee ? fee.brand_pays_paise + overage : 0,
      creatorReceivesPaise: fee ? fee.creator_receives_paise : 0,
      statusLabel: derived.label,
      statusColor: derived.color,
      isPosted: d.is_posted,
      isPostable: POSTABLE.has(d.status),
      internalNote: (d as Record<string, unknown>).internal_note as string | null ?? null,
    }
  })

  const hasCompletedDeal = allDeals.some((d) => ['paid', 'complete'].includes(d.status))

  const budgetPercent = campaign.budget_paise != null && campaign.budget_paise > 0
    ? Math.min(100, Math.round((estSpendPaise / campaign.budget_paise) * 100))
    : null

  // Split campaign name for t-accent on last word
  const nameParts = campaign.name.trim().split(/\s+/)
  const lastWord = nameParts.length > 1 ? nameParts.pop() : null
  const nameRest = nameParts.join(' ')

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(56px,6vw,96px)' }}>

      {/* ===== HEADER ===== */}
      <div className="surface reveal" style={{ padding: '36px 38px' }}>
        <Link href="/campaigns" className="backlink" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          All campaigns
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginTop: 22, flexWrap: 'wrap' }}>
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '5px 12px', borderRadius: 999,
              background: st.bg, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11, color: st.fg,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--neon-deep)' }} />
              {st.label}
            </span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.03em', fontSize: 'clamp(30px,3.6vw,38px)', lineHeight: 1.1, margin: '14px 0 0' }}>
              {lastWord ? <>{nameRest} <span className="t-accent">{lastWord}</span></> : campaign.name}
            </h1>
            {campaign.description && (
              <p className="t-body" style={{ color: 'var(--ink-2)', margin: '12px 0 0', maxWidth: 520 }}>
                {campaign.description}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {hasCompletedDeal && (
              <Link
                href={`/campaigns/${campaign.id}/analytics`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '10px 20px', borderRadius: 999,
                  border: '1px solid var(--border-hairline, #EAEAE3)',
                  background: 'var(--card)', color: 'var(--ink)',
                  fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 700,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                  transition: 'border-color .16s ease',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
                Analytics
              </Link>
            )}
            <CampaignActions campaignId={campaign.id} currentStatus={campaign.status} currentName={campaign.name} currentDescription={campaign.description} currentBudgetPaise={campaign.budget_paise} />
          </div>
        </div>
      </div>

      {/* ===== BUDGET CARD ===== */}
      {campaign.budget_paise != null && (
        <div className="surface reveal" style={{ padding: '30px 32px', marginTop: 22 }}>
          <h2 className="sect-head">Budget</h2>
          <div className="sect-rule" />

          <div style={{ position: 'relative', display: 'inline-block', marginTop: 16 }}>
            <span aria-hidden="true" style={{ position: 'absolute', left: -4, right: -4, bottom: 2, height: 14, background: 'var(--lime-400)', borderRadius: 3, transform: 'rotate(-2.5deg)', zIndex: 0 }} />
            <span className="t-data" style={{ position: 'relative', zIndex: 1, fontSize: 40 }}>
              {formatINR(campaign.budget_paise)}
            </span>
          </div>

          <div style={{ height: 7, borderRadius: 999, background: 'linear-gradient(90deg,var(--sec-mid),var(--sec-mid-2))', marginTop: 18, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${budgetPercent ?? 0}%`, background: 'var(--lime-400)', borderRadius: 999 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 24, paddingTop: 22, borderTop: '1px solid var(--hairline)' }}>
            <div>
              <div className="t-meta">Est. spend</div>
              <div className="t-data" style={{ fontSize: 22, marginTop: 9 }}>
                {formatINR(estSpendPaise)}
              </div>
            </div>
            <div style={{ paddingLeft: 24, borderLeft: '1px solid var(--hairline)' }}>
              <div className="t-meta">Paid</div>
              <div className="t-data" style={{ fontSize: 22, marginTop: 9 }}>
                {formatINR(paidPaise)}
              </div>
            </div>
            <div style={{ paddingLeft: 24, borderLeft: '1px solid var(--hairline)' }}>
              <div className="t-meta">To allocate</div>
              <div className="t-data" style={{ fontSize: 22, marginTop: 9, color: toAllocatePaise != null && toAllocatePaise < 0 ? '#dc2626' : undefined }}>
                {toAllocatePaise != null ? (toAllocatePaise < 0 ? `−${formatINR(Math.abs(toAllocatePaise))}` : formatINR(toAllocatePaise)) : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== COLLABORATIONS ===== */}
      <div className="surface reveal" style={{ padding: 0, overflow: 'hidden', marginTop: 34 }}>
        <div style={{ padding: '28px 30px 0' }}>
          <h2 className="sect-head">Collaborations</h2>
          <div className="sect-rule" />
        </div>

        <div style={{ padding: '20px 30px 28px', display: 'flex', alignItems: 'center', gap: 32 }}>
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <div className="t-data" style={{ fontSize: 40 }}>
              {creatorIds.size}
            </div>
            <div className="t-meta" style={{ marginTop: 5 }}>creators</div>
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid var(--hairline)', paddingLeft: 28, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="t-meta" style={{ color: 'var(--ink-2)' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--sec-mid-2)', marginRight: 7 }} />
                Ready to send
              </span>
              <span className="t-data" style={{ fontSize: 14 }}>{readyCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="t-meta" style={{ color: 'var(--ink-2)' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#D8DACF', marginRight: 7 }} />
                Still drafting
              </span>
              <span className="t-data" style={{ fontSize: 14, color: 'var(--ink-2)' }}>{draftCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="t-meta" style={{ color: 'var(--ink-2)' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--neon-deep)', marginRight: 7 }} />
                Briefs sent
              </span>
              <span className="t-data" style={{ fontSize: 14 }}>{sentCount}</span>
            </div>
          </div>
        </div>

        {/* Campaign roster */}
        <div style={{ borderTop: '1px solid var(--hairline)', padding: '24px 30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <h2 className="sect-head" style={{ fontSize: 17 }}>Campaign roster</h2>
            <AddCreatorsModal
              campaignId={campaign.id}
              creators={(allCreators ?? []) as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null; niches: string[] | null }[]}
              existingCreatorIds={existingDraftCreatorIds}
            />
          </div>
          <CampaignRoster
            drafts={allDrafts}
            productsMap={productsMap}
            campaignId={campaign.id}
            campaignDeals={campaignDeals}
            briefPitch={(campaign as Record<string, unknown>).brief_pitch as string | null ?? null}
            briefGuidelines={(campaign as Record<string, unknown>).brief_guidelines as string | null ?? null}
          />
        </div>
      </div>

      {/* ===== BRIEF ===== */}
      <div className="surface reveal" style={{ padding: '28px 30px', marginTop: 22 }}>
        <h2 className="sect-head">Campaign Brief</h2>
        <div className="sect-rule" />
        <div style={{ marginTop: 20 }}>
          <CampaignBrief
            campaignId={campaign.id}
            initialPitch={(campaign as Record<string, unknown>).brief_pitch as string | null ?? null}
            initialGuidelines={(campaign as Record<string, unknown>).brief_guidelines as string | null ?? null}
            initialAvoid={(campaign as Record<string, unknown>).brief_avoid as string | null ?? null}
            initialAttachments={((campaign as Record<string, unknown>).brief_attachments ?? []) as { name: string; storage_path: string; size_bytes: number; content_type: string }[]}
          />
        </div>
      </div>

      {/* Metadata */}
      <div style={{ marginTop: 22, padding: '0 4px' }}>
        <span className="t-meta">Created {new Date(campaign.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <span className="t-meta" style={{ marginLeft: 16 }}>Updated {new Date(campaign.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>
    </div>
  )
}
