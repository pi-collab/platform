import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyCreator } from '@/lib/creator-auth'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import CreatorProfileMobile from './CreatorProfileMobile'

export const metadata: Metadata = { title: 'Profile · Guapd Creator' }

export default async function CreatorProfilePage() {
  const ctx = await verifyCreator()
  const supabase = createClient()
  // handle lives on creators, which withholds it from the session client for
  // some columns — the admin client keeps this one query consistent.
  const admin = createAdminClient()

  const [{ data: creator }, { data: deals }, { data: invoices }, { data: storefront }] =
    await Promise.all([
      admin.from('creators').select('handle, profile_photo_url').eq('id', ctx.creatorId).maybeSingle(),
      supabase.from('deals').select('id, status').eq('status', 'complete'),
      supabase.from('invoices').select('creator_receives_paise, paid_at').not('paid_at', 'is', null),
      supabase.from('creator_storefronts').select('id, slug, is_published').maybeSingle(),
    ])

  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const paidThisYearPaise = (invoices ?? [])
    .filter((inv) => inv.paid_at && new Date(inv.paid_at) >= yearStart)
    .reduce((sum, inv) => sum + (inv.creator_receives_paise ?? 0), 0)

  return (
    <main style={{ position: 'relative', zIndex: 1 }}>
      <CreatorPageHeader title="Profile" backHref="/creator/dashboard" />
      <CreatorProfileMobile
        fullName={ctx.creatorName ?? ''}
        handle={creator?.handle ?? null}
        photoUrl={creator?.profile_photo_url ?? null}
        dealsDone={(deals ?? []).length}
        paidThisYearPaise={paidThisYearPaise}
        hasStorefront={Boolean(storefront)}
        // Only a PUBLISHED slug is passed. An unpublished one 404s, and handing
        // a creator a link to copy that does not work is worse than none.
        shopfrontSlug={storefront?.is_published ? storefront.slug : null}
      />
    </main>
  )
}
