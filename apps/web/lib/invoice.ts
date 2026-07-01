/**
 * Parse deal.payment_terms into number of days until due.
 * Returns null if unparseable (custom terms need manual handling).
 */
export function parsePaymentTermsDays(terms: string | null): number | null {
  if (!terms) return null
  const t = terms.toLowerCase().trim()

  // "100% on approval" / "on approval" → immediate
  if (t.includes('on approval')) return 0

  // "100% advance" (no "approval" clause) → immediate
  if (t.includes('advance') && !t.includes('approval')) return 0

  // "50% advance, 50% on approval" → 0 (second half due on approval)
  if (t.includes('advance') && t.includes('approval')) return 0

  // "Net 30", "Net 15"
  const netMatch = t.match(/net\s*(\d+)/)
  if (netMatch) return parseInt(netMatch[1], 10)

  // "30 days", "15 days"
  const daysMatch = t.match(/(\d+)\s*days?/)
  if (daysMatch) return parseInt(daysMatch[1], 10)

  return null
}

/**
 * Format a due date relative to today for display.
 */
export function formatDueStatus(dueDate: string | null): { text: string; urgent: boolean } | null {
  if (!dueDate) return null
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = due.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { text: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`, urgent: true }
  if (diffDays === 0) return { text: 'Due today', urgent: true }
  if (diffDays === 1) return { text: 'Due tomorrow', urgent: false }
  return { text: `Due in ${diffDays} days`, urgent: false }
}
