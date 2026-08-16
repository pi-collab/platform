'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyBrand } from '@/lib/brand-auth'
import { revalidatePath } from 'next/cache'
import { notifyDealParty } from '@/lib/notifications'

type ActionResult = { status: 'ok' } | { status: 'error'; message: string }

/**
 * Brand accepts the creator's counter offer — transitions negotiating → agreed.
 */
export async function acceptCounterOffer(dealId: string): Promise<ActionResult> {
  const brand = await verifyBrand()
  if (!brand) return { status: 'error', message: 'Not authorised' }

  const supabase = await createClient()
  const { data: deal } = await supabase
    .from('deals')
    .select('id, status, usage_rights, usage_rights_end_date')
    .eq('id', dealId)
    .eq('brand_id', brand.brandId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'negotiating') return { status: 'error', message: `Cannot accept: deal is "${deal.status}".` }

  // Find the latest creator counter to apply its prices
  const admin = createAdminClient()
  const { data: counterEvents } = await admin
    .from('events')
    .select('detail')
    .eq('deal_id', dealId)
    .eq('event_type', 'deal.counter_offer')
    .order('created_at', { ascending: false })
    .limit(1)

  const latestCounter = counterEvents?.[0]?.detail as { counter_items?: { id: string; label: string; price_paise: number }[]; counter_total_paise?: number } | undefined

  const now = new Date().toISOString()

  // Update deal status + total price from counter
  const dealUpdate: Record<string, unknown> = { status: 'agreed', agreed_at: now, rights_confirmed_at: now }
  if (latestCounter?.counter_total_paise) {
    dealUpdate.price_paise = latestCounter.counter_total_paise
  }

  const { error } = await supabase
    .from('deals')
    .update(dealUpdate)
    .eq('id', dealId)
    .eq('status', 'negotiating')

  if (error) return { status: 'error', message: error.message }

  // Update individual deliverable item prices from counter
  if (latestCounter?.counter_items) {
    for (const ci of latestCounter.counter_items) {
      await admin
        .from('deal_deliverable_items')
        .update({ price_paise: ci.price_paise })
        .eq('id', ci.id)
        .eq('deal_id', dealId)
    }
  }

  // Audit event
  await admin.from('events').insert({
    deal_id: dealId,
    event_type: 'deal.counter_accepted',
    detail: { accepted_by: 'brand', accepted_at: now, applied_prices: latestCounter?.counter_items ?? null },
  })

  notifyDealParty(dealId, 'creator', 'deal_agreed', (t) => `Your counter for "${t}" was accepted`)

  revalidatePath(`/deals/${dealId}`)
  return { status: 'ok' }
}

/**
 * Brand sends a counter back to the creator's counter.
 */
export async function brandCounterOffer(
  dealId: string,
  counterItems: { id: string; label: string; price_paise: number }[],
  note?: string,
): Promise<ActionResult> {
  const brand = await verifyBrand()
  if (!brand) return { status: 'error', message: 'Not authorised' }

  const supabase = await createClient()
  const { data: deal } = await supabase
    .from('deals')
    .select('id, status')
    .eq('id', dealId)
    .eq('brand_id', brand.brandId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (deal.status !== 'negotiating') return { status: 'error', message: `Cannot counter: deal is "${deal.status}".` }

  const totalPaise = counterItems.reduce((sum, i) => sum + i.price_paise, 0)
  if (totalPaise <= 0) return { status: 'error', message: 'Counter total must be greater than zero.' }

  const admin = createAdminClient()
  await admin.from('events').insert({
    deal_id: dealId,
    event_type: 'deal.brand_counter',
    detail: { counter_items: counterItems, counter_total_paise: totalPaise, note: note?.trim() || null },
  })

  // Send a message
  const { data: user } = await supabase.auth.getUser()
  if (user?.user) {
    const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.user.id).maybeSingle()
    if (profile) {
      const lines = counterItems.map((i) => `${i.label}: \u20B9${(i.price_paise / 100).toLocaleString('en-IN')}`)
      const body = `Counter offer:\n${lines.join('\n')}\nTotal: \u20B9${(totalPaise / 100).toLocaleString('en-IN')}${note?.trim() ? `\n\nNote: ${note.trim()}` : ''}`
      await supabase.from('messages').insert({ deal_id: dealId, sender_id: profile.id, sender_party: 'brand', body })
    }
  }

  notifyDealParty(dealId, 'creator', 'counter_offer', (t) => `New counter offer for "${t}"`)

  revalidatePath(`/deals/${dealId}`)
  return { status: 'ok' }
}

export async function updateDealTitle(dealId: string, title: string) {
  const brand = await verifyBrand()
  if (!brand) return { status: 'error' as const, message: 'Not authorised' }

  const trimmed = title.trim()
  if (!trimmed) return { status: 'error' as const, message: 'Title cannot be empty' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('deals')
    .update({ title: trimmed })
    .eq('id', dealId)
    .eq('brand_id', brand.brandId)

  if (error) return { status: 'error' as const, message: error.message }

  revalidatePath(`/deals/${dealId}`)
  return { status: 'ok' as const }
}
