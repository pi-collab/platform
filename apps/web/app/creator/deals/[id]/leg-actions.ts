'use server'

import { revalidatePath } from 'next/cache'
import { verifyCreator } from '@/lib/creator-auth'
import { createClient } from '@/lib/supabase/server'
import { notifyStaffLegAnswer, notifyStaffExtraAnswer } from '@/lib/experience-leg-notify'
import { notifyStaffItemSubmitted } from '@/lib/experience-deliverables-notify'
import { notifyStaffCreatorCountered } from '@/lib/experience-counter-notify'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyStaffCreatorInvoiced } from '@/lib/experience-money-notify'
import { storeCollabPostInsights } from '@/lib/post-insights-store'
import { notifyCollabPosted, notifyBrandAdCode, notifyStaffCommissionClaimed } from '@/lib/experience-collab-notify'

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
    return { ok: false, message: /already answered/i.test(error.message) ? 'You have already answered this offer.'
      : /new offer/i.test(error.message) ? 'Guapd sent you a new offer. Accept it, counter it, or decline.' : 'Could not save your answer. Please try again.' }
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


// ── 0542: counter an offer (rate and/or days), 3 times at most ─────────────
// creator_leg_counter / _counter_withdraw / _counter_accept run with the
// creator's own session: their own open leg only. A counter never changes the
// fee % or the deliverables; once both sides agree, the deal is frozen.
const plain = (m: string) => m.replace(/^.*?: /, '')

export async function counterLeg(dealId: string, rateRupees: string, days: string, note: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId)) return { ok: false, message: 'Something went wrong. Reload and try again.' }
  const rate = Number(String(rateRupees).replace(/[,\s₹]/g, ''))
  const d = Number(days)
  if (!Number.isInteger(rate) || rate <= 0) return { ok: false, message: 'Enter your day rate in whole rupees.' }
  if (!Number.isFinite(d) || d <= 0 || d > 365) return { ok: false, message: 'Enter the number of days.' }
  const { error } = await createClient().rpc('creator_leg_counter', {
    p_deal_id: dealId, p_day_rate_paise: rate * 100, p_days: Math.round(d * 100) / 100, p_note: typeof note === 'string' ? note.slice(0, 500) : null,
  })
  if (error) return { ok: false, message: plain(error.message) }
  await notifyStaffCreatorCountered(dealId)
  revalidatePath(`/creator/deals/${dealId}`)
  return { ok: true }
}

export async function withdrawMyCounter(dealId: string, counterId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(counterId)) return { ok: false, message: 'Something went wrong. Reload and try again.' }
  const { error } = await createClient().rpc('creator_leg_counter_withdraw', { p_counter_id: counterId })
  if (error) return { ok: false, message: plain(error.message) }
  revalidatePath(`/creator/deals/${dealId}`)
  return { ok: true }
}

export async function acceptGuapdCounter(dealId: string, counterId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(counterId)) return { ok: false, message: 'Something went wrong. Reload and try again.' }
  const { error } = await createClient().rpc('creator_leg_counter_accept', { p_counter_id: counterId })
  if (error) return { ok: false, message: plain(error.message) }
  await notifyStaffLegAnswer(dealId, true)
  revalidatePath(`/creator/deals/${dealId}`); revalidatePath('/creator/deals'); revalidatePath('/creator/dashboard')
  return { ok: true }
}

// ── 0552: confirm the shoot and raise the invoice to Guapd ────────────────
// creator_leg_invoice_raise runs with the creator's own session and checks in
// Postgres that the deal is theirs, Guapd marked the shoot done, their part is
// complete and no invoice is issued yet. Every figure is copied from the locked
// terms by the database; the screen's total is only checked against it.
export async function raiseLegInvoice(dealId: string, input: { confirmed: boolean; billingName: string; gstin: string; expectedPayablePaise: number }): Promise<LegOut<{ number: string }>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !input || typeof input.confirmed !== 'boolean' || typeof input.billingName !== 'string'
      || typeof input.gstin !== 'string' || !Number.isSafeInteger(input.expectedPayablePaise)) {
    return { ok: false, message: 'Something went wrong. Reload and try again.' }
  }
  const { data, error } = await createClient().rpc('creator_leg_invoice_raise', {
    p_deal_id: dealId, p_shoot_confirmed: input.confirmed, p_billing_name: input.billingName.slice(0, 200),
    p_gstin: input.gstin.slice(0, 20), p_expected_payable_paise: input.expectedPayablePaise,
  })
  if (error) {
    const m = error.message
    return { ok: false, message: /Confirm the shoot/i.test(m) ? 'Tick the box to confirm the shoot is done.'
      : /already raised/i.test(m) ? 'You have already raised your invoice for this deal.'
      : /GSTIN/i.test(m) ? 'That GSTIN is not valid. Check it, or leave it empty.'
      : /name to invoice/i.test(m) ? 'Enter the name to invoice from.'
      : /changed/i.test(m) ? 'These figures have changed. Refresh the page and check them again.'
      : /approval/i.test(m) ? 'Your deliverables need Guapd\u2019s approval before you invoice.'
      : /marks your shoot done/i.test(m) ? 'You can raise your invoice once Guapd marks your shoot done.'
      : /bank details/i.test(m) ? 'Add your bank details and PAN on the Payments page before you raise your invoice.'
      : 'Could not raise your invoice. Please try again.' }
  }
  const out = data as { id: string; number: string }
  await notifyStaffCreatorInvoiced(dealId, out.number)
  revalidatePath(`/creator/deals/${dealId}`)
  return { ok: true, data: { number: out.number } }
}

// ── 0555: extra deliverables offered on this deal ─────────────────────────
export async function respondToExtra(dealId: string, extraId: string, accept: boolean, reason: string, expectedNetPaise: number): Promise<LegOut<null>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(extraId) || typeof accept !== 'boolean' || !Number.isSafeInteger(expectedNetPaise)) return { ok: false, message: 'Something went wrong. Reload and try again.' }
  const { error } = await createClient().rpc('creator_leg_extra_respond', {
    p_extra_id: extraId, p_accept: accept, p_reason: typeof reason === 'string' ? reason.slice(0, 500) : null, p_expected_net_paise: expectedNetPaise,
  })
  if (error) return { ok: false, message: /changed/i.test(error.message) ? 'Guapd changed this offer. Refresh to see the latest.' : /closed/i.test(error.message) ? 'This deal is closed.' : 'Could not save your answer. Please try again.' }
  await notifyStaffExtraAnswer(dealId, accept)
  revalidatePath(`/creator/deals/${dealId}`)
  return { ok: true, data: null }
}

export async function raiseExtraInvoice(dealId: string, extraId: string, input: { confirmed: boolean; billingName: string; gstin: string; expectedPayablePaise: number }): Promise<LegOut<{ number: string }>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(extraId) || !input || typeof input.confirmed !== 'boolean' || typeof input.billingName !== 'string'
      || typeof input.gstin !== 'string' || !Number.isSafeInteger(input.expectedPayablePaise)) {
    return { ok: false, message: 'Something went wrong. Reload and try again.' }
  }
  const { data, error } = await createClient().rpc('creator_leg_extra_invoice_raise', {
    p_extra_id: extraId, p_confirmed: input.confirmed, p_billing_name: input.billingName.slice(0, 200),
    p_gstin: input.gstin.slice(0, 20), p_expected_payable_paise: input.expectedPayablePaise,
  })
  if (error) {
    const m = error.message
    return { ok: false, message: /Confirm/i.test(m) ? 'Tick the box to confirm first.'
      : /already raised/i.test(m) ? 'You have already raised the invoice for this extra.'
      : /GSTIN/i.test(m) ? 'That GSTIN is not valid. Check it, or leave it empty.'
      : /name to invoice/i.test(m) ? 'Enter the name to invoice from.'
      : /changed/i.test(m) ? 'These figures have changed. Refresh the page and check them again.'
      : /complete|shoot is done/i.test(m) ? 'You can invoice this once your part is complete.'
      : /bank details/i.test(m) ? 'Add your bank details and PAN on the Payments page before you raise your invoice.'
      : 'Could not raise your invoice. Please try again.' }
  }
  const out = data as { id: string; number: string }
  await notifyStaffCreatorInvoiced(dealId, out.number)
  revalidatePath(`/creator/deals/${dealId}`)
  return { ok: true, data: { number: out.number } }
}

// ── 0561: the videos Guapd sent this creator (collab / share) ─────────────
// creator_collab_file and creator_collab_post_link run with the creator's own
// session: their own deal's live posts only. The service role signs a
// 10-minute link for exactly the path the database just returned.
export async function openCollabVideo(dealId: string, postId: string): Promise<LegOut<string>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(postId)) return { ok: false, message: 'Something went wrong.' }
  const { data, error } = await createClient().rpc('creator_collab_file', { p_post_id: postId })
  if (error || !data) return { ok: false, message: 'This video is no longer shared with you.' }
  const f = data as { storage_path: string | null; external_url: string | null }
  if (f.external_url) return { ok: true, data: f.external_url }
  const signed = await createAdminClient().storage.from('deliverables').createSignedUrl(f.storage_path as string, 600, { download: true })
  if (signed.error || !signed.data) return { ok: false, message: 'Could not open the video. Try again.' }
  return { ok: true, data: signed.data.signedUrl }
}

export async function submitCollabPostLink(dealId: string, postId: string, url: string): Promise<LegOut<null>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(postId) || typeof url !== 'string') return { ok: false, message: 'Something went wrong.' }
  // The brand and staff hear about the first post only, not each correction.
  const { data: before } = await createClient().rpc('creator_collab_posts', { p_deal_id: dealId })
  const first = !((before ?? []) as { id: string; post_url: string | null }[]).some((p) => p.id === postId && p.post_url)
  const { error } = await createClient().rpc('creator_collab_post_link', { p_post_id: postId, p_url: url.trim().slice(0, 500) })
  if (error) return { ok: false, message: /Instagram post link/i.test(error.message) ? 'Paste the link to your Instagram post or reel (https://www.instagram.com/…).'
    : /final/i.test(error.message) ? 'The brand marked the ad complete; the link is final.' : /closed/i.test(error.message) ? 'This Experience is closed.' : 'Could not save the link. Please try again.' }
  if (first) await notifyCollabPosted(postId, 'creator')
  // 0576: the same verified-numbers lookup a deal post gets. A failure here
  // never fails saving the link; the nightly job retries a pending post.
  try { await storeCollabPostInsights(postId) } catch { /* retried by the cron */ }
  revalidatePath(`/creator/deals/${dealId}`)
  revalidatePath(`/creator/deals/${dealId}/analytics`)
  return { ok: true, data: null }
}

// 0574: the creator's partnership ad code for the brand (after the post link).
export async function submitCollabAdCode(dealId: string, postId: string, code: string): Promise<LegOut<null>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !isId(postId) || typeof code !== 'string') return { ok: false, message: 'Something went wrong.' }
  const { data, error } = await createClient().rpc('creator_collab_ad_code', { p_post_id: postId, p_code: code.trim().slice(0, 300) })
  if (error) return { ok: false, message: /no spaces/i.test(error.message) ? 'Paste the ad code from Instagram, without spaces.'
    : /post link first/i.test(error.message) ? 'Add your post link first. The code can change until the ad is complete.'
    : /closed/i.test(error.message) ? 'This Experience is closed.' : 'Could not save the ad code. Please try again.' }
  if (data === true) await notifyBrandAdCode(postId)
  revalidatePath(`/creator/deals/${dealId}`)
  return { ok: true, data: null }
}

// ── 0563: the affiliate commission ─────────────────────────────────────────
// creator_affiliate_claim runs with the creator's own session: their own deal,
// every collab ad complete, figures computed in Postgres (the screen's total is
// checked against them).
export async function claimAffiliateCommission(dealId: string, input: { salesRupees: string; confirmed: boolean; billingName: string; gstin: string; expectedPayablePaise: number }): Promise<LegOut<{ number: string }>> {
  await verifyCreator(`/creator/deals/${dealId}`)
  if (!isId(dealId) || !input || typeof input.salesRupees !== 'string' || !Number.isSafeInteger(input.expectedPayablePaise)) return { ok: false, message: 'Something went wrong. Reload and try again.' }
  const m = input.salesRupees.replace(/[,\s₹]/g, '').match(/^(\d{1,10})(?:\.(\d{1,2}))?$/)
  if (!m) return { ok: false, message: 'Enter the sales amount in rupees, e.g. 125000 or 125000.50' }
  const salesPaise = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  const { data, error } = await createClient().rpc('creator_affiliate_claim', {
    p_deal_id: dealId, p_sales_paise: salesPaise, p_confirmed: input.confirmed === true,
    p_billing_name: typeof input.billingName === 'string' ? input.billingName.slice(0, 200) : '', p_gstin: typeof input.gstin === 'string' ? input.gstin.slice(0, 15) : null,
    p_expected_payable_paise: input.expectedPayablePaise,
  })
  if (error) return { ok: false, message: /Confirm/i.test(error.message) ? 'Confirm the sales figure first.' : /changed/i.test(error.message) ? 'These figures have changed. Refresh the page and check them again.'
    : /GSTIN/i.test(error.message) ? 'That GSTIN is not valid.' : /name to invoice/i.test(error.message) ? 'Enter the name to invoice from.'
    : /already claimed/i.test(error.message) ? 'You have already claimed this commission.' : /ads complete/i.test(error.message) ? 'You can claim once the brand marks your collab ads complete.'
    : /bank details/i.test(error.message) ? 'Add your bank details and PAN on the Payments page before you raise your invoice.' : /no commission|more than zero/i.test(error.message) ? 'Enter a sales amount that earns a commission.' : 'Could not raise your invoice. Please try again.' }
  const out = data as { id: string; number: string }
  await notifyStaffCommissionClaimed(out.id)
  revalidatePath(`/creator/deals/${dealId}`)
  return { ok: true, data: { number: out.number } }
}

