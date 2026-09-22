import Link from 'next/link'
import { IG_BROKEN_STATUSES, type IgStatus } from '@/lib/ig-connection-status'

/**
 * "Your Instagram stopped working" — on the dashboard, where they will see it.
 *
 * ── Built once, placed four times ───────────────────────────────────────────
 * The creator dashboard is four renderings: mobile empty, desktop empty, mobile
 * populated, desktop populated. It used to render above all four, which was
 * safe but put a fault notice above the creator's own name — the first thing on
 * the screen was something being wrong.
 *
 * It now sits between the greeting and the overview, which means each rendering
 * places it. The ELEMENT is still built once, in the dashboard route, and passed
 * down as a slot: what varies is position, never whether it exists or what it
 * says. A fifth rendering that forgets the slot shows no banner, so the slot is
 * part of what a rendering owes the page.
 *
 * It carries no outer padding of its own for the same reason — each layout
 * already has its own gutter and rhythm.
 *
 * ── A fault, not a task ─────────────────────────────────────────────────────
 * CreatorTaskCard asks for setup and counts a broken connection as DONE,
 * because a connection that has since expired is not an unstarted task. This
 * says the other thing: it worked, and now it does not. The two must never
 * both be on screen about Instagram — see lib/creator-tasks.
 *
 * ── Drawn as a card, not a tinted strip ─────────────────────────────────────
 * It used to be the generic Banner: a coloured dot, a run-on sentence and an
 * underlined link, sitting directly above a dashboard made of white cards with
 * icon chips and pill buttons. It read as a browser warning that had wandered
 * in. Same words, the page's own shape — an amber chip carries the alarm, so
 * the copy does not have to.
 *
 * Returns null unless something is actually wrong, so the caller renders it
 * unconditionally and does not have to ask the question twice.
 */
export default function InstagramReconnectBanner({ status }: { status: IgStatus }) {
  if (!IG_BROKEN_STATUSES.includes(status)) return null

  // Two different instructions, because reconnecting a Personal account
  // produces a Personal account again — following the generic message would
  // fail and look like our bug.
  const personal = status === 'personal_account'

  const title = personal ? 'Instagram is set to a Personal account' : 'Instagram needs reconnecting'
  const body = personal
    ? 'Instagram only shares audience data from Business and Creator accounts, so your verified stats have stopped updating. Switch it back in Instagram, then reconnect.'
    : 'Your verified stats have stopped updating. Until you reconnect, your shopfront shows the numbers you entered yourself.'

  return (
    <section
          style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            borderRadius: 16,
            background: 'var(--card, #fff)',
            /* The amber is a hairline and a chip, not a wash. A full tinted
               panel at the top of every load is the kind of alarm people learn
               to scroll past. */
            border: '1px solid rgba(216,154,46,.28)',
            boxShadow: '0 1px 2px rgba(24,28,36,.05), 0 18px 40px -28px rgba(24,28,36,.28)',
            padding: '16px clamp(16px, 2.4vw, 22px)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(216,154,46,.12)', color: '#A9761D',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="20" x="2" y="2" rx="5" />
              <path d="M12 8v4" /><path d="M12 16h.01" />
            </svg>
          </span>

          <span style={{ flex: 1, minWidth: 200 }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink, #181C24)' }}>
              {title}
            </span>
            <span style={{ display: 'block', fontSize: 12, lineHeight: 1.5, color: 'var(--wg-500, #6B7280)', marginTop: 2 }}>
              {body}
            </span>
          </span>

          {/* The same pill the task rows use, so "the thing to press" looks the
              same everywhere on this screen. */}
          <Link
            href="/creator/settings"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              borderRadius: 999, padding: '9px 16px', textDecoration: 'none',
              background: 'var(--ink, #181C24)', color: '#fff',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
            }}
          >
            {personal ? 'How to fix it' : 'Reconnect'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </Link>
    </section>
  )
}
