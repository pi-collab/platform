'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export type InviteState = 'visitor' | 'not_creator' | 'needs_instagram' | 'mismatch' | 'ready' | 'accepted'

export default function InviteClient(p: {
  token: string; state: InviteState; brandName: string; brandLogo: string | null; username: string
  summary: string; deliverables: string[]; timeline: string | null
}) {
  const [state, setState] = useState(p.state)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const here = `/c/${p.token}`

  useEffect(() => {
    fetch('/api/invites/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: p.token }) }).catch(() => {})
  }, [p.token])

  async function accept() {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/invites/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: p.token }) }).catch(() => null)
    const j = await res?.json().catch(() => null)
    setBusy(false)
    if (j?.ok) setState('accepted')
    else setMsg(j?.message ?? 'Could not accept just now. Try again.')
  }

  const steps = [
    { label: 'Sign up with your phone number', done: state !== 'visitor' && state !== 'not_creator' },
    { label: `Connect your Instagram (@${p.username})`, done: state === 'ready' || state === 'accepted' },
    { label: 'Accept the invite', done: state === 'accepted' },
  ]

  return (
    <main style={{ minHeight: '100vh', background: '#F7F7F4', fontFamily: 'var(--font-ui)', color: 'var(--ink, #1A1B16)', padding: '40px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>guapd</div>
        <section style={{ background: '#fff', border: '1px solid #EAEAE3', borderRadius: 20, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {p.brandLogo ? <img src={p.brandLogo} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover' }} /> : null}
            <div>
              <div style={{ fontSize: 12, color: '#8B90A0', fontWeight: 600 }}>Campaign invite for @{p.username}</div>
              <h1 style={{ margin: '2px 0 0', fontSize: 20 }}>{p.brandName} wants to work with you</h1>
            </div>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.5, color: '#4A4F58' }}>{p.summary}</p>
          {(p.deliverables.length > 0 || p.timeline) && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#8B90A0' }}>
              {[p.deliverables.length ? `Deliverables: ${p.deliverables.join(', ')}` : null, p.timeline ? `Timeline: ${p.timeline}` : null].filter(Boolean).join(' · ')}
            </p>
          )}
          <p style={{ margin: '12px 0 0', fontSize: 13, color: '#4A4F58' }}>
            The brand sends you the offer, terms and payment through Guapd once you accept. Guapd is free for creators to join.
          </p>
        </section>

        <section style={{ background: '#fff', border: '1px solid #EAEAE3', borderRadius: 20, padding: 20 }}>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {steps.map((s, i) => (
              <li key={s.label} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: s.done ? '#8B90A0' : 'inherit' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: s.done ? '#DFF29A' : '#EEF1EC' }}>{s.done ? '✓' : i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state === 'visitor' && (<>
              <Link href="/signup/creator" style={btn}>Sign up with your phone</Link>
              <Link href={`/login/creator?next=${encodeURIComponent(here)}`} style={btnQuiet}>Already on Guapd? Log in</Link>
              <span style={{ fontSize: 12, color: '#8B90A0' }}>After signing up, open this link again or find the invite on your Guapd home.</span>
            </>)}
            {state === 'not_creator' && <span style={{ fontSize: 13.5 }}>You are signed in with a brand account. Sign in as a creator to accept.</span>}
            {state === 'needs_instagram' && <Link href="/creator/settings?tab=connected" style={btn}>Connect Instagram</Link>}
            {state === 'mismatch' && <span style={{ fontSize: 13.5 }}>This invite was sent to @{p.username}. Connect that Instagram account to accept it.</span>}
            {state === 'ready' && <button type="button" onClick={accept} disabled={busy} style={{ ...btn, border: 0, cursor: 'pointer' }}>{busy ? 'Accepting…' : 'Accept invite'}</button>}
            {state === 'accepted' && <span style={{ fontSize: 14, fontWeight: 600 }}>Accepted. {p.brandName} will send you an offer on Guapd.</span>}
            {msg && <span role="alert" style={{ fontSize: 13, color: '#9A2B2B' }}>{msg}</span>}
          </div>
        </section>
      </div>
    </main>
  )
}

const btn: React.CSSProperties = { display: 'block', textAlign: 'center', textDecoration: 'none', borderRadius: 14, padding: '12px 16px', background: '#1A1B16', color: '#fff', fontWeight: 700, fontSize: 14.5 }
const btnQuiet: React.CSSProperties = { ...btn, background: '#fff', color: '#1A1B16', border: '1px solid #EAEAE3' }
