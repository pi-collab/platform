'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { DatePill } from '@/components/DealOptionPills'
import { CHANNELS, QUOTE_STATUS, channelLabel, formatRupees, rupeesToPaise } from '@/lib/experience-request'
import type { ConsoleDeliverable, ConsoleQuote } from '@/lib/experience-console-server'
import { acceptQuote, submitQuote } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * The negotiation with the brand: Guapd's quotes and the brand's counters, as
 * one history. There is no brand screen yet, so staff record the brand's
 * counter and acceptance on the brand's behalf, with the channel it came
 * through. The database enforces the rules (one open quote, totals, quotes
 * closed once one is accepted); this component only collects input.
 */
export default function QuotePanel({ experienceId, open: quotesOpen, canSeePrice, quotes, requested, defaults, planVideos, planLabel }: {
  experienceId: string
  open: boolean
  /** The brand price is financial-only (0537). Without it: no amounts, no messages, no quoting. */
  canSeePrice: boolean
  quotes: ConsoleQuote[]
  requested: ConsoleDeliverable[]
  defaults: { count: number; city: string; date: string }
  /** Videos the plan implies (creators × videos per creator); a quote may differ, which is flagged. */
  planVideos: number
  planLabel: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<null | 'guapd' | 'brand'>(null)
  const [error, setError] = useState<string | null>(null)
  const current = quotes.find((q) => q.status === 'open') ?? null
  const latest = current ?? quotes[0] ?? null

  // composer
  const [perVideo, setPerVideo] = useState('')
  const [count, setCount] = useState(String(defaults.count || ''))
  const [misc, setMisc] = useState('')
  const [date, setDate] = useState(defaults.date)
  const [city, setCity] = useState(defaults.city)
  const [message, setMessage] = useState('')
  const [channel, setChannel] = useState('')

  const openComposer = (m: 'guapd' | 'brand') => {
    setError(null)
    setMode(m)
    if (latest) {
      setPerVideo(latest.per_video_paise != null ? String(latest.per_video_paise / 100) : '')
      setCount(String(latest.deliverable_count))
      setMisc(latest.misc_paise ? String(latest.misc_paise / 100) : '')
      setDate(latest.shoot_date ?? defaults.date)
      setCity(latest.shoot_city ?? defaults.city)
    }
    setMessage('')
    setChannel('')
  }

  const pv = rupeesToPaise(perVideo), ms = misc.trim() ? rupeesToPaise(misc) : 0, n = Number(count)
  const preview = pv && ms !== null && Number.isInteger(n) && n > 0 ? pv * n + ms : null

  const send = () => {
    if (!mode) return
    setError(null)
    start(async () => {
      const r = await submitQuote({ experienceId, proposedBy: mode, perVideo, count, misc, shootDate: date, shootCity: city, message, channel, deliverables: requested })
      if (r.ok) { setMode(null); router.refresh() } else setError(r.error)
    })
  }

  // accept
  const [confirming, setConfirming] = useState(false)
  const [acceptChannel, setAcceptChannel] = useState('')
  const [acceptErr, setAcceptErr] = useState<string | null>(null)
  const brandAccepts = current?.proposed_by === 'guapd'
  const accept = () => {
    if (!current) return
    if (brandAccepts && !acceptChannel) { setAcceptErr('Say how the brand accepted.'); return }
    setError(null)
    start(async () => {
      const r = await acceptQuote(experienceId, current.id, brandAccepts ? acceptChannel : null)
      setConfirming(false)
      if (r.ok) router.refresh(); else setError(r.error)
    })
  }

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Quotes</h2>
          <div className="sect-rule" />
        </div>
        {quotesOpen && canSeePrice && !mode && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={pillBtn} onClick={() => openComposer('brand')} disabled={!current}
              title={current ? '' : 'The brand counters a quote, so send one first'}>
              Record brand's counter
            </button>
            <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} onClick={() => openComposer('guapd')}>
              {current ? 'Send a new quote' : 'Send a quote'}
            </button>
          </div>
        )}
      </div>

      {!quotesOpen && <p className="t-body" style={{ margin: '14px 0 0' }}>The price is agreed, so quotes are closed.</p>}
      {!canSeePrice && (
        <p className="t-body" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-soft)' }}>
          The brand&apos;s price and the quotes are visible to finance only. You can see each quote&apos;s status, videos, date and city.
        </p>
      )}

      {/* ── Composer ── */}
      {mode && (
        <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: '#F7F7F4' }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
            {mode === 'guapd' ? 'Quote from Guapd' : "The brand's counter, as they sent it"}
          </div>
          {current && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--wg-500)', marginTop: 2 }}>This replaces the open quote (v{current.version}).</div>}
          <div className="xp-q" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 14 }}>
            <div><label style={fieldLabel} htmlFor="q-pv">Price per video (₹)</label>
              <input id="q-pv" className="dinput" inputMode="decimal" placeholder="3,500" value={perVideo} onChange={(e) => setPerVideo(e.target.value)} /></div>
            <div><label style={fieldLabel} htmlFor="q-n">Videos</label>
              <input id="q-n" className="dinput" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, marginTop: 6, color: Number(count) && Number(count) !== planVideos ? '#8C6417' : 'var(--wg-500)' }}>
                {Number(count) && Number(count) !== planVideos ? `Plan is ${planVideos} (${planLabel}). Accepting this locks ${count}.` : `From the plan: ${planLabel}`}
              </div></div>
            <div><label style={fieldLabel} htmlFor="q-misc">Extras (₹, optional)</label>
              <input id="q-misc" className="dinput" inputMode="decimal" placeholder="0" value={misc} onChange={(e) => setMisc(e.target.value)} /></div>
            <div><span style={fieldLabel}>Shoot date</span><DatePill value={date} onChange={setDate} id="q-date" /></div>
            <div><label style={fieldLabel} htmlFor="q-city">City</label>
              <input id="q-city" className="dinput" value={city} maxLength={120} onChange={(e) => setCity(e.target.value)} /></div>
            {mode === 'brand' && (
              <div><label style={fieldLabel} htmlFor="q-ch">Sent via</label>
                <select id="q-ch" className="dinput" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="">Select…</option>
                  {CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
            )}
            <div style={{ gridColumn: '1 / -1' }}><label style={fieldLabel} htmlFor="q-msg">{mode === 'guapd' ? 'Message to the brand (optional)' : 'What they said (optional)'}</label>
              <textarea id="q-msg" className="dinput" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} style={{ height: 'auto', padding: '12px 14px', lineHeight: 1.5 }} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--ink)' }}>
              Total <b style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginLeft: 6 }}>{preview != null ? formatRupees(preview) : '—'}</b>
              {preview != null && <span style={{ color: 'var(--wg-500)', marginLeft: 8, fontSize: 12.5 }}>{n} × {formatRupees(pv)}{ms ? ` + ${formatRupees(ms)}` : ''}</span>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={pillBtn} onClick={() => setMode(null)} disabled={pending}>Cancel</button>
              <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40, opacity: pending ? 0.6 : 1 }} onClick={send} disabled={pending}>
                {pending ? 'Saving…' : mode === 'guapd' ? 'Send quote' : 'Record counter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div role="alert" style={{ ...formError, marginTop: 14 }}>{error}</div>}

      {/* ── History ── */}
      {quotes.length === 0 ? (
        <p className="t-body" style={{ margin: '14px 0 0' }}>No quote yet. Send the brand a price to start.</p>
      ) : (
        <div style={{ marginTop: 18, borderRadius: 16, border: '1px solid var(--hair)', overflow: 'hidden' }}>
          {quotes.map((q, i) => {
            const st = QUOTE_STATUS[q.status] ?? { label: q.status, tone: 'neutral' as const }
            const isOpen = q.status === 'open'
            return (
              <div key={q.id} style={{ padding: '16px 18px', borderTop: i ? '1px solid var(--hair)' : 'none', background: isOpen ? '#FBFCF4' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={kpiLabel}>v{q.version} · {q.proposed_by === 'guapd' ? 'Guapd quote' : 'Brand counter'}</span>
                  <StatusChip label={st.label} tone={st.tone} />
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{q.total_paise != null ? formatRupees(q.total_paise) : <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--wg-500)' }}>Finance only</span>}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                  {q.per_video_paise != null ? <>{q.deliverable_count} × {formatRupees(q.per_video_paise)}{q.misc_paise ? ` + ${formatRupees(q.misc_paise)} extras` : ''}</> : <>{q.deliverable_count} video{q.deliverable_count === 1 ? '' : 's'}</>}
                  {(q.shoot_date || q.shoot_city) && <> · {[q.shoot_city, q.shoot_date ? fmt(q.shoot_date) : null].filter(Boolean).join(', ')}</>}
                </div>
                {q.message && <p className="t-body" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>“{q.message}”</p>}
                {q.brand_note && <p className="t-body" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: '#8C6417' }}>The brand: “{q.brand_note}”</p>}
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--wg-500)', marginTop: 8 }}>
                  {q.proposed_by === 'brand' ? `Recorded by ${q.created_by_name ?? 'Guapd'}${q.recorded_channel ? `, received via ${channelLabel(q.recorded_channel)}` : ''}` : `Sent by ${q.created_by_name ?? 'Guapd'}`}
                  {' · '}{new Date(q.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  {q.status === 'rejected' && q.decided_at && <> · declined {new Date(q.decided_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{q.recorded_channel === 'portal' ? ' by the brand on Guapd' : ''}</>}
                  {q.status === 'accepted' && q.decided_at && <> · accepted {new Date(q.decided_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{q.proposed_by === 'guapd' && q.recorded_channel ? ` via ${channelLabel(q.recorded_channel)}` : ''}</>}
                </div>
                {isOpen && quotesOpen && canSeePrice && !mode && (
                  <div style={{ marginTop: 12 }}>
                    <button type="button" style={pillBtn} onClick={() => { setAcceptChannel(''); setAcceptErr(null); setConfirming(true) }}>
                      {q.proposed_by === 'guapd' ? 'Brand accepted this' : 'Accept their counter'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirming && !!current}
        title={brandAccepts ? 'Record that the brand accepted' : "Accept the brand's counter"}
        body={current && current.total_paise != null && current.per_video_paise != null ? `This locks ${formatRupees(current.total_paise)} (${current.deliverable_count} × ${formatRupees(current.per_video_paise)}${current.misc_paise ? ` + ${formatRupees(current.misc_paise)}` : ''})${current.shoot_city ? `, ${current.shoot_city}` : ''}${current.shoot_date ? `, ${fmt(current.shoot_date)}` : ''} as the agreed price, closes quoting and moves the Experience to Building roster.` : ''}
        detail={brandAccepts ? (
          <div style={{ marginTop: 12 }}>
            <label style={fieldLabel} htmlFor="acc-ch">They accepted via</label>
            <select id="acc-ch" className="dinput" value={acceptChannel} onChange={(e) => setAcceptChannel(e.target.value)}>
              <option value="">Select…</option>
              {CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {acceptErr && !acceptChannel && <div style={{ ...formError, marginTop: 8 }}>{acceptErr}</div>}
          </div>
        ) : undefined}
        confirmLabel="Lock the price"
        busy={pending}
        onConfirm={accept}
        onCancel={() => setConfirming(false)}
      />

      <style>{`@media (max-width: 720px) { .xp-q { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  )
}

function fmt(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
