import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { experienceStaffUserIds } from '@/lib/staff-access-server'
import { emailExperienceStaff } from '@/lib/experience-staff-email'

/**
 * Notifications for the posting flow (0561). IN-APP + EMAIL only (WhatsApp
 * stays off). Never an amount, never a link's contents beyond saying it is
 * there. Never throws: a notification failure must not fail the action.
 *   - Guapd sends a video to its creator → the creator.
 *   - The creator posts (or Guapd records it) → the brand's members and staff.
 *   - The brand adds its affiliate link → the creator.
 */
function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

async function postContext(postId: string) {
  const admin = createAdminClient()
  const { data: p } = await admin.from('experience_collab_posts').select('id, kind, label, deal_id, experience_id, creator_id').eq('id', postId).maybeSingle()
  if (!p) return null
  const [{ data: e }, { data: c }, { data: d }] = await Promise.all([
    admin.from('experiences').select('title, brand_id').eq('id', p.experience_id).maybeSingle(),
    admin.from('creators').select('user_id, full_name').eq('id', p.creator_id).maybeSingle(),
    admin.from('deals').select('experience_brand_name').eq('id', p.deal_id).maybeSingle(),
  ])
  const { data: u } = c?.user_id ? await admin.from('users').select('email').eq('id', c.user_id).maybeSingle() : { data: null }
  return {
    id: p.id as string, kind: p.kind as 'collab' | 'share', label: p.label as string, dealId: p.deal_id as string, experienceId: p.experience_id as string,
    title: (e?.title ?? 'your Experience') as string, brandId: (e?.brand_id ?? null) as string | null,
    brandName: (d?.experience_brand_name ?? 'the brand') as string,
    creatorUserId: (c?.user_id ?? null) as string | null, creatorName: (c?.full_name ?? null) as string | null, creatorEmail: (u?.email ?? null) as string | null,
  }
}

async function tellCreator(postId: string, type: string, heading: string, body: (brand: string, label: string) => string, idKey: string) {
  const p = await postContext(postId)
  if (!p?.creatorUserId) return
  const text = body(p.brandName, p.label)
  await createNotification({ userId: p.creatorUserId, dealId: p.dealId, type, body: text })
  if (isPlausibleEmail(p.creatorEmail) && !isSyntheticEmail(p.creatorEmail)) {
    const first = (p.creatorName ?? '').split(' ')[0] || 'there'
    const { html, text: plain } = renderNoticeEmail({ heading, body: [`Hi ${first}, ${text}`], ctaUrl: `${siteBase()}/creator/deals/${p.dealId}`, ctaLabel: 'Open your deal' })
    const r = await sendDealEmail({ to: [p.creatorEmail as string], subject: `${p.brandName} · Managed by Guapd: ${heading.toLowerCase()}`, html, text: plain, dealId: p.dealId, idempotencyKey: `${idKey}-${postId}` })
    if (!r.ok) console.warn(`[experience-collab] creator email not sent post=${postId}`)
  }
}

/** Guapd sent an approved video to its creator. */
export async function notifyCreatorVideoSent(postId: string): Promise<void> {
  try {
    const p = await postContext(postId)
    if (!p) return
    if (p.kind === 'collab') {
      await tellCreator(postId, 'experience_collab_sent', 'Your video is ready to post',
        (brand, label) => `your ${label} for ${brand} is ready. Post it on Instagram as a collab with ${brand}, then paste the post link on Guapd.`, 'collab-sent')
    } else {
      await tellCreator(postId, 'experience_video_shared', 'Your video from the shoot',
        (brand, label) => `Guapd shared your ${label} from the ${brand} shoot. Post it on your own account if you like; nothing more is needed.`, 'video-shared')
    }
  } catch (err) {
    console.error(`[experience-collab] creator notification failed post=${postId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** The brand added its affiliate link to a collab post. */
export async function notifyCreatorAffiliateAdded(postId: string): Promise<void> {
  try {
    await tellCreator(postId, 'experience_collab_affiliate', 'The brand added its affiliate link',
      (brand, label) => `${brand} added its affiliate link for your ${label} collab. You can see it on your deal.`, 'collab-affiliate')
  } catch (err) {
    console.error(`[experience-collab] creator notification failed post=${postId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** The collab is live: the brand's members (add the affiliate link, boost) and the staff. */
export async function notifyCollabPosted(postId: string, by: 'creator' | 'guapd'): Promise<void> {
  try {
    const p = await postContext(postId)
    if (!p || p.kind !== 'collab') return
    const admin = createAdminClient()
    const who = p.creatorName ?? 'A creator'
    if (p.brandId) {
      const { data: members } = await admin.from('brand_members').select('user_id, users(email)').eq('brand_id', p.brandId)
      const body = `${who} posted their collab for ${p.title}. Add your affiliate link and run the ad on Guapd.`
      const emails: string[] = []
      for (const m of (members ?? []) as unknown as { user_id: string; users: { email: string | null } | { email: string | null }[] | null }[]) {
        await createNotification({ userId: m.user_id, dealId: null, type: 'experience_collab_posted', body })
        const u = Array.isArray(m.users) ? m.users[0] : m.users
        if (isPlausibleEmail(u?.email) && !isSyntheticEmail(u?.email)) emails.push(u!.email as string)
      }
      if (emails.length) {
        const { html, text } = renderNoticeEmail({ heading: 'Your collab is live', body: [body], ctaUrl: `${siteBase()}/experiences/${p.experienceId}#bx-collabs`, ctaLabel: 'See the post' })
        const r = await sendDealEmail({ to: emails, subject: `${p.title}: a collab is live`, html, text, idempotencyKey: `xp-collab-posted-${postId}` })
        if (!r.ok) console.warn(`[experience-collab] brand email not sent post=${postId}`)
      }
    }
    if (by === 'creator') {
      const staff = await experienceStaffUserIds(admin)
      const body = `${who} posted their ${p.label} collab for ${p.title}.`
      for (const userId of staff) await createNotification({ userId, dealId: p.dealId, type: 'experience_collab_posted', body })
      await emailExperienceStaff(staff, { subject: `${who} posted a collab`, heading: 'Collab posted', body, dealId: p.dealId, idKey: `staff-collab-${postId}` })
    }
  } catch (err) {
    console.error(`[experience-collab] posted notification failed post=${postId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
