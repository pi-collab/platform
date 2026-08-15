import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect, notFound } from 'next/navigation'
import EditCreatorForm from './EditCreatorForm'

export default async function EditCreatorPage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const admin = createAdminClient()
  const { data: creator, error } = await admin
    .from('creators')
    .select('id, full_name, phone, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card, is_vetted, is_rejected')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !creator) notFound()

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Edit creator</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        Editing: <strong>{creator.full_name}</strong>
        {creator.is_vetted
          ? <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#166534', background: '#dcfce7', padding: '0.125rem 0.5rem', borderRadius: 9999 }}>Vetted</span>
          : creator.is_rejected
          ? <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#991b1b', background: '#fee2e2', padding: '0.125rem 0.5rem', borderRadius: 9999 }}>Rejected</span>
          : <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.125rem 0.5rem', borderRadius: 9999 }}>Pending</span>
        }
      </p>
      <EditCreatorForm creator={creator} />
    </div>
  )
}
