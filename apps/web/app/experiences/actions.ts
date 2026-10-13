'use server'

import { revalidatePath } from 'next/cache'
import { verifyBrand } from '@/lib/brand-auth'
import { parseExperienceRequest, type RequestFormFields } from '@/lib/experience-request-validate'
import { brandSendToGuapd, getBrandGuapdThread, brandAcceptRosterMany, brandAddRosterCreators, brandSuggestCreator, brandAnswerQuote, brandAnswerAddon, brandDecideRelease, brandDecideRoster, brandRequestExperience, brandSignOff } from '@/lib/experience-brand-server'
import { notifyStaffBrandActed, notifyStaffBrandMessage } from '@/lib/experience-brand-notify'
import { registerExperienceRequestReview } from '@/lib/send-gate'

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
