'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sendMessage } from '@/app/inbox/actions'
import { markDealThreadRead } from '@/lib/thread-read-actions'

/**
 * A single chat thread, mobile — built to "Creator Inbox Thread - Mobile
 * Standalone". Shared by both sides; only the counterpart and which bubble is
 * "mine" differ.
 *
 * Renders below 720px in place of the desktop split-pane's right-hand side.
 * Sending and read-marking go through the SAME actions the desktop view uses,
 * so a message sent on a phone is identical to one sent on a laptop.
 *
 * ── The closed-thread rule is deliberately COPIED, not improved ────────────
 * The desktop view closes the composer on a terminal deal status. There is a
 * more considered rule in lib/messaging-window.ts (a 30-day grace anchored on
 * payment) which the inbox does not currently use. Applying it here would give
 * the same deal two different answers depending on the screen, so this mirrors
 * the desktop rule. Worth unifying — but as one change to both, not as a
 * divergence introduced here.
 */

export interface ThreadMessage {
  id: string
  sender_party: 'brand' | 'creator'
  body: string | null
  created_at: string
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) return 'Today'
  const yesterday = new Date(startOfToday)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d >= yesterday) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}

export default function InboxThreadMobile({
  dealId, name, initials, messages, me, backHref, dealHref, closedNotice, hasTabBar = false,
}: {
  dealId: string
  name: string
  initials: string
  messages: ThreadMessage[]
  /** Which side the viewer is. Their own messages sit right, in ink. */
  me: 'brand' | 'creator'
  backHref: string
  dealHref: string
  /** When set, the composer is replaced by this line and nothing can be sent. */
  closedNotice?: string | null
  hasTabBar?: boolean
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState<ThreadMessage[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  const all = [...messages, ...local]

  // Opening a thread is reading it.
  useEffect(() => {
    void markDealThreadRead(dealId).then(() => router.refresh())
  }, [dealId, router])

  // Newest message in view on open and after every send, without animating the
  // whole history past the reader.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [all.length])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)

    const res = await sendMessage(dealId, trimmed, me)
    setSending(false)

    if (res.status === 'error') {
      setError(res.message ?? 'Could not send that message.')
      return
    }
    /* Shown immediately, then reconciled by the refresh. The input is cleared
       only on success — losing what someone typed because the send failed is
       the worst outcome here. */
    setLocal((prev) => [...prev, {
      id: `local-${Date.now()}`, sender_party: me, body: trimmed,
      created_at: new Date().toISOString(),
    }])
    setBody('')
    router.refresh()
  }

  // Day dividers are inserted between messages rather than grouping into
  // buckets, so a long thread stays one scrolling column.
  const rendered: React.ReactNode[] = []
  let lastDay = ''
  for (const m of all) {
    const day = dayLabel(m.created_at)
    if (day !== lastDay) {
      rendered.push(
        <div key={`d-${day}-${m.id}`} className="ithread-m__daywrap">
          <span className="ithread-m__day">{day}</span>
        </div>,
      )
      lastDay = day
    }
    const mine = m.sender_party === me
    rendered.push(
      <div key={m.id} className={`ithread-m__msg${mine ? ' is-mine' : ''}`}>
        <div className="ithread-m__bubble">{m.body}</div>
        <span className="ithread-m__time">{timeLabel(m.created_at)}</span>
      </div>,
    )
  }

  return (
    <div className={`ithread-m${hasTabBar ? ' has-tabbar' : ''}`}>
      <header className="ithread-m__head">
        <Link href={backHref} className="ithread-m__back" aria-label="Back to messages">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <span className="ithread-m__avatar" aria-hidden="true">{initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ithread-m__name">{name}</div>
        </div>
        <Link href={dealHref} className="ithread-m__viewdeal">View deal</Link>
      </header>

      <div className="ithread-m__scroll">
        {all.length === 0 ? (
          <p className="ithread-m__empty">No messages yet. Say hello.</p>
        ) : rendered}
        <div ref={endRef} />
      </div>

      {closedNotice ? (
        <div className="ithread-m__closed">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>{closedNotice}</span>
        </div>
      ) : (
        <form className="ithread-m__composer" onSubmit={submit}>
          <div className="ithread-m__field">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message…"
              aria-label="Write a message"
              disabled={sending}
            />
            <button type="submit" disabled={sending || !body.trim()} aria-label="Send">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            </button>
          </div>
          {error && <p className="ithread-m__error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  )
}
