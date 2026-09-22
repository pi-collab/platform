'use client'

/**
 * "What kind of campaign?" — the fork, before anything is typed.
 *
 * Transcribed from "Choose Campaign Type - standalone".
 *
 * ── Why a fork and not a toggle inside the form ─────────────────────────────
 * The track decides what one billable unit is, which creators can be added and
 * what the fee is. It is not a preference to be adjusted among the name and the
 * budget; it is the decision that shapes everything after it. A radio sitting
 * between "Campaign name" and "Budget" would read as an afterthought and be
 * treated as one.
 *
 * The two cards also do a second job the toggle could not: they explain the
 * difference. "Vetted creators / 1:1 negotiation" against "Emerging & UGC /
 * Minimum applies" is the whole product distinction in four chips.
 */
export default function CampaignTypeModal({
  canGrowth, onChoose, onClose,
}: {
  /** Whether the brand holds the growth_campaigns entitlement. */
  canGrowth: boolean
  onChoose: (track: 'deals' | 'growth') => void
  onClose: () => void
}) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(24,28,36,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        animation: 'ctFadeIn .25s ease backwards',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose campaign type"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        style={{
          width: '100%', maxWidth: 920, maxHeight: '90vh', overflow: 'auto',
          background: '#FCFBF7', borderRadius: 28,
          boxShadow: '0 40px 80px -30px rgba(24,28,36,.5)',
          animation: 'ctPopIn .3s cubic-bezier(.22,1,.36,1) backwards',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '44px 48px 0' }}>
          <div>
            <span style={{
              fontFamily: "var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace)", fontSize: 10.5, fontWeight: 500,
              letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)',
            }}>
              New campaign
            </span>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em',
              fontSize: 'clamp(24px,2.8vw,28px)', margin: '12px 0 0',
            }}>
              What kind of campaign?
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
              Choose how you want to work with creators.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: 'none',
              background: 'rgba(24,28,36,.05)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            className="ct-closebtn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="typegrid" style={{ padding: '32px 48px 48px' }}>
          <TypeCard
            onClick={() => onChoose('deals')}
            icon={
              <path d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2Z" />
            }
            title="Deals campaign"
            body="Work with established, vetted creators on premium collaborations."
            chips={['Vetted creators', '1:1 negotiation']}
            cta="Start a Deals campaign"
          />

          <TypeCard
            onClick={() => canGrowth && onChoose('growth')}
            disabled={!canGrowth}
            icon={
              <>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </>
            }
            title="Growth campaign"
            badge="Growth"
            body="Run bulk campaigns with emerging & UGC creators for volume and reach."
            chips={['Emerging & UGC', 'Minimum applies']}
            cta={canGrowth ? 'Start a Growth campaign' : 'Not enabled yet'}
            /* Shown rather than hidden when the brand lacks the entitlement.
               A brand that cannot run one should still learn it exists — this
               is the only place the product explains what Growth IS, and an
               invisible option sells nothing. */
            note={canGrowth ? undefined : 'Talk to us and we’ll switch it on for your account.'}
          />
        </div>
      </div>
    </div>
  )
}

function TypeCard({
  onClick, icon, title, body, chips, cta, badge, disabled = false, note,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  body: string
  chips: string[]
  cta: string
  badge?: string
  disabled?: boolean
  note?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="typecard"
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        borderRadius: 20, background: '#FFFFFF',
        border: '1.5px solid var(--border-hairline, #EAEAE3)',
        padding: '34px 30px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.62 : 1,
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 48, height: 48, borderRadius: 15,
        background: 'linear-gradient(150deg, var(--frost-strong, rgba(255,255,255,.72)), rgba(255,255,255,0))',
        border: '1px solid var(--frost-edge, rgba(24,28,36,.08))',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 18 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', margin: 0 }}>
          {title}
        </h2>
        {/* Neon, per the design — not the indigo the Growth tag uses elsewhere.
            This is the one primary moment on the screen, which is what the
            neon is reserved for; the indigo tag is for rows in a list. */}
        {badge && (
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            fontFamily: 'var(--font-ui)', fontSize: 10.5, fontWeight: 700,
            color: 'var(--ink)', background: 'var(--neon)',
            borderRadius: 999, padding: '4px 10px',
          }}>
            {badge}
          </span>
        )}
      </span>

      <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, margin: '9px 0 0' }}>{body}</p>

      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 16 }}>
        {chips.map((c) => (
          <span key={c} style={{
            fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)',
            background: 'rgba(24,28,36,.04)', borderRadius: 999, padding: '5px 11px',
          }}>
            {c}
          </span>
        ))}
      </span>

      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        marginTop: 22, height: 48, borderRadius: 12,
        background: disabled ? 'rgba(24,28,36,.10)' : 'var(--ink)',
        fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14,
        color: disabled ? 'var(--ink-faint)' : '#FFFFFF',
      }}>
        {cta}
        {!disabled && (
          <svg className="arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </span>

      {note && (
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 10, textAlign: 'center' }}>
          {note}
        </span>
      )}
    </button>
  )
}
