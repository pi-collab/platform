'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { trackEvent } from '@/lib/analytics'

/**
 * The short Guapd AI intro: what it is, three steps, what is included now,
 * "Start with a brief", and two "Coming soon" rows that start nothing (a tap
 * opens a note with an optional one-line message). The Instagram block shows
 * only when Creator Marketplace is on in this environment.
 */
export const COMING_SOON = [
  { id: 'write_brief', label: 'Write your brief with Guapd AI' },
  { id: 'campaigns', label: 'Create and send campaigns with Guapd AI' },
] as const

export default function AiIntro({ instagram }: { instagram: { connected: boolean } | null }) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  useEffect(() => { trackEvent('ai_intro_seen') }, [])

  async function send(feature: string) {
    await fetch('/api/ai/interest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, ...(note.trim() ? { note: note.trim() } : {}) }) }).catch(() => {})
    setSent(feature); setNote('')
  }

  return (
    <div className="gai gai-intro">
      <header className="gai-head">
        <h1 className="gai-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>
          Guapd AI
        </h1>
        <p className="gai-sub">Describe the creators you want and get matches from creators on Guapd.</p>
      </header>

      <ol className="gai-steps">
        <li><span>1</span><div><strong>Describe your brief</strong><p>A sentence or a full campaign brief: who, where, what for.</p></div></li>
        <li><span>2</span><div><strong>Review ranked matches</strong><p>Each with a short reason it matched. Correct how your brief was read in one tap.</p></div></li>
        <li><span>3</span><div><strong>Send an offer</strong><p>Straight from a match, with the usual offer builder.</p></div></li>
      </ol>

      <div className="gai-included">
        <div className="gai-group-title">Included now</div>
        <p>Creators on Guapd. Verified numbers are marked Verified; anything else is marked self-reported.</p>
      </div>

      {instagram && (
        <div className="gai-included">
          <div className="gai-group-title">Optional: Instagram Creator Marketplace</div>
          <p>Connecting your brand&apos;s Instagram also searches Instagram&apos;s Creator Marketplace, including creators not on Guapd yet, whom you can invite. It needs a Facebook Page linked to your Instagram business account, and Instagram decides which accounts are eligible. You can skip it; Guapd AI works without it.</p>
          {!instagram.connected && <a className="gai-loosen" href="/api/meta/connect" onClick={() => trackEvent('ai_connect_clicked', { from: 'intro' })}>Connect Instagram</a>}
        </div>
      )}

      <Link href="/ai" className="gai-submit gai-intro-cta" onClick={() => trackEvent('ai_intro_cta_clicked')}>Start with a brief</Link>

      <div className="gai-soon" aria-label="Coming soon">
        <div className="gai-group-title">Coming soon</div>
        {COMING_SOON.map((row) => (
          <div key={row.id} className="gai-soon-row">
            <button type="button" className="gai-soon-btn" aria-disabled="true" aria-expanded={openRow === row.id}
              onClick={() => { setOpenRow(openRow === row.id ? null : row.id); setSent(null); trackEvent('ai_coming_soon_clicked', { row: row.id }) }}>
              <span>{row.label}</span><em>Coming soon</em>
            </button>
            {openRow === row.id && (
              <div className="gai-soon-note" role="note">
                {sent === row.id ? <p>Thanks. We read every note.</p> : (<>
                  <p>We&apos;re building this. Tell us what you&apos;d want it to do.</p>
                  <div className="gai-soon-form">
                    <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Optional, one line" aria-label="What you'd want it to do" />
                    <button type="button" className="gai-loosen" onClick={() => void send(row.id)}>Send</button>
                  </div>
                </>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
