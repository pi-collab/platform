import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import { deriveDisplayStatus } from '@/lib/deal-status'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Payments — Guapd Creator' }

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
      <main style={wrapper}>
        <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>
          Error loading payments: {error.message}
        </p>
      </main>
    )
  }

  const all = (invoices ?? []) as InvoiceRow[]

  // Summary
  const totalEarned = all
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.creator_receives_paise ?? 0), 0)

  const pendingInvoices = all.filter((inv) => inv.status === 'accepted')
  const pendingAmount = pendingInvoices.reduce(
    (sum, inv) => sum + (inv.creator_receives_paise ?? 0),
    0
  )

  return (
    <main style={wrapper}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={heading}>Payments</h1>
        <p style={{ color: '#888', fontSize: '0.875rem', margin: 0 }}>
          Your earnings and payment status
        </p>
      </div>

      {/* ── SUMMARY ───────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.625rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ ...statCard, background: '#f0fdf4' }}>
          <p style={statValue}>{formatRupees(totalEarned)}</p>
          <p style={statLabel}>Total earned</p>
        </div>
        <div style={statCard}>
          <p style={statValue}>{formatRupees(pendingAmount)}</p>
          <p style={statLabel}>
            Pending{pendingInvoices.length > 0 ? ` (${pendingInvoices.length})` : ''}
          </p>
        </div>
      </div>

      {/* ── PENDING PAYMENTS ──────────────────────────── */}
      {pendingInvoices.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={sectionLabel}>Pending payments</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendingInvoices.map((inv) => {
              const deal = inv.deals as any
              const brand = extractBrand(deal)
              const ds = deriveDisplayStatus('approved', inv.status, inv.due_date)
              return (
                <Link
                  key={inv.id}
                  href={`/creator/deals/${inv.deal_id}`}
                  style={row}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={rowTitle}>{deal?.title || 'Untitled deal'}</p>
                    <p style={rowSub}>{brand}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={rowAmount}>{formatRupees(inv.creator_receives_paise ?? 0)}</p>
                    <span style={{ ...badge, background: ds.color.bg, color: ds.color.color }}>
                      {ds.label}
                    </span>
                    {inv.due_date && (
                      <p style={rowDate}>
                        Due{' '}
                        {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PAYMENT HISTORY ───────────────────────────── */}
      <p style={sectionLabel}>Payment history</p>

      {all.length === 0 ? (
        <div style={emptyState}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111', margin: '0 0 0.5rem' }}>
            No payments yet
          </p>
          <p
            style={{
              fontSize: '0.875rem',
              color: '#888',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            When a deal is approved and invoiced, payment status will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {all.map((inv) => {
            const deal = inv.deals as any
            const brand = extractBrand(deal)
            const dealStatus = deal?.status ?? 'approved'
            const ds = deriveDisplayStatus(dealStatus, inv.status, inv.due_date)
            return (
              <Link
                key={inv.id}
                href={`/creator/deals/${inv.deal_id}`}
                style={row}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={rowTitle}>{deal?.title || 'Untitled deal'}</p>
                  <p style={rowSub}>{brand}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={rowAmount}>{formatRupees(inv.creator_receives_paise ?? 0)}</p>
                  <span style={{ ...badge, background: ds.color.bg, color: ds.color.color }}>
                    {ds.label}
                  </span>
                  {inv.status === 'paid' && inv.paid_at && (
                    <p style={rowDate}>
                      Paid{' '}
                      {new Date(inv.paid_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  {inv.status === 'accepted' && inv.due_date && (
                    <p style={rowDate}>
                      Due{' '}
                      {new Date(inv.due_date + 'T00:00:00').toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  )}
                  {inv.status === 'issued' && inv.issued_at && (
                    <p style={rowDate}>
                      Issued{' '}
                      {new Date(inv.issued_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
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

function formatRupees(paise: number): string {
  if (paise === 0) return '\u20B90'
  const rupees = paise / 100
  if (rupees >= 10000000) return `\u20B9${(rupees / 10000000).toFixed(1)}Cr`
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

// ── Styles ──────────────────────────────────────────────────────

const wrapper: React.CSSProperties = {
  padding: '2rem clamp(1rem, 3vw, 2.5rem)',
  maxWidth: 900,
  margin: '0 auto',
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.375rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: '0 0 0.25rem',
}

const sectionLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#888',
  margin: '0 0 0.5rem',
}

const statCard: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid #e5e5e5',
  borderRadius: 10,
  background: '#fafafa',
}

const statValue: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 700,
  color: '#111',
  margin: 0,
  fontFamily: 'monospace',
}

const statLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: '#888',
  margin: '0.2rem 0 0',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
}

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '1rem',
  padding: '0.875rem 1rem',
  border: '1px solid #e5e5e5',
  borderRadius: 10,
  textDecoration: 'none',
  color: 'inherit',
  background: '#fff',
}

const rowTitle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#111',
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const rowSub: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#888',
  margin: '0.1rem 0 0',
}

const rowAmount: React.CSSProperties = {
  fontSize: '0.9375rem',
  fontWeight: 700,
  fontFamily: 'monospace',
  color: '#111',
  margin: 0,
}

const badge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: '0.1rem 0.4rem',
  borderRadius: 9999,
  textTransform: 'capitalize',
  marginTop: '0.2rem',
}

const rowDate: React.CSSProperties = {
  fontSize: '0.6875rem',
  color: '#aaa',
  margin: '0.2rem 0 0',
}

const emptyState: React.CSSProperties = {
  padding: '3rem 1rem',
  textAlign: 'center',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  background: '#fff',
}
