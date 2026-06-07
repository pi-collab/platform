interface Feature {
  label:    string
  headline: string
  body:     string
  reverse?: boolean
  visual?:  React.ReactNode
}

interface FeatureZigzagProps {
  features: Feature[]
}

export default function FeatureZigzag({ features }: FeatureZigzagProps) {
  return (
    <div className="features">
      {features.map((feature, i) => (
        <div
          key={feature.label}
          className={`feature-row${feature.reverse ? ' feature-row--reverse' : ''}`}
        >
          <div className="feature-row__inner">
            <div className="feature-row__text" data-animate>
              <span className="feature-row__label">{feature.label}</span>
              <h2 className="feature-row__headline">{feature.headline}</h2>
              <p className="feature-row__body">{feature.body}</p>
            </div>

            <div className="feature-row__visual" data-animate data-delay="120">
              {feature.visual ?? <DefaultVisual index={i} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Fallback placeholder when no visual is provided */
function DefaultVisual({ index }: { index: number }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 400,
        aspectRatio: '4/3',
        background: 'var(--section-bg-alt)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-muted)',
        fontSize: '0.8125rem',
      }}
    >
      Product screenshot — coming soon
    </div>
  )
}
