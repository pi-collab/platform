import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import Footer from '@/components/Footer'
import { roleBySlug } from '@/lib/careers'
import ApplyForm from './ApplyForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const role = await roleBySlug(params.slug)
  if (!role) return { title: 'Role not found' }
  return {
    title: `${role.title} · Careers`,
    description: role.summary,
    alternates: { canonical: `/careers/${role.slug}` },
  }
}

export default async function RolePage({ params }: { params: { slug: string } }) {
  const role = await roleBySlug(params.slug)
  // Unpublished and unknown both 404. A draft should not be readable by anyone
  // who guesses its slug.
  if (!role) notFound()

  return (
    <>
      <MarketingNav audience="home" />
      <main style={containerStyle}>
        <Link href="/careers" style={backStyle}>&larr; All roles</Link>

        <p style={eyebrowStyle}>
          {[role.team, role.location, role.employmentType].filter(Boolean).join(' · ')}
        </p>
        <h1 style={h1Style}>{role.title}</h1>
        {role.summary && <p style={leadStyle}>{role.summary}</p>}

        {role.about.map((p, i) => <p key={`a${i}`} style={pStyle}>{p}</p>)}

        {role.responsibilities.length > 0 && (
          <>
            <h2 style={h2Style}>What you will do</h2>
            <ul style={ulStyle}>{role.responsibilities.map((r, i) => <li key={`r${i}`} style={liStyle}>{r}</li>)}</ul>
          </>
        )}

        {role.requirements.length > 0 && (
          <>
            <h2 style={h2Style}>What we are looking for</h2>
            <ul style={ulStyle}>{role.requirements.map((r, i) => <li key={`q${i}`} style={liStyle}>{r}</li>)}</ul>
          </>
        )}

        <h2 style={{ ...h2Style, marginTop: 48 }}>Apply</h2>
        <ApplyForm slug={role.slug} title={role.title} />
      </main>
      <Footer />
    </>
  )
}

const containerStyle: React.CSSProperties = {
  maxWidth: 760, margin: '0 auto',
  padding: 'clamp(40px,6vw,72px) clamp(20px,5vw,28px) clamp(64px,8vw,104px)',
  fontFamily: 'var(--font-ui)', color: 'var(--ink-soft)', lineHeight: 1.75,
}
const backStyle: React.CSSProperties = {
  display: 'inline-block', marginBottom: 24, fontSize: 13.5, fontWeight: 600,
  color: 'var(--ink-soft)', textDecoration: 'none',
}
const eyebrowStyle: React.CSSProperties = {
  margin: '0 0 10px', fontSize: 12, fontWeight: 600, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'var(--ink-faint)',
}
const h1Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 'clamp(30px,4vw,40px)', fontWeight: 700,
  letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--ink)', margin: '0 0 14px',
}
const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 'clamp(19px,2.2vw,22px)', fontWeight: 700,
  letterSpacing: '-0.02em', color: 'var(--ink)', margin: '40px 0 12px',
}
const leadStyle: React.CSSProperties = { margin: '0 0 24px', fontSize: '16px', color: 'var(--ink-soft)' }
const pStyle: React.CSSProperties = { margin: '0 0 16px', fontSize: '15.5px' }
const ulStyle: React.CSSProperties = { margin: '0 0 16px', paddingLeft: 22 }
const liStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: '15.5px' }
