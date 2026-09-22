import { redirect } from 'next/navigation'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGrowthMinimum } from '@/lib/platform-settings'
import SettingsClient from './SettingsClient'

export const metadata = { title: 'Settings · Ops', robots: { index: false, follow: false } }

export default async function OpsSettingsPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/ops')

  const admin = createAdminClient()

  const [minimum, { data: brands }, { data: entitlements }] = await Promise.all([
    getGrowthMinimum(),
    admin.from('brands').select('id, name').order('name'),
    admin.from('brand_entitlements').select('brand_id, key, value, source'),
  ])

  const growthBrands = new Set(
    (entitlements ?? [])
      .filter((e) => e.key === 'growth_campaigns' && e.value === true)
      .map((e) => e.brand_id),
  )

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Settings</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem', maxWidth: 640 }}>
        Platform-wide values and per-brand access. Changing the Growth minimum applies to campaigns
        created from now on — campaigns already created keep the minimum they were created under.
      </p>

      <SettingsClient
        minimum={minimum}
        brands={(brands ?? []).map((b) => ({
          id: b.id,
          name: b.name,
          growth: growthBrands.has(b.id),
        }))}
      />
    </div>
  )
}
