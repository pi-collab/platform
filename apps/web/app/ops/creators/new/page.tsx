import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'
import AddCreatorForm from './AddCreatorForm'

export default async function NewCreatorPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Add Creator</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        Manually add a vetted creator to the roster. Rate card is optional.
      </p>
      <AddCreatorForm />
    </div>
  )
}
