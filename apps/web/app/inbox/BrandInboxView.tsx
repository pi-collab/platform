'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { sendMessage } from './actions'
import { useRealtimeMessages } from '@/lib/realtime/useRealtimeMessages'
import { playGuapSound } from '@/lib/sounds'

interface Thread {
  dealId: string
  dealTitle: string
  dealStatus: string
  creatorName: string
  creatorPhoto: string | null
  creatorInitials: string
  lastMessage: string
  senderParty: string
  createdAt: string
  amountPaise: number
}

interface Message {
  id: string
  deal_id: string
  sender_party: 'brand' | 'creator'
  body: string | null
  created_at: string
}

const TERMINAL_STATUSES = ['complete', 'declined', 'cancelled']
const ACTIVE_STATUSES = ['negotiating', 'agreed', 'delivered', 'revision', 'approved']

const EMOJI_LIST = [
  '\u{1F60A}', '\u{1F602}', '\u{2764}\u{FE0F}', '\u{1F525}', '\u{1F44D}', '\u{1F44F}', '\u{1F389}', '\u{1F4AF}',
  '\u{1F64F}', '\u{1F60D}', '\u{1F91D}', '\u{2705}', '\u{1F4B0}', '\u{1F680}', '\u{2B50}', '\u{1F4AA}',
  '\u{1F440}', '\u{1F60E}', '\u{1F914}', '\u{1F4F8}', '\u{1F3AC}', '\u{1F4E9}', '\u{1F4AC}', '\u{2728}',
]

type FilterKey = 'all' | 'unread' | 'active' | 'completed'
const FILTER_DEFS: [FilterKey, string][] = [['all', 'All'], ['unread', 'Unread'], ['active', 'Active'], ['completed', 'Completed']]

function statusMeta(status: string): { label: string; dot: string; color: string } {
  if (TERMINAL_STATUSES.includes(status)) {
    if (status === 'declined' || status === 'cancelled') return { label: 'Declined', dot: 'var(--danger, #d2545a)', color: 'var(--danger, #d2545a)' }
    return { label: 'Completed', dot: 'var(--sec-ink, #4a5c3a)', color: 'var(--ink-soft)' }
  }
  if (status === 'negotiating') return { label: 'Negotiating', dot: 'var(--warning)', color: 'var(--warning)' }
  return { label: status.charAt(0).toUpperCase() + status.slice(1), dot: 'var(--neon-deep)', color: 'var(--ink)' }
}

function formatRupees(paise: number): string {
  if (paise === 0) return '\u20B90'
  const rupees = paise / 100
  if (rupees >= 100000) {
    const l = rupees / 100000
    return `\u20B9${l.toFixed(l >= 10 ? 0 : 1).replace(/\.0$/, '')}L`
  }
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

export default function BrandInboxView({
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
  const [filter, setFilter] = useState<FilterKey>('all')
  const [query, setQuery] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const emojiRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const knownIdsRef = useRef(new Set(allMessages.map((m) => m.id)))

  useRealtimeMessages(
    selected,
    (msg) => {
      knownIdsRef.current.add(msg.id)
      setMessagesByDeal((prev) => ({
        ...prev,
        [msg.deal_id]: [...(prev[msg.deal_id] ?? []), msg],
      }))
      playGuapSound()
    },
    knownIdsRef,
  )

  const counts = useMemo(() => ({
    all: threads.length,
    unread: 0,
    active: threads.filter((t) => ACTIVE_STATUSES.includes(t.dealStatus)).length,
    completed: threads.filter((t) => TERMINAL_STATUSES.includes(t.dealStatus)).length,
  }), [threads])

  const filteredThreads = useMemo(() => {
    let list = threads
    if (filter === 'active') list = list.filter((t) => ACTIVE_STATUSES.includes(t.dealStatus))
    else if (filter === 'completed') list = list.filter((t) => TERMINAL_STATUSES.includes(t.dealStatus))
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((t) => (t.creatorName + ' ' + t.dealTitle).toLowerCase().includes(q))
    }
    return list
  }, [threads, filter, query])

  const selectedThread = threads.find((t) => t.dealId === selected)
  const selectedMessages = selected ? (messagesByDeal[selected] ?? []) : []
  const isTerminal = selectedThread ? TERMINAL_STATUSES.includes(selectedThread.dealStatus) : false

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selected, selectedMessages.length])

  useEffect(() => {
    if (mobileChat) inputRef.current?.focus()
  }, [mobileChat])

  useEffect(() => {
    if (!emojiOpen) return
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [emojiOpen])

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
    const result = await sendMessage(selected, trimmed, 'brand')
    setSending(false)
    if (result.status === 'error') {
      setError(result.message ?? 'Failed to send')
      return
    }
    const msg = { id: result.data!.id, deal_id: selected, sender_party: result.data!.sender_party, body: result.data!.body, created_at: result.data!.created_at } as Message
    knownIdsRef.current.add(msg.id)
    setMessagesByDeal((prev) => ({
      ...prev,
      [selected]: [...(prev[selected] ?? []), msg],
    }))
    setBody('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e as unknown as React.FormEvent)
    }
  }

  if (threads.length === 0) {
    return (
      <div style={{ maxWidth: 1080, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(20px,2vw,24px)', letterSpacing: '-0.02em', marginTop: 20 }}>
          No conversations yet
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)', marginTop: 8, maxWidth: 300, lineHeight: 1.5 }}>
          Messages will appear here when you start a deal thread with a creator.
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', width: '100%', padding: 'clamp(14px,2vw,22px) clamp(14px,2.4vw,26px) clamp(16px,2vw,24px)', boxSizing: 'border-box', overflow: 'hidden' }}>
    <div style={{
      display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)',
      borderRadius: 26, overflow: 'hidden',
      border: '1px solid var(--frost-edge, #e5e5dc)',
      background: 'var(--card)',
      boxShadow: '0 34px 66px -34px rgba(40,45,25,.42),inset 0 1px 0 rgba(255,255,255,.9)',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'clamp(12px,2vw,22px)',
        padding: '16px clamp(16px,2vw,24px)',
        borderBottom: '1px solid var(--border-hairline, #EAEAE3)',
        background: 'var(--card)',
      }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(20px,2vw,24px)', letterSpacing: '-0.02em', margin: 0, flexShrink: 0 }}>
          Inbox
        </h1>
        <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creators or deals"
            style={{
              width: '100%', padding: '10px 15px 10px 39px',
              borderRadius: 'var(--radius-pill, 999px)',
              border: '1px solid var(--border-hairline, #EAEAE3)',
              background: 'var(--card)', fontSize: 13.5, color: 'var(--ink)', outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>
          {FILTER_DEFS.map(([key, label]) => (
            <div
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius-pill, 999px)',
                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                whiteSpace: 'nowrap', cursor: 'pointer',
                ...(filter === key
                  ? { color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--frost-edge, #e5e5dc)', boxShadow: '0 4px 12px -8px rgba(40,45,25,.5)' }
                  : { color: 'var(--ink-faint)', background: 'transparent', border: '1px solid transparent' }),
              }}
            >
              {label} {counts[key]}
            </div>
          ))}
        </div>
      </div>

      {/* Body: list + thread */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* Conversation list */}
        <div className="inbox-left" style={{
          width: 340, flexShrink: 0, overflowY: 'auto', padding: 12,
          borderRight: '1px solid var(--border-hairline, #EAEAE3)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {filteredThreads.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)' }}>
              No conversations match
            </div>
          ) : (
            filteredThreads.map((t) => {
              const sm = statusMeta(t.dealStatus)
              const isSelected = t.dealId === selected
              return (
                <div
                  key={t.dealId}
                  onClick={() => selectThread(t.dealId)}
                  style={{
                    display: 'flex', gap: 12, padding: '13px 12px 13px 9px', borderRadius: 14, cursor: 'pointer',
                    borderLeft: `3px solid ${isSelected ? 'var(--neon-deep)' : 'transparent'}`,
                    background: 'transparent',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {t.creatorPhoto ? (
                      <img src={t.creatorPhoto} alt={t.creatorName} style={{
                        width: 44, height: 44, borderRadius: 13, objectFit: 'cover',
                        border: '1px solid var(--border-hairline, #EAEAE3)',
                      }} />
                    ) : (
                      <div style={{
                        width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5,
                        color: 'var(--sec-ink, #4a5c3a)', background: 'var(--sec-2, #f5f5f0)',
                      }}>
                        {t.creatorInitials}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.creatorName}
                      </span>
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', flexShrink: 0 }}>
                        {formatTimeAgo(t.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.dealTitle}
                    </div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 5, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.senderParty === 'brand' ? 'You: ' : ''}{t.lastMessage}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: sm.color, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.dot, flexShrink: 0 }} />
                        {sm.label}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Thread panel */}
        <div className={mobileChat ? 'inbox-right inbox-right-open' : 'inbox-right'} style={{ flex: 1, minWidth: 0, padding: 'clamp(12px,1.6vw,18px)' }}>
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden',
            background: 'var(--card)', border: '1px solid var(--frost-edge, #e5e5dc)',
            boxShadow: '0 26px 54px -34px rgba(40,45,25,.42),inset 0 1px 0 rgba(255,255,255,.9)',
          }}>
            {selectedThread ? (
              <>
                {/* Thread header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-hairline, #EAEAE3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <button onClick={() => setMobileChat(false)} className="inbox-back-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 4, display: 'none', alignItems: 'center' }} aria-label="Back">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      {selectedThread.creatorPhoto ? (
                        <img src={selectedThread.creatorPhoto} alt={selectedThread.creatorName} style={{
                          width: 46, height: 46, borderRadius: 13, objectFit: 'cover',
                          border: '1px solid var(--border-hairline, #EAEAE3)',
                        }} />
                      ) : (
                        <div style={{
                          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                          color: 'var(--sec-ink, #4a5c3a)', background: 'var(--sec-2, #f5f5f0)',
                        }}>
                          {selectedThread.creatorInitials}
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, lineHeight: 1.2 }}>
                          {selectedThread.creatorName}
                        </div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', marginTop: 3 }}>
                          {selectedThread.dealTitle} · {statusMeta(selectedThread.dealStatus).label}
                        </div>
                      </div>
                    </div>
                    {selectedThread.amountPaise > 0 && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>
                          {formatRupees(selectedThread.amountPaise)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <a
                      href={`/deals/${selectedThread.dealId}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                        color: 'var(--ink-soft)', textDecoration: 'none',
                      }}
                    >
                      View deal
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                    </a>
                  </div>
                </div>

                {/* Messages */}
                <div style={{
                  flex: 1, overflowY: 'auto', padding: 22,
                  display: 'flex', flexDirection: 'column', gap: 14,
                  background: 'linear-gradient(180deg,rgba(247,250,253,.6),rgba(255,255,255,0))',
                }}>
                  {selectedMessages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)' }}>
                        No messages yet. Start the conversation.
                      </p>
                    </div>
                  ) : (
                    <>
                      {selectedMessages.map((msg) => {
                        const isBrand = msg.sender_party === 'brand'
                        return (
                          <div key={msg.id} style={{ display: 'flex', justifyContent: isBrand ? 'flex-end' : 'flex-start' }}>
                            <div style={{ maxWidth: '74%' }}>
                              <div style={{
                                padding: '11px 15px',
                                borderRadius: isBrand ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                background: isBrand ? '#16170F' : 'var(--sec-2, #f5f5f0)',
                                color: isBrand ? 'var(--card)' : 'var(--ink)',
                                fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1.5,
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                ...(isBrand ? {} : { boxShadow: '0 8px 20px -16px rgba(40,45,25,.4)' }),
                              }}>
                                {msg.body}
                              </div>
                              <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)',
                                marginTop: 5, textAlign: isBrand ? 'right' : 'left',
                              }}>
                                {isBrand ? 'You' : 'Creator'} · {new Date(msg.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      <div ref={bottomRef} />
                    </>
                  )}
                </div>

                {/* Composer */}
                {isTerminal ? (
                  <div style={{
                    padding: '18px 22px', borderTop: '1px solid var(--border-hairline, #EAEAE3)',
                    background: 'rgba(247,249,252,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)' }}>
                      This deal is {selectedThread.dealStatus}, so messaging is closed.
                    </span>
                  </div>
                ) : (
                  <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div ref={emojiRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="Write a message..."
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={sending}
                        style={{
                          width: '100%', padding: '12px 44px 12px 16px', borderRadius: 12,
                          border: '1.5px solid var(--border-hairline, #EAEAE3)',
                          background: 'var(--card)', fontSize: 14, color: 'var(--ink)', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setEmojiOpen((v) => !v)}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 30, height: 30, borderRadius: 8, border: 'none',
                          background: 'none', cursor: 'pointer', padding: 0,
                        }}
                        aria-label="Emoji"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={emojiOpen ? 'var(--ink)' : 'var(--ink-faint)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                          <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
                          <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
                        </svg>
                      </button>
                      {emojiOpen && (
                        <div style={{
                          position: 'absolute', bottom: 48, right: 0, zIndex: 10,
                          background: 'var(--card)', border: '1px solid var(--frost-edge, #e5e5dc)',
                          borderRadius: 16, padding: 12, boxShadow: '0 12px 32px -8px rgba(40,45,25,.25)',
                          width: 280,
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
                            {EMOJI_LIST.map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => { setBody((b) => b + em); setEmojiOpen(false); inputRef.current?.focus() }}
                                style={{
                                  background: 'none', border: 'none', fontSize: 20, cursor: 'pointer',
                                  borderRadius: 8, padding: '6px 0',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleSend(e as unknown as React.FormEvent)}
                      disabled={sending || !body.trim()}
                      className="neonbtn"
                      style={{
                        flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 44, height: 44, borderRadius: 14, border: 'none',
                        background: 'var(--neon)',
                        boxShadow: '0 8px 18px -8px rgba(180,210,60,.85)',
                        cursor: sending || !body.trim() ? 'not-allowed' : 'pointer',
                        opacity: sending || !body.trim() ? 0.5 : 1,
                      }}
                    >
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
                      </svg>
                    </button>
                  </div>
                )}
                {error && (
                  <div style={{ padding: '0 18px 10px', fontFamily: 'var(--font-ui)', fontSize: 12, color: '#dc2626' }}>
                    {error}
                  </div>
                )}
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(20px,2vw,24px)', letterSpacing: '-0.02em', marginTop: 20 }}>
                  Select a conversation to view messages
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)', marginTop: 8, maxWidth: 300, lineHeight: 1.5 }}>
                  Pick a conversation from the list to see the thread and deal details.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .inbox-left { width: 100% !important; }
          .inbox-right { display: none !important; position: absolute; inset: 0; z-index: 5; }
          .inbox-right-open { display: flex !important; }
          .inbox-back-btn { display: flex !important; }
        }
      `}</style>
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
