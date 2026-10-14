import Link from 'next/link'
import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { listConsoleBrands } from '@/lib/experience-console-server'
import NoAccess from '../NoAccess'
import ExperienceRequestForm from '@/components/ExperienceRequestForm'
import { recordExperienceRequest } from '../actions'
import { container, h1, heroCard, lede, serifAccent } from '../ui'

export const dynamic = 'force-dynamic'

/** Record a brand's Experience request (staff, on the brand's behalf). */
export default async function NewExperiencePage() {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  const brands = await listConsoleBrands()

  return (
    <div style={container}>
      <Link href="/experiences-admin" style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--wg-600)', textDecoration: 'none' }}>← All Experiences</Link>
      <section style={{ ...heroCard, marginTop: 12 }}>
        <h1 style={h1}>New <span style={serifAccent}>experience</span></h1>
        <p style={lede}>Record what the brand asked for, and how it reached us. It starts as a request; the price comes next, as a quote.</p>
      </section>
      {brands.ok
        ? <ExperienceRequestForm mode="staff" brands={brands.data} submit={recordExperienceRequest} doneBase="/experiences-admin" cancelHref="/experiences-admin" />
        : <div className="surface" style={{ padding: 24, marginTop: 20 }}><p className="t-body" style={{ margin: 0 }}>Could not load brands: {brands.error}</p></div>}
    </div>
  )
}
