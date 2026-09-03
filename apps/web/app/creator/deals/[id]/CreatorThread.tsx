'use client'

import { useState, useRef, useEffect } from 'react'
import { markDealThreadRead } from '@/lib/thread-read-actions'
import { sendMessage } from '@/app/inbox/actions'
import { useRealtimeMessages } from '@/lib/realtime/useRealtimeMessages'
import { playGuapSound } from '@/lib/sounds'

interface Message {
  id: string
  deal_id: string
  sender_party: 'brand' | 'creator'
  body: string | null
  created_at: string
}

const TERMINAL_STATUSES = ['complete', 'declined', 'cancelled']

export default function CreatorThread({
  dealId,
  dealStatus,
  initialMessages,
  autoOpen = false,
  hideLauncher = false,
}: {
  dealId: string
  dealStatus: string
  initialMessages: Message[]
  autoOpen?: boolean
  hideLauncher?: boolean
}) {
  const isTerminal = TERMINAL_STATUSES.includes(dealStatus)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(autoOpen)
  // Minimised is the resting state once a conversation exists: a bar you can
  // see, rather than nothing at all. Closing collapses to it instead of hiding.
  const [dismissed, setDismissed] = useState(false)
  // Unread means unread, not "how many messages exist". The bar showed the
  // total, so a finished conversation sat there reading "12" forever and the
  // number said nothing about whether anything needed attention.
  //
  // Read state is per device, in localStorage, keyed on the deal. The messages
  // table has no read marker, and adding one is the right fix for a header
  // badge that must be right across devices — but for a bar on the page you are
  // already looking at, remembering what this browser has seen is enough and
  // needs no migration.
  const seenKey = `guapd:deal-chat-seen:${dealId}`
  const [lastSeenId, setLastSeenId] = useState<string | null>(null)

  useEffect(() => {
    try { setLastSeenId(window.localStorage.getItem(seenKey)) } catch { /* private mode */ }
  }, [seenKey])

  // Only the OTHER party's messages count: your own are read by definition.
  const unread = (() => {
    if (messages.length === 0) return 0
    const from = lastSeenId ? messages.findIndex((m) => m.id === lastSeenId) : -1
    return messages.slice(from + 1).filter((m) => m.sender_party !== 'creator').length
  })()

  // Opening IS reading. Locally for this bar, and on the server for the header
  // badge, which spans deals and has to be right on another device.
  useEffect(() => {
    if (!open || messages.length === 0) return
    const latest = messages[messages.length - 1].id
    setLastSeenId(latest)
    try { window.localStorage.setItem(seenKey, latest) } catch { /* private mode */ }
    void markDealThreadRead(dealId)
  }, [open, messages, seenKey, dealId])

  const hasMessages = messages.length > 0

  // Opened from a Message control elsewhere on the page. See OpenDealChat.
  useEffect(() => {
    const openIt = () => { setDismissed(false); setOpen(true) }
    window.addEventListener('guapd:open-deal-chat', openIt)
    return () => window.removeEventListener('guapd:open-deal-chat', openIt)
  }, [])
  const [emojiOpen, setEmojiOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)

  // Dedupe: track all known message ids so realtime skips sender's own echo
  const knownIdsRef = useRef(new Set(initialMessages.map((m) => m.id)))

  // Realtime: subscribe to new messages on this deal
  useRealtimeMessages(
    dealId,
    (msg) => {
      knownIdsRef.current.add(msg.id)
      setMessages((prev) => [...prev, msg as Message])
      playGuapSound()
      // A message arriving opens the panel. If it was DISMISSED, it comes back
      // as the bar instead: dismissing means "leave me alone", and answering
      // that by throwing a panel open would be the wrong reading of it.
      if (msg.sender_party !== 'creator') {
        setDismissed((wasDismissed) => {
          if (!wasDismissed) setOpen(true)
          return false
        })
      }
    },
    knownIdsRef,
  )

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, open])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (emojiOpen) setEmojiOpen(false)
        else setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [open, emojiOpen])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setEmojiOpen(false)
      }
    }
    if (emojiOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [emojiOpen])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return

    setError(null)
    setSending(true)

    const result = await sendMessage(dealId, trimmed, 'creator')

    setSending(false)

    if (result.status === 'error') {
      setError(result.message ?? 'Failed to send')
      return
    }

    const msg = { id: result.data!.id, deal_id: dealId, sender_party: result.data!.sender_party, body: result.data!.body, created_at: result.data!.created_at } as Message
    knownIdsRef.current.add(msg.id)
    setMessages((prev) => [...prev, msg])
    setBody('')
  }



  return (
    <>
      <button onClick={() => setOpen(true)} style={{ ...ctaButton, ...(hideLauncher ? { display: 'none' } : null) }} data-open-deal-chat>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {messages.length > 0 ? `Messages (${messages.length})` : 'Message brand'}
      </button>

      {/* Minimised bar. Sits where the panel will appear, so expanding does not
          move the thing you just clicked. */}
      {!open && !dismissed && (
        <button
          onClick={() => setOpen(true)}
          aria-label={unread > 0 ? `Open messages, ${unread} unread` : hasMessages ? 'Open messages' : 'Start a conversation'}
          style={minBar}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
            {hasMessages ? 'Messages' : 'Send a message'}
          </span>
          {unread > 0 && <span style={minCount}>{unread}</span>}
        </button>
      )}

      {/* Chat panel */}
      <div style={{
        ...panel,
        transform: open ? 'scale(1)' : 'scale(0.95)',
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        transformOrigin: 'bottom right',
      }}>
        <div style={panelHeader}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111', margin: 0 }}>Messages</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button onClick={() => setOpen(false)} style={closeBtn} aria-label="Minimise chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="18" x2="18" y2="18" /></svg>
            </button>
            <button onClick={() => { setOpen(false); setDismissed(true) }} style={closeBtn} aria-label="Close chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        <div style={messagesArea}>
          {messages.length === 0 ? (
            <p style={emptyState}>No messages yet. Send a message to the brand.</p>
          ) : (
            <div style={messageList}>
              {messages.map((msg) => {
                const isCreator = msg.sender_party === 'creator'
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isCreator ? 'flex-end' : 'flex-start' }}>
                    <div style={isCreator ? bubbleMine : bubbleTheirs}>
                      <p style={bubbleLabel}>{isCreator ? 'You' : 'Brand'}</p>
                      <p style={bubbleBody}>{msg.body}</p>
                      <p style={bubbleTime}>
                        {new Date(msg.created_at).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div style={composeArea}>
          {isTerminal ? (
            <p style={closedNotice}>This deal is {dealStatus}, so messaging is closed.</p>
          ) : (
            <>
              {emojiOpen && (
                <div ref={emojiRef} style={emojiPicker}>
                  {EMOJI_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p style={emojiGroupLabel}>{group.label}</p>
                      <div style={emojiGrid}>
                        {group.emojis.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setBody((prev) => prev + emoji)
                              inputRef.current?.focus()
                            }}
                            style={emojiBtn}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleSend} style={composeForm}>
                <button
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  style={emojiToggle}
                  aria-label="Emojis"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </button>
                <input
                  ref={inputRef}
                  style={composeInput}
                  type="text"
                  placeholder="Type a message..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={sending}
                  autoFocus={open}
                />
                <button
                  type="submit"
                  disabled={sending || !body.trim()}
                  style={{
                    ...sendBtn,
                    opacity: sending || !body.trim() ? 0.5 : 1,
                    cursor: sending || !body.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? '...' : 'Send'}
                </button>
              </form>
              {error && (
                <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '0.375rem 0 0' }}>{error}</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

const ctaButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 1rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.8125rem',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const minBar: React.CSSProperties = {
  position: 'fixed', bottom: 16, right: 16, zIndex: 998,
  display: 'flex', alignItems: 'center', gap: 9,
  width: 220, maxWidth: 'calc(100vw - 32px)',
  padding: '11px 14px', borderRadius: 12,
  background: 'var(--section-bg, #fff)', border: '1px solid var(--color-border)',
  boxShadow: '0 8px 32px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08)',
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
  color: 'var(--ink, #12151C)', cursor: 'pointer',
}

const minCount: React.CSSProperties = {
  flexShrink: 0, minWidth: 20, padding: '1px 6px', borderRadius: 999,
  background: 'var(--neon, #E8FF66)', color: 'var(--lime-950, #161B08)',
  fontSize: 11, fontWeight: 700, textAlign: 'center',
}

const panel: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  width: 360,
  maxWidth: 'calc(100vw - 32px)',
  height: 480,
  maxHeight: 'calc(100vh - 32px)',
  background: '#fff',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  zIndex: 999,
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.2s ease, opacity 0.2s ease, visibility 0.2s ease',
  boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
  overflow: 'hidden',
}

const panelHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem 1.25rem',
  borderBottom: '1px solid #e5e5e5',
  flexShrink: 0,
}

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#888',
  padding: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
}

const messagesArea: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '1rem 1.25rem',
}

const messageList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.625rem',
}

const emptyState: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#888',
  textAlign: 'center',
  padding: '3rem 1rem',
  margin: 0,
}

const bubbleBase: React.CSSProperties = {
  maxWidth: '80%',
  padding: '0.5rem 0.75rem',
  borderRadius: 12,
  fontSize: '0.8125rem',
  lineHeight: 1.5,
}

const bubbleMine: React.CSSProperties = {
  ...bubbleBase,
  background: '#111',
  color: '#fff',
  borderBottomRightRadius: 4,
}

const bubbleTheirs: React.CSSProperties = {
  ...bubbleBase,
  background: '#f5f5f5',
  color: '#111',
  border: '1px solid #e5e5e5',
  borderBottomLeftRadius: 4,
}

const bubbleLabel: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  margin: '0 0 0.15rem',
  opacity: 0.7,
}

const bubbleBody: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const bubbleTime: React.CSSProperties = {
  fontSize: '0.625rem',
  margin: '0.25rem 0 0',
  opacity: 0.55,
}

const composeArea: React.CSSProperties = {
  padding: '0.75rem 1.25rem',
  borderTop: '1px solid #e5e5e5',
  flexShrink: 0,
}

const composeForm: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
}

const composeInput: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 0.75rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  fontSize: '0.875rem',
  outline: 'none',
  background: '#fff',
  minHeight: 40,
}

const sendBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.8125rem',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const closedNotice: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#888',
  textAlign: 'center',
  margin: 0,
  padding: '0.25rem 0',
}

const emojiToggle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#888',
  padding: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const emojiPicker: React.CSSProperties = {
  padding: '0.5rem 0.75rem 0.25rem',
  borderBottom: '1px solid #e5e5e5',
  maxHeight: 200,
  overflowY: 'auto',
}

const emojiGroupLabel: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#888',
  margin: '0.25rem 0',
}

const emojiGrid: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 2,
}

const emojiBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '1.25rem',
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  padding: 0,
}

const EMOJI_GROUPS = [
  {
    label: 'Smileys',
    emojis: ['😊', '😂', '🙂', '😍', '🤩', '😎', '🤔', '😅', '🙏', '😁', '🥳', '😇'],
  },
  {
    label: 'Gestures',
    emojis: ['👍', '👏', '🤝', '✌️', '💪', '🙌', '👋', '🫡', '✅', '❌', '💯', '🔥'],
  },
  {
    label: 'Objects',
    emojis: ['📸', '🎬', '📝', '💰', '📊', '🎯', '📅', '⏰', '🔗', '📩', '💡', '🚀'],
  },
]
