import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import type { Metadata } from 'next'
import PaymentsClient from './PaymentsClient'

export const metadata: Metadata = { title: 'Payments · Guapd Creator' }

export default async function CreatorPaymentsPage() {
  await verifyCreator()
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
      paidMonthsAgo: monthsDiff,
    }
  })

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(48px,5vw,80px)' }}>
      <PaymentsClient
        totalEarnedPaise={totalEarnedPaise}
        pendingAmountPaise={pendingAmountPaise}
        pendingCount={pendingInvoices.length}
        pending={pending}
        history={history}
      />
    </main>
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
