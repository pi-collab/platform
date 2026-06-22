'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  sender_party: 'brand' | 'creator'
  body: string | null
  created_at: string
}

export default function DealThread({
  dealId,
  initialMessages,
}: {
  dealId: string
  initialMessages: Message[]
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, open])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return

    setError(null)
    setSending(true)

    const supabase = createClient()

    const { data, error: insertError } = await supabase
      .from('messages')
      .insert({ deal_id: dealId, body: trimmed, sender_party: 'brand' })
      .select('id, sender_party, body, created_at')
      .single()

    setSending(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setMessages((prev) => [...prev, data as Message])
    setBody('')
  }

  const hasMessages = messages.length > 0

  return (
    <>
      {/* CTA Button */}
      <button
        onClick={() => setOpen(true)}
        style={ctaButton}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {hasMessages ? `Messages (${messages.length})` : 'Start conversation'}
      </button>

      {/* No full-screen backdrop — panel sits alongside content like LinkedIn/Facebook chat */}

      {/* Slide-out panel */}
      <div style={{
        ...panel,
        transform: open ? 'scale(1)' : 'scale(0.95)',
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        transformOrigin: 'bottom right',
      }}>
        {/* Panel header */}
        <div style={panelHeader}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
            Messages
          </h2>
          <button onClick={() => setOpen(false)} style={closeBtn} aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Messages area */}
        <div style={messagesArea}>
          {messages.length === 0 ? (
            <p style={emptyState}>No messages yet — start the conversation.</p>
          ) : (
            <div style={messageList}>
              {messages.map((msg) => {
                const isBrand = msg.sender_party === 'brand'
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: isBrand ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div style={isBrand ? bubbleBrand : bubbleCreator}>
                      <p style={bubbleLabel}>
                        {isBrand ? 'You' : 'Creator'}
                      </p>
                      <p style={bubbleBody}>{msg.body}</p>
                      <p style={bubbleTime}>
                        {new Date(msg.created_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
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

        {/* Compose */}
        <div style={composeArea}>
          <form onSubmit={handleSend} style={composeForm}>
            <input
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
            <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '0.375rem 0 0' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const ctaButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 1rem',
  background: 'var(--brand-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.8125rem',
  fontWeight: 700,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const panel: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  width: 380,
  maxWidth: 'calc(100vw - 32px)',
  height: 520,
  maxHeight: 'calc(100vh - 32px)',
  background: 'var(--section-bg, #fff)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  zIndex: 999,
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.2s ease, opacity 0.2s ease, visibility 0.2s ease',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
  overflow: 'hidden',
}

const panelHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem 1.25rem',
  borderBottom: '1px solid var(--color-border)',
  flexShrink: 0,
}

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-muted)',
  padding: '0.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--radius-sm)',
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
  color: 'var(--color-muted)',
  textAlign: 'center',
  padding: '3rem 1rem',
  margin: 0,
}

const bubbleBase: React.CSSProperties = {
  maxWidth: '80%',
  padding: '0.5rem 0.75rem',
  borderRadius: 'var(--radius-md)',
  fontSize: '0.8125rem',
  lineHeight: 1.5,
}

const bubbleBrand: React.CSSProperties = {
  ...bubbleBase,
  background: 'var(--brand-primary)',
  color: '#fff',
  borderBottomRightRadius: 4,
}

const bubbleCreator: React.CSSProperties = {
  ...bubbleBase,
  background: 'var(--section-bg-alt, #f5f5f5)',
  color: 'var(--color-body)',
  border: '1px solid var(--color-border)',
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
  borderTop: '1px solid var(--color-border)',
  flexShrink: 0,
}

const composeForm: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
}

const composeInput: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.875rem',
  outline: 'none',
  background: 'rgba(255, 255, 255, 0.2)',
  minHeight: 40,
}

const sendBtn: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--brand-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.8125rem',
  fontWeight: 700,
  fontFamily: 'var(--font-body)',
  whiteSpace: 'nowrap',
}
