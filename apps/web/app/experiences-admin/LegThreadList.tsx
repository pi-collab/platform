import Link from 'next/link'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import type { LegThreadRow } from '@/lib/experience-console-server'

/**
 * Sent creator deals as a list (0546): the Deals tab of one Experience and the
 * console inbox across all of them. Status, any open counter, the last message
 * and this staff user's unread count. No money: amounts stay on the Creator
 * deals panel, behind the same operational access.
 */
const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  negotiating: { label: 'Awaiting creator', tone: 'amber' },
  agreed: { label: 'Accepted', tone: 'lime' },
  declined: { label: 'Declined', tone: 'red' },
  cancelled: { label: 'Withdrawn', tone: 'neutral' },
  complete: { label: 'Complete', tone: 'neutral' },
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function LegThreadList({ rows, hrefFor, activeId, showExperience }: {
  rows: LegThreadRow[]
  /** The deal id is appended. */
  hrefFor: string
  activeId: string | null
  showExperience: boolean
}) {
  if (rows.length === 0) {
    return <p className="t-body" style={{ margin: 0, fontSize: 13.5 }}>No creator deals sent yet. Send them from Creator deals on the Overview tab.</p>
  }
  return (
    <ul className="xp-tl" role="list">
      {rows.map((r) => {
        const st = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as ChipTone }
        const initials = (r.creator_name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
        return (
          <li key={r.deal_id}>
            <Link href={`${hrefFor}${r.deal_id}`} className={`xp-tl-row${activeId === r.deal_id ? ' on' : ''}`} aria-current={activeId === r.deal_id ? 'true' : undefined}>
              {r.creator_photo
                ? <img src={r.creator_photo} alt="" className="xp-tl-av" />
                : <span className="xp-tl-av" aria-hidden="true">{initials}</span>}
              <span className="xp-tl-main">
                <span className="xp-tl-top">
                  <span className="xp-tl-name">{r.creator_name}</span>
                  {r.last_message && <span className="xp-tl-when">{ago(r.last_message.created_at)}</span>}
                </span>
                <span className="xp-tl-sub">
                  {showExperience ? `${r.experience_title} · ${r.brand_name}` : r.deal_ref ?? ''}
                </span>
                <span className="xp-tl-last">
                  {r.last_message ? <>{r.last_message.from === 'guapd' ? 'You: ' : ''}{r.last_message.body}</> : <em>No messages yet</em>}
                </span>
                <span className="xp-tl-chips">
                  <StatusChip label={st.label} tone={st.tone} />
                  {r.open_counter && <StatusChip label={r.open_counter.proposed_by === 'creator' ? `Creator countered · round ${r.open_counter.round}` : `Guapd countered · round ${r.open_counter.round}`} tone="amber" />}
                </span>
              </span>
              {r.unread > 0 && <span className="xp-tl-unread" aria-label={`${r.unread} unread`}>{r.unread}</span>}
            </Link>
          </li>
        )
      })}
      <style dangerouslySetInnerHTML={{ __html: `
        .xp-tl { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .xp-tl-row { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--hairline); background: #fff; text-decoration: none; color: inherit; }
        .xp-tl-row:hover { border-color: #D8D9CF; }
        .xp-tl-row.on { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink) inset; }
        .xp-tl-av { width: 38px; height: 38px; border-radius: 12px; flex: none; object-fit: cover; display: inline-flex; align-items: center; justify-content: center; background: var(--sec-2, #EEF0E6); font-family: var(--font-display); font-weight: 700; font-size: 13px; color: var(--ink); }
        .xp-tl-main { flex: 1; min-width: 0; display: grid; gap: 3px; }
        .xp-tl-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
        .xp-tl-name { font-family: var(--font-ui); font-weight: 700; font-size: 14px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .xp-tl-when { font-family: var(--font-ui); font-size: 11px; color: var(--ink-faint); flex: none; }
        .xp-tl-sub { font-family: var(--font-ui); font-size: 12px; color: var(--ink-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .xp-tl-last { font-family: var(--font-ui); font-size: 13px; color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .xp-tl-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
        .xp-tl-unread { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--neon); color: var(--ink); font-family: var(--font-ui); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex: none; }
      ` }} />
    </ul>
  )
}
