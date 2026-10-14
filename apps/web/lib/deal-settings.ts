/**
 * Deal settings: the engine reads these, never a hardcoded deal type.
 *
 * A template is a named jsonb bundle of settings (deal_templates.settings).
 * validateDealSettings() is the gate every template and every snapshot goes
 * through. It is a HARD rule, not a UI hint: it runs server-side wherever
 * settings are saved or snapshotted onto a deal.
 *
 * ── What it refuses ─────────────────────────────────────────────────────────
 * 1. Unknown keys, at any depth (.strict()). A config cannot invent a field
 *    like "creator_pay_from_brand_invoice": anything not modelled is refused.
 * 2. payment_flow 'route_split': disabled until Razorpay Route is approved
 *    (also blocked by a database CHECK).
 * 3. payment_flow 'brand_pays_creator_direct' on any template: schema-only, the
 *    value existing marketplace deals carry; it is never configured.
 * 4. An Experience with any flow other than guapd_principal_vendor_payout.
 * 5. An Experience whose CREATOR provides the deliverables but whose creator
 *    work ends at anything other than Guapd accepting them
 *    (on_delivery_accepted). Who provides decides when the creator's part is
 *    done (0538): Guapd provides → shoot done; creator submits → approved.
 * 6. Anything that names a link between the legs' money or brand → creator
 *    routing (split / pool / disburse / escrow / cost-plus / markup / derived
 *    pricing…), with an explicit message, even if a future schema change lets
 *    such a key through the strict shape.
 *
 * The schema allows every enum value (so a future variant is config), and
 * EXPOSED_V1 lists what the product offers today.
 */

import { z } from 'zod'

export const COMPLETION_TRIGGERS = ['on_shoot_done', 'on_content_posted', 'on_delivery_accepted'] as const
export const DELIVERABLES_OWNERS = ['guapd', 'creator', 'brand'] as const
export const PRICING_BASES = ['per_deliverable', 'per_day', 'per_post', 'package'] as const
export const PAYMENT_FLOWS = ['guapd_principal_vendor_payout', 'brand_pays_creator_direct', 'route_split'] as const
export const FOLLOW_ON_TYPES = ['none', 'affiliate', 'boost_rights', 'revenue_share'] as const
export const FOLLOW_ON_TRIGGERS = ['sales_final', 'campaign_end', 'on_agreement', 'date'] as const
export const FOLLOW_ON_BASES = ['pct_of_sales', 'fixed'] as const
export const FOLLOW_ON_INVOICERS = ['creator', 'brand', 'ops'] as const

/** What v1 actually offers. Other enum values are valid but not exposed. */
export const EXPOSED_V1 = {
  completion_trigger: ['on_shoot_done', 'on_delivery_accepted'],
  deliverables_owner: ['guapd', 'creator'],
  pricing_basis: ['per_deliverable'],
  payment_flow: ['guapd_principal_vendor_payout'],
  follow_on_type: ['none', 'affiliate'],
} as const

const FollowOn = z.object({
  type: z.enum(FOLLOW_ON_TYPES),
  trigger: z.enum(FOLLOW_ON_TRIGGERS),
  basis: z.enum(FOLLOW_ON_BASES),
  invoicer: z.enum(FOLLOW_ON_INVOICERS),
}).strict()

const Settings = z.object({
  kind: z.enum(['experience', 'deal']),
  completion_trigger: z.enum(COMPLETION_TRIGGERS),
  deliverables_owner: z.enum(DELIVERABLES_OWNERS),
  pricing_basis: z.enum(PRICING_BASES),
  payment_flow: z.enum(PAYMENT_FLOWS),
  follow_on: FollowOn.optional(),
  /** Guapd's default per-video price TO THE BRAND (brand leg only). */
  brand_per_video_paise_default: z.number().int().nonnegative().optional(),
  cost_line_categories: z.array(z.string().min(1).max(40)).max(40).optional(),
}).strict()

export type DealSettings = z.infer<typeof Settings>

/** Words that describe moving or deriving money ACROSS the legs. */
const LINKAGE = /(split|pool|disburs|escrow|route_|brand_pays_creator|creator_from_brand|brand_from_creator|from_creator|from_brand|cost_plus|markup|derive|pass_through|passthrough|payer|payee)/i

function linkageProblems(raw: unknown, path = ''): string[] {
  if (!raw || typeof raw !== 'object') return []
  const out: string[] = []
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const here = path ? `${path}.${k}` : k
    if (LINKAGE.test(k)) out.push(`"${here}" links the two legs' money or routes brand money to a creator; not allowed (brand pays Guapd, Guapd pays creators, separately)`)
    if (typeof v === 'string' && k !== 'payment_flow' && LINKAGE.test(v)) out.push(`"${here}: ${v}" links the two legs' money; not allowed`)
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...linkageProblems(v, here))
  }
  return out
}

export type ValidationResult = { ok: true; settings: DealSettings } | { ok: false; errors: string[] }

export function validateDealSettings(raw: unknown, opts: { exposedOnly?: boolean } = {}): ValidationResult {
  const errors: string[] = linkageProblems(raw)

  const parsed = Settings.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`)
    return { ok: false, errors: Array.from(new Set(errors)) }
  }
  const s = parsed.data

  if (s.payment_flow === 'route_split') {
    errors.push('payment_flow route_split is disabled: pooling a brand\'s money and splitting it to creators is payment-aggregator activity (needs Razorpay Route approval)')
  }
  if (s.payment_flow === 'brand_pays_creator_direct') {
    errors.push('payment_flow brand_pays_creator_direct cannot be configured: it is the legacy value existing marketplace deals carry, never a template setting')
  }
  if (s.kind === 'experience' && s.payment_flow !== 'guapd_principal_vendor_payout') {
    errors.push('an Experience runs only as guapd_principal_vendor_payout: brand pays Guapd, Guapd pays creators')
  }
  if (s.kind === 'experience' && s.deliverables_owner === 'creator' && s.completion_trigger !== 'on_delivery_accepted') {
    errors.push('when the creator submits the deliverables, their work ends when Guapd accepts them: use completion_trigger on_delivery_accepted')
  }

  if (opts.exposedOnly) {
    const check = (field: keyof typeof EXPOSED_V1, value: string | undefined) => {
      if (value !== undefined && !(EXPOSED_V1[field] as readonly string[]).includes(value)) errors.push(`${field} "${value}" is not offered yet`)
    }
    check('completion_trigger', s.completion_trigger)
    check('deliverables_owner', s.deliverables_owner)
    check('pricing_basis', s.pricing_basis)
    check('payment_flow', s.payment_flow)
    check('follow_on_type', s.follow_on?.type)
  }

  return errors.length ? { ok: false, errors } : { ok: true, settings: s }
}

/** What gets frozen onto a deal / Experience when created from a template. */
export interface SettingsSnapshot {
  template_id: string
  template_version: number
  settings: DealSettings
}

/**
 * Validate a template row and produce the snapshot to store on a new deal or
 * Experience. Throws on an invalid template: a bad bundle never reaches a deal.
 */
export function resolveDealSettings(template: { id: string; version: number; settings: unknown }): SettingsSnapshot {
  const v = validateDealSettings(template.settings)
  if (!v.ok) throw new Error(`template ${template.id} v${template.version} is invalid: ${v.errors.join('; ')}`)
  return { template_id: template.id, template_version: template.version, settings: v.settings }
}
