import Link from 'next/link'
import { verifyBrand } from '@/lib/brand-auth'
import { listBrandExperiences } from '@/lib/experience-brand-server'
import { brandStage } from '@/lib/experience-brand-status'
import StatusChip from '@/components/StatusChip'
import './[id]/brand-experience.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Experiences · Guapd' }

/**
 * The brand's Experiences (0544): every one on their own brand, from
 * brand_experiences (the brand's own session; membership checked in the
 * database), with the one thing waiting on them. "Request an Experience" for
 * a member of an approved brand.
 */
export default async function BrandExperiencesPage() {
  await verifyBrand()
  const r = await listBrandExperiences()
  const rows = r.ok ? r.data.experiences : []
  const canRequest = r.ok && r.data.can_request
  const fmt = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <div className="bx-page">
      <section className="surface bx-hero bx-hero-row">
        <div>
          <div className="bx-kicker">Managed by Guapd</div>
          <h1 className="bx-h1">Experiences</h1>
          <p className="bx-sub">A UGC day shoot run end to end by Guapd: you say what you need, Guapd prices it, finds the creators, runs the shoot and delivers the content.</p>
        </div>
        {canRequest
          ? <Link href="/experiences/new" className="neonbtn bx-cta">Request an Experience</Link>
          : <p className="bx-note bx-hero-aside">Requests open once Guapd has approved your brand account.</p>}
      </section>

      {!r.ok && <p className="bx-err" role="alert">Could not load your Experiences. Refresh to try again.</p>}

      {r.ok && rows.length === 0 && (
        <section className="surface bx-card">
          <p className="bx-empty" style={{ marginTop: 0 }}>No Experiences yet.{canRequest ? ' Request one and Guapd will come back with a price.' : ''}</p>
        </section>
      )}

      {rows.length > 0 && (
        <section className="surface bx-card bx-list">
          {rows.map((e) => {
            const st = brandStage(e.status, e.quote_to_answer)
            const waiting = [
              e.quote_to_answer && 'Price to answer',
              e.roster_to_review > 0 && `${e.roster_to_review} creator${e.roster_to_review === 1 ? '' : 's'} to review`,
              e.items_to_review > 0 && `${e.items_to_review} deliverable${e.items_to_review === 1 ? '' : 's'} to review`,
              e.signoff_due && 'Sign-off',
              e.invoices_due > 0 && `${e.invoices_due} invoice${e.invoices_due === 1 ? '' : 's'} due`,
            ].filter(Boolean) as string[]
            const when = e.shoot_date ? `Shoot ${fmt(e.shoot_date)}${e.shoot_city ? ` · ${e.shoot_city}` : ''}` : e.requested_at ? `Requested ${fmt(e.requested_at)}` : ''
            return (
              <Link key={e.id} href={`/experiences/${e.id}`} className="bx-list-row">
                <div style={{ minWidth: 0 }}>
                  <div className="bx-label">{e.title}</div>
                  <div className="bx-when">{[e.creator_count ? `${e.creator_count} creator${e.creator_count === 1 ? '' : 's'}` : null, when].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="bx-waiting">{waiting.length ? <span className="bx-chip bx-chg">Waiting on you: {waiting.join(', ')}</span> : null}</div>
                <div className="bx-list-status"><StatusChip label={st.label} tone={st.tone} /></div>
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
