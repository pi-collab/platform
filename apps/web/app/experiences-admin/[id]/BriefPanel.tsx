'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import BriefEditor, { type BriefEditorActions, type BriefEditorAttachment } from '@/components/BriefEditor'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { BriefDoc, ConsoleBrief } from '@/lib/experience-console-server'
import { briefAttachmentLink, saveCreatorOwnBrief, saveExperienceBrief, uploadExperienceBriefAttachment } from '../actions'
import { card, pillBtn } from '../ui'

/**
 * The brief creators get (0546). The same editor as a campaign brief
 * (components/BriefEditor): the brief, attachments, creative guidelines and
 * what to avoid. One brief for everyone by default; any creator can be
 * switched to their own. Editable until the shoot is confirmed, then locked.
 * Every creator who sees a changed brief on a sent deal is told.
 *
 * A creator only ever sees their own brief (theirs, else the shared one):
 * creator_leg_context picks it in Postgres. No price or creator money here.
 */
type Creator = { roster_id: string; full_name: string; has_own_brief: boolean; sent: boolean }

const atts = (d: BriefDoc | null | undefined): BriefEditorAttachment[] =>
  (d?.attachments ?? []).map((a) => ({ name: a.name, storage_path: a.storage_path, size_bytes: Number(a.size_bytes ?? 0), content_type: a.content_type ?? '' }))

export default function BriefPanel({ experienceId, brief, creators }: { experienceId: string; brief: ConsoleBrief; creators: Creator[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [backToShared, setBackToShared] = useState<Creator | null>(null)
  const locked = !brief.editable
  const sentShared = creators.filter((c) => c.sent && !c.has_own_brief).length

  const common = {
    upload: async (fd: FormData) => {
      const r = await uploadExperienceBriefAttachment(experienceId, fd)
      return r.ok ? { attachment: { ...r.data, size_bytes: Number(r.data.size_bytes ?? 0) } } : { error: r.error }
    },
    open: async (path: string) => {
      const r = await briefAttachmentLink(experienceId, path)
      return r.ok ? { url: r.data } : { error: r.error }
    },
  }
  const sharedActions: BriefEditorActions = {
    ...common,
    save: async (pitch, guidelines, avoid, attachments) => {
      const r = await saveExperienceBrief(experienceId, { pitch, guidelines, avoid, attachments })
      if (r.ok) router.refresh()
      return { error: r.ok ? null : r.error }
    },
  }
  const ownActions = (c: Creator): BriefEditorActions => ({
    ...common,
    save: async (pitch, guidelines, avoid, attachments) => {
      const r = await saveCreatorOwnBrief(experienceId, c.roster_id, true, { pitch, guidelines, avoid, attachments })
      if (r.ok) router.refresh()
      return { error: r.ok ? null : r.error }
    },
  })

  const makeOwn = (c: Creator) => {
    setError(null)
    // Starts from the shared brief, so staff only change what differs.
    start(async () => {
      const r = await saveCreatorOwnBrief(experienceId, c.roster_id, true, brief.shared)
      if (!r.ok) { setError(r.error); return }
      setOpenFor(c.roster_id)
      router.refresh()
    })
  }
  const makeShared = (c: Creator) => {
    setError(null)
    start(async () => {
      const r = await saveCreatorOwnBrief(experienceId, c.roster_id, false, null)
      if (!r.ok) { setError(r.error); return }
      setBackToShared(null); setOpenFor(null)
      router.refresh()
    })
  }

  return (
    <section className="surface" style={card} aria-labelledby="xp-brief">
      <div className="xp-brief-head">
        <div>
          <h2 id="xp-brief" className="sect-head">Brief for creators</h2>
          <div className="sect-rule" />
        </div>
        <span className="xp-brief-state">
          {locked ? 'Locked: the shoot is confirmed'
            : sentShared > 0 ? `Editable until the shoot is confirmed · ${sentShared} creator${sentShared === 1 ? '' : 's'} on a sent deal ${sentShared === 1 ? 'is' : 'are'} told about changes`
            : 'Editable until the shoot is confirmed'}
        </span>
      </div>

      <div style={{ marginTop: 6 }}>
        <BriefEditor key={`shared-${brief.shared.updated_at ?? ''}`} actions={sharedActions} locked={locked}
          lockedNote="The brief is locked now that the shoot is confirmed."
          initialPitch={brief.shared.pitch} initialGuidelines={brief.shared.guidelines} initialAvoid={brief.shared.avoid}
          initialAttachments={atts(brief.shared)} />
      </div>

      {creators.length > 0 && (
        <div className="xp-brief-who">
          <div className="xp-brief-who-title">Who gets which brief</div>
          {creators.map((c) => {
            const own = brief.overrides[c.roster_id]
            const isOpen = openFor === c.roster_id
            return (
              <div key={c.roster_id} className="xp-brief-row">
                <div className="xp-brief-row-main">
                  <span className="xp-brief-name">{c.full_name}</span>
                  <div className="xp-seg" role="group" aria-label={`${c.full_name}'s brief`}>
                    <button type="button" className={c.has_own_brief ? '' : 'on'} aria-pressed={!c.has_own_brief} disabled={locked || pending || !c.has_own_brief}
                      onClick={() => setBackToShared(c)}>Same as everyone</button>
                    <button type="button" className={c.has_own_brief ? 'on' : ''} aria-pressed={c.has_own_brief} disabled={locked || pending || c.has_own_brief}
                      onClick={() => makeOwn(c)}>Own brief</button>
                  </div>
                  {c.has_own_brief && (
                    <button type="button" style={{ ...pillBtn, height: 32 }} onClick={() => setOpenFor(isOpen ? null : c.roster_id)}>
                      {isOpen ? 'Hide' : locked ? 'View' : 'View or edit'}
                    </button>
                  )}
                </div>
                {c.has_own_brief && isOpen && own && (
                  <div className="xp-brief-own">
                    <BriefEditor key={`own-${c.roster_id}-${own.updated_at ?? ''}`} actions={ownActions(c)} locked={locked}
                      lockedNote="Locked: the shoot is confirmed."
                      initialPitch={own.pitch} initialGuidelines={own.guidelines} initialAvoid={own.avoid} initialAttachments={atts(own)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && <div role="alert" className="xp-brief-error">{error}</div>}

      <ConfirmDialog open={!!backToShared} title={`Put ${backToShared?.full_name ?? 'this creator'} back on the shared brief`}
        body={`Their own brief is removed and they see the brief everyone else sees.${backToShared?.sent ? ' They are told the brief changed.' : ''}`}
        confirmLabel="Use the shared brief" busy={pending}
        onConfirm={() => backToShared && makeShared(backToShared)} onCancel={() => setBackToShared(null)} />

      <style dangerouslySetInnerHTML={{ __html: `
        .xp-brief-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .xp-brief-state { font-family: var(--font-ui); font-size: 12px; color: var(--ink-faint); padding-top: 4px; max-width: 420px; }
        .xp-brief-who { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--hairline); }
        .xp-brief-who-title { font-family: var(--font-ui); font-size: 10px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 6px; }
        .xp-brief-row { border-top: 1px solid var(--hairline); padding: 12px 0; }
        .xp-brief-row:first-of-type { border-top: 0; }
        .xp-brief-row-main { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .xp-brief-name { font-family: var(--font-ui); font-weight: 600; font-size: 14px; color: var(--ink); min-width: 160px; flex: 1; }
        .xp-seg { display: inline-flex; border: 1px solid var(--hairline); border-radius: 10px; padding: 3px; background: #F7F7F4; }
        .xp-seg button { height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; font-family: var(--font-ui); font-size: 12.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
        .xp-seg button.on { background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(22,23,15,.08); cursor: default; }
        .xp-seg button:disabled:not(.on) { opacity: .5; cursor: not-allowed; }
        .xp-brief-own { margin-top: 12px; padding: 16px; border-radius: 14px; background: #F7F7F4; }
        .xp-brief-error { margin-top: 12px; padding: 10px 14px; border-radius: 12px; background: #FDECEC; color: #9C4147; font-family: var(--font-ui); font-size: 13px; }
        @media (max-width: 720px) { .xp-brief-name { min-width: 100%; } }
      ` }} />
    </section>
  )
}
