'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import { CHANNELS, channelLabel } from '@/lib/experience-request'
import type { ConsoleCollabPost, ConsoleDeliverables } from '@/lib/experience-console-server'
import { recordCollabAdCode, recordCollabForBrand, recordCollabPost, sendVideoToCreator, setCollabInstructions, takeVideoBack } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'
import LinkTile, { CodeTile, LinkTiles } from '@/components/LinkTile'

/**
 * Posting (0561, operational). Once the brand approves a video Guapd shared,
 * Guapd sends it to the creator who shot it: as a COLLAB (one of their
 * ad-rights videos: they post it with the brand and give the link) or as a
 * SHARE (post it on their own account if they like; nothing asked). The brand
 * adds its affiliate link and marks the ad complete on Guapd; staff record
 * either for someone only when it reached Guapd another way.
 * 0566: the creator's main invoice no longer waits for these; it opens once their shoot is done.
 * 0574: the creator's partnership ad code (they add it; staff record it when it came another way).
 * 0573: posting instructions (caption, tags, timing) go with the video, and can
 * be added or changed while it is live. The creator sees them; the brand does not.
 */
const noteBox = { marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#FBFBF8', border: '1px solid var(--hairline)' } as const
const noteText = { fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4 } as const

const STATE: Record<ConsoleCollabPost['status'], { label: string; tone: ChipTone }> = {
  sent:        { label: 'With the creator', tone: 'amber' },
  posted:      { label: 'Posted', tone: 'blue' },
  ad_complete: { label: 'Ad complete', tone: 'green' },
  cancelled:   { label: 'Taken back', tone: 'neutral' },
}

type Ask =
  | { kind: 'post'; post: ConsoleCollabPost }
  | { kind: 'affiliate'; post: ConsoleCollabPost }
  | { kind: 'ad_code'; post: ConsoleCollabPost }
  | { kind: 'ad_complete'; post: ConsoleCollabPost }
  | { kind: 'cancel'; post: ConsoleCollabPost }
  | { kind: 'instructions'; post: ConsoleCollabPost }
  | { kind: 'send'; releaseId: string; send: 'collab' | 'share' }

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
  const [note, setNote] = useState('')
  const writable = ['shoot_scheduled', 'shoot_done', 'delivering'].includes(data.status)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      setAsk(null); setText(''); setNote(''); router.refresh()
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
        Send each brand-approved video to the creator who shot it. Their ad-rights videos go as collabs: they post with the brand and give the link (their invoice does not wait for it).
        Any other video can be shared for them to post on their own account. The brand adds its affiliate link and marks the ad complete on Guapd.
      </p>
      {error && !ask && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}

      {legs.map(({ l, videos }) => {
        const mine = live.filter((p) => p.deal_id === l.deal_id)
        const collabs = mine.filter((p) => p.kind === 'collab')
        const need = adRights[l.deal_id] ?? 0
        const posted = collabs.filter((p) => p.status !== 'sent').length
        // Why a collab cannot go: said on screen (a tooltip never shows on a phone).
        const collabFull = collabs.length < need ? null
          : need === 0 ? 'No ad-rights videos on this creator’s deal, so a collab cannot be sent. Share it with them instead.'
          : `All ${need} of this creator’s ad-rights videos are already sent as collabs.`
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
                          <button type="button" style={{ ...pillBtn, ...(collabs.length >= need ? { opacity: 0.4, cursor: 'not-allowed' } : null) }} disabled={pending || collabs.length >= need}
                            title={collabFull ?? undefined}
                            onClick={() => { setError(null); setNote(''); setAsk({ kind: 'send', releaseId: i.release!.id, send: 'collab' }) }}>Send to post as a collab</button>
                          <button type="button" style={pillBtn} disabled={pending} onClick={() => { setError(null); setNote(''); setAsk({ kind: 'send', releaseId: i.release!.id, send: 'share' }) }}>Share with the creator</button>
                        </>
                      )}
                      {p && writable && p.status === 'sent' && p.kind === 'collab' && (
                        <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(''); setAsk({ kind: 'post', post: p }) }}>Record the post link</button>
                      )}
                      {p && writable && p.status === 'posted' && (
                        <>
                          <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(p.affiliate_url ?? ''); setAsk({ kind: 'affiliate', post: p }) }}>{p.affiliate_url ? 'Change affiliate link' : 'Record affiliate link'}</button>
                          <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(p.ad_code ?? ''); setAsk({ kind: 'ad_code', post: p }) }}>{p.ad_code ? 'Change ad code' : 'Record ad code'}</button>
                          <button type="button" style={pillBtn} disabled={pending} onClick={() => { setText(''); setAsk({ kind: 'ad_complete', post: p }) }}>Record ad complete</button>
                        </>
                      )}
                      {p && writable && (p.status === 'sent' || p.status === 'posted') && (
                        <button type="button" style={pillBtn} disabled={pending} onClick={() => { setError(null); setNote(p.instructions ?? ''); setAsk({ kind: 'instructions', post: p }) }}>{p.instructions ? 'Edit instructions' : 'Add instructions'}</button>
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
                  {!p && writable && collabFull && (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: '#8C6417', marginTop: 6 }}>{collabFull}</div>
                  )}
                  {p && p.instructions && !(ask?.kind === 'instructions' && ask.post.id === p.id) && (
                    <div style={noteBox}>
                      <div style={{ ...kpiLabel, fontSize: 10 }}>Posting instructions · seen by the creator</div>
                      <div style={noteText}>{p.instructions}</div>
                    </div>
                  )}
                  {((ask?.kind === 'send' && !p && ask.releaseId === i.release!.id) || (ask?.kind === 'instructions' && p && ask.post.id === p.id)) && (
                    <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: '#F7F7F4', display: 'grid', gap: 10 }}>
                      <div>
                        <label style={fieldLabel} htmlFor={`ci-${i.id}`}>Posting instructions <span style={{ fontWeight: 500, color: 'var(--ink-faint)' }}>(optional)</span></label>
                        <textarea id={`ci-${i.id}`} className="dinput" value={note} maxLength={2000} rows={5} onChange={(e) => setNote(e.target.value)}
                          placeholder={'Caption, tags and anything to do while posting. For example:\nCaption: Festive glow with @brand ✨ #ad\nTag @brand, post by Friday 7 pm'}
                          style={{ width: '100%', height: 'auto', minHeight: 116, padding: '10px 12px', lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)' }}>
                          <span>The creator sees this on their deal. The brand does not.</span>
                          <span>{note.length} / 2,000</span>
                        </div>
                      </div>
                      {error && <div role="alert" style={formError}>{error}</div>}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button type="button" style={pillBtn} disabled={pending} onClick={() => { setAsk(null); setError(null) }}>Cancel</button>
                        <button type="button" className="neonbtn" style={{ ...neonBtn, height: 38 }} disabled={pending}
                          onClick={() => run(() => ask.kind === 'send' ? sendVideoToCreator(experienceId, ask.releaseId, ask.send, note) : setCollabInstructions(experienceId, (ask as { post: ConsoleCollabPost }).post.id, note))}>
                          {pending ? 'Saving…' : ask.kind === 'send' ? (ask.send === 'collab' ? 'Send to post as a collab' : 'Share with the creator') : 'Save instructions'}
                        </button>
                      </div>
                    </div>
                  )}
                  {p && p.kind === 'collab' && p.status === 'posted' && !p.ad_code && (
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#8C6417', marginTop: 6 }}>Waiting for the creator&rsquo;s ad code (the brand needs it to run the ad).</div>
                  )}
                  {p && (p.post_url || p.affiliate_url || p.ad_code) && (
                    <LinkTiles>
                      {p.post_url && <LinkTile label="Post" url={p.post_url}
                        meta={`${fmt(p.posted_at)}${p.post_channel && p.post_channel !== 'portal' ? ` · recorded (${channelLabel(p.post_channel)})` : ' · by the creator'}`} />}
                      {p.affiliate_url && <LinkTile label="Brand’s affiliate link" url={p.affiliate_url}
                        meta={p.affiliate_channel && p.affiliate_channel !== 'portal' ? `Recorded (${channelLabel(p.affiliate_channel)})` : 'Added by the brand'} />}
                      {p.ad_code && <CodeTile label="Creator’s ad code" code={p.ad_code}
                        meta={`${fmt(p.ad_code_at)}${p.ad_code_channel && p.ad_code_channel !== 'portal' ? ` · recorded (${channelLabel(p.ad_code_channel)})` : ' · by the creator'}`} />}
                    </LinkTiles>
                  )}
                  {ask && p && ask.kind !== 'send' && ask.kind !== 'instructions' && ask.post.id === p.id && (
                    <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: '#F7F7F4', display: 'grid', gap: 10 }}>
                      {ask.kind !== 'ad_complete' && (
                        <div>
                          <label style={fieldLabel} htmlFor={`cp-${p.id}`}>{ask.kind === 'post' ? 'Instagram post link' : ask.kind === 'affiliate' ? 'The brand’s affiliate link' : ask.kind === 'ad_code' ? 'The creator’s partnership ad code' : 'Why take it back (the creator is not told the reason)'}</label>
                          <input id={`cp-${p.id}`} className="dinput" value={text} maxLength={ask.kind === 'cancel' ? 300 : 500} onChange={(e) => setText(e.target.value)}
                            placeholder={ask.kind === 'post' ? 'https://www.instagram.com/reel/…' : ask.kind === 'affiliate' ? 'https://…' : ask.kind === 'ad_code' ? 'Paste the ad code' : 'Wrong cut sent'} />
                        </div>
                      )}
                      {ask.kind !== 'cancel' && (
                        <div>
                          <label style={fieldLabel} htmlFor={`cc-${p.id}`}>{ask.kind === 'post' || ask.kind === 'ad_code' ? 'The creator sent it via' : 'The brand told us via'}</label>
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
                            : ask.kind === 'ad_code' ? recordCollabAdCode(experienceId, p.id, text, channel)
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
