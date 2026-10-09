import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifyBrand } from '@/lib/brand-auth'
import { getBrandDeliverables, getBrandExperience, getBrandInvoices, getBrandReport, getBrandRoster, type BrandInvoice } from '@/lib/experience-brand-server'
import { BRAND_STEPS, brandNext, brandStage, brandStepIndex } from '@/lib/experience-brand-status'
import { countOf, formatRupees } from '@/lib/experience-request'
import StatusChip from '@/components/StatusChip'
import StepperTimeline from '@/components/StepperTimeline'
import InvoicePdf from './InvoicePdf'
import ViewFile from './ViewFile'
import { DeliverableReview, QuoteCard, RosterReview, SignOffCard } from './BrandPanels'
import './brand-experience.css'

export const dynamic = 'force-dynamic'

/**
 * A brand's Experience, as the brand sees it (0544; first built in 0538).
 *
 * Every read is a brand_experience_* function run with the member's OWN
 * session; each checks in Postgres that the caller belongs to THIS
 * Experience's brand (never the house brand) and returns named fields only.
 * The brand sees its request, Guapd's price, the creators (names, handles,
 * profile links and what each makes), the deliverables Guapd shared, its own
 * invoices and, at Complete, the report. Never a creator's rate, pay, cost,
 * margin, note or id, and never another brand's anything.
 *
 * The brand decides here (price: admins; creators and deliverables: any
 * member; sign-off: admins). Guapd can still record the same decisions from a
 * WhatsApp or email; the latest stands.
 */
export default async function BrandExperiencePage({ params }: { params: { id: string } }) {
  await verifyBrand()
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound()
  const exp = await getBrandExperience(params.id)
  if (!exp.ok) notFound()
  const e = exp.data
  const quoteToAnswer = e.quote?.status === 'open' && e.quote.proposed_by === 'guapd'
  const hasRoster = !['requested', 'cancelled'].includes(e.status)
  const hasDeliverables = ['shoot_done', 'delivering', 'complete'].includes(e.status)
  const [roster, deliverables, invoices, report] = await Promise.all([
    hasRoster ? getBrandRoster(e.id) : Promise.resolve(null),
    hasDeliverables ? getBrandDeliverables(e.id) : Promise.resolve(null),
    getBrandInvoices(e.id),
    e.status === 'complete' ? getBrandReport(e.id) : Promise.resolve(null),
  ])
  const st = brandStage(e.status, quoteToAnswer)
  const fmt = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const date = fmt(e.shoot_date)
  const req = e.request
  const perCreator = (req.deliverables ?? []).map((d) => countOf(Number(d.count), d.type)).join(' · ')
  const extras = [
    req.affiliate && `affiliate link on ${req.affiliate_per_creator ?? 'all'} of each creator's videos`,
    req.ad_rights && `ad rights${req.ad_rights_months ? ` for ${req.ad_rights_months} months` : ''}`,
    req.boost && `boost${req.boost_months ? ` for ${req.boost_months} months` : ''}`,
  ].filter(Boolean) as string[]
  const invoiceList = invoices.ok ? invoices.data : []
  const reviewing = ['shoot_done', 'delivering'].includes(e.status)
  const reviewBlock = (
    <>
      {hasDeliverables && deliverables?.ok && e.status !== 'complete' && (
        <section className="surface bx-card" aria-labelledby="bx-deliv">
          <h2 id="bx-deliv" className="bx-h2">Deliverables</h2>
          <p className="bx-note">What Guapd has shared with you. Approve each one, or tell Guapd what to change.</p>
          <DeliverableReview experienceId={e.id} items={deliverables.data.items} />
        </section>
      )}

      {['delivering', 'complete'].includes(e.status) && (
        <section className="surface bx-card" aria-labelledby="bx-signoff">
          <h2 id="bx-signoff" className="bx-h2">Sign-off</h2>
          <div style={{ marginTop: 8 }}>
            <SignOffCard experienceId={e.id} isAdmin={e.is_admin} signedAt={e.signoff_at} signedOnGuapd={e.signoff_on_guapd} open={e.status === 'delivering'} />
          </div>
        </section>
      )}

    </>
  )

  return (
    <div className="bx-page">
      <Link href="/experiences" className="bx-back">← Experiences</Link>
      <section className="surface bx-hero bx-hero-row" style={{ marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="bx-kicker">{e.brand_name} · Managed by Guapd</div>
          <h1 className="bx-h1">{e.title}</h1>
          <p className="bx-sub">
            {date || e.shoot_city ? `Shoot${date ? ` on ${date}` : ''}${e.shoot_city ? ` in ${e.shoot_city}` : ''}` : e.requested_at ? `Requested ${fmt(e.requested_at)}${e.request_on_guapd ? '' : ' (recorded by Guapd)'}` : ''}
          </p>
        </div>
        <div className="bx-hero-aside"><StatusChip label={st.label} tone={st.tone} /></div>
      </section>

      {e.status !== 'cancelled' && (
        <div style={{ marginTop: 20 }}>
          <StepperTimeline steps={BRAND_STEPS} currentStepIndex={e.status === 'requested' && e.quote?.status === 'accepted' ? 1 : brandStepIndex(e.status)}
            nextLabel={brandNext(e.status, quoteToAnswer)} dates={{}} />
        </div>
      )}

      {report?.ok && (
        <section className="surface bx-card" aria-labelledby="bx-report">
          <div className="bx-head-row">
            <h2 id="bx-report" className="bx-h2">Your report</h2>
            <span className="bx-when">Completed {fmt(report.data.completed_at)}</span>
          </div>
          <p className="bx-note">Everything this Experience delivered: who shot it, what you received and what you were invoiced.</p>
          <div className="bx-report-grid">
            <div className="bx-stat"><div className="bx-stat-n">{report.data.creators.length}</div><div className="bx-when">creator{report.data.creators.length === 1 ? '' : 's'}</div></div>
            <div className="bx-stat"><div className="bx-stat-n">{report.data.items.length}</div><div className="bx-when">deliverable{report.data.items.length === 1 ? '' : 's'} received</div></div>
            <div className="bx-stat">{report.data.invoices.length
              ? <><div className="bx-stat-n">{formatRupees(report.data.invoices.reduce((t, i) => t + i.total_paise, 0))}</div><div className="bx-when">invoiced</div></>
              : <><div className="bx-stat-n">—</div><div className="bx-when">not invoiced yet</div></>}</div>
          </div>
          <h3 className="bx-h3">Creators</h3>
          <div className="bx-chips-wrap">
            {report.data.creators.map((c) => (
              <span key={`${c.full_name}-${c.handle}`} className="bx-person">
                {c.full_name}{c.profile_url ? <> · <a className="bx-link" href={c.profile_url} target="_blank" rel="noreferrer noopener">@{c.handle}</a></> : null}
              </span>
            ))}
          </div>
          <h3 className="bx-h3">Deliverables</h3>
          {report.data.items.map((i) => (
            <div key={i.release_id} className="bx-row">
              <div><div className="bx-label">{i.label}</div><div className="bx-when">{i.creator_name ?? 'Creator'}</div></div>
              <div style={{ minWidth: 0 }}>{i.kind === 'link' && i.url ? <a className="bx-link" href={i.url} target="_blank" rel="noreferrer noopener">{i.url}</a> : <ViewFile releaseId={i.release_id} fileName={i.file_name} />}</div>
              <div>{i.decision === 'approved' ? <span className="bx-chip bx-ok">Approved</span> : i.decision === 'changes_requested' ? <span className="bx-chip bx-chg">Changes asked</span> : <span className="bx-chip bx-new">Delivered</span>}</div>
            </div>
          ))}
        </section>
      )}

      {/* While deliverables are with the brand, they (and the sign-off) come first. */}
      {reviewing && reviewBlock}

      <section className="surface bx-card" aria-labelledby="bx-price">
        <h2 id="bx-price" className="bx-h2">Price</h2>
        <div style={{ marginTop: 12 }}>
          <QuoteCard experienceId={e.id} quote={e.quote} isAdmin={e.is_admin} agreedTotal={e.agreed_total_paise} />
        </div>
      </section>

      {hasRoster && roster?.ok && (
        <section className="surface bx-card" aria-labelledby="bx-creators">
          <h2 id="bx-creators" className="bx-h2">Creators</h2>
          <p className="bx-note">{roster.data.can_decide
            ? 'Accept the creators you want for the shoot. You can change your mind until Guapd confirms them.'
            : 'The creators for your shoot.'}</p>
          <RosterReview experienceId={e.id} creators={roster.data.creators} canDecide={roster.data.can_decide} />
        </section>
      )}

      {!reviewing && reviewBlock}

      {invoiceList.length > 0 && <Invoices invoices={invoiceList} fmt={fmt} />}

      <section className="surface bx-card" aria-labelledby="bx-req">
        <h2 id="bx-req" className="bx-h2">Your request</h2>
        <dl className="bx-dl">
          <dt>Creators</dt><dd>{req.creator_count ?? '—'}</dd>
          <dt>Each creator makes</dt><dd>{perCreator || '—'}</dd>
          {extras.length > 0 && <><dt>Also</dt><dd>{extras.join('; ')}</dd></>}
          {(req.location || req.date_from) && <><dt>Where and when</dt><dd>{[req.location, req.date_from ? `${fmt(req.date_from)}${req.date_to ? ` to ${fmt(req.date_to)}` : ''}` : null].filter(Boolean).join(' · ')}</dd></>}
          {req.brief && <><dt>Brief</dt><dd className="bx-pre">{req.brief}</dd></>}
        </dl>
      </section>
    </div>
  )
}

function Invoices({ invoices, fmt }: { invoices: BrandInvoice[]; fmt: (iso: string | null) => string | null }) {
  return (
    <section className="surface bx-card" aria-labelledby="bx-inv">
      <h2 id="bx-inv" className="bx-h2">Invoices</h2>
      <p className="bx-note">Guapd&apos;s invoices for this Experience. Pay by the details on the invoice; Guapd records your payment and marks it paid.</p>
      {invoices.map((i) => (
        <div key={i.invoice_id} className="bx-row">
          <div>
            <div className="bx-label">{i.number}</div>
            <div className="bx-when">Issued {fmt(i.issue_date)}{i.due_date ? ` · due ${fmt(i.due_date)}` : ''}</div>
            <div className="bx-when">{i.description}</div>
          </div>
          <div>
            <div className="bx-label">{formatRupees(i.total_paise)}</div>
            <div className="bx-when">{i.gst_paise ? `${formatRupees(i.subtotal_paise)} + ${formatRupees(i.gst_paise)} GST` : 'No GST charged'}{i.status === 'part_paid' ? ` · ${formatRupees(i.paid_paise)} received` : ''}</div>
            {i.has_pdf && <div style={{ marginTop: 6 }}><InvoicePdf invoiceId={i.invoice_id} /></div>}
          </div>
          <div>
            {i.status === 'paid' ? <span className="bx-chip bx-ok">Paid</span>
              : i.status === 'part_paid' ? <span className="bx-chip bx-new">Part paid</span>
              : <span className="bx-chip bx-chg">Due</span>}
          </div>
        </div>
      ))}
    </section>
  )
}
