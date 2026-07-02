import Link from 'next/link'

export const metadata = {
  title: 'Sign up complete — Guapd',
  robots: { index: false, follow: false },
}

export default function CreatorSignupCompletePage({
  searchParams,
}: {
  searchParams: { claimed?: string }
}) {
  const isClaimed = searchParams.claimed === '1'

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        {isClaimed ? (
          <>
            <h1 style={styles.heading}>Welcome back!</h1>
            <p style={styles.sub}>
              Your profile has been linked to your account. You&apos;re all set.
            </p>
            <Link href="/creator/deals" style={styles.btn}>
              Go to my deals
            </Link>
          </>
        ) : (
          <>
            <h1 style={styles.heading}>You&apos;re all set!</h1>
            <p style={styles.sub}>
              Your profile is under review. We&apos;ll notify you when you&apos;re approved — this usually takes 24-48 hours.
            </p>
            <Link href="/creator/deals" style={styles.btn}>
              Check my status
            </Link>
          </>
        )}
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#fafafa',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
    padding: '3rem 2.5rem',
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 16,
    minWidth: 320,
    maxWidth: 420,
    textAlign: 'center',
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#111',
    margin: 0,
  },
  sub: {
    fontSize: '0.9375rem',
    color: '#555',
    margin: 0,
    lineHeight: 1.6,
  },
  note: {
    fontSize: '0.8125rem',
    color: '#888',
    margin: 0,
  },
  btn: {
    display: 'inline-block',
    padding: '0.625rem 1.5rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9375rem',
    fontWeight: 700,
    textDecoration: 'none',
  },
  link: {
    color: '#111',
    fontWeight: 600,
  },
}
