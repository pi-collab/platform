import { createAdminClient } from '@/lib/supabase/admin'
import VettingBadge from '@/components/ops/VettingBadge'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect, notFound } from 'next/navigation'
import EditCreatorForm from './EditCreatorForm'

export default async function EditCreatorPage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const admin = createAdminClient()
  const { data: creator, error } = await admin
    .from('creators')
    .select('id, full_name, phone, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card, is_vetted, is_rejected, vetting_status')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !creator) notFound()

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Edit creator</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        Editing: <strong>{creator.full_name}</strong>
        <span style={{ marginLeft: '0.5rem' }}><VettingBadge row={creator} /></span>
      </p>
      <EditCreatorForm creator={creator} />
    </div>
  )
}
