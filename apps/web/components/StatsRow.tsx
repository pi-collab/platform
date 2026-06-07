interface Stat {
  value: string
  label: string
}

interface StatsRowProps {
  stats: Stat[]
  className?: string
}

export default function StatsRow({ stats, className = 'stats' }: StatsRowProps) {
  return (
    <section className={className}>
      <div className="stats__grid">
        {stats.map((stat, i) => (
          <div key={stat.label}>
            <span className="stats__value">{stat.value}</span>
            <span className="stats__label">{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
