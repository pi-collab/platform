import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { experienceStaffUserIds } from '@/lib/staff-access-server'

/**
 * Notifications between a brand and Guapd on an Experience (0544).
 *   - Brand → Guapd: when the brand acts in the portal, the Experiences staff
 *     are told in-app.
 *   - Guapd → brand: when something waits on the brand (a quote, creators to
 *     review), the brand's members are told in-app and by email, linking to
 *     /experiences/[id].
 * IN-APP + EMAIL only (WhatsApp stays off). Never a creator's rate or pay; a
 * quote message says a price is ready, not what it is.
 * Never throws: a notification failure must not fail the action.
 */
function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

async function experienceTitle(experienceId: string) {
  const { data } = await createAdminClient().from('experiences').select('id, title, brand_id, brands(name)').eq('id', experienceId).maybeSingle()
  if (!data) return null
  const b = (data as unknown as { brands: { name: string } | { name: string }[] | null }).brands
  return { id: data.id as string, title: data.title as string, brandId: data.brand_id as string, brandName: (Array.isArray(b) ? b[0]?.name : b?.name) ?? 'A brand' }
}

/** The brand did something on Guapd: tell the Experiences staff (in-app). */
export async function notifyStaffBrandActed(experienceId: string, what: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const [e, staff] = await Promise.all([experienceTitle(experienceId), experienceStaffUserIds(admin)])
    if (!e) return
    const body = `${e.brandName} ${what} on ${e.title}.`
    for (const userId of staff) await createNotification({ userId, dealId: null, type: 'experience_brand_acted', body })
  } catch (err) {
    console.error(`[experience-brand] staff notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Something waits on the brand: tell the brand's members (in-app + email). */
export async function notifyBrandWaiting(experienceId: string, kind: 'quote' | 'roster', count = 0): Promise<void> {
  try {
    const e = await experienceTitle(experienceId)
    if (!e) return
    const admin = createAdminClient()
    const { data: members } = await admin.from('brand_members').select('user_id, users(email)').eq('brand_id', e.brandId)
    // Creators are added one at a time from the pool: one nudge an hour, not one per click.
    if (kind === 'roster' && members?.length) {
      const { count: recent } = await admin.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', (members[0] as { user_id: string }).user_id).eq('type', 'experience_roster_ready')
        .like('body', `%for ${e.title.replace(/[%_]/g, '')} %`).gte('created_at', new Date(Date.now() - 3600_000).toISOString())
      if ((recent ?? 0) > 0) return
    }
    const body = kind === 'quote'
      ? `Guapd's price for ${e.title} is ready. Accept it, or tell Guapd what would work.`
      : `Creators for ${e.title} are ready for your review.`
    const emails: string[] = []
    for (const m of (members ?? []) as unknown as { user_id: string; users: { email: string | null } | { email: string | null }[] | null }[]) {
      await createNotification({ userId: m.user_id, dealId: null, type: kind === 'quote' ? 'experience_quote_ready' : 'experience_roster_ready', body })
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      if (isPlausibleEmail(u?.email) && !isSyntheticEmail(u?.email)) emails.push(u!.email as string)
    }
    if (emails.length) {
      const { html, text } = renderNoticeEmail({
        heading: kind === 'quote' ? 'Your Experience price is ready' : 'Creators to review',
        body: [body],
        ctaUrl: `${siteBase()}/experiences/${e.id}`,
        ctaLabel: kind === 'quote' ? 'See the price' : 'Review creators',
      })
      const r = await sendDealEmail({ to: emails, subject: `${e.title}: ${kind === 'quote' ? 'price ready' : 'creators to review'}`, html, text,
        idempotencyKey: `xp-${kind}-${e.id}-${Date.now().toString().slice(0, -5)}` })
      if (!r.ok) console.warn(`[experience-brand] brand email not sent experience=${e.id}`)
    }
  } catch (err) {
    console.error(`[experience-brand] brand notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
