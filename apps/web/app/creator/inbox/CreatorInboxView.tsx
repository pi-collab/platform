'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Thread {
  dealId: string
  dealTitle: string
  dealStatus: string
  brandName: string
  lastMessage: string
  senderParty: string
  createdAt: string
}

interface Message {
  id: string
  deal_id: string
  sender_party: 'brand' | 'creator'
  body: string | null
  created_at: string
}

const TERMINAL_STATUSES = ['complete', 'declined', 'cancelled']

export default function CreatorInboxView({
  threads,
  allMessages,
}: {
  threads: Thread[]
  allMessages: Message[]
}) {
  const [selected, setSelected] = useState<string | null>(threads[0]?.dealId ?? null)
  const [messagesByDeal, setMessagesByDeal] = useState<Record<string, Message[]>>(() => {
    const map: Record<string, Message[]> = {}
    for (const msg of allMessages) {
      if (!map[msg.deal_id]) map[msg.deal_id] = []
      map[msg.deal_id].push(msg)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }
    return map
  })
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobileChat, setMobileChat] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedThread = threads.find((t) => t.dealId === selected)
  const selectedMessages = selected ? (messagesByDeal[selected] ?? []) : []
  const isTerminal = selectedThread ? TERMINAL_STATUSES.includes(selectedThread.dealStatus) : false

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected, selectedMessages.length])

  useEffect(() => {
    if (mobileChat) inputRef.current?.focus()
  }, [mobileChat])

  function selectThread(dealId: string) {
    setSelected(dealId)
    setMobileChat(true)
    setBody('')
    setError(null)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending || !selected) return

    setError(null)
    setSending(true)

    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('messages')
      .insert({ deal_id: selected, body: trimmed, sender_party: 'creator' })
      .select('id, deal_id, sender_party, body, created_at')
      .single()

    setSending(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    const msg = data as Message
    setMessagesByDeal((prev) => ({
      ...prev,
      [selected]: [...(prev[selected] ?? []), msg],
    }))
    setBody('')
  }

  if (threads.length === 0) {
    return (
      <div style={emptyWrap}>
        <p style={{ fontSize: '1rem', fontWeight: 600, color: '#111', margin: '0 0 0.5rem' }}>No conversations yet</p>
        <p style={{ fontSize: '0.875rem', color: '#888', margin: 0, lineHeight: 1.6 }}>
          Messages will appear here when a brand starts a deal thread with you.
        </p>
      </div>
    )
  }

  return (
    <div style={container}>
      {/* Left panel — thread list */}
      <div style={leftPanel} className="inbox-left">
        <div style={leftHeader}>
          <h1 style={heading}>Inbox</h1>
        </div>
        <div style={threadList}>
          {threads.map((t) => (
            <button
              key={t.dealId}
              onClick={() => selectThread(t.dealId)}
              style={{
                ...threadRow,
                background: t.dealId === selected ? '#f5f5f5' : '#fff',
                borderLeft: t.dealId === selected ? '3px solid #111' : '3px solid transparent',
              }}
            >
              <div style={brandInitial}>
                {t.brandName.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.brandName}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: '#aaa', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {formatTimeAgo(t.createdAt)}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.1rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.dealTitle}
                </p>
                <p style={{ fontSize: '0.8125rem', color: '#555', margin: '0.2rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.senderParty === 'creator' ? 'You: ' : ''}{t.lastMessage}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — chat */}
      <div style={rightPanel} className={mobileChat ? 'inbox-right inbox-right-open' : 'inbox-right'}>
        {selectedThread ? (
          <>
            <div style={chatHeader}>
              <button onClick={() => setMobileChat(false)} className="inbox-back-btn" style={backBtn} aria-label="Back to threads">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111', margin: 0 }}>{selectedThread.brandName}</p>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.1rem 0 0' }}>{selectedThread.dealTitle}</p>
              </div>
              <a href={`/creator/deals/${selectedThread.dealId}`} style={viewDealLink}>View deal</a>
            </div>

            <div style={messagesArea}>
              {selectedMessages.length === 0 ? (
                <p style={emptyChat}>No messages yet — send a message to the brand.</p>
              ) : (
                <div style={msgList}>
                  {selectedMessages.map((msg) => {
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
                <p style={closedNotice}>This deal is {selectedThread.dealStatus} — messaging is closed.</p>
              ) : (
                <>
                  <form onSubmit={handleSend} style={composeForm}>
                    <input
                      ref={inputRef}
                      style={composeInput}
                      type="text"
                      placeholder="Type a message..."
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      disabled={sending}
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
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: '#aaa', fontSize: '0.875rem' }}>Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/* ── Styles ─────────────────────────────────────────────────────── */

const emptyWrap: React.CSSProperties = {
  padding: '3rem 1rem',
  textAlign: 'center',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  background: '#fff',
  margin: '2rem auto',
  maxWidth: 480,
}

const container: React.CSSProperties = {
  display: 'flex',
  height: 'calc(100vh - 0px)',
  overflow: 'hidden',
}

const leftPanel: React.CSSProperties = {
  width: 340,
  flexShrink: 0,
  borderRight: '1px solid #e5e5e5',
  display: 'flex',
  flexDirection: 'column',
  background: '#fafafa',
  overflow: 'hidden',
}

const leftHeader: React.CSSProperties = {
  padding: '1.25rem 1rem 0.75rem',
  borderBottom: '1px solid #e5e5e5',
  flexShrink: 0,
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.25rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: 0,
}

const threadList: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
}

const threadRow: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'flex-start',
  padding: '0.75rem 1rem',
  border: 'none',
  borderBottom: '1px solid #f0f0f0',
  width: '100%',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
}

const brandInitial: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 20,
  background: '#e5e5e5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#888',
  flexShrink: 0,
}

const rightPanel: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
  minWidth: 0,
}

const chatHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.875rem 1.25rem',
  borderBottom: '1px solid #e5e5e5',
  flexShrink: 0,
}

const backBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#888',
  padding: '0.25rem',
  display: 'none',
  alignItems: 'center',
  justifyContent: 'center',
}

const viewDealLink: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#2563eb',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const messagesArea: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '1rem 1.25rem',
}

const emptyChat: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#aaa',
  textAlign: 'center',
  padding: '3rem 1rem',
  margin: 0,
}

const msgList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.625rem',
}

const bubbleBase: React.CSSProperties = {
  maxWidth: '75%',
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
  fontFamily: 'inherit',
}

const sendBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.8125rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}

const closedNotice: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#888',
  textAlign: 'center',
  margin: 0,
  padding: '0.25rem 0',
}
