'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { logOpsEvent } from '@/lib/ops-audit'

export type RoleResult = { error?: string; id?: string }

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

  const row = readForm(formData)
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

  const row = readForm(formData)
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
