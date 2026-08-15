'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CreatorSignInButton from '@/components/CreatorSignInButton'
import { sendOTP, verifyAndMatch } from './actions'
import FormError from '@/components/FormError'

export default function CreatorSignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim() || loading) return

    setError(null)
    setLoading(true)

    const result = await sendOTP(phone.trim())
    setLoading(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    setStep('code')
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || loading) return

    setError(null)
    setLoading(true)

    const result = await verifyAndMatch(phone.trim(), code.trim())

    if (result.status === 'error') {
      setLoading(false)
      setError(result.message)
      return
    }

    if (result.status === 'multi_stub') {
      setLoading(false)
      setError(result.message)
      return
    }

    // Stay in loading state — page navigates away
    router.push(result.redirect)
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Creator sign up</h1>
        <p style={styles.sub}>
          {step === 'phone'
            ? 'Enter your phone number to get started.'
            : `We sent a code to ${phone}. Enter it below.`}
        </p>

        {error && <FormError>{error}</FormError>}

        {step === 'phone' ? (
          <form onSubmit={handleSendCode} style={styles.form}>
            <input
              style={styles.input}
              type="tel"
              placeholder="Phone number (e.g. 9876543210)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8125rem', color: '#888', cursor: 'pointer' }}>
              <input type="checkbox" name="terms_accepted" required style={{ marginTop: '0.2rem' }} />
              <span>
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#111', fontWeight: 600, textDecoration: 'underline' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#111', fontWeight: 600, textDecoration: 'underline' }}>Privacy Policy</a>
              </span>
            </label>
            <button
              type="submit"
              disabled={loading || !phone.trim()}
              style={{
                ...styles.btn,
                opacity: loading || !phone.trim() ? 0.5 : 1,
              }}
            >
              {loading ? 'Sending...' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} style={styles.form}>
            <input
              style={styles.input}
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={loading}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              style={{
                ...styles.btn,
                opacity: loading || code.length !== 6 ? 0.5 : 1,
              }}
            >
              {loading ? 'Verifying...' : 'Verify & continue'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setCode(''); setError(null) }}
              style={styles.link}
            >
              Use a different number
            </button>
          </form>
        )}

        <div style={styles.divider}>
          <span style={styles.dividerText}>or</span>
        </div>

        <CreatorSignInButton />

        <p style={styles.footer}>
          Already have an account?{' '}
          <Link href="/login/creator" style={styles.footerLink}>Sign in</Link>
        </p>

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
    maxWidth: 400,
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#111',
    margin: 0,
  },
  sub: {
    fontSize: '0.9375rem',
    color: '#888',
    margin: 0,
    textAlign: 'center',
  },
  error: {
    fontSize: '0.875rem',
    color: '#854d0e',
    background: '#fef9c3',
    padding: '0.625rem 1rem',
    borderRadius: 8,
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.5,
    width: '100%',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
  },
  input: {
    padding: '0.625rem 0.75rem',
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    fontSize: '1rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '0.625rem 1rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  link: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },
  footer: {
    fontSize: '0.8125rem',
    color: '#888',
    margin: 0,
  },
  footerLink: {
    color: '#111',
    fontWeight: 600,
    textDecoration: 'none',
  },
  divider: {
    width: '100%',
    textAlign: 'center',
    borderBottom: '1px solid #e5e5e5',
    lineHeight: '0.1em',
    margin: '0.25rem 0',
  },
  dividerText: {
    background: '#fff',
    padding: '0 0.75rem',
    fontSize: '0.8125rem',
    color: '#888',
  },
}
