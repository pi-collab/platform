'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import { CHANNELS, channelLabel } from '@/lib/experience-request'
import type { ConsoleCollabPost, ConsoleDeliverables } from '@/lib/experience-console-server'
import { recordCollabForBrand, recordCollabPost, sendVideoToCreator, takeVideoBack } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'
import LinkTile, { LinkTiles } from '@/components/LinkTile'

/**
 * Posting (0561, operational). Once the brand approves a video Guapd shared,
 * Guapd sends it to the creator who shot it: as a COLLAB (one of their
 * ad-rights videos: they post it with the brand and give the link) or as a
 * SHARE (post it on their own account if they like; nothing asked). The brand
 * adds its affiliate link and marks the ad complete on Guapd; staff record
 * either for someone only when it reached Guapd another way.
 * The creator's main invoice waits until all their ad-rights videos are posted.
 */
const STATE: Record<ConsoleCollabPost['status'], { label: string; tone: ChipTone }> = {
  sent:        { label: 'With the creator', tone: 'amber' },
  posted:      { label: 'Posted', tone: 'blue' },
  ad_complete: { label: 'Ad complete', tone: 'green' },
  cancelled:   { label: 'Taken back', tone: 'neutral' },
}

type Ask =
  | { kind: 'post'; post: ConsoleCollabPost }
  | { kind: 'affiliate'; post: ConsoleCollabPost }
  | { kind: 'ad_complete'; post: ConsoleCollabPost }
  | { kind: 'cancel'; post: ConsoleCollabPost }

export default function CollabPanel({ experienceId, data, posts, adRights }: {
  experienceId: string
  data: ConsoleDeliverables
  posts: ConsoleCollabPost[]
  /** deal id → the creator's ad-rights video count (their collab posts). */
  adRights: Record<string, number>
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [text, setText] = useState('')
  const [channel, setChannel] = useState('whatsapp')
  const writable = ['shoot_scheduled', 'shoot_done', 'delivering'].includes(data.status)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      setAsk(null); setText(''); router.refresh()
    })
  }
  const live = posts.filter((p) => p.status !== 'cancelled')
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
  const legs = data.legs.filter((l) => l.shoot_outcome === 'done')
    .map((l) => ({ l, videos: l.items.filter((i) => i.release?.brand_decision === 'approved') }))
    .filter((x) => x.videos.length > 0 || live.some((p) => p.deal_id === x.l.deal_id))
  if (legs.length === 0) return null

  return (
    <section className="surface" style={{ ...card, marginTop: 20 }} id="xp-collabs">
      <h2 className="sect-head">Posting</h2>
      <div className="sect-rule" />
      <p className="t-body" style={{ margin: '10px 0 0', fontSize: 13 }}>
        Send each brand-approved video to the creator who shot it. Their ad-rights videos go as collabs: they post with the brand and give the link, and their invoice waits for it.
        Any other video can be shared for them to post on their own account. The brand adds its affiliate link and marks the ad complete on Guapd.
      </p>
      {error && !ask && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}

      {legs.map(({ l, videos }) => {
        const mine = live.filter((p) => p.deal_id === l.deal_id)
        const collabs = mine.filter((p) => p.kind === 'collab')
        const need = adRights[l.deal_id] ?? 0
        const posted = collabs.filter((p) => p.status !== 'sent').length
        return (
          <div key={l.roster_id} style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{l.full_name}</span>
              <span style={{ ...kpiLabel, fontSize: 10.5 }}>
                {need > 0 ? `Collabs: ${posted} of ${need} posted` : 'No ad-rights videos'}
              </span>
            </div>
            {videos.map((i) => {
              const p = mine.find((x) => x.release_id === i.release!.id)
              const st = p ? STATE[p.status] : null
              return (
                <div key={i.id} style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--hairline)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600 }}>{i.label}</span>
                    {p && <span style={{ ...kpiLabel, fontSize: 10 }}>{p.kind === 'collab' ? 'Collab' : 'Shared'}</span>}
                    {st && <StatusChip label={st.label} tone={st.tone} />}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {!p && writable && (
                        <>
                          <button type="button" style={pillBtn} disabled={pending || collabs.length >= need}
                            title={collabs.length >= need ? 'All of this creator’s ad-rights videos are already sent as collabs' : undefined}
                            onClick={() => run(() => sendVideoToCreator(experienceId, i.release!.id, 'collab'))}>Send to post as a collab</button>
                          <button type="button" style={pillBtn} disabled={pending} onClick={() => run(() => sendVideoToCreator(experienceId, i.release!.id, 'share'))}>Share with the creator</button>
                        </>
                      )}
                      {p && writable && p.status === 'sent' && p.kind === 'collab' && (
                        <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(''); setAsk({ kind: 'post', post: p }) }}>Record the post link</button>
                      )}
                      {p && writable && p.status === 'posted' && (
                        <>
                          <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(p.affiliate_url ?? ''); setAsk({ kind: 'affiliate', post: p }) }}>{p.affiliate_url ? 'Change affiliate link' : 'Record affiliate link'}</button>
                          <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(''); setAsk({ kind: 'ad_complete', post: p }) }}>Record ad complete</button>
                        </>
                      )}
                      {p && writable && p.status === 'sent' && (
                        <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(''); setAsk({ kind: 'cancel', post: p }) }}>Take back</button>
                      )}
                    </div>
                  </div>
                  {p && (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6, display: 'grid', gap: 3 }}>
                      <span>Sent {fmt(p.sent_at)}{p.kind === 'share' ? ' · no link needed' : ''}</span>
                      {p.ad_complete_at && <span>Ad complete {fmt(p.ad_complete_at)}{p.ad_complete_channel && p.ad_complete_channel !== 'portal' ? ` · recorded (${channelLabel(p.ad_complete_channel)})` : ' · by the brand'}</span>}
                    </div>
                  )}
                  {p && (p.post_url || p.affiliate_url) && (
                    <LinkTiles>
                      {p.post_url && <LinkTile label="Post" url={p.post_url}
                        meta={`${fmt(p.posted_at)}${p.post_channel && p.post_channel !== 'portal' ? ` · recorded (${channelLabel(p.post_channel)})` : ' · by the creator'}`} />}
                      {p.affiliate_url && <LinkTile label="Brand’s affiliate link" url={p.affiliate_url}
                        meta={p.affiliate_channel && p.affiliate_channel !== 'portal' ? `Recorded (${channelLabel(p.affiliate_channel)})` : 'Added by the brand'} />}
                    </LinkTiles>
                  )}
                  {ask && p && ask.post.id === p.id && (
                    <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: '#F7F7F4', display: 'grid', gap: 10 }}>
                      {ask.kind !== 'ad_complete' && (
                        <div>
                          <label style={fieldLabel} htmlFor={`cp-${p.id}`}>{ask.kind === 'post' ? 'Instagram post link' : ask.kind === 'affiliate' ? 'The brand’s affiliate link' : 'Why take it back (the creator is not told the reason)'}</label>
                          <input id={`cp-${p.id}`} className="dinput" value={text} maxLength={ask.kind === 'cancel' ? 300 : 500} onChange={(e) => setText(e.target.value)}
                            placeholder={ask.kind === 'post' ? 'https://www.instagram.com/reel/…' : ask.kind === 'affiliate' ? 'https://…' : 'Wrong cut sent'} />
                        </div>
                      )}
                      {ask.kind !== 'cancel' && (
                        <div>
                          <label style={fieldLabel} htmlFor={`cc-${p.id}`}>{ask.kind === 'post' ? 'The creator sent it via' : 'The brand told us via'}</label>
                          <select id={`cc-${p.id}`} className="dinput" value={channel} onChange={(e) => setChannel(e.target.value)}>
                            {CHANNELS.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                          </select>
                        </div>
                      )}
                      {error && <div role="alert" style={formError}>{error}</div>}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" style={pillBtn} disabled={pending} onClick={() => { setAsk(null); setError(null) }}>Cancel</button>
                        <button type="button" className="neonbtn" style={{ ...neonBtn, height: 38 }} disabled={pending}
                          onClick={() => run(() => ask.kind === 'post' ? recordCollabPost(experienceId, p.id, text, channel)
                            : ask.kind === 'affiliate' ? recordCollabForBrand(experienceId, p.id, 'affiliate', text, channel)
                            : ask.kind === 'ad_complete' ? recordCollabForBrand(experienceId, p.id, 'ad_complete', null, channel)
                            : takeVideoBack(experienceId, p.id, text))}>
                          {pending ? 'Saving…' : ask.kind === 'cancel' ? 'Take it back' : 'Record'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </section>
  )
}
