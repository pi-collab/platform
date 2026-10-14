import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { staffNotificationHref } from '@/lib/experience-staff-notifications'

/**
 * Email to Guapd Experiences staff (0547, item 4), mirroring the brand account:
 * every staff alert that goes to the console bell also goes by email, to each
 * staff user with Experiences access, one message each (staff addresses are not
 * shown to one another). The link opens the creator deal on its Experience's
 * Deals tab, or the console. Carries no creator money and never message text.
 * Never throws.
 */
function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

export async function emailExperienceStaff(userIds: string[], n: { subject: string; heading: string; body: string; dealId: string | null; idKey: string }): Promise<void> {
  try {
    if (userIds.length === 0) return
    const { data: users } = await createAdminClient().from('users').select('id, email').in('id', userIds)
    const { html, text } = renderNoticeEmail({
      heading: n.heading, body: [n.body],
      ctaUrl: `${siteBase()}${staffNotificationHref(n.dealId)}`, ctaLabel: n.dealId ? 'Open the deal' : 'Open Experiences',
      footerNote: 'You get this because you have Guapd Experiences access.',
    })
    for (const u of users ?? []) {
      const email = u.email as string | null
      if (!isPlausibleEmail(email) || isSyntheticEmail(email)) continue
      const r = await sendDealEmail({ to: [email as string], subject: n.subject, html, text, dealId: n.dealId ?? undefined, idempotencyKey: `${n.idKey}-${u.id}` })
      if (!r.ok) console.warn(`[experience-staff-email] not sent key=${n.idKey}`)
    }
  } catch (err) {
    console.error(`[experience-staff-email] failed key=${n.idKey}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
