'use client'

import { useState, useTransition } from 'react'
import { draftCreatorBio } from '@/app/creator/dashboard/bio-actions'

/**
 * "Write it with AI" for a bio field, wherever a creator edits their bio
 * (settings, storefront editor). It only FILLS the box: the page's own Save is
 * still what stores it, so a draft is always read before it goes anywhere.
 *
 * The dashboard task has the same button inline; this is the same action for
 * creators whose bio already exists and so never see that task.
 */
export default function BioAiAssist({ onDraft, hasBio }: { onDraft: (bio: string) => void; hasBio: boolean }) {
  const [drafting, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function draft() {
    setError(null)
    setNote(null)
    start(async () => {
      const res = await draftCreatorBio()
      if (!res.ok) { setError(res.message); return }
      onDraft(res.bio)
      setNote(res.thin
        ? 'A starting point from your niche and city. Connect Instagram for a draft that knows your content. Edit it, then save.'
        : 'Drafted from your profile. Check every line is true and sounds like you, then save.')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={draft}
          disabled={drafting}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 999, border: '1px solid var(--ink, #181C24)',
            background: '#fff', color: 'var(--ink, #181C24)',
            fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
            cursor: drafting ? 'wait' : 'pointer', opacity: drafting ? 0.6 : 1,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
          {drafting ? 'Writing…' : hasBio ? 'Rewrite with AI' : 'Write it with AI'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--ink-faint, #8B90A0)' }}>
          Not sure what to say? AI drafts one from your Instagram and YouTube profile.
        </span>
      </div>
      {note && <span style={{ fontSize: 12, color: '#92400e' }}>{note}</span>}
      {error && <span role="alert" style={{ fontSize: 12, fontWeight: 600, color: '#9B3030' }}>{error}</span>}
    </div>
  )
}
