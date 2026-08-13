'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setNewPassword } from './actions'
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '@/lib/password'

export default function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')

    // Instant feedback only — actions.ts re-runs this same check server-side.
    const check = validateNewPassword(password, confirmPw)
    if (!check.ok) {
      setError(check.message)
      return
    }

    setLoading(true)
    const res = await setNewPassword(password, confirmPw)

    if (res.status === 'ok') {
      setDone(true)
      setLoading(false)
      return
    }

    setLoading(false)
    if (res.status === 'expired') {
      setError('This reset link has expired or was already used. Request a new one.')
      return
    }
    setError(res.message)
  }

  if (done) {
    return (
      <div style={styles.form}>
        <p style={styles.success}>
          Password updated. You&apos;ve been signed out on other devices — sign in
          with your new password.
        </p>
        <button type="button" onClick={() => router.push('/login')} style={styles.btn}>
          Go to login
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <input
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={MIN_PASSWORD_LENGTH}
        autoComplete="new-password"
        required
        autoFocus
        disabled={loading}
        style={styles.input}
      />
      <input
        type="password"
        placeholder="Confirm new password"
        value={confirmPw}
        onChange={(e) => setConfirmPw(e.target.value)}
        autoComplete="new-password"
        required
        disabled={loading}
        style={styles.input}
      />
      {error && <p style={styles.error}>{error}</p>}
      <button type="submit" disabled={loading} style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Updating...' : 'Update password'}
      </button>
    </form>
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
    padding: '0.625rem 0.875rem',
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    fontSize: '0.9375rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
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
    fontFamily: 'inherit',
  },
  error: {
    fontSize: '0.875rem',
    color: '#854d0e',
    background: '#fef9c3',
    padding: '0.625rem 0.875rem',
    borderRadius: 8,
    margin: 0,
    lineHeight: 1.5,
  },
  success: {
    fontSize: '0.9375rem',
    color: '#15803D',
    background: '#f0fdf4',
    padding: '0.75rem 0.875rem',
    borderRadius: 8,
    margin: 0,
    lineHeight: 1.6,
  },
}
