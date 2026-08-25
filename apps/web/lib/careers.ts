import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Open roles, stored in job_roles and edited from ops.
 *
 * Reads go through the service role rather than the anon key. The RLS policy
 * would allow the public page to read published rows directly, but ops needs to
 * see unpublished drafts through the same functions, and one code path that
 * both surfaces share is easier to keep correct than two that must agree.
 * `publishedOnly` is therefore an argument, not an accident of which client
 * happened to be used.
 */

/** One question a role asks its applicants, answered in a text box. */
export interface ApplicationQuestion {
  id: string
  prompt: string
  required: boolean
}

export interface Role {
  id: string
  slug: string
  title: string
  team: string
  location: string
  employmentType: string
  summary: string
  about: string[]
  responsibilities: string[]
  requirements: string[]
  isPublished: boolean
  sortOrder: number
  questions: ApplicationQuestion[]
}

/**
 * Parse the jsonb column into questions, discarding anything malformed.
 *
 * Tolerant on purpose. This runs on the PUBLIC role page: one bad element
 * should cost that question, not the whole posting. The ops action is the
 * validating writer; this is the reader, and a reader that throws takes a live
 * job ad down.
 */
function toQuestions(v: unknown): ApplicationQuestion[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const q = raw as Record<string, unknown>
    const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : ''
    const id = typeof q.id === 'string' ? q.id : ''
    if (!prompt || !id) return []
    return [{ id, prompt, required: q.required === true }]
  })
}

const COLUMNS =
  'id, slug, title, team, location, employment_type, summary, about, responsibilities, requirements, is_published, sort_order, application_questions'

type Row = Record<string, unknown>

function toRole(r: Row): Role {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title ?? ''),
    team: String(r.team ?? ''),
    location: String(r.location ?? ''),
    employmentType: String(r.employment_type ?? ''),
    summary: String(r.summary ?? ''),
    about: list(r.about),
    responsibilities: list(r.responsibilities),
    requirements: list(r.requirements),
    isPublished: r.is_published === true,
    sortOrder: typeof r.sort_order === 'number' ? r.sort_order : 100,
    questions: toQuestions(r.application_questions),
  }
}

export async function listRoles({ publishedOnly = true } = {}): Promise<Role[]> {
  const admin = createAdminClient()
  let q = admin.from('job_roles').select(COLUMNS).order('sort_order').order('created_at')
  if (publishedOnly) q = q.eq('is_published', true)
  const { data, error } = await q
  if (error) {
    console.error('[careers] listRoles failed:', error.message)
    return []
  }
  return (data ?? []).map((r) => toRole(r as Row))
}

/**
 * By id, for the ops edit screen.
 *
 * Exists so that screen stops hand-rolling its own select string and its own
 * row-to-Role mapping. It had both, and they went stale the moment a column was
 * added — a `.select()` string is just text, so nothing failed until the shape
 * was used. One reader, one column list.
 */
export async function roleById(id: string): Promise<Role | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('job_roles').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) {
    console.error('[careers] roleById failed:', error.message)
    return null
  }
  return data ? toRole(data as Row) : null
}

export async function roleBySlug(slug: string, { publishedOnly = true } = {}): Promise<Role | null> {
  const admin = createAdminClient()
  let q = admin.from('job_roles').select(COLUMNS).eq('slug', slug)
  if (publishedOnly) q = q.eq('is_published', true)
  const { data, error } = await q.maybeSingle()
  if (error) {
    console.error('[careers] roleBySlug failed:', error.message)
    return null
  }
  return data ? toRole(data as Row) : null
}
