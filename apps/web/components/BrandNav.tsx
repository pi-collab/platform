import { createClient } from '@/lib/supabase/server'
import BrandSidebar from '@/components/BrandSidebar'

export default async function BrandNav() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let brandName: string | null = null
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
    }
  }

  return <BrandSidebar brandName={brandName} />
}
