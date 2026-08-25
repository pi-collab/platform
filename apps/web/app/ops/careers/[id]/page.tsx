import { notFound, redirect } from 'next/navigation'
import { verifyOpsAccess } from '@/lib/ops-auth'
import RoleForm from '../RoleForm'
import { roleById } from '@/lib/careers'

export const dynamic = 'force-dynamic'

export default async function EditRolePage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const role = await roleById(params.id)
  if (!role) notFound()

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.25rem' }}>Edit role</h1>
      <RoleForm role={role} />
    </div>
  )
}
