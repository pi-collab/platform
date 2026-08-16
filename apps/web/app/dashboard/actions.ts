'use server'

import { revalidatePath } from 'next/cache'
import { verifyBrand } from '@/lib/brand-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { APPROVAL_ACK_EVENT } from '@/lib/approval-notice'

/**
 * Dismiss the post-approval notice, permanently and for every device.
 *
 * The brand is resolved from the session via verifyBrand — never passed in.
 * A server action is directly callable, so accepting a brand id here would let
 * anyone dismiss any brand's notice.
 */
export async function acknowledgeApproval(): Promise<{ ok: boolean }> {
  const brand = await verifyBrand()

  const admin = createAdminClient()
  const { error } = await admin.from('events').insert({
    event_type: APPROVAL_ACK_EVENT,
    detail: { brand_id: brand.brandId },
  })

  if (error) {
    // Non-fatal: the notice reappears next load, which is a far smaller problem
    // than an error on a button whose only job is to hide a congratulation.
    console.error(`[approval-notice] ack failed brand=${brand.brandId}: ${error.message}`)
    return { ok: false }
  }

  revalidatePath('/dashboard')
  return { ok: true }
}
