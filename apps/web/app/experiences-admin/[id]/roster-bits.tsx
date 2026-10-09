'use client'

/**
 * Row pieces shared by the roster and the "Not on Guapd yet" rows under it,
 * so both line up in the same columns: avatar, who, plan / cost, status, menu.
 */
export const ROSTER_COLS = '40px 1.5fr 1.4fr 150px 34px'

export function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
    : <span style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink-soft)', background: '#F7F4FB' }}>{initials}</span>
}

export function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="pmi" style={{
      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none',
      fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: danger ? '#C4494F' : 'var(--ink)', cursor: 'pointer',
    }}>{children}</button>
  )
}

export const kebab = (open: boolean): React.CSSProperties => ({
  width: 34, height: 34, borderRadius: 9, background: open ? 'var(--sec-2)' : 'transparent', border: 'none',
  cursor: 'pointer', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
})
export const menuBox: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 190, borderRadius: 12, background: '#FFFFFF',
  boxShadow: '0 4px 16px rgba(22,23,15,.12)', border: '1px solid var(--hairline)', padding: 6, zIndex: 10,
}
