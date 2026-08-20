import { redirect } from 'next/navigation'
import { verifyOpsAccess } from '@/lib/ops-auth'
import RoleForm from '../RoleForm'

export default async function NewRolePage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')
  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.25rem' }}>New role</h1>
      <RoleForm />
    </div>
  )
}
