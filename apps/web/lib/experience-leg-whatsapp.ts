import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppTemplate, maskPhone } from '@/lib/whatsapp'
import { creatorWhatsAppContact } from '@/lib/creator-whatsapp'
import { formatAmountForMessage } from '@/lib/money'

/**
 * WhatsApp for Experience creator legs (Phase 6.1, item 7). Three approved
 * MSG91 templates, one per trigger:
 *
 *   step       template                   body vars                                   button
 *   offer      experience_offer_sent      {{1}} first name, {{2}} brand, {{3}} amount  https://guapd.com/offer/{{1}}
 *   updated    experience_offer_updated   {{1}} first name, {{2}} brand, {{3}} amount  https://guapd.com/offer/{{1}}
 *   payment    experience_payment_sent    {{1}} first name, {{2}} amount, {{3}} brand  https://guapd.com/deals/{{1}}
 *
 * - brand = exactly "<Experience brand> · Managed by Guapd", from the leg's
 *   experience_brand_name (written from the Experience at send). Never the
 *   house brand's name.
 * - button {{1}} = the Experience-leg deal id. /offer/<id> and /deals/<id>
 *   both redirect a leg id to /creator/deals/<id> (the creator's own page,
 *   login required) — see app/offer/[token]/page.tsx and app/deals/[id]/page.tsx.
 * - amount = what reaches the creator: offer/updated = net after the fee + any
 *   allowance (no fee on it); payment = what was paid.
 * - experience_affiliate_link is approved but NOT wired: it waits on the
 *   affiliate posting flow (docs/experiences-plan.md, deferred).
 *
 * Sent only when EXPERIENCE_LEG_WHATSAPP is exactly 'true' (and lib/whatsapp's
 * own MSG91_WHATSAPP_ENABLED): staging holds real creators, and nothing here
 * should message them by accident. In-app + email always go regardless.
 * Sent to the creator's own number (a nominated WhatsApp number wins; an
 * explicit opt-out is honoured), from Guapd's MSG91 number. Never throws.
 */

export type LegWhatsAppStep = 'offer' | 'updated' | 'payment'

const TEMPLATE: Record<LegWhatsAppStep, string> = {
  offer: 'experience_offer_sent',
  updated: 'experience_offer_updated',
  payment: 'experience_payment_sent',
}

export function legWhatsAppOn(): boolean {
  return process.env.EXPERIENCE_LEG_WHATSAPP === 'true'
}

/** "Kiro · Managed by Guapd": the brand value every leg template carries. */
export function legBrandValue(experienceBrandName: string | null | undefined): string {
  return `${(experienceBrandName ?? '').trim() || 'A brand'} · Managed by Guapd`
}

/** The template variables for a step, in the order each approved template declares them. */
export function legWhatsAppVars(step: LegWhatsAppStep, firstName: string, brandValue: string, amount: string): string[] {
  return step === 'payment' ? [firstName, amount, brandValue] : [firstName, brandValue, amount]
}

export async function sendLegWhatsApp(step: LegWhatsAppStep, dealId: string, amountPaise: number | null | undefined): Promise<void> {
  try {
    if (!legWhatsAppOn()) return
    const admin = createAdminClient()
    const { data: deal } = await admin.from('deals')
      .select('id, creator_id, experience_brand_name, leg_role')
      .eq('id', dealId).maybeSingle()
    if (!deal || deal.leg_role !== 'creator_leg') return
    // An amount is part of every template; a missing one would send a broken message.
    if (amountPaise == null) { await record(dealId, step, 'skipped', 'no_amount'); return }

    const { phone, name, skipReason } = await creatorWhatsAppContact(deal.creator_id as string)
    if (!phone) { await record(dealId, step, 'skipped', skipReason ?? 'no_phone'); return }

    const res = await sendWhatsAppTemplate({
      template: TEMPLATE[step], toPhone: phone,
      bodyVars: legWhatsAppVars(step, name, legBrandValue(deal.experience_brand_name as string | null), formatAmountForMessage(amountPaise)),
      buttonValue: dealId, dealId,
    })
    await record(dealId, step, res.ok ? 'sent' : 'failed', res.ok ? undefined : res.reason, phone)
  } catch (err) {
    console.error(`[experience-whatsapp] ${step} threw deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** What the creator would now receive in all on their sent leg (net + allowance). */
export async function legTotalPaise(dealId: string): Promise<number | null> {
  const { data } = await createAdminClient().from('experience_creator_terms').select('creator_net_paise, allowance_paise').eq('deal_id', dealId).maybeSingle()
  return data ? Number(data.creator_net_paise) + Number(data.allowance_paise ?? 0) : null
}

async function record(dealId: string, step: string, outcome: 'sent' | 'failed' | 'skipped', reason?: string, phone?: string | null) {
  try {
    await createAdminClient().from('events').insert({
      deal_id: dealId, event_type: `experience.leg_whatsapp_${outcome}`,
      detail: { step, template: TEMPLATE[step as LegWhatsAppStep], ...(reason ? { reason } : {}), ...(phone ? { to: maskPhone(phone) } : {}) },
    })
  } catch { /* the notice matters more than its audit line */ }
}
