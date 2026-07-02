'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendOTP } from '@/app/signup/creator/actions'
import { verifyAndSignIn } from './actions'

export default function PhoneLogin() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return
    setError(null)
    setLoading(true)

    const res = await sendOTP(phone.trim())
    setLoading(false)

    if (res.status === 'error') {
      setError(res.message)
      return
    }
    setStep('code')
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setError(null)
    setLoading(true)

    const res = await verifyAndSignIn(phone.trim(), code.trim())
    setLoading(false)

    if (res.status === 'error') {
      setError(res.message)
      return
    }
    router.push(res.redirect)
  }

  return (
    <div style={{ width: '100%' }}>
      {error && <p style={styles.error}>{error}</p>}

      {step === 'phone' ? (
        <form onSubmit={handleSendOTP} style={styles.form}>
          <input
            style={styles.input}
            type="tel"
            placeholder="Phone number (10 digits)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button type="submit" disabled={!phone.trim() || loading} style={{ ...styles.btn, opacity: phone.trim() && !loading ? 1 : 0.5 }}>
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} style={styles.form}>
          <p style={styles.codeSent}>Code sent to {phone}</p>
          <input
            style={styles.input}
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button type="submit" disabled={!code.trim() || loading} style={{ ...styles.btn, opacity: code.trim() && !loading ? 1 : 0.5 }}>
            {loading ? 'Verifying...' : 'Sign in'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('phone'); setCode(''); setError(null) }}
            style={styles.backBtn}
          >
            Change number
          </button>
        </form>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
    width: '100%',
  },
  input: {
    padding: '0.5rem 0.75rem',
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    fontSize: '0.9375rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '0.5rem 1rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  backBtn: {
    padding: '0.375rem',
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  codeSent: {
    fontSize: '0.8125rem',
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
    margin: '0 0 0.5rem',
    textAlign: 'center',
    lineHeight: 1.5,
  },
}
