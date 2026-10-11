import { metaLabel, sectionHeading, termRow } from './deal-shell'

/**
 * The creator deal page's cards, shared by a marketplace deal (page.tsx) and an
 * Experience creator leg (CreatorLegView), so both read as ONE deal page: the
 * "Ready to decide?" bar, the terms card with the dark "You receive" bar, the
 * Deliverables card and the money card. Lifted verbatim out of page.tsx and
 * InvoiceCard.tsx; nothing here reads data. Each caller passes its own values,
 * and a leg passes only its own leg's figures.
 */

export const dateValue: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 5,
}
export const metaRight: React.CSSProperties = { fontSize: 11.5, color: 'var(--ink-soft)' }
export const itemIcon: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 11, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
}
export const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 11px', borderRadius: 999,
  background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
  fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)',
}
const statusPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-soft)',
}

/** "Ready to decide?" — the bar above the tracker while an offer is open. */
export function ReadyToDecideBar({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="surface" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{sub}</div>
      </div>
      <a href="#decision" className="neonbtn" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: 44, padding: '0 22px', borderRadius: 12,
        background: 'var(--neon)', border: 'none',
        fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13, letterSpacing: '-0.01em', color: 'var(--ink)',
        boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
        textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        Ready to decide
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
      </a>
    </div>
  )
}

/** Offer / Agreed terms: what you make on the left, dates on the right, the dark "You receive" bar below. */
export function TermsCard({ heading, agreedLabel, title, sub, side, receiveLabel, receive }: {
  heading: string
  /** e.g. "Agreed 9 Oct, 6:43 pm"; omitted before agreement. */
  agreedLabel?: string | null
  title: React.ReactNode
  sub?: React.ReactNode
  side: { label: string; value: React.ReactNode }[]
  receiveLabel: string
  /** Formatted amount; the bar is hidden when null. */
  receive: string | null
}) {
  return (
    <div className="surface" style={{ padding: 0, overflow: 'hidden', scrollMarginTop: 24 }} id="decision">
      <div style={{ padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <h3 style={sectionHeading}>{heading}</h3>
          {agreedLabel && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-soft)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neon-deep)' }} />
              {agreedLabel}
            </span>
          )}
        </div>

        {/* Summary hero: deliverables left, dates right */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 22 }}>
          <div style={{ flex: 1.3, paddingRight: 32 }}>
            <div style={metaLabel}>Deliverables</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginTop: 8 }}>
              {title}
            </div>
            {sub && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>{sub}</div>}
          </div>
          {side.length > 0 && (
            <div style={{ flex: 1, paddingLeft: 32, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
              {side.map((s) => (
                <div key={s.label}>
                  <div style={metaLabel}>{s.label}</div>
                  <div style={dateValue}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dark "You receive" footer bar */}
      {receive != null && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          padding: '18px 28px',
          borderRadius: '0 0 20px 20px',
          background: 'var(--ink)', color: '#FFFFFF',
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{receiveLabel}</span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>
            {receive}
          </span>
        </div>
      )}
    </div>
  )
}

export type DeliverableIcon = 'instagram' | 'youtube' | 'video'

export function DeliverableGlyph({ kind, size = 18 }: { kind: DeliverableIcon; size?: number }) {
  if (kind === 'youtube') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m10 8 6 4-6 4V8z" /><rect x="2" y="3" width="20" height="18" rx="4" /></svg>
  if (kind === 'video') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" /></svg>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
}

/** One deliverable row: icon, name, optional price, chips. */
export function DeliverableRow({ icon, label, price, chips, last }: {
  icon: DeliverableIcon
  label: React.ReactNode
  price?: string | null
  chips: React.ReactNode[]
  last: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '16px 0', borderBottom: last ? 'none' : '1px solid var(--border-hairline, #EAEAE3)' }}>
      <span style={itemIcon}><DeliverableGlyph kind={icon} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 }}>
          <h4 style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>{label}</h4>
          {price && <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{price}</span>}
        </div>
        {chips.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 }}>{chips}</div>}
      </div>
    </div>
  )
}

/** The Deliverables card: heading + count, the rows, then whatever money rows and actions the caller adds. */
export function DeliverablesCard({ count, rows, children }: { count: string; rows: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="surface" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={sectionHeading}>Deliverables</h3>
        <span style={metaRight}>{count}</span>
      </div>
      <div style={{ marginTop: 12 }}>{rows}</div>
      {children}
    </div>
  )
}

/** A label / amount line inside a card (fee, total …). */
export function MoneyRow({ label, value, strong, last }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; last?: boolean }) {
  return (
    <div style={{ ...termRow, ...(last ? { borderBottom: 'none' } : {}) }}>
      <span style={{ fontSize: 12.5, color: strong ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: strong ? 600 : 400 }}>{label}</span>
      <b style={{ fontSize: strong ? 15 : 14, fontWeight: 700 }}>{value}</b>
    </div>
  )
}

/** The actions footer under a card's rows (Accept / Counter / Decline). */
export function CardActions({ children }: { children: React.ReactNode }) {
  return <div style={{ paddingTop: 22, marginTop: 22, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>{children}</div>
}

/**
 * The money card, in the Invoice card's layout: heading + status pill, a helper
 * line, the big "You receive" with its terms on the left and the breakdown on the
 * right, and a footer line. A leg uses it for its payout; Guapd pays, so there is
 * no invoice to raise.
 */
export function MoneyCard({ heading, pill, pillDot, helper, receiveLabel, receive, receiveSub, side, footer, paidBar }: {
  heading: string
  pill: string
  pillDot: string
  helper?: string | null
  receiveLabel: string
  receive: string
  receiveSub?: string | null
  side: { label: string; value: string }[]
  footer?: React.ReactNode
  /** When set, the dark "You received" bar replaces the two-column breakdown. */
  paidBar?: boolean
}) {
  return (
    <div className="surface" style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={sectionHeading}>{heading}</h3>
        <span style={statusPill}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: pillDot }} />
          {pill}
        </span>
      </div>

      {helper && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, maxWidth: 640 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>{helper}</span>
        </div>
      )}

      {paidBar ? (
        <>
          {side.length > 0 && <div style={{ marginTop: 18 }}>{side.map((s, i) => <MoneyRow key={s.label} label={s.label} value={s.value} last={i === side.length - 1} />)}</div>}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
            padding: '18px 24px', margin: '16px -24px 0', background: 'var(--ink)', color: '#FFFFFF',
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{receiveLabel}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>{receive}</span>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 22 }}>
          <div style={{ flex: 1.3, paddingRight: 32 }}>
            <div style={metaLabel}>{receiveLabel}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 8 }}>{receive}</div>
            {receiveSub && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 8 }}>{receiveSub}</div>}
          </div>
          {side.length > 0 && (
            <div style={{ flex: 1, paddingLeft: 32, borderLeft: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
              {side.map((s) => (
                <div key={s.label}>
                  <div style={metaLabel}>{s.label}</div>
                  <div style={dateValue}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {footer && (
        <div style={{ padding: '20px 0 0', marginTop: 20, borderTop: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {footer}
        </div>
      )}
    </div>
  )
}
