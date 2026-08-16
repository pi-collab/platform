import Link from 'next/link'

/**
 * Brand-facing explanation of the first-send hold.
 *
 * A held deal with no explanation is the "is this thing broken?" failure — the
 * brand sees a deal they believe they sent, no creator response, and no reason.
 * Worse, they may re-send, creating duplicates. So this states three things
 * explicitly: it is held, it is NOT lost, and release is automatic.
 *
 * Rendered on the deals list and on the pending page.
 */
export default function HeldNotice({
  heldCount,
  status,
  rejectionReason,
  showDealsLink = true,
}: {
  heldCount: number
  status: string
  rejectionReason?: string | null
  /** False on /deals itself, where the link would point at the page you are
   *  already reading. */
  showDealsLink?: boolean
}) {
  if (status === 'rejected') {
    return (
      <div className="heldnotice heldnotice--rejected" role="status">
        <div className="heldnotice__title">Your account isn’t cleared to send new deals</div>
        <p className="heldnotice__body">
          {rejectionReason?.trim() ||
            'We weren’t able to approve your account for sending. Your existing deals are unaffected.'}
          {heldCount > 0 && (
            <> {heldCount === 1 ? 'The deal you queued has' : `The ${heldCount} deals you queued have`} not been sent.</>
          )}
        </p>
        <p className="heldnotice__body">
          {/* Not "reply to your signup email": that was sent by Supabase with
              no reply-to, so a reply reaches nobody. A mailto at least opens
              somewhere real, without printing the address as body text. */}
          If you think this is a mistake,{' '}
          <a href="mailto:contact@guapd.com" className="heldnotice__link">get in touch</a>{' '}
          and we’ll take another look.
        </p>
      </div>
    )
  }

  if (heldCount === 0) return null

  return (
    <div className="heldnotice" role="status">
      <div className="heldnotice__title">
        Your account’s being reviewed before your first {heldCount === 1 ? 'deal goes' : 'deals go'} out
      </div>
      <p className="heldnotice__body">
        {heldCount === 1 ? 'Your deal is' : `All ${heldCount} of your deals are`} saved and waiting. We check
        every brand once before their first deal reaches a creator. We’ll notify you as soon as you’re
        cleared, and <strong>everything you’ve sent goes out automatically</strong>. You don’t need to
        send anything again.
      </p>
      <p className="heldnotice__meta">
        This happens once. After you’re approved, every future deal sends straight away.{' '}
        <Link href="/deals" className="heldnotice__link">View your queued deals</Link>
      </p>
    </div>
  )
}
