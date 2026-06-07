interface TestimonialCard {
  quote: string
  name:  string
  role:  string
}

interface TestimonialsProps {
  label?:    string
  headline?: string
  cards:     TestimonialCard[]
}

export default function Testimonials({ label, headline, cards }: TestimonialsProps) {
  return (
    <section className="testimonials">
      {(label || headline) && (
        <div className="testimonials__header" data-animate>
          {label    && <p className="testimonials__label">{label}</p>}
          {headline && <h2 className="testimonials__headline">{headline}</h2>}
        </div>
      )}

      <div className="testimonials__grid">
        {cards.map((card, i) => (
          <div key={i} className="testimonial-card" data-animate data-delay={String(i * 100)}>
            <div className="testimonial-card__quote-mark" aria-hidden="true">"</div>
            <p className="testimonial-card__quote">{card.quote}</p>
            <div className="testimonial-card__author">
              <span className="testimonial-card__name">{card.name}</span>
              {card.role && (
                <span className="testimonial-card__role">{card.role}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
