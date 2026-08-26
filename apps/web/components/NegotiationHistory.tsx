'use client'

interface RoundEvent {
  event_type: string
  detail: {
    counter_items?: { id: string; label: string; price_paise: number }[]
    counter_total_paise?: number
    note?: string | null
  }
  created_at: string
}

interface Props {
  events: RoundEvent[]
  variant: 'brand' | 'creator'
  brandName?: string
  creatorFirstName?: string
  collapsed?: boolean
}

function formatINR(paise: number): string {
  const rupees = paise / 100
  const s = String(Math.round(rupees))
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function NegotiationHistory({ events, variant, brandName = 'Brand', creatorFirstName = 'Creator', collapsed = false }: Props) {
  if (events.length < 2) return null

  const rounds = events.map((e) => {
    const isBrand = e.event_type === 'deal.brand_counter'
    const isCreator = e.event_type === 'deal.counter_offer'
    const party = isBrand ? 'brand' : isCreator ? 'creator' : 'unknown'
    const amount = e.detail?.counter_total_paise ?? 0
    const date = formatShortDate(e.created_at)
    const label = party === 'brand'
      ? (variant === 'brand' ? 'You' : brandName)
      : (variant === 'creator' ? 'You' : creatorFirstName)
    return { party, label, amount, date, created_at: e.created_at }
  })

  const totalRounds = rounds.length
  const dates = rounds.map((r) => r.date)
  const uniqueDates = Array.from(new Set(dates))
  const dateRange = uniqueDates.length === 1 ? uniqueDates[0] : `${uniqueDates[0]} \u2013 ${uniqueDates[uniqueDates.length - 1]}`
  const lastMover = rounds[rounds.length - 1]
  const lastMoverLabel = lastMover.party === 'brand'
    ? (variant === 'brand' ? 'you' : brandName.toLowerCase())
    : (variant === 'creator' ? 'you' : creatorFirstName.toLowerCase())

  return (
    <div className="surface" style={{ padding: '22px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Negotiation history</h3>
        <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
          {totalRounds} round{totalRounds !== 1 ? 's' : ''} &middot; {dateRange} &middot; {lastMoverLabel} moved last
        </span>
      </div>

      {/* Horizontal timeline — pills connected by a line */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 24, gap: 0 }}>
        {rounds.map((round, i) => {
          const isLast = i === rounds.length - 1
          const isDark = isLast
          return (
            <div key={i} style={{ display: 'contents' }}>
              {/* Pill */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 999, flexShrink: 0,
                background: isDark ? 'var(--ink)' : 'var(--card)',
                border: isDark ? '1.5px solid var(--ink)' : '1.5px solid var(--border-hairline, #EAEAE3)',
                color: isDark ? '#FFFFFF' : 'var(--ink)',
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 500,
                  color: isDark ? 'rgba(255,255,255,.7)' : 'var(--ink-soft)',
                  whiteSpace: 'nowrap',
                }}>
                  {round.label} &middot; {round.date}
                </span>
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800,
                  letterSpacing: '-0.02em', whiteSpace: 'nowrap',
                }}>
                  {formatINR(round.amount)}
                </span>
              </div>
              {/* Connecting line */}
              {!isLast && (
                <div style={{ flex: 1, minWidth: 20, height: 2, background: 'var(--border-hairline, #EAEAE3)' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {!collapsed && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-soft)', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
          {variant === 'brand'
            ? `${creatorFirstName}\u2019s latest number is on the table, the terms below reflect it.`
            : `The brand\u2019s latest number is on the table, the terms below reflect it.`}
        </div>
      )}
    </div>
  )
}
