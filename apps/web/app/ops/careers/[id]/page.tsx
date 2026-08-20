import { notFound, redirect } from 'next/navigation'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import RoleForm from '../RoleForm'
import type { Role } from '@/lib/careers'

export const dynamic = 'force-dynamic'

export default async function EditRolePage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const admin = createAdminClient()
  const { data } = await admin
    .from('job_roles')
    .select('id, slug, title, team, location, employment_type, summary, about, responsibilities, requirements, is_published, sort_order')
    .eq('id', params.id)
    .maybeSingle()

  if (!data) notFound()

  const role: Role = {
    id: data.id, slug: data.slug, title: data.title, team: data.team ?? '',
    location: data.location ?? '', employmentType: data.employment_type ?? '',
    summary: data.summary ?? '', about: data.about ?? [],
    responsibilities: data.responsibilities ?? [], requirements: data.requirements ?? [],
    isPublished: data.is_published === true, sortOrder: data.sort_order ?? 100,
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.25rem' }}>Edit role</h1>
      <RoleForm role={role} />
    </div>
  )
}
