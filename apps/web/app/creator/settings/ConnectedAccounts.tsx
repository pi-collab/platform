'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { disconnectInstagram, resyncInstagram } from './instagram-actions'
import { igOutcome, timeAgo, type OutcomeTone } from '@/lib/instagram-outcomes'
import type { IgConnectionView } from '@/lib/instagram-sync'

/**
 * Connected accounts.
 *
 * Its own section, not part of the social handles list. A handle is a piece of
 * text; a connection has a token, an expiry and five states, and the array that
 * holds the handles has a history of writers destroying each other's keys.
 *
 * Everything shown here comes from a server action that selects explicit
 * non-token columns. The token is never sent to the browser.
 */
export default function ConnectedAccounts({ connection }: { connection: IgConnectionView }) {
  const router = useRouter()
  const search = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [outcome, setOutcome] = useState<{ tone: OutcomeTone; text: string } | null>(null)

  // Read the callback's `?ig=` once, then strip it from the URL. Held in state
  // first because removing the parameter is what makes it unreadable, and
  // stripping it is what stops a refresh from replaying an outcome that has
  // already been dealt with. This also clears the "#_" fragment Instagram
  // appends on the way back.
  //
  // Runs on mount only: the parameter is a one-time report, not live state.
  useEffect(() => {
    const reason = search.get('ig')
    if (!reason) return
    setOutcome(igOutcome(reason))

    const rest = new URLSearchParams(search.toString())
    rest.delete('ig')
    const qs = rest.toString()
    router.replace(qs ? `/creator/settings?${qs}` : '/creator/settings', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = connection.status
  const snap = connection.snapshot

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) {
    startTransition(async () => {
      const res = await fn()
      setMsg(res.ok ? { ok: true, text: okText } : { ok: false, text: res.message ?? 'Something went wrong.' })
      if (res.ok) router.refresh()
    })
  }

  return (
    <section className="ca-card">
      <div className="ca-head">
        <span className="ca-icon" aria-hidden="true">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="20" x="2" y="2" rx="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
        </span>
        <div className="ca-head__text">
          <h3 className="ca-title">Instagram</h3>
          <p className="ca-sub">
            {s === 'connected' && snap
              ? <>Connected as @{snap.username}</>
              : 'Connect to show verified numbers on your shopfront'}
          </p>
        </div>
        <StatusPill status={s} />
      </div>

      {/* What the OAuth callback reported. Suppressed once an action on this
          card has its own message, so the two never stack. */}
      {!msg && outcome && (
        <p className={`ca-msg ca-msg--${outcome.tone}`} role="status">{outcome.text}</p>
      )}

      {/* ── Not connected ───────────────────────────────────────────────── */}
      {s === 'not_connected' && (
        <>
          <p className="ca-body">
            Brands trust a number they can see came from Instagram. Connecting fills in your
            followers and audience automatically, and keeps them current.
          </p>
          <p className="ca-note">
            You&rsquo;ll keep signing in to Guapd with your phone. This only reads your Instagram
            data, and you can disconnect whenever you like.
          </p>
          <a className="ca-btn ca-btn--primary" href="/api/instagram/connect">Connect Instagram</a>
        </>
      )}

      {/* ── Personal account ────────────────────────────────────────────── */}
      {s === 'personal_account' && (
        <>
          <p className="ca-body">
            That account is a personal one, and Instagram only shares audience data from
            Business and Creator accounts.
          </p>
          <ol className="ca-steps">
            <li>Open Instagram and go to <strong>Settings</strong></li>
            <li>Tap <strong>Account type and tools</strong></li>
            <li>Choose <strong>Switch to professional account</strong>, then pick Creator or Business</li>
            <li>Come back here and reconnect</li>
          </ol>
          <a className="ca-btn ca-btn--primary" href="/api/instagram/connect">Reconnect</a>
        </>
      )}

      {/* ── Expired / broken ────────────────────────────────────────────── */}
      {(s === 'expired' || s === 'needs_reconnect') && (
        <>
          <p className="ca-body">
            {s === 'expired'
              ? 'The connection to Instagram has expired. Your shopfront is showing the numbers you entered yourself until you reconnect.'
              : 'We lost access to your Instagram data. Your shopfront is showing the numbers you entered yourself until you reconnect.'}
          </p>
          <a className="ca-btn ca-btn--primary" href="/api/instagram/connect">Reconnect Instagram</a>
        </>
      )}

      {/* ── Connected ───────────────────────────────────────────────────── */}
      {s === 'connected' && snap && (
        <>
          <dl className="ca-figures">
            <Figure label="Followers" value={fmt(snap.followersCount)} />
            <Figure label="Posts" value={fmt(snap.mediaCount)} />
            {snap.reachLast30 != null && <Figure label="Reach, 30 days" value={fmt(snap.reachLast30)} />}
          </dl>

          {snap.demographicsUnavailable && (
            <p className="ca-note">
              Instagram only shares audience breakdowns for accounts with 100 followers or more,
              so your age, gender and city figures aren&rsquo;t available yet.
            </p>
          )}

          {/* Said out loud rather than left for a brand to assume. The 13-17
              bucket is dropped because the shopfront has no band for it, which
              makes these percentages describe adult followers. */}
          {snap.ageBreakdown && (snap.under18Excluded ?? 0) > 0 && (
            <p className="ca-note">
              Age and gender percentages cover your followers aged 18 and over.
            </p>
          )}

          <p className="ca-synced">
            {connection.lastSyncedAt
              ? <>Updated {timeAgo(connection.lastSyncedAt)}. Refreshes daily.</>
              : <>Not synced yet.</>}
            {connection.syncError && <span className="ca-warn"> Last attempt failed.</span>}
          </p>

          <div className="ca-actions">
            <button type="button" className="ca-btn" disabled={pending}
              onClick={() => run(resyncInstagram, 'Synced.')}>
              {pending ? 'Working…' : 'Sync now'}
            </button>
            <button type="button" className="ca-btn ca-btn--quiet" disabled={pending}
              onClick={() => {
                if (!confirm('Disconnect Instagram? Your shopfront will go back to the numbers you entered yourself.')) return
                run(disconnectInstagram, 'Disconnected.')
              }}>
              Disconnect
            </button>
          </div>
        </>
      )}

      {msg && <p className={msg.ok ? 'ca-msg ca-msg--ok' : 'ca-msg ca-msg--err'} role="status">{msg.text}</p>}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="ca-figure">
      <dt className="ca-figure__label">{label}</dt>
      <dd className="ca-figure__value">{value}</dd>
    </div>
  )
}

function StatusPill({ status }: { status: IgConnectionView['status'] }) {
  const map: Record<IgConnectionView['status'], { text: string; cls: string }> = {
    not_connected: { text: 'Not connected', cls: 'ca-pill--idle' },
    connected: { text: 'Verified', cls: 'ca-pill--ok' },
    expired: { text: 'Expired', cls: 'ca-pill--warn' },
    needs_reconnect: { text: 'Action needed', cls: 'ca-pill--warn' },
    personal_account: { text: 'Personal account', cls: 'ca-pill--warn' },
  }
  const v = map[status]
  return <span className={`ca-pill ${v.cls}`}>{v.text}</span>
}

function fmt(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return `${v % 1 === 0 ? v : v.toFixed(1)}M` }
  if (n >= 1_000) { const v = n / 1_000; return `${v % 1 === 0 ? v : v.toFixed(1)}K` }
  return String(n)
}

