import Link from 'next/link'
import Banner from '@/components/ui/Banner'
import { IG_BROKEN_STATUSES, type IgStatus } from '@/lib/ig-connection-status'

/**
 * "Your Instagram stopped working" — on the dashboard, where they will see it.
 *
 * ── Why this renders at the page root ───────────────────────────────────────
 * The creator dashboard is four renderings: mobile empty, desktop empty, mobile
 * populated, desktop populated. Threading a prop into all four is how the two
 * halves of this product drift apart — a field added to the desktop table and
 * missing from the mobile card is a bug this codebase has had before.
 *
 * So the banner is rendered ONCE, above all four branches, and is responsive on
 * its own. Every creator sees it on every layout by construction, and a fifth
 * branch would inherit it for free.
 *
 * Returns null unless something is actually wrong, so the caller renders it
 * unconditionally and does not have to ask the question twice.
 */
export default function InstagramReconnectBanner({ status }: { status: IgStatus }) {
  if (!IG_BROKEN_STATUSES.includes(status)) return null

  const personal = status === 'personal_account'

  return (
    <div style={{ padding: '12px clamp(18px, 4vw, 44px) 0' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <Banner tone="warning">
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.4rem' }}>
            {/* Two different instructions, because reconnecting a Personal
                account produces a Personal account again — following the
                generic message would fail and look like our bug. */}
            <span>
              {personal
                ? 'Your Instagram is set to a Personal account, so your verified stats have stopped updating. Switch back to a Business or Creator account in Instagram, then reconnect.'
                : 'Your Instagram connection needs a quick reconnect to keep your verified stats live on your shopfront.'}
            </span>
            <Link
              href="/creator/settings"
              style={{ fontWeight: 700, textDecoration: 'underline', whiteSpace: 'nowrap' }}
            >
              Reconnect Instagram
            </Link>
          </span>
        </Banner>
      </div>
    </div>
  )
}
