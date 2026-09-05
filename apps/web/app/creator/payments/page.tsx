import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import CreatorPaymentsEmpty from './CreatorPaymentsEmpty'
import type { Metadata } from 'next'
import PaymentsClient from './PaymentsClient'
import CreatorPaymentsMobile from '@/components/CreatorPaymentsMobile'

export const metadata: Metadata = { title: 'Payments · Guapd Creator' }

/**
 * Where the back arrow goes.
 *
 * These screens have two doors — the profile menu and the dashboard — so a
 * fixed href sends half the visitors somewhere they have never been. The
 * caller states its own return in `?from=`, which keeps CreatorPageHeader's
 * rule that a back arrow never guesses.
 */
function backFrom(from: string | undefined) {
  return from === 'profile' ? '/creator/profile' : '/creator/dashboard'
}

export default async function CreatorPaymentsPage({ searchParams }: { searchParams?: { from?: string } }) {
  const backHref = backFrom(searchParams?.from)
  const ctx = await verifyCreator()
  const supabase = createClient()

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(
      'id, deal_id, status, creator_receives_paise, due_date, issued_at, accepted_at, paid_at, deals(id, title, status, brands(name))'
    )
    .order('issued_at', { ascending: false })

  if (error) {
    return (
      <main style={{ padding: '2rem clamp(1rem, 3vw, 2.5rem)', maxWidth: 1080, margin: '0 auto' }}>
        <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>
          Error loading payments: {error.message}
        </p>
      </main>
    )
  }

  const all = (invoices ?? []) as InvoiceRow[]
  const now = new Date()

  // Summary
  const totalEarnedPaise = all
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.creator_receives_paise ?? 0), 0)

  // Pending = issued or accepted (not yet paid)
  const pendingInvoices = all.filter((inv) => inv.status === 'issued' || inv.status === 'accepted')
  const pendingAmountPaise = pendingInvoices.reduce(
    (sum, inv) => sum + (inv.creator_receives_paise ?? 0),
    0
  )

  const pending = pendingInvoices.map((inv) => {
    const deal = inv.deals as any
    const brand = extractBrand(deal)
    const isOverdue = inv.due_date && new Date(inv.due_date + 'T00:00:00') < now
    const dueDateStr = inv.due_date
      ? new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : null
    const statusLabel = isOverdue ? 'Overdue' : inv.status === 'accepted' ? 'Accepted' : 'Sent'
    const meta = dueDateStr
      ? `Due ${dueDateStr} · invoice ${inv.status}, awaiting ${inv.status === 'issued' ? 'acceptance' : 'release'}`
      : `Invoice ${inv.status}`

    return {
      id: inv.id,
      dealId: inv.deal_id,
      dealTitle: deal?.title || 'Untitled deal',
      brandName: brand,
      brandInitials: getInitials(brand),
      amountPaise: inv.creator_receives_paise ?? 0,
      status: statusLabel,
      meta,
      dueDateStr,
      isOverdue: Boolean(isOverdue),
    }
  })

  // History = paid invoices
  const paidInvoices = all.filter((inv) => inv.status === 'paid')
  const history = paidInvoices.map((inv) => {
    const deal = inv.deals as any
    const brand = extractBrand(deal)
    const paidDate = inv.paid_at
      ? new Date(inv.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : ''
    const paidAt = inv.paid_at ? new Date(inv.paid_at) : now
    const monthsDiff = (now.getFullYear() - paidAt.getFullYear()) * 12 + (now.getMonth() - paidAt.getMonth())

    return {
      id: inv.id,
      dealId: inv.deal_id,
      dealTitle: deal?.title || 'Untitled deal',
      brandName: brand,
      brandInitials: getInitials(brand),
      amountPaise: inv.creator_receives_paise ?? 0,
      paidDate,
      paidAt: inv.paid_at,
      paidMonthsAgo: monthsDiff,
    }
  })

  /* Deals the creator can invoice but has not.
     This screen is driven entirely by invoices, so a creator whose deals are
     approved and posted — everything done, money not yet asked for — was shown
     "Nothing's landed yet" and no hint that the next move was theirs. That is
     the exact state a real account was sitting in: five deals, two of them
     approved and posted, zero invoices, and a screen that looked broken.

     The predicate mirrors generateInvoice's gate exactly (status 'approved',
     is_posted true, no invoice yet). If that gate ever moves, this must move
     with it or the screen will offer an action the server refuses. */
  const invoicedDealIds = new Set(all.map((inv) => inv.deal_id))
  const { data: readyDeals } = await supabase
    .from('deals')
    .select('id, title, price_paise, brands(name)')
    .eq('creator_id', ctx.creatorId)
    .eq('status', 'approved')
    .eq('is_posted', true)

  const readyToInvoice = (readyDeals ?? [])
    .filter((d) => !invoicedDealIds.has(d.id))
    .map((d) => {
      const brand = extractBrand(d)
      return {
        dealId: d.id as string,
        dealTitle: (d.title as string) || 'Untitled deal',
        brandName: brand,
        brandInitials: getInitials(brand),
        amountPaise: (d.price_paise as number) ?? 0,
      }
    })

  // No invoices at all. PaymentsClient renders totals, tabs and a table — all
  // chrome for rows that do not exist.
  // Both render when there are no invoices; the width decides which is visible.
  // Returning the mobile design early fired at every width, so a creator on a
  // desktop never reached the payments screen.
  const isEmpty = all.length === 0 && readyToInvoice.length === 0

  // Service role: upi_id is withheld from the client roles as PII, so the
  // session client cannot read it back. Only needed for the empty screen.
  const admin = createAdminClient()
  const { data: creatorRow } = await admin
    .from('creators')
    .select('upi_id')
    .eq('id', ctx.creatorId)
    .maybeSingle()
  const upiId = (creatorRow as { upi_id?: string | null } | null)?.upi_id ?? null

  return (
    <>
    {isEmpty && (
      <main className="creator-empty-mobile" style={{ position: 'relative', zIndex: 1 }}>
        <CreatorPageHeader title="Payments" backHref={backHref} />
        <CreatorPaymentsEmpty upiId={upiId} totalEarnedPaise={totalEarnedPaise} />
      </main>
    )}
    {!isEmpty && (
      <CreatorPaymentsMobile
        totalEarnedPaise={totalEarnedPaise}
        upiId={upiId}
        pending={pending}
        history={history}
        readyToInvoice={readyToInvoice}
      />
    )}
    <main className={isEmpty ? 'creator-empty-desktop' : 'cpay-desktop'} style={{ flex: 1, minWidth: 0, padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(48px,5vw,80px)' }}>
      <PaymentsClient
        totalEarnedPaise={totalEarnedPaise}
        pendingAmountPaise={pendingAmountPaise}
        pendingCount={pendingInvoices.length}
        pending={pending}
        history={history}
      />
    </main>
    </>
  )
}

// ── Types ────────────────────────────────────────────────────────
interface InvoiceRow {
  id: string
  deal_id: string
  status: string
  creator_receives_paise: number | null
  due_date: string | null
  issued_at: string | null
  accepted_at: string | null
  paid_at: string | null
  deals: unknown
}

// ── Helpers ─────────────────────────────────────────────────────
function extractBrand(deal: any): string {
  const brand = deal?.brands
  const obj = Array.isArray(brand) ? brand[0] : brand
  return obj?.name || 'Unknown brand'
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
