'use client'

const deals = [
  {
    brand: 'Groww',
    type: 'Finance · Instagram Reel',
    amount: '₹48,000',
    status: 'New offer',
    timeline: '14 days · 2 revisions',
  },
  {
    brand: 'Zerodha',
    type: 'BFSI · YouTube Short',
    amount: '₹60,000',
    status: 'Negotiating',
    timeline: '21 days · 1 revision',
  },
  {
    brand: 'Fi Money',
    type: 'Fintech · Instagram Story',
    amount: '₹35,000',
    status: 'Agreed',
    timeline: '7 days · 2 revisions',
  },
]

export default function DealDisplayCards() {
  return (
    <div className="deal-display-cards">
      {deals.map((deal, i) => (
        <div
          key={deal.brand}
          className={`deal-display-card deal-display-card--${i}`}
        >
          <div className="deal-display-card__header">
            <span className="deal-display-card__brand">{deal.brand}</span>
            <span className="deal-display-card__status">{deal.status}</span>
          </div>
          <p className="deal-display-card__type">{deal.type}</p>
          <p className="deal-display-card__timeline">{deal.timeline}</p>
          <div className="deal-display-card__amount">{deal.amount}</div>
        </div>
      ))}
    </div>
  )
}
