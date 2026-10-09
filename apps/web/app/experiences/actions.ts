'use server'

import { revalidatePath } from 'next/cache'
import { verifyBrand } from '@/lib/brand-auth'
import { parseExperienceRequest, type RequestFormFields } from '@/lib/experience-request-validate'
import { brandAnswerQuote, brandDecideRelease, brandDecideRoster, brandRequestExperience, brandSignOff } from '@/lib/experience-brand-server'
import { notifyStaffBrandActed } from '@/lib/experience-brand-notify'

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
  await verifyBrand()
  const parsed = parseExperienceRequest(f)
  if (!parsed.ok) return parsed
  const r = await brandRequestExperience(parsed.value)
  if (!r.ok) return r
  done(r.data)
  await notifyStaffBrandActed(r.data, 'requested a new Experience')
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

export async function decideRosterCreator(experienceId: string, rosterId: string, decision: 'accepted' | 'rejected', expected: string): Promise<Out> {
  await verifyBrand()
  if (!isUuid(experienceId) || !isUuid(rosterId)) return { ok: false, error: 'Not found.' }
  if (decision !== 'accepted' && decision !== 'rejected') return { ok: false, error: 'Accept or reject.' }
  if (!['pending', 'accepted', 'rejected'].includes(expected)) return { ok: false, error: 'Refresh the page and try again.' }
  const r = await brandDecideRoster(rosterId, decision, expected)
  if (!r.ok) return r
  done(experienceId)
  await notifyStaffBrandActed(experienceId, decision === 'accepted' ? 'accepted a creator' : 'rejected a creator')
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
