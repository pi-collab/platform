'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { notifyStaffLegAnswer } from '@/lib/experience-leg-notify'
import { notifyStaffItemSubmitted } from '@/lib/experience-deliverables-notify'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The creator's actions on a Guapd Experience creator leg: accept or
 * decline (here), and on creator-submit shoots, submitting deliverables
 * (0538, below). creator_leg_respond (0534) runs with the creator's own session and
 * checks in Postgres that the leg is theirs and still open; every other write
 * to a leg is refused. The house brand has no members, so the Experiences
 * staff are told instead (in-app).
 */
export async function respondToLeg(dealId: string, accept: boolean, reason?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (typeof dealId !== 'string' || !/^[0-9a-f-]{36}$/i.test(dealId) || typeof accept !== 'boolean') {
    return { ok: false, message: 'Something went wrong. Reload and try again.' }
  }
  const { error } = await createClient().rpc('creator_leg_respond', {
    p_deal_id: dealId, p_accept: accept, p_reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
  })
  if (error) {
    return { ok: false, message: /already answered/i.test(error.message) ? 'You have already answered this offer.' : 'Could not save your answer. Please try again.' }
  }
  await notifyStaffLegAnswer(dealId, accept)
  revalidatePath(`/creator/deals/${dealId}`)
  revalidatePath('/creator/deals')
  revalidatePath('/creator/dashboard')
  return { ok: true }
}

// ── 0538: deliverables on a creator-submit shoot ───────────────────────────
// creator_leg_item_upload_slot / creator_leg_item_submit run with the
// creator's own session and check in Postgres that the leg is theirs, the
// shoot is marked done for them, and this shoot is one where creators submit.
// The service role only signs an upload for the exact path the database
// returned. Guapd-provides shoots refuse both.

type LegOut<T = null> = { ok: true; data: T } | { ok: false; message: string }
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const friendly = (m: string) =>
  /Mark this creator|shoot done/i.test(m) ? 'You can submit once Guapd marks your shoot done.'
  : /nothing for you to submit/i.test(m) ? 'Guapd delivers the content on this shoot; there is nothing for you to submit.'
  : /file type/i.test(m) ? 'That file type is not accepted. Use a video, image, PDF, audio file or zip.'
  : /Approved already/i.test(m) ? 'Guapd already approved this one.'
  : /https/i.test(m) ? 'The link must start with https://'
  : /did not finish uploading|does not match/i.test(m) ? 'The upload did not finish. Please try again.'
  : 'Could not save that. Please try again.'

export async function startLegItemUpload(dealId: string, itemId: string, fileName: string): Promise<LegOut<{ path: string; token: string }>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(itemId) || typeof fileName !== 'string') return { ok: false, message: 'Something went wrong. Reload and try again.' }
  const { data, error } = await createClient().rpc('creator_leg_item_upload_slot', { p_item_id: itemId, p_file_name: fileName.slice(0, 200) })
  if (error) return { ok: false, message: friendly(error.message) }
  const signed = await createAdminClient().storage.from('deliverables').createSignedUploadUrl(data as string)
  if (signed.error || !signed.data) return { ok: false, message: 'Could not start the upload. Please try again.' }
  return { ok: true, data: { path: signed.data.path, token: signed.data.token } }
}

export async function submitLegItem(dealId: string, itemId: string, c: { url?: string | null; storagePath?: string | null; fileName?: string | null }): Promise<LegOut<number>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(itemId)) return { ok: false, message: 'Something went wrong. Reload and try again.' }
  const url = typeof c.url === 'string' && c.url.trim() ? c.url.trim().slice(0, 2000) : null
  const storagePath = typeof c.storagePath === 'string' && c.storagePath.trim() ? c.storagePath.trim().slice(0, 600) : null
  if (!url === !storagePath) return { ok: false, message: 'Add a link or a file.' }
  const { data, error } = await createClient().rpc('creator_leg_item_submit', {
    p_item_id: itemId, p_url: url, p_storage_path: storagePath, p_file_name: storagePath && typeof c.fileName === 'string' ? c.fileName.trim().slice(0, 200) : null,
  })
  if (error) return { ok: false, message: friendly(error.message) }
  const { data: item } = await createClient().from('deal_deliverable_items').select('label').eq('id', itemId).maybeSingle()
  await notifyStaffItemSubmitted(dealId, item?.label ?? 'a deliverable')
  revalidatePath(`/creator/deals/${dealId}`)
  return { ok: true, data: Number(data) }
}

/** A short-lived link to the creator's own submitted file (RLS: their own, visible items only). */
export async function openLegItemFile(dealId: string, itemId: string): Promise<LegOut<string>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(itemId)) return { ok: false, message: 'Something went wrong.' }
  const { data: item } = await createClient().from('deal_deliverable_items').select('storage_path').eq('id', itemId).eq('deal_id', dealId).maybeSingle()
  if (!item?.storage_path) return { ok: false, message: 'No file here.' }
  const { data, error } = await createAdminClient().storage.from('deliverables').createSignedUrl(item.storage_path, 600)
  if (error || !data) return { ok: false, message: 'Could not open the file.' }
  return { ok: true, data: data.signedUrl }
}
