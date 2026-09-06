'use client'

import Link from 'next/link'

/**
 * Creator deal detail — the OFFER RECEIVED state, mobile.
 * Built to "Creator Deal Detail - Offer Received Mobile Standalone".
 *
 * Renders below 720px and only while a deal is `negotiating`. Every other state
 * — agreed, delivered, approved, paid — has its own design we do not have, so
 * the existing page keeps those on mobile as well as desktop. Same reasoning as
 * the inbox: build the state we were given, hand the rest over untouched.
 *
 * The decision controls are NOT re-implemented here. Accept, counter and
 * decline all render the existing AcceptDecline component, so the terms a
 * creator agrees to on a phone go through exactly the code that has been
 * handling them on desktop.
 *
 * ── Three things the mockup shows that we cannot ──────────────────────────
 * "RESPOND BY 19 JUL". No offer expiry exists anywhere in this schema and
 * nothing expires an offer. This is the fourth screen to ask for that date. It
 * says how long the offer has been waiting instead, which is true.
 *
 * "LIVE WINDOW 22–28 JUL". There is no live-window field. The deal carries one
 * delivery date, which is shown as Deliver by.
 *
 * "EXCLUSIVITY Beauty, 14 days". No exclusivity field exists. Omitted rather
 * than filled with a plausible-looking default — this is a term a creator would
 * be held to.
 */

export interface OfferItem {
  id: string
  label: string
  pricePaise: number
  detail: string | null
}

export interface OfferAttachment {
  name: string
  url: string | null
}

function inr(paise: number): string {
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN')
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function CreatorOfferMobile({
  brandName, dealTitle, receivesPaise, totalPaise, feePaise, feePercent,
  paymentTerms, paymentIn, deliverBy, waitingLabel, items, briefPitch, guidelines,
  avoid, attachments, usageRights, revisionLimit, extraRevisionPaise,
  requiresShipment, unreadNotifications, decision,
}: {
  brandName: string
  dealTitle: string
  receivesPaise: number | null
  totalPaise: number | null
  feePaise: number | null
  feePercent: number | null
  paymentTerms: string | null
  /** e.g. "30 days", derived from the agreed payment terms. */
  paymentIn: string | null
  deliverBy: string | null
  waitingLabel: string
  items: OfferItem[]
  briefPitch: string | null
  guidelines: string[]
  avoid: string[]
  attachments: OfferAttachment[]
  usageRights: string | null
  revisionLimit: number | null
  extraRevisionPaise: number | null
  requiresShipment: boolean
  unreadNotifications: number
  /** The existing AcceptDecline, passed through rather than rebuilt. */
  decision: React.ReactNode
}) {
  return (
    <div className="offer-m">
      {/* Sticky: who it is from and how to reach them. */}
      <div className="offer-m__head">
        <div className="offer-m__headrow">
          <Link href="/creator/deals" className="offer-m__back" aria-label="Back to deals">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
          <h1 className="offer-m__title">
            Offer from <span className="offer-m__brand">{brandName}</span>
          </h1>
          <div className="offer-m__headactions">
            <Link href="/creator/inbox" className="offer-m__icon" aria-label="Message brand">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </Link>
            <Link href="/creator/notifications?from=deals" className="offer-m__icon" aria-label="Notifications">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {unreadNotifications > 0 && (
                <span className="mbell-badge">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>
              )}
            </Link>
          </div>
        </div>
        {/* The DEAL's own name beside the status dot — what this offer is for.
            The stage ("Offer received") belongs to the progress block below;
            putting it here left the deal unnamed on its own screen. */}
        <div className="offer-m__status">
          <span className="offer-m__statuslabel">
            <span className="offer-m__dot" aria-hidden="true" />{dealTitle}
          </span>
          <span className="offer-m__waiting">{waitingLabel}</span>
        </div>
      </div>

      <div className="offer-m__body">
        {/* Where this sits in the pipeline. */}
        <div className="offer-m__progresswrap">
          <div className="offer-m__progresshead">
            <span className="offer-m__stage">Offer received</span>
            <span className="offer-m__next">Next: agree terms</span>
          </div>
          <div className="offer-m__progress" aria-hidden="true">
            <span className="is-on" />{Array.from({ length: 5 }, (_, i) => <span key={i} />)}
          </div>
        </div>

        {/* The money and the decision — the one job of this screen. */}
        <section className="offer-m__card">
          <div className="offer-m__label">You receive</div>
          <div className="offer-m__amount">{receivesPaise !== null ? inr(receivesPaise) : '—'}</div>
          {paymentTerms && <div className="offer-m__terms">{paymentTerms}</div>}

          {(deliverBy || paymentIn) && (
            <div className="offer-m__split">
              <div style={{ flex: 1 }}>
                <div className="offer-m__label">Deliver by</div>
                <div className="offer-m__splitval">{deliverBy ?? '—'}</div>
              </div>
              {/* The export's second column is a "Live window", which has no
                  field. This is the payment window, which the agreed terms
                  actually state. */}
              <div style={{ flex: 1 }}>
                <div className="offer-m__label">Payment in</div>
                <div className="offer-m__splitval">{paymentIn ?? '—'}</div>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="offer-m__items">
              {items.map((it) => (
                <details key={it.id} className="offer-m__deliv">
                  <summary>
                    <span className="offer-m__delivicon" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="12" cy="12" r="3.2" /></svg>
                    </span>
                    <span className="offer-m__delivname">{it.label}</span>
                    <span className="offer-m__delivprice">{inr(it.pricePaise)}</span>
                    <svg className="offer-m__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </summary>
                  {it.detail && <div className="offer-m__delivbody">{it.detail}</div>}
                </details>
              ))}
            </div>
          )}

          {feePaise !== null && feePaise > 0 && (
            <div className="offer-m__feerow">
              <span>Platform fee{feePercent ? ` (${feePercent}%)` : ''}</span>
              <span>&minus;{inr(feePaise)}</span>
            </div>
          )}

          <div className="offer-m__decision">{decision}</div>
        </section>

        {/* Brief */}
        {(briefPitch || attachments.length > 0 || requiresShipment) && (
          <details className="offer-m__card offer-m__fold" open>
            <summary className="offer-m__foldhead">
              Brief &amp; attachments
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            {briefPitch && (
              <>
                <div className="offer-m__label" style={{ marginTop: 14 }}>The brief</div>
                <p className="offer-m__prose">{briefPitch}</p>
              </>
            )}
            {attachments.length > 0 && (
              <>
                <div className="offer-m__label" style={{ marginTop: 16 }}>Attachments</div>
                <div className="offer-m__files">
                  {attachments.map((a) => (
                    a.url
                      ? <a key={a.name} href={a.url} target="_blank" rel="noopener noreferrer" className="offer-m__file">{a.name}</a>
                      : <span key={a.name} className="offer-m__file">{a.name}</span>
                  ))}
                </div>
              </>
            )}
            {requiresShipment && (
              <>
                <div className="offer-m__label" style={{ marginTop: 16 }}>Product kit</div>
                <p className="offer-m__prose">The brand will ship product to you for this deal.</p>
              </>
            )}
          </details>
        )}

        {/* Terms */}
        <details className="offer-m__card offer-m__fold">
          <summary className="offer-m__foldhead">
            Full terms
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          <dl className="offer-m__terms-list">
            {totalPaise !== null && <><dt>Deal total</dt><dd>{inr(totalPaise)}</dd></>}
            {feePaise !== null && feePaise > 0 && (
              <><dt>Platform fee{feePercent ? ` (${feePercent}%)` : ''}</dt><dd>&minus;{inr(feePaise)}</dd></>
            )}
            {receivesPaise !== null && <><dt>You receive</dt><dd>{inr(receivesPaise)}</dd></>}
            {usageRights && <><dt>Usage rights</dt><dd>{usageRights}</dd></>}
            {revisionLimit !== null && (
              <>
                <dt>Revisions</dt>
                <dd>
                  {revisionLimit} round{revisionLimit === 1 ? '' : 's'}
                  {extraRevisionPaise ? `, then ${inr(extraRevisionPaise)}` : ''}
                </dd>
              </>
            )}
            {paymentTerms && <><dt>Payment</dt><dd>{paymentTerms}</dd></>}
          </dl>
        </details>

        {/* Guidelines */}
        {(guidelines.length > 0 || avoid.length > 0) && (
          <details className="offer-m__card offer-m__fold">
            <summary className="offer-m__foldhead">
              Creative guidelines
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            {guidelines.length > 0 && (
              <ol className="offer-m__guides">
                {guidelines.map((g, i) => <li key={i}><span>{i + 1}</span>{g}</li>)}
              </ol>
            )}
            {avoid.length > 0 && (
              <>
                <div className="offer-m__label" style={{ marginTop: 16 }}>Please avoid</div>
                <ul className="offer-m__avoid">
                  {avoid.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </>
            )}
          </details>
        )}
      </div>
    </div>
  )
}
