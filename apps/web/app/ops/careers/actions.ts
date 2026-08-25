'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { logOpsEvent } from '@/lib/ops-audit'

export type RoleResult = { error?: string; id?: string }

interface Question { id: string; prompt: string; required: boolean }

const MAX_QUESTIONS = 10
const MAX_PROMPT = 200

/** Textarea → string[]: one entry per non-empty line. */
function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Lowercase, hyphenated, URL-safe. This is what an applicant shares. */
function toSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Parse the questions the form serialised into a hidden field.
 *
 * Validated here rather than trusting what arrived: a server action is directly
 * callable, so the repeater's own limits are convenience, not a boundary. The
 * database CHECK only asserts "is an array" — element shape is this function's
 * job, and this is the only writer.
 *
 * Blank prompts are DROPPED rather than rejected. Clicking "Add a question" and
 * then saving without typing is an ordinary thing to do, and failing the whole
 * role for it would lose the edits alongside it.
 */
function questionsFrom(value: FormDataEntryValue | null): { questions: Question[]; error?: string } {
  if (value == null) return { questions: [] }
  let raw: unknown
  try {
    raw = JSON.parse(String(value))
  } catch {
    return { questions: [], error: 'Could not read the questions on this role.' }
  }
  if (!Array.isArray(raw)) return { questions: [], error: 'Could not read the questions on this role.' }
  if (raw.length > MAX_QUESTIONS) {
    return { questions: [], error: `A role can ask at most ${MAX_QUESTIONS} questions.` }
  }

  const seen = new Set<string>()
  const questions: Question[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const q = entry as Record<string, unknown>
    const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : ''
    if (!prompt) continue
    if (prompt.length > MAX_PROMPT) {
      return { questions: [], error: `Keep each question under ${MAX_PROMPT} characters.` }
    }
    // A duplicate id would make two questions share one answer field on the
    // form, so the second would silently overwrite the first.
    const id = typeof q.id === 'string' && q.id && !seen.has(q.id) ? q.id : crypto.randomUUID()
    seen.add(id)
    questions.push({ id, prompt, required: q.required === true })
  }
  return { questions }
}

function readForm(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const slugRaw = String(formData.get('slug') ?? '').trim()
  return {
    title,
    // Fall back to the title so posting a role never requires thinking about
    // URLs, but keep it editable because a slug is permanent once shared.
    slug: toSlug(slugRaw || title),
    team: String(formData.get('team') ?? '').trim(),
    location: String(formData.get('location') ?? '').trim(),
    employment_type: String(formData.get('employment_type') ?? '').trim() || 'Full-time',
    summary: String(formData.get('summary') ?? '').trim(),
    about: lines(formData.get('about')),
    responsibilities: lines(formData.get('responsibilities')),
    requirements: lines(formData.get('requirements')),
    sort_order: Number.parseInt(String(formData.get('sort_order') ?? '100'), 10) || 100,
    is_published: formData.get('is_published') === 'yes',
  }
}

export async function createRole(formData: FormData): Promise<RoleResult> {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const parsed = questionsFrom(formData.get('application_questions'))
  if (parsed.error) return { error: parsed.error }
  const row = { ...readForm(formData), application_questions: parsed.questions }
  if (!row.title) return { error: 'Title is required.' }
  if (!row.slug) return { error: 'Could not build a URL from that title — set a slug.' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('job_roles').insert(row).select('id').single()

  if (error) {
    // The slug is unique, and a collision is the one failure worth naming:
    // "duplicate key" tells an ops user nothing they can act on.
    if (error.code === '23505') return { error: `A role with the URL "${row.slug}" already exists.` }
    return { error: error.message }
  }

  await logOpsEvent(user, 'job_role.create', 'job_roles', data.id, {
    slug: row.slug, title: row.title, is_published: row.is_published,
  })

  revalidatePath('/careers')
  revalidatePath('/ops/careers')
  return { id: data.id }
}

export async function updateRole(id: string, formData: FormData): Promise<RoleResult> {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const parsed = questionsFrom(formData.get('application_questions'))
  if (parsed.error) return { error: parsed.error }
  const row = { ...readForm(formData), application_questions: parsed.questions }
  if (!row.title) return { error: 'Title is required.' }
  if (!row.slug) return { error: 'Could not build a URL from that title — set a slug.' }

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('job_roles').select('slug, title, is_published').eq('id', id).maybeSingle()

  const { error } = await admin.from('job_roles').update(row).eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: `A role with the URL "${row.slug}" already exists.` }
    return { error: error.message }
  }

  await logOpsEvent(user, 'job_role.update', 'job_roles', id, {
    before: { slug: before?.slug, title: before?.title, is_published: before?.is_published },
    after: { slug: row.slug, title: row.title, is_published: row.is_published },
  })

  // Both the old and new slug, because renaming one leaves the previous URL
  // cached and still serving.
  if (before?.slug) revalidatePath(`/careers/${before.slug}`)
  revalidatePath(`/careers/${row.slug}`)
  revalidatePath('/careers')
  revalidatePath('/ops/careers')
  return { id }
}

export async function setPublished(id: string, published: boolean): Promise<RoleResult> {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('job_roles').select('slug, is_published').eq('id', id).maybeSingle()

  const { error } = await admin.from('job_roles').update({ is_published: published }).eq('id', id)
  if (error) return { error: error.message }

  await logOpsEvent(user, published ? 'job_role.publish' : 'job_role.unpublish', 'job_roles', id, {
    slug: before?.slug,
    before: { is_published: before?.is_published },
    after: { is_published: published },
  })

  if (before?.slug) revalidatePath(`/careers/${before.slug}`)
  revalidatePath('/careers')
  revalidatePath('/ops/careers')
  return { id }
}

export async function deleteRole(id: string): Promise<RoleResult> {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('job_roles').select('slug, title').eq('id', id).maybeSingle()

  const { error } = await admin.from('job_roles').delete().eq('id', id)
  if (error) return { error: error.message }

  // Applications are not linked to the role row — they are events carrying the
  // slug — so deleting a role never destroys an application.
  await logOpsEvent(user, 'job_role.delete', 'job_roles', id, {
    slug: before?.slug, title: before?.title,
  })

  if (before?.slug) revalidatePath(`/careers/${before.slug}`)
  revalidatePath('/careers')
  revalidatePath('/ops/careers')
  return {}
}
