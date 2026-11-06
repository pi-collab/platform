'use client'

import Link from 'next/link'
import { useState } from 'react'
import { trackEvent } from '@/lib/analytics'
import { whatsappUrl } from '@/lib/meta/invite-links'
import { DEFAULT_META_OPTIONS, type MetaOptions } from '@/lib/meta/marketplace-params'

/**
 * Instagram Creator Marketplace results, for a CONNECTED brand with the
 * Instagram or Both source picked. Runs only when the brand asks (each run is
 * a Meta call). Connecting is offered by the banner under the box, not here. Cards say whether the creator is on
 * Guapd: Send offer if so, Send invite if not. Invites go by hand (copy,
 * Instagram, WhatsApp to a number the brand types; the number is not saved).
 */

export interface MetaState {
  connected: boolean
  needsReconnect: boolean
  igUsername: string | null
  /** Why Creator Marketplace cannot be used, if known (0590). */
  eligibility: 'no_page' | 'no_instagram' | 'missing_permission' | 'not_eligible' | null
  /** Text to show after a Facebook login round trip. */
  notice: string | null
  /** The callback's ?meta= value, for the connect events. */
  connectResult: string | null
  /** Invites need an approved brand (enforced server-side too). */
  brandApproved: boolean
}

interface MetaCreator {
  igId: string; username: string; biography: string | null; country: string | null; category: string | null
  pictureUrl: string | null; onboarded: string | null; followers: number | null; hasPublicEmail: boolean
  guapd: { creatorId: string } | null
}
interface InviteInfo { invite: { id: string; link: string; sentAt: string | null; openedAt: string | null; signedUpAt: string | null; acceptedAt: string | null }; message: string; instagram: { profile: string; message: string } }

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : String(n))

export default function MetaSection({ searchId, meta }: { searchId: string; meta: MetaState }) {
  const [opts, setOpts] = useState<MetaOptions>(DEFAULT_META_OPTIONS)
  const [rows, setRows] = useState<MetaCreator[] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run() {
    setPending(true); setError(null)
    const res = await fetch('/api/meta/creator-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searchId, options: opts }) }).catch(() => null)
    const j = await res?.json().catch(() => null)
    setPending(false)
    if (j?.ok) { setRows(j.creators); trackEvent('meta_search_run', { result_count: j.creators.length }) }
    else setError(j?.message ?? 'Instagram did not answer. Try again.')
  }

  const toggle = (k: 'hasPublicContactEmail' | 'excludeMessagedCreators' | 'verifiedAccount', label: string) => (
    <label className="gai-opt"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}</label>
  )

  return (
    <section className="gai-ig">
      <div className="gai-group-title">Instagram Creator Marketplace{meta.igUsername ? ` · as @${meta.igUsername}` : ''}</div>
      <div className="gai-opts">
        <label className="gai-opt">
          Posted in
          <select value={opts.latestPostActivity ?? ''} onChange={(e) => setOpts({ ...opts, latestPostActivity: (e.target.value || null) as MetaOptions['latestPostActivity'] })}>
            <option value="">any time</option><option value="last_7_days">last 7 days</option><option value="last_30_days">last 30 days</option><option value="last_90_days">last 90 days</option>
          </select>
        </label>
        {toggle('verifiedAccount', 'Verified accounts only')}
        {toggle('excludeMessagedCreators', 'Hide creators I have messaged')}
        {toggle('hasPublicContactEmail', 'Has a public email')}
      </div>
      <button type="button" className="gai-loosen" onClick={run} disabled={pending}>{pending ? 'Searching Instagram…' : rows ? 'Search Instagram again' : 'Search Instagram too'}</button>
      {error && <p className="gai-error" role="alert">{error}</p>}
      {rows && rows.length === 0 && <p className="gai-notice">Instagram found no creators for this search.</p>}
      {rows && rows.length > 0 && (
        <ol className="gai-list" style={{ marginTop: 12 }}>
          {rows.map((r, i) => <MetaCard key={r.username} r={r} position={i + 1} searchId={searchId} approved={meta.brandApproved} />)}
        </ol>
      )}
    </section>
  )
}

function MetaCard({ r, position, searchId, approved }: { r: MetaCreator; position: number; searchId: string; approved: boolean }) {
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [phone, setPhone] = useState('')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function openInvite() {
    setErr(null)
    const res = await fetch('/api/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ searchId, igUsername: r.username }) }).catch(() => null)
    const j = await res?.json().catch(() => null)
    if (j?.ok) { setInvite(j); trackEvent('invite_created', { position }) } else setErr(j?.message ?? 'Could not create the invite.')
  }
  const sent = (via: 'copy' | 'instagram' | 'whatsapp') => {
    if (!invite) return
    fetch('/api/invites/sent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteId: invite.invite.id, via }) }).catch(() => {})
    trackEvent('invite_sent', { via })
  }
  const wa = invite && phone ? whatsappUrl(phone, invite.message) : null

  return (
    <li className="gai-card">
      <div className="gai-card-top">
        <span className="gai-photo">{r.pictureUrl ? <img src={r.pictureUrl} alt="" /> : <span aria-hidden="true">{r.username.slice(0, 2).toUpperCase()}</span>}</span>
        <span className="gai-who">
          <span className="gai-name">@{r.username}</span>
          <span className="gai-meta">{[r.category, r.country].filter(Boolean).join(' · ')}</span>
        </span>
      </div>
      <div className="gai-stats">
        <span className={`gai-badge${r.guapd ? ' gai-badge--verified' : ''}`}>{r.guapd ? 'On Guapd' : 'Not on Guapd yet'}</span>
        {r.followers !== null && <span>{fmt(r.followers)} followers, from Instagram</span>}
      </div>
      {r.biography && <p className="gai-reason">{r.biography}</p>}
      {r.guapd ? (
        <Link href={`/deals/new?creator=${r.guapd.creatorId}&back=ai&s=${searchId}`} className="gai-offer" onClick={() => trackEvent('offer_started_from_search', { position, source: 'instagram' })}>Send offer</Link>
      ) : !approved ? (
        <p className="gai-gaps">Invites open once Guapd approves your brand.</p>
      ) : !invite ? (
        <button type="button" className="gai-offer" style={{ border: 0, cursor: 'pointer' }} onClick={openInvite}>Send invite</button>
      ) : (
        <div className="gai-invite">
          <p className="gai-gaps">Invite link: {invite.invite.link}</p>
          <p className="gai-gaps">{invite.invite.acceptedAt ? 'Accepted' : invite.invite.signedUpAt ? 'Signed up' : invite.invite.openedAt ? 'Opened' : invite.invite.sentAt ? 'Sent' : 'Not sent yet'}</p>
          <div className="gai-invite-actions">
            <button type="button" className="gai-loosen" onClick={async () => { try { await navigator.clipboard.writeText(invite.message); setCopied(true); sent('copy') } catch { setErr('Could not copy. Select the link above instead.') } }}>{copied ? 'Copied' : 'Copy message'}</button>
            <a className="gai-loosen" href={invite.instagram.message} target="_blank" rel="noreferrer" onClick={() => sent('instagram')}>Open on Instagram</a>
          </div>
          <label className="gai-opt" style={{ marginTop: 8 }}>
            WhatsApp number (if you have it)
            <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
          </label>
          {wa && <a className="gai-loosen" href={wa} target="_blank" rel="noreferrer" onClick={() => sent('whatsapp')}>Open WhatsApp</a>}
        </div>
      )}
      {err && <p className="gai-error" role="alert">{err}</p>}
    </li>
  )
}
