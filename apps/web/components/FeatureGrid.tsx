interface FeatureCard {
  icon:  string
  title: string
  body:  string
}

interface FeatureGridProps {
  label?:    string
  headline?: string
  cards:     FeatureCard[]
}

export default function FeatureGrid({ label, headline, cards }: FeatureGridProps) {
  return (
    <section className="feature-grid">
      {(label || headline) && (
        <div className="feature-grid__header" data-animate>
          {label    && <p className="feature-grid__label">{label}</p>}
          {headline && <h2 className="feature-grid__headline">{headline}</h2>}
        </div>
      )}

      <div className="feature-grid__cards">
        {cards.map((card, i) => (
          <div key={card.title} className="feature-card" data-animate data-delay={String(i * 50)}>
            <span className="feature-card__icon" aria-hidden="true">{card.icon}</span>
            <h3 className="feature-card__title">{card.title}</h3>
            <p className="feature-card__body">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
