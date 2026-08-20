import { createAdminClient } from '@/lib/supabase/admin'
import { followerRangeOf } from '@/lib/follower-range'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import CreatorTabs from './CreatorTabs'

export default async function CreatorDetailPage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const admin = createAdminClient()
  const { data: creator, error } = await admin
    .from('creators')
    .select('id, user_id, full_name, phone, contact_email, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card, is_vetted, is_rejected, created_at, updated_at')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !creator) notFound()

  // How to reach this creator. The channels they choose at signup live in
  // users.preferences, which nothing in ops was reading — so answering "how do
  // we contact them?" meant querying the database by hand.
  const { data: contactRow } = creator.user_id
    ? await admin.from('users').select('email, preferences').eq('id', creator.user_id).maybeSingle()
    : { data: null }
  const prefs = (contactRow?.preferences ?? {}) as Record<string, unknown>
  const contact = {
    // contact_email is the address they asked to be notified on, which is not
    // necessarily the one they signed in with.
    notifyEmail: (creator as { contact_email?: string | null }).contact_email ?? null,
    loginEmail: contactRow?.email ?? null,
    whatsapp: typeof prefs.whatsapp_phone === 'string' ? prefs.whatsapp_phone : null,
    wantsEmail: prefs.notify_email === true,
    wantsWhatsapp: prefs.notify_whatsapp === true,
  }

  const [{ data: products }, { data: deals }, { data: pairRates }, { data: appeals }] = await Promise.all([
    admin
      .from('creator_products')
      .select('id, platform, handle, product_type, description, price_paise, display_price, is_active, included_revisions, price_per_extra_revision_paise, created_at')
      .eq('creator_id', params.id)
      .order('created_at', { ascending: false }),
    admin
      .from('deals')
      .select('id, title, status, price_paise, created_at, brands(name)')
      .eq('creator_id', params.id)
      .order('created_at', { ascending: false }),
    admin
      .from('brand_creator_rates')
      .select('id, brand_id, fee_pct, reason, set_by, updated_at, brands(id, name, platform_fee_percent)')
      .eq('creator_id', params.id)
      .order('updated_at', { ascending: false }),
    // Appeals from a rejected creator. Shown here, not only mailed, because
    // this is the page the decision gets reversed on - reading the appeal in
    // an inbox and acting on it here means holding it in your head in between.
    admin
      .from('events')
      .select('detail, created_at')
      .eq('event_type', 'creator.appeal_submitted')
      .contains('detail', { creator_id: params.id })
      .order('created_at', { ascending: false }),
  ])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{creator.full_name}</h1>
            {creator.is_vetted ? (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>Vetted</span>
            ) : creator.is_rejected ? (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>Rejected</span>
            ) : (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>Pending</span>
            )}
          </div>
          <p style={{ color: '#888', fontSize: '0.75rem', margin: 0 }}>
            Added {new Date(creator.created_at).toLocaleDateString()}
            {creator.handle && <> &middot; {creator.handle}</>}
            {(creator.niches as string[])?.length > 0 && <> &middot; {(creator.niches as string[]).join(', ')}</>}
            {followerRangeOf(creator.social_accounts) && (
              <> &middot; {followerRangeOf(creator.social_accounts)} followers</>
            )}
          </p>
        </div>
        <Link
          href={`/ops/creators/${creator.id}/edit`}
          style={{
            padding: '0.5rem 1rem',
            background: '#111',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: '0.8125rem',
            textDecoration: 'none',
          }}
        >
          Edit
        </Link>

      </div>

      {/* Contact channels. Ops has to answer "how do we reach this person?"
          without opening the database — which is the whole point of asking them
          at signup. Shows what they chose and what they gave. */}
      <div style={{ margin: '0 0 1.25rem', padding: '0.85rem 1rem', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>
          How to reach them
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1.5rem', fontSize: '0.8125rem' }}>
          <span data-ph-mask>Phone (signup): <strong>{creator.phone || '\u2014'}</strong></span>
          <span data-ph-mask>
            WhatsApp: <strong>{contact.whatsapp || '\u2014'}</strong>
            {contact.whatsapp && !contact.wantsWhatsapp && <span style={{ color: '#92400e' }}> (opted out)</span>}
          </span>
          <span data-ph-mask>
            Email: <strong>{contact.notifyEmail || contact.loginEmail || '\u2014'}</strong>
            {(contact.notifyEmail || contact.loginEmail) && !contact.wantsEmail && <span style={{ color: '#92400e' }}> (opted out)</span>}
          </span>
        </div>
        {!contact.wantsEmail && !contact.wantsWhatsapp && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#92400e' }}>
            No notification channel opted into — platform notifications will not reach them.
          </p>
        )}
      </div>

      {(appeals ?? []).length > 0 && (
        <div style={appealBox}>
          <div style={appealHead}>
            Appeal from this creator
            <span style={appealDate}>
              {new Date((appeals as { created_at: string }[])[0].created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
          </div>
          {(appeals as { detail: { note?: string } }[]).map((a, i) => (
            <p key={i} style={appealNote}>{a.detail?.note ?? '(no note)'}</p>
          ))}
          <p style={appealHint}>
            They were told we&rsquo;d come back within 3&ndash;5 days. Vetting them sends the
            approval email automatically.
          </p>
        </div>
      )}

      <CreatorTabs creator={creator} products={products ?? []} deals={deals ?? []} pairRates={(pairRates ?? []) as any} />
    </div>
  )
}

/* ── Appeal panel ─────────────────────────────────────────────────────────
   Deliberately loud. It appears only on a rejected creator who has written in,
   which is rare and time-bound, and it is easy to miss a quiet note above a
   tabbed interface. */
const appealBox: React.CSSProperties = {
  border: '1px solid #E3B3B3',
  background: '#FFF7F7',
  borderRadius: 10,
  padding: '1rem 1.125rem',
  marginBottom: '1.25rem',
}

const appealHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '0.75rem',
  fontSize: '0.8125rem',
  fontWeight: 700,
  color: '#8A2F2F',
  marginBottom: '0.5rem',
}

const appealDate: React.CSSProperties = { fontWeight: 500, color: '#A8756F' }

const appealNote: React.CSSProperties = {
  margin: '0 0 0.5rem',
  fontSize: '0.875rem',
  lineHeight: 1.6,
  color: '#3F2222',
  whiteSpace: 'pre-wrap',
}

const appealHint: React.CSSProperties = {
  margin: '0.5rem 0 0',
  fontSize: '0.75rem',
  color: '#A8756F',
}
