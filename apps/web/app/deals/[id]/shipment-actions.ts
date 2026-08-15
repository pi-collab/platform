'use server'

import { verifyBrand } from '@/lib/brand-auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyDealParty } from '@/lib/notifications'

type Result =
  | { status: 'success' }
  | { status: 'error'; message: string }

/**
 * Mark a deal's product as shipped (pending → shipped).
 * Brand-only action — verifyBrand() is the guard.
 */
export async function markShipped(
  dealId: string,
  trackingLink?: string,
  carrierNote?: string,
): Promise<Result> {
  await verifyBrand()
  const supabase = createClient()

  // Validate tracking link if provided
  if (trackingLink?.trim()) {
    try {
      const parsed = new URL(trackingLink.trim())
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { status: 'error', message: 'Tracking link must start with http:// or https://' }
      }
    } catch {
      return { status: 'error', message: 'Please enter a valid tracking URL' }
    }
  }

  const { data: deal } = await supabase
    .from('deals')
    .select('id, requires_shipment, shipment_status, status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (!deal.requires_shipment) return { status: 'error', message: 'This deal does not require a product shipment.' }
  if (deal.shipment_status !== 'pending') {
    return { status: 'error', message: `Cannot mark as shipped — shipment is already "${deal.shipment_status}".` }
  }
  if (deal.status === 'negotiating' || deal.status === 'declined' || deal.status === 'cancelled') {
    return { status: 'error', message: `Cannot ship for a deal that is "${deal.status}".` }
  }

  const { error } = await supabase
    .from('deals')
    .update({
      shipment_status: 'shipped',
      tracking_link: trackingLink?.trim() || null,
      carrier_note: carrierNote?.trim() || null,
      shipped_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('shipment_status', 'pending')

  if (error) return { status: 'error', message: `Failed to update shipment: ${error.message}` }

  notifyDealParty(dealId, 'creator', 'product_shipped', (t) => `Product shipped for ${t}`)

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}

/**
 * Mark a shipment as delivered (shipped → delivered).
 * Brand-only action — brand confirms delivery via tracking info.
 */
export async function markShipmentDelivered(dealId: string): Promise<Result> {
  await verifyBrand()
  const supabase = createClient()

  const { data: deal } = await supabase
    .from('deals')
    .select('id, requires_shipment, shipment_status')
    .eq('id', dealId)
    .maybeSingle()

  if (!deal) return { status: 'error', message: 'Deal not found.' }
  if (!deal.requires_shipment) return { status: 'error', message: 'This deal does not require a product shipment.' }
  if (deal.shipment_status !== 'shipped') {
    return { status: 'error', message: `Cannot mark as delivered — shipment is "${deal.shipment_status}".` }
  }

  const { error } = await supabase
    .from('deals')
    .update({ shipment_status: 'delivered' })
    .eq('id', dealId)
    .eq('shipment_status', 'shipped')

  if (error) return { status: 'error', message: `Failed to update shipment: ${error.message}` }

  notifyDealParty(dealId, 'creator', 'product_delivered', (t) => `Product delivered for ${t}`)

  revalidatePath(`/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}`)
  return { status: 'success' }
}
