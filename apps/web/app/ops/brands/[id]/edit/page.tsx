import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect, notFound } from 'next/navigation'
import EditBrandForm from './EditBrandForm'

export default async function EditBrandPage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: brand, error } = await admin
    .from('brands')
    .select('id, name, category, company_size, website, contact_name, social_accounts')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !brand) notFound()

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Edit brand</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        Editing: <strong>{brand.name}</strong>
      </p>
      <EditBrandForm brand={brand} />
    </div>
  )
}
