import Link from 'next/link'
import { verifyBrand } from '@/lib/brand-auth'
import { listBrandExperiences } from '@/lib/experience-brand-server'
import ExperienceRequestForm from '@/components/ExperienceRequestForm'
import { requestExperience } from '../actions'
import '../[id]/brand-experience.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Request an Experience · Guapd' }

/** The brand requests an Experience themselves (0544): the same fields staff record, sent on Guapd. */
export default async function NewBrandExperiencePage() {
  await verifyBrand()
  const r = await listBrandExperiences()
  const canRequest = r.ok && r.data.can_request
  return (
    <div className="bx-page">
      <Link href="/experiences" className="bx-back">← Experiences</Link>
      <section className="surface bx-hero" style={{ marginTop: 12 }}>
        <div className="bx-kicker">Managed by Guapd</div>
        <h1 className="bx-h1">Request an Experience</h1>
        <p className="bx-sub">Tell Guapd how many creators you want and what each one makes. Guapd comes back with a price; nothing is booked until you accept it.</p>
      </section>
      {canRequest
        ? <ExperienceRequestForm mode="brand" submit={requestExperience} doneBase="/experiences" cancelHref="/experiences" />
        : <section className="surface bx-card"><p className="bx-empty" style={{ marginTop: 0 }}>Requests open once Guapd has approved your brand account.</p></section>}
    </div>
  )
}
