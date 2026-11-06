import Link from 'next/link'
import { GUAPD_AI_SWITCH_PATH } from './GuapdAiSearchNotice'
import { VISIBILITY_CARD } from '@/lib/ai/search-visibility-copy'

/**
 * "Your visibility": the last 7 days of Guapd AI search, as three counts from
 * creator_search_visibility (0589). Each is a count of DISTINCT brand–days,
 * so one brand re-running searches adds at most 1 a day. Never which brand,
 * never a brief.
 */
export interface SearchVisibilityCounts { appeared: number; opened_profile: number; started_offer: number }

const times = (n: number) => (n === 1 ? 'time' : 'times')

export default function SearchVisibilityCard({ counts, hidden }: { counts: SearchVisibilityCounts; hidden: boolean }) {
  const stat = (n: number, label: string) => (
    <div style={{ flex: '1 1 0', minWidth: 90 }}>
      <div style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>{n}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.35 }}>{label}</div>
    </div>
  )
  return (
    <section aria-label="Your visibility" style={{
      borderRadius: 16, background: 'var(--card, #fff)', border: '1px solid var(--border-hairline, #EAEAE3)',
      boxShadow: '0 1px 2px rgba(24,28,36,.05), 0 18px 40px -28px rgba(24,28,36,.28)', padding: '16px clamp(16px, 2.4vw, 22px)', marginTop: 12, fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Your visibility</div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Guapd AI search, last 7 days</div>
      </div>
      {hidden ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
          {VISIBILITY_CARD.hidden} <Link href={GUAPD_AI_SWITCH_PATH} style={{ color: 'var(--ink)', fontWeight: 600 }}>{VISIBILITY_CARD.hiddenLink}</Link>
        </p>
      ) : counts.appeared === 0 ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
          {VISIBILITY_CARD.zeroTip} <Link href={GUAPD_AI_SWITCH_PATH} style={{ color: 'var(--ink)', fontWeight: 600 }}>{VISIBILITY_CARD.zeroLink}</Link>
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
            {stat(counts.appeared, `${times(counts.appeared)} you were shown to a brand`)}
            {stat(counts.opened_profile, `${times(counts.opened_profile)} a brand opened your profile`)}
            {stat(counts.started_offer, `${times(counts.started_offer)} a brand started an offer`)}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.45 }}>{VISIBILITY_CARD.footnote}</p>
        </>
      )}
    </section>
  )
}
