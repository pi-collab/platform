import { createClient } from '@/lib/supabase/server'
import BrandSidebar from '@/components/BrandSidebar'

export default async function BrandNav() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let brandName: string | null = null
  let unreadCount = 0

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (profile) {
      const { data: membership } = await supabase
        .from('brand_members')
        .select('brands(name)')
        .eq('user_id', profile.id)
        .maybeSingle()

      brandName = (membership as any)?.brands?.name ?? null

      // Unread notification count
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .is('read_at', null)

      unreadCount = count ?? 0
    }
  }

  return <BrandSidebar brandName={brandName} unreadCount={unreadCount} />
}
