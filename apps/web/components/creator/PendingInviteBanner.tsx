import Link from 'next/link'

/** "A brand invited you": on the creator home when this browser opened an
 *  invite link (guapd_invite cookie) that is not accepted yet. */
export default function PendingInviteBanner({ token, brandName }: { token: string; brandName: string }) {
  return (
    <section style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderRadius: 16, background: 'var(--card, #fff)',
      border: '1px solid rgba(160,190,40,.35)', boxShadow: '0 1px 2px rgba(24,28,36,.05), 0 18px 40px -28px rgba(24,28,36,.28)',
      padding: '16px clamp(16px, 2.4vw, 22px)', marginTop: 12, fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{brandName} invited you to a campaign</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>Connect your Instagram and accept, and they will send you an offer.</div>
      </div>
      <Link href={`/c/${token}`} style={{ fontWeight: 700, fontSize: 13, padding: '9px 14px', borderRadius: 999, background: 'var(--ink)', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>View invite</Link>
    </section>
  )
}
