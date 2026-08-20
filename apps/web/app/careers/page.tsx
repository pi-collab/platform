import Link from 'next/link'
import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import Footer from '@/components/Footer'
import { listRoles } from '@/lib/careers'

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Open roles at Guapd — building the operating system for creator deals in India.',
  alternates: { canonical: '/careers' },
}

// Roles are edited in ops, so this page must not be baked at build time.
export const dynamic = 'force-dynamic'

export default async function CareersPage() {
  const roles = await listRoles()

  return (
    <>
      <MarketingNav audience="home" />
      <main style={containerStyle}>
        <p style={eyebrowStyle}>Careers</p>
        <h1 style={h1Style}>Come build it with us.</h1>
        <p style={leadStyle}>
          We are making brand and creator collaborations work like a product instead of a
          group chat. If that sounds like your kind of problem, we would like to hear from you.
        </p>

        {roles.length === 0 ? (
          <div style={emptyStyle}>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)' }}>No open roles right now.</p>
            <p style={{ margin: '8px 0 0' }}>
              We are still worth talking to. Send a note through the contact link below and tell us
              what you would want to work on.
            </p>
          </div>
        ) : (
          <ul style={listStyle}>
            {roles.map((role) => (
              <li key={role.id}>
                <Link href={`/careers/${role.slug}`} style={cardStyle}>
                  <span style={cardMetaStyle}>
                    {[role.team, role.location, role.employmentType].filter(Boolean).join(' · ')}
                  </span>
                  <span style={cardTitleStyle}>{role.title}</span>
                  {role.summary && <span style={cardSummaryStyle}>{role.summary}</span>}
                  <span style={cardCtaStyle}>View role &rarr;</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  )
}

const containerStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  padding: 'clamp(40px,6vw,72px) clamp(20px,5vw,28px) clamp(64px,8vw,104px)',
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink-soft)',
  lineHeight: 1.75,
}
const eyebrowStyle: React.CSSProperties = {
  margin: '0 0 10px', fontSize: 12, fontWeight: 600, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'var(--ink-faint)',
}
const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,4.4vw,44px)', fontWeight: 700,
  letterSpacing: '-0.03em', lineHeight: 1.08, color: 'var(--ink)', margin: '0 0 14px',
}
const leadStyle: React.CSSProperties = { margin: '0 0 40px', fontSize: '15.5px' }
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }
const cardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, padding: '20px 22px',
  border: '1px solid var(--hairline, rgba(24,28,36,.12))', borderRadius: 14,
  textDecoration: 'none', background: '#fff',
}
const cardMetaStyle: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, letterSpacing: '.08em',
  textTransform: 'uppercase', color: 'var(--ink-faint)',
}
const cardTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700,
  letterSpacing: '-0.02em', color: 'var(--ink)',
}
const cardSummaryStyle: React.CSSProperties = { fontSize: 14.5, color: 'var(--ink-soft)' }
const cardCtaStyle: React.CSSProperties = { marginTop: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }
const emptyStyle: React.CSSProperties = {
  padding: '22px 24px', border: '1px dashed var(--hairline, rgba(24,28,36,.18))',
  borderRadius: 14, fontSize: '15px',
}
