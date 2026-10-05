import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { trackForCreator } from '@/lib/deal-track'
import { brandInvoiceSubtotal, creatorLegTerms, experienceMargin, type MarginBreakdown, type CreatorLegTerms } from '@/lib/experience-money'

/**
 * Server side of the two-leg money model. Service role, explicit columns,
 * never select('*') (the service role bypasses the column grants).
 *
 * The two legs are written by SEPARATE functions that never read each other:
 *   lockCreatorLegTerms   reads the creator and their track, writes their terms
 *   draftServiceInvoice   reads only the brand-leg price inputs it is given
 * so a creator's rate cannot reach a brand invoice and a brand price cannot
 * reach a creator's pay. experiencePnL reads both, for ops display only, and
 * writes nothing.
 */

// ── Leg 2: freeze a creator's terms when sent/agreed ────────────────────────

export interface LockTermsInput {
  dealId: string
  experienceId: string
  creatorId: string
  dayRatePaise?: number
  days?: number
  grossPaise?: number
}

/**
 * Compute and LOCK a creator leg's terms. The platform % comes from the
 * creator's track as it is NOW (send time) and is snapshotted; a later change
 * of track or rate never moves a locked leg (DB trigger t_ect_freeze).
 */
export async function lockCreatorLegTerms(admin: SupabaseClient, input: LockTermsInput): Promise<CreatorLegTerms> {
  const track = await trackForCreator(admin, input.creatorId)
  const terms = creatorLegTerms({ dayRatePaise: input.dayRatePaise, days: input.days, grossPaise: input.grossPaise, track })

  const { data: existing } = await admin.from('experience_creator_terms')
    .select('deal_id, locked_at').eq('deal_id', input.dealId).maybeSingle()
  if ((existing as { locked_at: string | null } | null)?.locked_at) {
    throw new Error('These creator terms are already agreed and locked')
  }

  const row = {
    deal_id: input.dealId, experience_id: input.experienceId, creator_id: input.creatorId,
    day_rate_paise: input.dayRatePaise ?? null, days: input.days ?? null,
    creator_gross_paise: terms.creatorGrossPaise, platform_track: terms.platformTrack,
    platform_pct: terms.platformPct, creator_net_paise: terms.creatorNetPaise,
    locked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  const { error } = existing
    ? await admin.from('experience_creator_terms').update(row).eq('deal_id', input.dealId)
    : await admin.from('experience_creator_terms').insert(row)
  if (error) throw new Error(`Could not lock creator terms: ${error.message}`)
  return terms
}

// ── Leg 1: Guapd's invoice to the brand ─────────────────────────────────────

export interface DraftInvoiceInput {
  experienceId: string
  brandId: string
  kind: 'initial' | 'additional' | 'follow_on'
  /** Required for 'additional': where the extra videos come from. */
  source?: 'existing_footage' | 'new_shoot'
  perVideoPaise: number
  deliverableCount: number
  miscPaise?: number
  lineLabel?: string
}

/**
 * Draft a service invoice from BRAND-LEG inputs only.
 *
 * An 'additional' invoice (more videos later) is priced the same way and is
 * independent of creator legs: 'existing_footage' needs no creator leg at all;
 * 'new_shoot' means ops ALSO creates/extends a creator leg, separately, with
 * normal track maths — this function does not, and cannot, do that.
 */
export async function draftServiceInvoice(admin: SupabaseClient, p: DraftInvoiceInput): Promise<{ id: string; number: string; subtotalPaise: number }> {
  if (p.kind === 'additional' && !p.source) throw new Error("An additional invoice must say whether it is from existing footage or a new shoot")
  const misc = p.miscPaise ?? 0
  const subtotal = brandInvoiceSubtotal({ perVideoPaise: p.perVideoPaise, deliverableCount: p.deliverableCount, miscPaise: misc })
  const lines = [
    { label: p.lineLabel ?? 'Content production service', quantity: p.deliverableCount, unit_paise: p.perVideoPaise, amount_paise: p.perVideoPaise * p.deliverableCount },
    ...(misc > 0 ? [{ label: 'Production extras', quantity: 1, unit_paise: misc, amount_paise: misc }] : []),
  ]
  const { data, error } = await admin.from('service_invoices').insert({
    experience_id: p.experienceId, brand_id: p.brandId, kind: p.kind, source: p.source ?? null, status: 'draft',
    per_video_paise: p.perVideoPaise, deliverable_count: p.deliverableCount, misc_paise: misc,
    lines, subtotal_paise: subtotal, total_paise: subtotal,
  }).select('id, number').single()
  if (error || !data) throw new Error(`Could not draft invoice: ${error?.message}`)
  return { id: data.id, number: data.number, subtotalPaise: subtotal }
}

// ── P&L: derived, ops only, writes nothing ──────────────────────────────────

export async function experiencePnL(admin: SupabaseClient, experienceId: string): Promise<MarginBreakdown> {
  const [inv, terms, costs] = await Promise.all([
    admin.from('service_invoices').select('subtotal_paise, status').eq('experience_id', experienceId).neq('status', 'void'),
    admin.from('experience_creator_terms').select('creator_gross_paise, creator_net_paise').eq('experience_id', experienceId),
    admin.from('experience_cost_lines').select('total_paise, provided_by').eq('experience_id', experienceId).eq('provided_by', 'guapd'),
  ])
  for (const r of [inv, terms, costs]) if (r.error) throw new Error(`P&L read failed: ${r.error.message}`)
  return experienceMargin({
    brandInvoiceSubtotalsPaise: (inv.data ?? []).map((r: { subtotal_paise: number }) => Number(r.subtotal_paise)),
    creatorLegs: (terms.data ?? []).map((r: { creator_gross_paise: number; creator_net_paise: number }) => ({
      creatorGrossPaise: Number(r.creator_gross_paise), creatorNetPaise: Number(r.creator_net_paise),
    })),
    guapdCostsPaise: (costs.data ?? []).map((r: { total_paise: number }) => Number(r.total_paise)),
  })
}
