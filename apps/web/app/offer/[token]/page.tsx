import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOfferToken } from '@/lib/offer-token'
import OfferCard from './OfferCard'

/**
 * Public offer page — token-gated, no login required to VIEW.
 *
 * Service-role is used for the read because the viewer has no session.
 * The token IS the authorization: a valid token for deal X shows deal X
 * and nothing else.
 */
export default async function OfferPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token)
  const parsed = verifyOfferToken(token)

  if (!parsed) {
    return (
      <main style={wrapper}>
        <div style={errorCard}>
          <h1 style={errorHeading}>Link invalid or expired</h1>
          <p style={errorText}>
            This offer link is no longer valid. It may have expired or been tampered with.
            Please ask the brand to resend the offer.
          </p>
        </div>
      </main>
    )
  }

  const admin = createAdminClient()

  const [{ data: deal }, { data: items }] = await Promise.all([
    admin
      .from('deals')
      .select('id, title, deliverables, price_paise, currency, timeline_date, revision_limit, usage_rights, payment_terms, status, brands(name), creators(full_name)')
      .eq('id', parsed.dealId)
      .single(),
    admin
      .from('deal_deliverable_items')
      .select('id, label, platform, handle, price_paise')
      .eq('deal_id', parsed.dealId)
      .order('created_at', { ascending: true }),
  ])

  if (!deal) {
    return (
      <main style={wrapper}>
        <div style={errorCard}>
          <h1 style={errorHeading}>Offer not found</h1>
          <p style={errorText}>
            This deal no longer exists. Please contact the brand for details.
          </p>
        </div>
      </main>
    )
  }

  const brandName = (deal.brands as any)?.name ?? 'A brand'
  const creatorName = (deal.creators as any)?.full_name ?? 'you'

  // If already acted on, show a simple status page
  if (deal.status !== 'negotiating') {
    return (
      <main style={wrapper}>
        <div style={errorCard}>
          <h1 style={errorHeading}>Offer already {deal.status}</h1>
          <p style={errorText}>
            This offer from {brandName} has already been {deal.status}.
            {deal.status === 'agreed' && ' Download the app to manage your deal.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main style={wrapper}>
      <OfferCard
        token={token}
        deal={{
          id: deal.id,
          title: deal.title,
          deliverables: deal.deliverables,
          price_paise: deal.price_paise,
          currency: deal.currency,
          timeline_date: deal.timeline_date,
          revision_limit: deal.revision_limit,
          usage_rights: deal.usage_rights,
          payment_terms: deal.payment_terms,
          brand_name: brandName,
          creator_name: creatorName,
        }}
        items={(items ?? []).map((i) => ({ id: i.id, label: i.label, platform: i.platform, handle: i.handle, price_paise: i.price_paise }))}
      />
    </main>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const wrapper: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem 1rem',
  background: 'var(--page-bg, #fafafa)',
}

const errorCard: React.CSSProperties = {
  background: 'var(--section-bg, #fff)',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 16,
  maxWidth: 440,
  width: '100%',
  padding: '2.5rem 2rem',
  textAlign: 'center',
}

const errorHeading: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.25rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: '0 0 0.5rem',
}

const errorText: React.CSSProperties = {
  fontSize: '0.875rem',
  color: 'var(--color-muted, #888)',
  margin: 0,
  lineHeight: 1.6,
}
