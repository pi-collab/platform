'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LegThread, LegThreadMessage } from '@/lib/experience-console-server'
import { sendGuapdLegMessage } from './actions'

/**
 * One Guapd ↔ creator thread, staff side (0546). Guapd's messages go out as
 * Guapd (the creator sees "Guapd", never a staff name or the brand); here staff
 * see which colleague wrote each. The brand is never part of this thread.
 *
 * Staff read through experience_console_leg_thread (gated, marks it read for
 * this staff user), not through RLS, so it refreshes on a short poll while open.
 */
export default function LegThreadView({ thread, closeHref, sendBody, heading }: {
  thread: LegThread
  closeHref: string
  /** 6.1 item 11: the brand ↔ Guapd thread uses this same view, with its own
   *  send (a server action bound to the Experience) and heading. */
  sendBody?: (body: string) => Promise<{ ok: true; data: { id: string; body: string; created_at: string } } | { ok: false; error: string }>
  heading?: { sub: string; empty: string; placeholder: string }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [messages, setMessages] = useState<LegThreadMessage[]>(thread.messages)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMessages(thread.messages) }, [thread.messages])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 20000)
    return () => clearInterval(t)
  }, [router])

  const send = () => {
    const text = body.trim()
    if (!text) return
    setError(null)
    start(async () => {
      const r = sendBody ? await sendBody(text) : await sendGuapdLegMessage(thread.deal_id, text)
      if (!r.ok) { setError(r.error); return }
      setMessages((m) => [...m, { id: r.data.id, from: 'guapd', body: r.data.body, created_at: r.data.created_at, sender_name: 'You' }])
      setBody('')
      router.refresh()
    })
  }

  return (
    <section className="xp-th" aria-label={`Messages with ${thread.creator_name}`}>
      <header className="xp-th-head">
        <div style={{ minWidth: 0 }}>
          <div className="xp-th-name">{thread.creator_name}{thread.creator_handle ? <span className="xp-th-handle"> · @{thread.creator_handle.replace(/^@/, '')}</span> : null}</div>
          <div className="xp-th-sub">{heading ? heading.sub : <>{thread.experience_title}{thread.deal_ref ? ` · ${thread.deal_ref}` : ''} · Guapd ↔ creator, the brand does not see this</>}</div>
        </div>
        <Link href={closeHref} className="xp-th-close" aria-label="Close the thread">Close</Link>
      </header>

      <div className="xp-th-body">
        {messages.length === 0 && <p className="xp-th-empty">{heading ? heading.empty : `No messages yet. Write to ${thread.creator_name.split(' ')[0]}; they see it as a message from Guapd.`}</p>}
        {messages.map((m) => (
          <div key={m.id} className={`xp-th-msg ${m.from === 'guapd' ? 'me' : ''}`}>
            <div className="xp-th-meta">{m.from === 'guapd' ? `Guapd · ${m.sender_name ?? 'staff'}` : m.sender_name ?? thread.creator_name} · {new Date(m.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
            <div className="xp-th-bubble">{m.body}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {thread.can_message ? (
        <div className="xp-th-compose">
          <textarea className="dinput" rows={2} maxLength={4000} value={body} placeholder={heading ? heading.placeholder : `Message ${thread.creator_name.split(' ')[0]} as Guapd…`}
            aria-label="Message" onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            style={{ height: 'auto', padding: '10px 12px', lineHeight: 1.45, resize: 'vertical' }} />
          <button type="button" className="neonbtn" disabled={pending || !body.trim()} onClick={send}
            style={{ height: 40, padding: '0 18px', borderRadius: 999, border: 0, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5 }}>
            {pending ? 'Sending…' : 'Send'}
          </button>
        </div>
      ) : <p className="xp-th-closed">Messages on this deal are closed ({thread.status}).</p>}
      {error && <div role="alert" className="xp-th-error">{error}</div>}

      <style dangerouslySetInnerHTML={{ __html: `
        .xp-th { border: 1px solid var(--hairline); border-radius: 16px; background: #fff; display: flex; flex-direction: column; min-height: 420px; }
        .xp-th-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 14px 16px; border-bottom: 1px solid var(--hairline); }
        .xp-th-name { font-family: var(--font-ui); font-weight: 700; font-size: 15px; color: var(--ink); }
        .xp-th-handle { font-weight: 500; color: var(--ink-faint); font-size: 13px; }
        .xp-th-sub { font-family: var(--font-ui); font-size: 12px; color: var(--ink-faint); margin-top: 2px; }
        .xp-th-close { font-family: var(--font-ui); font-size: 12.5px; font-weight: 600; color: var(--ink-soft); text-decoration: none; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--hairline); display: inline-flex; align-items: center; flex: none; }
        .xp-th-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; max-height: 460px; background: #FBFBF8; }
        .xp-th-empty { font-family: var(--font-ui); font-size: 13px; color: var(--ink-faint); margin: auto 0; text-align: center; }
        .xp-th-msg { max-width: 78%; display: grid; gap: 4px; }
        .xp-th-msg.me { align-self: flex-end; text-align: right; }
        .xp-th-meta { font-family: var(--font-ui); font-size: 10.5px; font-weight: 600; letter-spacing: .04em; color: var(--ink-faint); }
        .xp-th-bubble { font-family: var(--font-ui); font-size: 13.5px; line-height: 1.5; color: var(--ink); padding: 10px 13px; border-radius: 14px; background: #fff; border: 1px solid var(--hairline); white-space: pre-wrap; text-align: left; overflow-wrap: anywhere; }
        .xp-th-msg.me .xp-th-bubble { background: var(--ink); color: #fff; border-color: var(--ink); }
        .xp-th-compose { display: flex; gap: 10px; align-items: flex-end; padding: 12px 16px; border-top: 1px solid var(--hairline); }
        .xp-th-compose textarea { flex: 1; }
        .xp-th-closed { margin: 0; padding: 12px 16px; border-top: 1px solid var(--hairline); font-family: var(--font-ui); font-size: 12.5px; color: var(--ink-faint); }
        .xp-th-error { margin: 0 16px 12px; padding: 8px 12px; border-radius: 10px; background: #FDECEC; color: #9C4147; font-family: var(--font-ui); font-size: 12.5px; }
        @media (max-width: 720px) { .xp-th-msg { max-width: 92%; } .xp-th-compose { flex-direction: column; align-items: stretch; } }
      ` }} />
    </section>
  )
}
