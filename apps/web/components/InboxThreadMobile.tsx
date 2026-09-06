'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sendMessage } from '@/app/inbox/actions'
import { markDealThreadRead } from '@/lib/thread-read-actions'
import { useRealtimeMessages } from '@/lib/realtime/useRealtimeMessages'
import { EMOJI_LIST } from '@/lib/emoji'

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
  const [emojiOpen, setEmojiOpen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* Messages are MERGED BY ID, never replaced and never ignored.
     The first version ignored the server after mount, to stop a sent message
     arriving back as a duplicate of its own optimistic copy. That killed the
     duplicate and created a worse bug: returning to a thread you had already
     opened served Next's cached payload, the refresh fetched the real one, and
     because the deal id had not changed the newer messages were dropped on the
     floor. You saw the thread you left, not the thread as it is.
     Merging by id solves both — a message we already hold is skipped whatever
     door it came through. */
  const [all, setAll] = useState<ThreadMessage[]>(messages)
  const knownIdsRef = useRef(new Set(messages.map((m) => m.id)))

  // A different thread is a different conversation, not more of this one.
  useEffect(() => {
    setAll(messages)
    knownIdsRef.current = new Set(messages.map((m) => m.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId])

  /* Fold in anything the server has that we do not. Keyed on a signature
     rather than the array, which is a new object on every render. */
  const serverSig = `${messages.length}:${messages[messages.length - 1]?.id ?? ''}`
  useEffect(() => {
    setAll((prev) => {
      const held = new Set(prev.map((m) => m.id))
      const additions = messages.filter((m) => !held.has(m.id))
      if (additions.length === 0) return prev
      for (const m of additions) knownIdsRef.current.add(m.id)
      return [...prev, ...additions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig])

  /* Live. Ids we already hold are ignored, which is how our own send does not
     arrive back as a second copy of itself. */
  useRealtimeMessages(
    dealId,
    (msg) => {
      if (knownIdsRef.current.has(msg.id)) return
      knownIdsRef.current.add(msg.id)
      setAll((prev) => [...prev, msg as ThreadMessage])
      /* Arriving while you are looking at it counts as read. Marking only on
         mount meant a message that landed WHILE the thread was open stayed
         unread — so leaving and coming back showed a badge for something you
         had already watched appear. */
      if (msg.sender_party !== me) void markDealThreadRead(dealId)
    },
    knownIdsRef,
    // Its own channel: the desktop view is mounted too, watching the same deal.
    'mobile',
  )

  // Opening a thread is reading it. The refresh is for the unread badges
  // elsewhere on the page, not for the messages here.
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
      // The text stays put. Losing what someone wrote is the worst outcome.
      setError(res.message ?? 'Could not send that message.')
      return
    }

    /* Appended with the REAL id from the insert, and registered as known, so
       realtime's echo of this same row is dropped rather than shown twice. */
    if (res.data) {
      knownIdsRef.current.add(res.data.id)
      setAll((prev) => [...prev, {
        id: res.data!.id,
        sender_party: res.data!.sender_party as 'brand' | 'creator',
        body: res.data!.body,
        created_at: res.data!.created_at,
      }])
    }
    setBody('')
    setEmojiOpen(false)
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
          {emojiOpen && (
            <div className="ithread-m__emoji" role="listbox" aria-label="Emoji">
              {EMOJI_LIST.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { setBody((b) => b + e); inputRef.current?.focus() }}
                  aria-label={`Insert ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <div className="ithread-m__field">
            <button
              type="button"
              className="ithread-m__emojibtn"
              onClick={() => setEmojiOpen((v) => !v)}
              aria-expanded={emojiOpen}
              aria-label="Emoji"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            <input
              ref={inputRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message…"
              aria-label="Write a message"
              disabled={sending}
            />
            <button type="submit" className="ithread-m__send" disabled={sending || !body.trim()} aria-label="Send">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            </button>
          </div>
          {error && <p className="ithread-m__error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  )
}
