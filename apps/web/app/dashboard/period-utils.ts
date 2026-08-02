export type Period = 'this_year' | 'this_quarter' | 'this_month' | 'this_week' | 'custom'

export function periodToDateRange(period: Period, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date()
  const to = now
  let from: Date

  switch (period) {
    case 'this_year':
      from = new Date(now.getFullYear(), 0, 1)
      break
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3)
      from = new Date(now.getFullYear(), q * 3, 1)
      break
    }
    case 'this_month':
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'this_week': {
      const day = now.getDay()
      from = new Date(now)
      from.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
      from.setHours(0, 0, 0, 0)
      break
    }
    case 'custom':
      from = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), 0, 1)
      if (customTo) return { from, to: new Date(customTo) }
      break
    default:
      from = new Date(now.getFullYear(), 0, 1)
  }

  return { from, to }
}
