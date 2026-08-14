'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmail, signUpWithEmail, resetPassword } from '@/app/login/actions'
import { validateNewPassword } from '@/lib/password'
import { trackEvent } from '@/lib/analytics'

type View = 'login' | 'signup' | 'reset' | 'confirm'

export default function EmailAuthForm() {
  const router = useRouter()
  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signInWithEmail(email, password)
    if (res.status === 'error') {
      setLoading(false)
      setError(res.message)
    } else {
      // Stay in loading state — page navigates away and unmounts this component
      router.push('/deals')
      router.refresh()
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    // Shared with the reset page so the two can't drift apart.
    const check = validateNewPassword(password, confirmPw)
    if (!check.ok) {
      setError(check.message)
      return
    }
    setLoading(true)
    const res = await signUpWithEmail(email, password)
    if (res.status !== 'error') trackEvent('brand_signed_up', { method: 'email' })
    if (res.status === 'error') {
      setLoading(false)
      setError(res.message)
    } else {
      setLoading(false)
      setMessage(res.message)
      setView('confirm')
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await resetPassword(email)
    setLoading(false)
    if (res.status === 'error') {
      setError(res.message)
    } else {
      setMessage('If that email is registered, you\'ll receive a reset link.')
      setView('confirm')
    }
  }

  if (view === 'confirm') {
    return (
      <div style={styles.form}>
        <p style={styles.success}>{message}</p>
        <button type="button" onClick={() => { setView('login'); setMessage(''); setError('') }} style={styles.link}>
          Back to login
        </button>
      </div>
    )
  }

  if (view === 'reset') {
    return (
      <form onSubmit={handleReset} style={styles.form}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={styles.input}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={loading} style={styles.btn}>
          {loading ? 'Sending...' : 'Send reset link'}
        </button>
        <button type="button" onClick={() => { setView('login'); setError('') }} style={styles.link}>
          Back to login
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={view === 'login' ? handleLogin : handleSignup} style={styles.form}>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        style={styles.input}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        minLength={8}
        style={styles.input}
      />
      {view === 'signup' && (
        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPw}
          onChange={e => setConfirmPw(e.target.value)}
          required
          style={styles.input}
        />
      )}
      {error && <p style={styles.error}>{error}</p>}
      <button type="submit" disabled={loading} style={styles.btn}>
        {loading ? 'Please wait...' : view === 'login' ? 'Log in' : 'Create account'}
      </button>
      {view === 'login' && (
        <>
          <button type="button" onClick={() => { setView('reset'); setError('') }} style={styles.link}>
            Forgot password?
          </button>
          <button type="button" onClick={() => { setView('signup'); setError('') }} style={styles.link}>
            Don&apos;t have an account? Sign up
          </button>
        </>
      )}
      {view === 'signup' && (
        <button type="button" onClick={() => { setView('login'); setError('') }} style={styles.link}>
          Already have an account? Log in
        </button>
      )}
    </form>
  )
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
  },
  input: {
    padding: '0.625rem 0.875rem',
    border: '1px solid #DDD3BE',
    borderRadius: 8,
    fontSize: '0.9375rem',
    fontFamily: 'inherit',
    outline: 'none',
    background: '#FDFAF6',
  },
  btn: {
    padding: '0.75rem 2rem',
    background: '#16100B',
    color: '#fff',
    border: 'none',
    borderRadius: 9999,
    fontSize: '0.9375rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  link: {
    background: 'none',
    border: 'none',
    color: '#7A6D61',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textDecoration: 'underline',
    padding: 0,
  },
  error: {
    fontSize: '0.8125rem',
    color: '#B91C1C',
    background: '#FEF2F2',
    padding: '0.5rem 0.75rem',
    borderRadius: 8,
    margin: 0,
  },
  success: {
    fontSize: '0.875rem',
    color: '#15803D',
    background: '#F0FDF4',
    padding: '0.75rem 1rem',
    borderRadius: 8,
    margin: 0,
    textAlign: 'center' as const,
  },
}
