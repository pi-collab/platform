import Link from 'next/link'

/**
 * 0580: a creator invoice needs a bank account on file (the database refuses
 * it otherwise). Shown in place of an invoice form until there is one, with a
 * link to Payments that brings the creator back to this deal.
 */
export default function BankDetailsFirst({ dealId }: { dealId: string }) {
  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 14, background: 'var(--sec-2, #F7F7F4)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', maxWidth: 440 }}>
        <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 999, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--neon)', color: 'var(--ink)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z" /></svg>
        </span>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>Add your bank details and PAN first</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--ink-soft)', marginTop: 3 }}>Guapd pays your invoice into your bank account, and your PAN goes on the invoice for TDS. Both need to be on file before you raise one. It takes a minute, and you come straight back here.</div>
        </div>
      </div>
      <Link href={`/creator/payments?deal=${dealId}`} className="neonbtn"
        style={{ display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 18px', borderRadius: 11, background: 'var(--neon)', color: 'var(--ink)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Add details
      </Link>
    </div>
  )
}
