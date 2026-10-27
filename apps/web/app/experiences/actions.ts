'use server'

import { revalidatePath } from 'next/cache'
import { verifyBrand } from '@/lib/brand-auth'
import { parseExperienceRequest, type RequestFormFields } from '@/lib/experience-request-validate'
import { brandSendToGuapd, getBrandGuapdThread, brandAcceptRosterMany, brandAddRosterCreators, brandSuggestCreator, brandAnswerQuote, brandAnswerAddon, brandDecideRelease, brandDecideRoster, brandRequestExperience, brandSignOff, brandCollabAct, brandReportPayment, brandPayinQuote } from '@/lib/experience-brand-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkoutSignatureValid, createRazorpayOrder, razorpayKeyId } from '@/lib/razorpay-payin'
import { notifyCreatorAffiliateAdded } from '@/lib/experience-collab-notify'
import { notifyStaffBrandActed, notifyStaffBrandMessage } from '@/lib/experience-brand-notify'
import { registerExperienceRequestReview } from '@/lib/send-gate'
import { rupeesToPaise } from '@/lib/experience-request'

/**
 * The brand's own Experience actions (0544). Each passes verifyBrand (a
 * signed-in, non-rejected brand member) and then calls a brand_experience_*
 * database function with the member's own session, which checks membership
 * of THIS Experience's brand again, admin-only steps (price, sign-off), the
 * point of no return and a stale screen. Messages here are friendly; the
 * database is the authority.
 */
type Out<T = null> = { ok: true; data: T } | { ok: false; error: string }
const BASE = '/experiences'
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const note = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
const done = (id: string) => { revalidatePath(BASE); revalidatePath(`${BASE}/${id}`) }

export async function requestExperience(f: RequestFormFields): Promise<Out<string>> {
  const brand = await verifyBrand()
  const parsed = parseExperienceRequest(f)
  if (!parsed.ok) return parsed
  const r = await brandRequestExperience(parsed.value)
  if (!r.ok) return r
  done(r.data)
  await notifyStaffBrandActed(r.data, 'requested a new Experience')
  // 0556: a brand not yet approved may request; its first request opens the review.
  if (brand.brandStatus !== 'approved') await registerExperienceRequestReview(brand.brandId)
  return r
}

export async function answerQuote(experienceId: string, quoteId: string, accept: boolean, why: string): Promise<Out> {
  await verifyBrand()
  if (!isUuid(experienceId) || !isUuid(quoteId) || typeof accept !== 'boolean') return { ok: false, error: 'Not found.' }
  const text = note(why, 1000)
  if (!accept && (!text || text.length < 3)) return { ok: false, error: 'Tell Guapd what would work.' }
  const r = await brandAnswerQuote(quoteId, accept, accept ? null : text)
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, accept ? 'accepted the price' : 'declined the price, with a note')
  return r
}

/** 0554: the brand accepts or declines an add-on to its agreed price. */
export async function answerAddon(experienceId: string, addonId: string, accept: boolean, why: string, expectedTotalPaise: number): Promise<Out> {
  await verifyBrand()
  if (!isUuid(experienceId) || !isUuid(addonId) || typeof accept !== 'boolean' || !Number.isSafeInteger(expectedTotalPaise)) return { ok: false, error: 'Not found.' }
  const text = note(why, 1000)
  if (!accept && (!text || text.length < 3)) return { ok: false, error: 'Tell Guapd what would work.' }
  const r = await brandAnswerAddon(addonId, accept, accept ? null : text, expectedTotalPaise)
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, accept ? 'accepted an add-on to the price' : 'declined an add-on, with a note')
  return r
}

export async function decideRosterCreator(experienceId: string, rosterId: string, decision: 'accepted' | 'rejected' | 'on_hold', expected: string): Promise<Out> {
  await verifyBrand()
  if (!isUuid(experienceId) || !isUuid(rosterId)) return { ok: false, error: 'Not found.' }
  if (!['accepted', 'rejected', 'on_hold'].includes(decision)) return { ok: false, error: 'Accept, reject or put on hold.' }
  if (!['pending', 'accepted', 'on_hold'].includes(expected)) return { ok: false, error: 'Refresh the page and try again.' }
  const r = await brandDecideRoster(rosterId, decision, expected)
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, decision === 'accepted' ? 'accepted a creator' : decision === 'on_hold' ? 'put a creator on hold' : 'rejected a creator')
  return r
}

/** 0558: the brand suggests a creator who is not on Guapd yet. */
export async function suggestCreator(experienceId: string, fullName: string, handle: string, why: string): Promise<Out<string>> {
  await verifyBrand()
  if (!isUuid(experienceId) || typeof fullName !== 'string' || typeof handle !== 'string') return { ok: false, error: 'Not found.' }
  const name = fullName.trim()
  if (name.length < 2) return { ok: false, error: 'Enter their name.' }
  if (!handle.trim()) return { ok: false, error: 'Enter their Instagram handle.' }
  const r = await brandSuggestCreator(experienceId, name.slice(0, 120), handle.trim().slice(0, 200), note(why, 500))
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, 'suggested a creator who is not on Guapd yet')
  return r
}

/** 0557: the brand adds creators it wants; each joins the roster accepted. */
export async function addRosterCreators(experienceId: string, creatorIds: string[]): Promise<Out<number>> {
  await verifyBrand()
  if (!isUuid(experienceId) || !Array.isArray(creatorIds) || creatorIds.length === 0 || creatorIds.length > 20 || !creatorIds.every(isUuid)) {
    return { ok: false, error: 'Pick up to 20 creators.' }
  }
  const r = await brandAddRosterCreators(experienceId, Array.from(new Set(creatorIds)))
  if (!r.ok) return r
  done(experienceId)
  if (r.data > 0) await notifyStaffBrandActed(experienceId, r.data === 1 ? 'added a creator to review on the roster' : `added ${r.data} creators to review on the roster`)
  return r
}

/** 0548: accept several creators at once. Reject and hold stay one at a time. */
export async function acceptRosterCreators(experienceId: string, items: { rosterId: string; expected: string }[]): Promise<Out<number>> {
  await verifyBrand()
  if (!isUuid(experienceId) || !Array.isArray(items) || items.length === 0 || items.length > 200) return { ok: false, error: 'Pick the creators to accept.' }
  if (!items.every((i) => isUuid(i.rosterId) && ['pending', 'on_hold'].includes(i.expected))) return { ok: false, error: 'Refresh the page and try again.' }
  const r = await brandAcceptRosterMany(experienceId, items.map((i) => ({ roster_id: i.rosterId, expected: i.expected })))
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, `accepted ${r.data} creator${r.data === 1 ? '' : 's'}`)
  return r
}

export async function decideDeliverable(experienceId: string, releaseId: string, decision: 'approved' | 'changes_requested', why: string, expected: string): Promise<Out> {
  await verifyBrand()
  if (!isUuid(experienceId) || !isUuid(releaseId)) return { ok: false, error: 'Not found.' }
  if (decision !== 'approved' && decision !== 'changes_requested') return { ok: false, error: 'Approve, or ask for changes.' }
  if (!['new', 'changes_requested'].includes(expected)) return { ok: false, error: 'Refresh the page and try again.' }
  const text = note(why, 1000)
  if (decision === 'changes_requested' && (!text || text.length < 3)) return { ok: false, error: 'Say what to change.' }
  const r = await brandDecideRelease(releaseId, decision, text, expected)
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, decision === 'approved' ? 'approved a deliverable' : 'asked for changes to a deliverable')
  return r
}

export async function signOffExperience(experienceId: string, why: string): Promise<Out> {
  await verifyBrand()
  if (!isUuid(experienceId)) return { ok: false, error: 'Not found.' }
  const r = await brandSignOff(experienceId, note(why, 500))
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, 'signed off')
  return r
}

// ── 0550: the brand ↔ Guapd thread ──
/** Send to Guapd. Shaped for the shared chat (DealThread's channel). Bind the Experience id. */
export async function sendMessageToGuapd(experienceId: string, body: string): Promise<{ status: 'success' | 'error'; message?: string; data?: { id: string; body: string; created_at: string } }> {
  await verifyBrand()
  if (!isUuid(experienceId)) return { status: 'error', message: 'Not found.' }
  if (typeof body !== 'string' || !body.trim()) return { status: 'error', message: 'Write a message first.' }
  const r = await brandSendToGuapd(experienceId, body)
  if (!r.ok) return { status: 'error', message: r.error }
  await notifyStaffBrandMessage(experienceId)
  done(experienceId)
  return { status: 'success', data: r.data }
}

/** Opening the thread marks it read (the read is the brand function itself). */
export async function markGuapdThreadRead(experienceId: string): Promise<void> {
  await verifyBrand()
  if (!isUuid(experienceId)) return
  await getBrandGuapdThread(experienceId)
}

/** 0561: the brand adds its affiliate link to a live collab, or marks the ad complete. */
export async function actOnCollab(experienceId: string, postId: string, action: 'affiliate' | 'ad_complete', url: string | null): Promise<Out<null>> {
  await verifyBrand()
  if (!isUuid(experienceId) || !isUuid(postId) || (action !== 'affiliate' && action !== 'ad_complete')) return { ok: false, error: 'Not found.' }
  const link = action === 'affiliate' ? (typeof url === 'string' ? url.trim().slice(0, 500) : '') : null
  if (action === 'affiliate' && !/^https:\/\//i.test(link ?? '')) return { ok: false, error: 'Paste the full affiliate link, starting with https://' }
  const r = await brandCollabAct(postId, action, link)
  if (!r.ok) return r
  done(experienceId)
  if (action === 'affiliate') await notifyCreatorAffiliateAdded(postId)
  await notifyStaffBrandActed(experienceId, action === 'affiliate' ? 'added its affiliate link to a collab' : 'marked a collab ad complete')
  return r
}

/**
 * 0568: the brand marks a payment it made against Guapd's invoice: amount, TDS
 * it deducted, the date, how, and the reference. A report, not a receipt:
 * Guapd confirms it against its bank before it counts as received.
 */
const PAY_METHODS = ['bank_transfer', 'upi', 'cheque', 'cash', 'other'] as const
export async function reportPayment(experienceId: string, invoiceId: string, f: { amount: string; tds: string; paidOn: string; method: string; reference: string; note: string }): Promise<Out<{ balance_paise: number }>> {
  await verifyBrand()
  if (!isUuid(experienceId) || !isUuid(invoiceId)) return { ok: false, error: 'Not found.' }
  const amountPaise = rupeesToPaise(String(f.amount ?? ''))
  const tdsPaise = String(f.tds ?? '').trim() === '' ? 0 : rupeesToPaise(String(f.tds))
  if (amountPaise == null || amountPaise < 0 || tdsPaise == null || tdsPaise < 0 || amountPaise + tdsPaise <= 0) return { ok: false, error: 'Enter the amount you paid (and any TDS you deducted).' }
  const paidOn = typeof f.paidOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.paidOn) ? f.paidOn : null
  if (!paidOn) return { ok: false, error: 'Enter the date you paid.' }
  if (!(PAY_METHODS as readonly string[]).includes(f.method)) return { ok: false, error: 'Say how you paid.' }
  const reference = note(f.reference, 100)
  if (!reference || reference.length < 3) return { ok: false, error: 'Enter the payment reference (UTR or cheque number).' }
  const r = await brandReportPayment({ invoiceId, amountPaise, tdsPaise, paidOn, method: f.method, reference, note: note(f.note, 300) })
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, 'marked a payment against an invoice')
  return { ok: true, data: { balance_paise: Number(r.data.balance_paise) } }
}

/**
 * 0578: pay a Guapd invoice online (Razorpay Standard Checkout). Admin only,
 * checked again in Postgres. The amount is the invoice's balance worked out in
 * the database (brand_experience_payin_quote); nothing the browser sends sets
 * it. The order is filed by razorpay_payin_order_record, which works the
 * balance out again and refuses if it moved. Recording the money is the
 * webhook's job, never this one's.
 */
export type OnlinePayment = { keyId: string; orderId: string; amountPaise: number; currency: 'INR'; invoiceNumber: string; brandName: string }
export async function startOnlinePayment(experienceId: string, invoiceId: string): Promise<Out<OnlinePayment>> {
  const brand = await verifyBrand()
  if (!isUuid(experienceId) || !isUuid(invoiceId)) return { ok: false, error: 'Not found.' }
  const keyId = razorpayKeyId()
  if (!keyId) return { ok: false, error: 'Online payment is not available yet.' }
  const q = await brandPayinQuote(invoiceId)
  if (!q.ok) return q
  if (q.data.experience_id !== experienceId) return { ok: false, error: 'Not found.' }
  const base = { keyId, amountPaise: q.data.amount_paise, currency: 'INR' as const, invoiceNumber: q.data.number, brandName: brand.brandName }
  // A second click or tab reuses the unpaid order for the same amount.
  if (q.data.order_id) return { ok: true, data: { ...base, orderId: q.data.order_id } }

  const order = await createRazorpayOrder({ amountPaise: q.data.amount_paise, receipt: q.data.number, notes: { invoice_id: invoiceId, experience_id: experienceId } })
  if (!order.ok) return { ok: false, error: order.error }
  const { error } = await createAdminClient().rpc('razorpay_payin_order_record', {
    p_razorpay_order_id: order.orderId, p_invoice_id: invoiceId, p_amount_paise: q.data.amount_paise,
    p_receipt: q.data.number, p_created_by: brand.profileId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { ...base, orderId: order.orderId } }
}

/**
 * 0578: the checkout says it succeeded. Checks the signature and nothing more:
 * a valid signature is not money received. The invoice changes only when
 * Razorpay's signed webhook arrives; the screen shows "confirming" until then.
 */
export async function checkOnlinePayment(experienceId: string, v: { orderId: unknown; paymentId: unknown; signature: unknown }): Promise<Out<'processing'>> {
  await verifyBrand()
  if (!isUuid(experienceId)) return { ok: false, error: 'Not found.' }
  const orderId = typeof v.orderId === 'string' ? v.orderId : ''
  const paymentId = typeof v.paymentId === 'string' ? v.paymentId : ''
  const signature = typeof v.signature === 'string' ? v.signature : ''
  if (!orderId || !paymentId || !signature) return { ok: false, error: 'The payment details are incomplete.' }
  if (!checkoutSignatureValid(orderId, paymentId, signature)) return { ok: false, error: 'We could not verify this payment. If money left your account, contact Guapd with the Razorpay payment ID ' + paymentId.slice(0, 40) + '.' }
  done(experienceId)
  return { ok: true, data: 'processing' }
}
