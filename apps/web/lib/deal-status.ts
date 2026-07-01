/**
 * Derive an actionable display status from deal status + invoice status.
 * Does NOT change the deal enum — purely a UI label.
 * Used by both the deals list and deal detail page to stay in sync.
 */
export function deriveDisplayStatus(
  dealStatus: string,
  invoiceStatus: string | null,
  invoiceDueDate: string | null,
): { label: string; color: { bg: string; color: string } } {
  if (dealStatus === 'approved') {
    if (!invoiceStatus || invoiceStatus === 'draft')
      return { label: 'approved', color: DISPLAY_COLORS.approved }
    if (invoiceStatus === 'issued')
      return { label: 'invoice to accept', color: DISPLAY_COLORS['invoice to accept'] }
    if (invoiceStatus === 'accepted') {
      if (invoiceDueDate) {
        const diffDays = dueDiffDays(invoiceDueDate)
        if (diffDays < 0)
          return { label: 'overdue', color: DISPLAY_COLORS.overdue }
      }
      return { label: 'payment due', color: DISPLAY_COLORS['payment due'] }
    }
    if (invoiceStatus === 'paid')
      return { label: 'paid', color: DISPLAY_COLORS.paid }
  }
  return { label: dealStatus, color: DISPLAY_COLORS[dealStatus] ?? { bg: '#f3f4f6', color: '#6b7280' } }
}

/**
 * Short due-date label for compact display (e.g. "3d", "today", "2d overdue").
 * Returns null when not applicable.
 */
export function dueLabel(
  dealStatus: string,
  invoiceStatus: string | null,
  invoiceDueDate: string | null,
): string | null {
  if (dealStatus !== 'approved' || invoiceStatus !== 'accepted' || !invoiceDueDate) return null
  const diffDays = dueDiffDays(invoiceDueDate)
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'today'
  return `${diffDays}d`
}

function dueDiffDays(dueDateStr: string): number {
  const due = new Date(dueDateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const DISPLAY_COLORS: Record<string, { bg: string; color: string }> = {
  negotiating:         { bg: '#fef3c7', color: '#92400e' },
  agreed:              { bg: '#dbeafe', color: '#1e40af' },
  delivered:           { bg: '#e0e7ff', color: '#3730a3' },
  revision:            { bg: '#ffedd5', color: '#9a3412' },
  approved:            { bg: '#dcfce7', color: '#166534' },
  'invoice to accept': { bg: '#fef9c3', color: '#854d0e' },
  'payment due':       { bg: '#fef9c3', color: '#854d0e' },
  overdue:             { bg: '#fee2e2', color: '#991b1b' },
  paid:                { bg: '#d1fae5', color: '#065f46' },
  complete:            { bg: '#f3f4f6', color: '#374151' },
  declined:            { bg: '#fee2e2', color: '#991b1b' },
  cancelled:           { bg: '#f3f4f6', color: '#6b7280' },
}
