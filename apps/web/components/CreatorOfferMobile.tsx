'use client'

import React from 'react'
import Link from 'next/link'
import { zeroFeeNote } from '@/lib/fee-copy'

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
  brandName, dealTitle, receivesPaise, totalPaise, feePaise, feePercent, feeBasis,
  paymentTerms, paymentIn, deliverBy, waitingLabel, items, briefPitch, guidelines,
  avoid, attachments, usageRights, counter, revisionLimit, extraRevisionPaise,
  requiresShipment, unreadNotifications, decision, messageHref,
  stage = 'offer', agreedAt, rightsConfirmedAt, submitNode, submitDone = 0, submitTotal = 0, submittedAt, reviewedAt, approvedAt, postNode, allPosted = false,
}: {
  brandName: string
  dealTitle: string
  receivesPaise: number | null
  totalPaise: number | null
  feePaise: number | null
  feePercent: number | null
  /** deals.fee_basis. NULL on deals created before 0500 — treated as unknown,
      which downgrades the copy to a plain statement rather than a wrong one. */
  feeBasis: string | null
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
  /* Set once anyone has countered. Both states are status 'negotiating'; this
     is what tells them apart. Null on a fresh offer. */
  counter: {
    /** Who moved last. Decides which of the two negotiating screens this is. */
    lastBy: 'brand' | 'creator'
    theirPaise: number | null
    youAskedPaise: number | null
    at: string | null
  } | null
  revisionLimit: number | null
  extraRevisionPaise: number | null
  requiresShipment: boolean
  unreadNotifications: number
  /** This deal's message thread. */
  messageHref?: string
  /** The existing AcceptDecline, passed through rather than rebuilt. */
  decision: React.ReactNode
  /* AGREED shares this component rather than getting its own file. Per the
     exports, everything from "Brief & attachments" down is identical on both
     screens - two copies of that markup would drift the moment either is
     touched. Only the header, the stage line and the card body differ. */
  stage?: 'offer' | 'agreed' | 'submitted' | 'revision' | 'approved'
  agreedAt?: string | null
  rightsConfirmedAt?: string | null
  /** DeliverableItems, passed through: it owns uploads, versions and per-item
      status, none of which should exist twice. */
  submitNode?: React.ReactNode
  /** Items submitted, and how many there are. Drives both the "0 of 2" count
      and the segment bar the export puts under the heading. */
  submitDone?: number
  submitTotal?: number
  /** When the work was submitted, formatted. Drives the header line. */
  submittedAt?: string | null
  /** When the brand last reviewed. Header line on the revision screen. */
  reviewedAt?: string | null
  /** When the brand approved. Header line on the approved screen. */
  approvedAt?: string | null
  /** PostedCard in compact mode: one card per deliverable. */
  postNode?: React.ReactNode
  /** Whether every deliverable has a live URL yet. */
  allPosted?: boolean
}) {
  /* The agreed figures, defined once. Agreed and revision show them in their
     own collapsible card; submitted and approved fold them into "Brief &
     attachments" after the attachments, which is what BOTH of those exports
     do. Two screens agreeing is what settled it - one could have been an
     export artefact. */
  const agreedTermRows = (
            <div className="offer-m__termrows">
              {/* Flat rows, not the expandable deliverable cards the offer
                  screen uses. Nothing left to weigh up, so nothing opens. */}
              {items.map((it) => (
                <div className="offer-m__termrow" key={it.id}>
                  <span>{it.label}</span><span>{inr(it.pricePaise)}</span>
                </div>
              ))}
              {totalPaise !== null && (
                <div className="offer-m__termrow"><span>Deal total</span><span>{inr(totalPaise)}</span></div>
              )}
              {feePaise !== null && feePaise > 0 && (
                <div className="offer-m__termrow">
                  <span>Platform fee{feePercent ? ` (${feePercent}%)` : ''}</span>
                  <span>&minus;{inr(feePaise)}</span>
                </div>
              )}
              {usageRights && (
                <div className="offer-m__termrow"><span>Usage rights</span><span>{usageRights}</span></div>
              )}
              {revisionLimit !== null && (
                <div className="offer-m__termrow">
                  <span>Revisions</span>
                  <span>{revisionLimit} round{revisionLimit === 1 ? '' : 's'} included</span>
                </div>
              )}
              {rightsConfirmedAt && (
                <div className="offer-m__termrow"><span>Rights confirmed</span><span>{rightsConfirmedAt}</span></div>
              )}
            </div>
  )

  return (
    <div className="offer-m">
      {/* Sticky: who it is from and how to reach them. */}
      <div className="offer-m__head">
        <div className="offer-m__headrow">
          <Link href="/creator/deals" className="offer-m__back" aria-label="Back to deals">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
          <h1 className="offer-m__title">
            {stage === 'offer' ? 'Offer from ' : 'Deal with '}
            <span className="offer-m__brand">{brandName}</span>
          </h1>
          <div className="offer-m__headactions">
            {/* THIS deal's thread, not the inbox list - and `from=deal` so the
                thread's back arrow returns here rather than to the list. */}
            <Link href={messageHref ?? '/creator/inbox'} className="offer-m__icon" aria-label="Message brand">
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
            {/* Green once the deal is past the decision - both exports use
                neon-deep here. Amber belongs to an offer still to answer. */}
            <span className={`offer-m__dot${stage === 'offer' ? '' : ' offer-m__dot--agreed'}`} aria-hidden="true" />{dealTitle}
          </span>
          <span className="offer-m__waiting">
            {stage === 'approved'
              ? (approvedAt ? `Approved ${approvedAt}` : 'Approved')
              : stage === 'revision'
              ? (reviewedAt ? `Reviewed ${reviewedAt}` : 'Reviewed')
              : stage === 'submitted'
              ? (submittedAt ? `Submitted ${submittedAt}` : 'Submitted')
              : stage === 'agreed'
              /* The export puts the delivery date on the header line and the
                 agreed date in the card's summary, not the other way round. */
              ? (deliverBy ? `Deliver by ${deliverBy}` : 'Agreed')
              : counter?.at ? `Countered ${counter.at}` : waitingLabel}
          </span>
        </div>
      </div>

      <div className="offer-m__body">
        {/* Where this sits in the pipeline. */}
        <div className="offer-m__progresswrap">
          <div className="offer-m__progresshead">
            <span className="offer-m__stage">
              {stage === 'approved' ? 'Approved'
                : stage === 'revision' ? 'Changes requested'
                : stage === 'submitted' ? 'Submitted'
                : stage === 'agreed' ? 'Agreed'
                : counter ? 'Negotiating' : 'Offer received'}
            </span>
            <span className="offer-m__next">
              {stage === 'approved' ? 'Next: post content'
                : stage === 'revision' ? 'Next: resubmit'
                : stage === 'submitted' ? 'Next: brand review'
                : stage === 'agreed' ? 'Next: submit work' : 'Next: agree terms'}
            </span>
          </div>
          <div className="offer-m__progress" aria-hidden="true">
            {/* One lit segment per stage reached, so the bar moves forward. */}
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className={[
                  i <= (stage === 'approved' ? 3 : stage === 'revision' || stage === 'submitted' ? 2 : stage === 'agreed' ? 1 : 0) ? 'is-on' : '',
                  /* The export paints the reached segment amber on revision:
                     progress was made and then handed back. */
                  stage === 'revision' && i === 2 ? 'is-warn' : '',
                ].filter(Boolean).join(' ') || undefined}
              />
            ))}
          </div>
        </div>

        {/* AGREED: a COLLAPSED accordion, per the export. The summary carries
            the three things worth seeing at a glance - when it was agreed, what
            the creator takes home, and when they are paid. Everything else
            (the deliverables, the totals, the rights stamp) is folded away,
            because at this stage the screen's job is to get the work submitted,
            not to re-read terms already agreed.

            Deliberately NOT `open`: the export has no open attribute here,
            unlike the offer screen where the money IS the decision. */}
        {/* AGREED: a COLLAPSED accordion, per the export - no `open` attribute,
            unlike the offer screen where the money IS the decision. Two rows in
            the summary: the agreed stamp with the fold control, then the amount
            with the payment window beside it. Everything else folds away,
            because at this stage the screen's job is the work, not re-reading
            terms already agreed. */}
        {/* APPROVED: one card per deliverable to post, then the invoice
            state. Both sit above the folds - they are what is left to do. */}
        {stage === 'approved' && postNode}

        {stage === 'approved' && (
          <section className="offer-m__card offer-m__invoice">
            <h2 className="offer-m__submittitle">Invoice</h2>
            {/* The export says the invoice is created automatically. It is
                not: invoicing is gated on is_posted and the creator raises it
                themselves. Telling them it happens on its own would have them
                waiting for something nobody was going to do. */}
            <p className="offer-m__invoicebody">
              You can create and share your invoice once content is posted.
            </p>
            <div className="offer-m__invoicestate">
              <span className={`offer-m__invoicedot${allPosted ? ' offer-m__invoicedot--done' : ''}`} aria-hidden="true" />
              <span className="offer-m__label">
                {allPosted ? 'Ready to invoice' : 'Waiting on posted content'}
              </span>
            </div>
          </section>
        )}

        {/* The export's own notice, restored. I removed this when the purple
            banner was called out, having read "the purple one is not required"
            as "no notice is required" - they are two different blocks and only
            DeliverableItems' one was the duplicate.

            Not a link: the export makes it an anchor pointing at
            "Creator Deal Detail - Revision Mobile.dc.html", which is navigation
            between design files, not a destination in the product. */}
        {stage === 'submitted' && (
          <div className="offer-m__card offer-m__notice">
            <span className="offer-m__noticeicon" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></svg>
            </span>
            <div>
              <div className="offer-m__noticetitle">Submitted for review</div>
              <div className="offer-m__noticebody">The brand has been notified and is reviewing your deliverables.</div>
            </div>
          </div>
        )}

        {/* The submitted work, folded: it has been sent, so it is a record
            rather than a task. */}
        {/* REVISION: always open. The brand has handed work back, so what to
            do about it must not be behind a fold. Submitted folds it because
            there the work is a record; here it is the task. */}
        {stage === 'revision' && submitNode && (
          <section className="offer-m__card offer-m__submit">
            <div className="offer-m__submithead">
              <h2 className="offer-m__submittitle">Deliverables</h2>
            </div>
            <div className="offer-m__submitbody">{submitNode}</div>
          </section>
        )}

        {(stage === 'submitted' || stage === 'approved') && submitNode && (
          <details className="offer-m__card offer-m__fold offer-m__delivfold">
            <summary className="offer-m__foldhead">
              <h2 className="offer-m__submittitle">Deliverables</h2>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </summary>
            <div className="offer-m__submitbody">{submitNode}</div>
          </details>
        )}

        {(stage === 'agreed' || stage === 'revision') && (
          <details className="offer-m__card offer-m__agreedcard">
            <summary className="offer-m__agreedsum">
              <div className="offer-m__agreedtop">
                <span className="offer-m__agreedstamp">
                  <span className="offer-m__agreeddot" aria-hidden="true" />
                  <span className="offer-m__label">{agreedAt ? `Agreed on ${agreedAt}` : 'Agreed'}</span>
                </span>
                <span className="offer-m__agreedchev" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></span>
              </div>
              {/* Amount and payment window share a baseline - the export does
                  not stack them, and at 20px this is a reference figure, not
                  the headline it is on the offer screen. */}
              <div className="offer-m__agreedmoney">
                <div>
                  <div className="offer-m__label">You receive</div>
                  <div className="offer-m__agreedamount">{receivesPaise !== null ? inr(receivesPaise) : '\u2014'}</div>
                </div>
                {paymentTerms && <span className="offer-m__agreedterms-note">{paymentTerms}</span>}
              </div>
            </summary>

            {agreedTermRows}
          </details>
        )}

        {/* OFFER ONLY. This said `stage !== 'agreed'`, which is true for
            'submitted' too - so a deal the creator had already delivered
            rendered the whole offer card underneath, Accept, Counter and
            Decline included, on work that was already sent. */}
        {stage === 'offer' && (
        <section className="offer-m__card">
          {/* THE HEADLINE IS WHATEVER THE CREATOR HAS TO ACT ON.
              No counter: what they take home, which is the offer.
              Brand countered: THEIR number, because that is the thing on the
              table to accept - "You receive" alongside it was a figure derived
              from the old price and read as a competing offer.
              Creator countered: their own ask, because nothing is theirs to
              decide until the brand answers. */}
          {!counter && (
            <>
              <div className="offer-m__label">You receive</div>
              <div className="offer-m__amount">{receivesPaise !== null ? inr(receivesPaise) : '\u2014'}</div>
            </>
          )}
          {counter?.lastBy === 'brand' && (
            <>
              <div className="offer-m__label">Their counter</div>
              <div className="offer-m__amount">{counter.theirPaise !== null ? inr(counter.theirPaise) : '\u2014'}</div>
            </>
          )}
          {counter?.lastBy === 'creator' && (
            <>
              <div className="offer-m__label">Your ask</div>
              <div className="offer-m__amount">{counter.youAskedPaise !== null ? inr(counter.youAskedPaise) : '\u2014'}</div>
            </>
          )}
          {paymentTerms && <div className="offer-m__terms">{paymentTerms}</div>}

          {/* WHAT IS ACTUALLY ON THE TABLE. Only the brand's number is a term
              the creator can accept; their own ask is not binding until the
              brand takes it. Showing both, labelled, is the difference between
              a negotiation you can read and two numbers you have to remember.
              Everything below this block stays exactly as the offer-received
              screen draws it — same layout, same order — so moving from one
              state to the other does not feel like a different page. */}
          {counter?.lastBy === 'brand' && counter.youAskedPaise !== null && (
            <div className="offer-m__counter">
              <div className="offer-m__counterhead">
                <div>
                  <span className="offer-m__label">On the table</span>
                  <div className="offer-m__counterasked">You asked {inr(counter.youAskedPaise)}</div>
                </div>
                <span className="offer-m__counterpill">Their move answered</span>
              </div>
            </div>
          )}

          {/* WAITING ON THE BRAND. The controls are gone because there is
              nothing here for the creator to accept - their own ask is not a
              term they can agree with themselves. Leaving Accept on screen
              would offer them the brand's superseded price. */}
          {counter?.lastBy === 'creator' && (
            <div className="offer-m__counter">
              <div className="offer-m__counterhead">
                <div>
                  <span className="offer-m__label">Their offer</span>
                  <div className="offer-m__counterasked">
                    {counter.theirPaise !== null ? inr(counter.theirPaise) : '\u2014'}
                  </div>
                </div>
                <span className="offer-m__counterpill offer-m__counterpill--sent">
                  Sent &middot; waiting for {brandName}
                </span>
              </div>
            </div>
          )}

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

          {/* A zero fee is explained, not just shown. Otherwise a creator
              reads it as a bug, or expects it on the next deal too.

              The REASON comes from feeBasis, never from the number being zero.
              An ops pair rate, a per-deal override and a brand on 0% all land
              here too, and telling one of those creators their free deal came
              from a storefront referral is a specific false claim about how
              they were found — and about whether the next one is charged. */}
          {zeroFeeNote(feePercent, feeBasis, 'creator') ? (
            <div className="offer-m__feerow offer-m__feerow--free">
              <span>Platform fee</span>
              <span>{zeroFeeNote(feePercent, feeBasis, 'creator')}</span>
            </div>
          ) : feePaise !== null && feePaise > 0 ? (
            <div className="offer-m__feerow">
              <span>Platform fee{feePercent ? ` (${feePercent}%)` : ''}</span>
              <span>&minus;{inr(feePaise)}</span>
            </div>
          ) : null}

          {counter?.lastBy !== 'creator' && <div className="offer-m__decision">{decision}</div>}
        </section>
        )}

        {/* SUBMIT DELIVERABLES. DeliverableItems is passed through whole: it
            owns uploads, versions, per-item status and the review handoff, and
            a phone-shaped copy of that logic is the last thing this needs. */}
        {stage === 'agreed' && submitNode && (
          <section className="offer-m__card offer-m__submit">
            <div className="offer-m__submithead">
              <h2 className="offer-m__submittitle">Submit deliverables</h2>
              <span className="offer-m__submitcount">{submitDone} of {submitTotal}</span>
            </div>
            {/* One segment per deliverable, filled as each is submitted. The
                export has this under the heading and I had missed it. */}
            {submitTotal > 0 && (
              <div className="offer-m__submitbar" aria-hidden="true">
                {Array.from({ length: submitTotal }, (_, i) => (
                  <span key={i} className={i < submitDone ? 'is-on' : undefined} />
                ))}
              </div>
            )}
            <div className="offer-m__submitbody">{submitNode}</div>
          </section>
        )}

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
            {(stage === 'submitted' || stage === 'approved') && (
              <div className="offer-m__briefterms">
                <div className="offer-m__agreedstamp">
                  <span className="offer-m__agreeddot" aria-hidden="true" />
                  <span className="offer-m__label">{agreedAt ? `Agreed on ${agreedAt}` : 'Agreed'}</span>
                </div>
                <div className="offer-m__agreedmoney">
                  <div>
                    <div className="offer-m__label">You receive</div>
                    <div className="offer-m__agreedamount">{receivesPaise !== null ? inr(receivesPaise) : '\u2014'}</div>
                  </div>
                  {paymentTerms && <span className="offer-m__agreedterms-note">{paymentTerms}</span>}
                </div>
                {agreedTermRows}
              </div>
            )}
          </details>
        )}

        {/* Terms */}
        <details className="offer-m__card offer-m__fold">
          <summary className="offer-m__foldhead">
            Full terms &amp; guidelines
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#878D99" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          {/* The export labels the list inside the fold as well as the fold. */}
          <div className="offer-m__label" style={{ marginTop: 14 }}>Full terms</div>
          {/* Flex rows, matching the agreed block's structure and the export's.
              A dl needed the value pulled onto its label's line with a negative
              margin, which assumed every row was one line high - it is not,
              once usage rights or revision terms wrap. */}
          <div className="offer-m__terms-list">
            {totalPaise !== null && (
              <div className="offer-m__termrow"><span>Deal total</span><span>{inr(totalPaise)}</span></div>
            )}
            {feePaise !== null && feePaise > 0 && (
              <div className="offer-m__termrow">
                <span>Platform fee{feePercent ? ` (${feePercent}%)` : ''}</span>
                <span>&minus;{inr(feePaise)}</span>
              </div>
            )}
            {receivesPaise !== null && (
              <div className="offer-m__termrow"><span>You receive</span><span>{inr(receivesPaise)}</span></div>
            )}
            {/* WHEN THEY GET PAID, not when the post runs. This row was the
                go-live date; a creator reading an offer needs the payment
                window more than the publish date, and the publish date is
                already the thing they are agreeing to deliver. */}
            {paymentIn && (
              <div className="offer-m__termrow"><span>Payment in</span><span>{paymentIn}</span></div>
            )}
            {/* Legacy: only on deals agreed before 0501. */}
            {usageRights && (
              <div className="offer-m__termrow"><span>Usage rights</span><span>{usageRights}</span></div>
            )}
            {revisionLimit !== null && (
              <div className="offer-m__termrow">
                <span>Revisions</span>
                <span>
                  {revisionLimit} round{revisionLimit === 1 ? '' : 's'}
                  {extraRevisionPaise ? `, then ${inr(extraRevisionPaise)}` : ''}
                </span>
              </div>
            )}
          </div>
            {guidelines.length > 0 && (
              <>
                <div className="offer-m__label" style={{ marginTop: 18 }}>Creative guidelines</div>
                <ol className="offer-m__guides">
                  {guidelines.map((g, i) => <li key={i}><span>{i + 1}</span>{g}</li>)}
                </ol>
              </>
            )}
            {avoid.length > 0 && (
              <>
                <div className="offer-m__label" style={{ marginTop: 18 }}>Please avoid</div>
                <ul className="offer-m__avoid">
                  {avoid.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </>
            )}
        </details>

      </div>
    </div>
  )
}
