'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { CHANNELS, channelLabel } from '@/lib/experience-request'
import type { ConsoleDeliverables, ConsoleItem, ConsoleShootLeg } from '@/lib/experience-console-server'
import { attachItem, openItemFile, recordBrandDecision, releaseItems, reviewItem, startItemUpload, withdrawRelease } from '../actions'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * Deliverables (staff console, operational). Who provides them is the
 * template's setting, snapshotted onto the Experience: Guapd attaches them
 * (Kiro) or the creator submits them. Either way Guapd reviews, then chooses
 * which approved items to SHARE with the brand. The brand sees only what is
 * shared, at the version shared (brand_experience_deliverables, 0538).
 *
 * The readiness box is one of the checks Complete is gated on (0540, see
 * CompletionPanel). No money here.
 */
const ITEM: Record<string, { label: string; tone: ChipTone }> = {
  pending:   { label: 'Waiting for content', tone: 'neutral' },
  submitted: { label: 'To review', tone: 'amber' },
  revision:  { label: 'Changes asked', tone: 'red' },
  approved:  { label: 'Approved by Guapd', tone: 'lime' },
}
const BRAND: Record<string, { label: string; tone: ChipTone }> = {
  none:              { label: 'Shared · awaiting brand', tone: 'blue' },
  approved:          { label: 'Brand approved', tone: 'green' },
  changes_requested: { label: 'Brand asked for changes', tone: 'red' },
}
const DECISION_CHANNELS = CHANNELS.filter(([k]) => k !== 'portal')

type Ask =
  | { kind: 'revision'; item: ConsoleItem }
  | { kind: 'withdraw'; item: ConsoleItem }
  | { kind: 'decide'; item: ConsoleItem }
  | { kind: 'share' }

export default function DeliverablesPanel({ experienceId, data }: { experienceId: string; data: ConsoleDeliverables }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [text, setText] = useState('')
  const [decision, setDecision] = useState<'approved' | 'changes_requested'>('approved')
  const [channel, setChannel] = useState<string>('whatsapp')
  const [attachFor, setAttachFor] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busyUpload, setBusyUpload] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const { status, owner, progress } = data
  const legs = data.legs.filter((l) => l.shoot_outcome === 'done')
  const skipped = data.legs.filter((l) => l.shoot_outcome === 'did_not_shoot')
  const writable = ['shoot_scheduled', 'shoot_done', 'delivering'].includes(status)
  const sharing = status === 'shoot_done' || status === 'delivering'

  const done = (msg?: string) => { setAsk(null); setText(''); setAttachFor(null); setLink(''); setFile(null); if (msg) setNotice(msg); router.refresh() }
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (d: unknown) => void) => {
    setError(null); setNotice(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      after ? after(r.data) : done()
    })
  }

  const shareable = (i: ConsoleItem) => sharing && i.item_status === 'approved' && i.release?.brand_decision !== 'approved'
    && (!i.release || i.release.item_version < i.version)
  const allShareable = legs.flatMap((l) => l.items.filter(shareable))
  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])

  const attach = (item: ConsoleItem) => {
    setError(null); setNotice(null)
    if (file) {
      setBusyUpload(true)
      start(async () => {
        try {
          const slot = await startItemUpload(item.id, file.name)
          if (!slot.ok) { setError(slot.error); return }
          const { error: upErr } = await createBrowserClient().storage.from('deliverables')
            .uploadToSignedUrl(slot.data.path, slot.data.token, file, { contentType: file.type || undefined })
          if (upErr) { setError(upErr.message || 'Upload failed. Try again.'); return }
          const r = await attachItem(experienceId, item.id, { storagePath: slot.data.path, fileName: file.name })
          if (!r.ok) { setError(r.error); return }
          done(`${item.label}: version ${r.data} attached.`)
        } finally { setBusyUpload(false) }
      })
    } else {
      run(() => attachItem(experienceId, item.id, { url: link }), (v) => done(`${item.label}: version ${v} attached.`))
    }
  }

  const openFile = async (item: ConsoleItem) => {
    const w = window.open('', '_blank')
    const r = await openItemFile(item.id)
    if (!r.ok) { w?.close(); setError(r.error); return }
    if (w) w.location.href = r.data; else window.location.href = r.data
  }

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
  const sel = selected.filter((id) => allShareable.some((i) => i.id === id))
  const overAfter = (() => {
    // A rough "would this over-share?" for the confirm dialog: the database counts exactly.
    const add = sel.map((id) => allShareable.find((i) => i.id === id))
      .filter((i) => i && !i.release && (i.type === 'UGC video' || i.type === 'Reel')).length
    return progress.videos_sold != null && (progress.videos_shared ?? 0) + add > progress.videos_sold
  })()

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Deliverables</h2>
          <div className="sect-rule" />
          <p className="t-body" style={{ margin: '10px 0 0', fontSize: 13 }}>
            {owner === 'guapd' ? 'Guapd provides the content on this Experience: attach each deliverable, approve it, then share it.' : 'Creators submit their deliverables here; Guapd reviews, then shares.'}
            {' '}The brand sees only what you share, at the version you shared.
          </p>
        </div>
        {sharing && (
          <button type="button" className="neonbtn" style={{ ...neonBtn, opacity: sel.length === 0 ? 0.45 : 1, cursor: sel.length === 0 ? 'default' : 'pointer' }} disabled={pending || sel.length === 0}
            title={sel.length === 0 ? 'Tick the approved deliverables to share' : undefined} onClick={() => { setError(null); setAsk({ kind: 'share' }) }}>
            Share with the brand{sel.length ? ` (${sel.length})` : ''}
          </button>
        )}
      </div>

      {/* ── Shared vs sold, and readiness for sign-off ── */}
      {progress.reason !== 'no_agreed_plan' && (
        <div role="status" style={{ marginTop: 16, padding: '14px 16px', borderRadius: 14,
          background: progress.over_shared ? '#FCF6E4' : progress.ready ? '#F4FBDC' : '#F7F7F4',
          border: `1px solid ${progress.over_shared ? '#C89A3C40' : progress.ready ? '#8FAF1F40' : 'var(--hairline)'}` }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            Shared {progress.videos_shared ?? 0} · sold {progress.videos_sold ?? 0} videos
            <span style={{ fontWeight: 500, color: 'var(--ink-soft)', marginLeft: 8 }}>{progress.videos_approved ?? 0} approved by the brand</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>
            {progress.lines.filter((l) => !l.is_video || progress.per_type).map((l) => (
              <span key={l.type}>{l.type}: shared {l.shared} · sold {l.sold} · approved {l.approved}</span>
            ))}
          </div>
          {progress.over_shared && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: '#8C6417', marginTop: 6 }}>More shared than the brand bought. That is allowed (a bonus), just make sure it is meant.</div>}
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: progress.ready ? 'var(--ink)' : 'var(--ink-soft)', marginTop: 6 }}>
            {progress.ready ? 'Ready for sign-off: everything sold is approved by the brand.' : `Not ready for sign-off yet${progress.gaps.length ? `: ${progress.gaps.map((g) => `${g.type} ${g.approved} of ${g.sold} approved`).join(', ')}` : ''}.`}
            {' '}Complete waits for this (see Completion).
          </div>
        </div>
      )}

      {error && !ask && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}
      {notice && <div role="status" style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: '#F4FBDC', fontFamily: 'var(--font-ui)', fontSize: 13 }}>{notice}</div>}

      {legs.length === 0 && (
        <p className="t-body" style={{ margin: '16px 0 0' }}>Deliverables open per creator once their shoot is recorded as done.</p>
      )}

      {legs.map((l: ConsoleShootLeg) => (
        <div key={l.roster_id} style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{l.full_name}</span>
            <span style={{ ...kpiLabel, fontSize: 10.5 }}>{l.items.filter((i) => i.item_status === 'approved').length} of {l.items.length} approved</span>
          </div>
          {l.items.map((i) => {
            const st = ITEM[i.item_status] ?? ITEM.pending
            const rel = i.release ? BRAND[i.release.brand_decision ?? 'none'] : null
            const canAttach = writable && owner === 'guapd' && i.item_status !== 'approved'
            const canReview = writable && (i.item_status === 'submitted' || (i.item_status === 'approved' && i.release?.brand_decision !== 'approved'))
            return (
              <div key={i.id} style={{ borderTop: '1px solid var(--hairline)', padding: '12px 4px' }}>
                <div className="xp-drow" style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1.2fr) minmax(0, 1.6fr) minmax(0, 1.3fr)', gap: 12, alignItems: 'start' }}>
                  <input type="checkbox" aria-label={`Share ${i.label}`} disabled={!shareable(i)} checked={sel.includes(i.id)} onChange={() => toggle(i.id)}
                    style={{ width: 18, height: 18, marginTop: 3, accentColor: 'var(--lime-600, #6E8F12)', visibility: sharing ? 'visible' : 'hidden' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                      {i.label}{i.version > 1 ? <span style={{ fontWeight: 500, color: 'var(--ink-faint)' }}> · v{i.version}</span> : null}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <StatusChip label={st.label} tone={st.tone} />
                      {rel && <StatusChip label={rel.label} tone={rel.tone} />}
                      {i.affiliate_link && <StatusChip label="Affiliate link" tone="violet" />}
                    </div>
                  </div>
                  <div className="t-body" style={{ fontSize: 13, color: 'var(--ink-soft)', minWidth: 0 }}>
                    {i.external_url && <a href={i.external_url} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>{i.external_url}</a>}
                    {i.has_file && <button type="button" onClick={() => openFile(i)} style={{ ...pillBtn, height: 30, fontSize: 12.5 }}>Open {i.file_name}</button>}
                    {!i.external_url && !i.has_file && <span>{owner === 'guapd' ? 'Nothing attached yet.' : 'The creator has not submitted yet.'}</span>}
                    {i.submitted_at && <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 4 }}>{i.submitted_via === 'creator' ? 'Submitted by the creator' : 'Attached by Guapd'} {fmt(i.submitted_at)}</div>}
                    {i.note && i.item_status === 'revision' && <div style={{ fontSize: 12.5, color: '#9C4147', marginTop: 4 }}>Asked: {i.note}</div>}
                    {i.release && (
                      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 4 }}>
                        Brand has v{i.release.item_version}, shared {fmt(i.release.released_at)}
                        {i.release.brand_decision && ` · ${i.release.brand_decision === 'approved' ? 'approved' : 'changes asked'} via ${channelLabel(i.release.brand_decision_channel)}`}
                        {i.release.brand_decision_note && <div style={{ color: '#8C6417' }}>Brand: {i.release.brand_decision_note}</div>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {canAttach && <button type="button" style={{ ...pillBtn, height: 32 }} onClick={() => { setError(null); setAttachFor(attachFor === i.id ? null : i.id); setLink(''); setFile(null) }}>{i.external_url || i.has_file ? 'New version' : 'Attach'}</button>}
                    {canReview && i.item_status === 'submitted' && <button type="button" className="neonbtn" style={{ ...neonBtn, height: 32, padding: '0 14px' }} disabled={pending} onClick={() => run(() => reviewItem(experienceId, i.id, 'approve', null))}>Approve</button>}
                    {canReview && <button type="button" style={{ ...pillBtn, height: 32 }} onClick={() => { setText(''); setError(null); setAsk({ kind: 'revision', item: i }) }}>Ask for changes</button>}
                    {i.release && i.release.brand_decision !== 'approved' && writable && (
                      <>
                        <button type="button" style={{ ...pillBtn, height: 32 }} onClick={() => { setText(''); setDecision('approved'); setChannel('whatsapp'); setError(null); setAsk({ kind: 'decide', item: i }) }}>Brand&apos;s answer</button>
                        <button type="button" style={{ ...pillBtn, height: 32 }} onClick={() => { setText(''); setError(null); setAsk({ kind: 'withdraw', item: i }) }}>Withdraw</button>
                      </>
                    )}
                  </div>
                </div>

                {attachFor === i.id && (
                  <div style={{ marginTop: 10, padding: 14, borderRadius: 14, background: '#F7F7F4', display: 'grid', gap: 10 }}>
                    <div>
                      <label style={fieldLabel} htmlFor={`link-${i.id}`}>Link (Drive, Frame.io, Instagram…)</label>
                      <input id={`link-${i.id}`} className="dinput" value={link} disabled={!!file} placeholder="https://" onChange={(e) => setLink(e.target.value)} />
                    </div>
                    <div>
                      <label style={fieldLabel} htmlFor={`file-${i.id}`}>Or a file (video, image, PDF, audio or zip)</label>
                      <input id={`file-${i.id}`} type="file" accept="video/*,image/*,application/pdf,audio/*,.zip" disabled={!!link.trim()}
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button type="button" style={pillBtn} onClick={() => setAttachFor(null)}>Cancel</button>
                      <button type="button" className="neonbtn" style={{ ...neonBtn, height: 40 }} disabled={pending || busyUpload || (!file && !link.trim())} onClick={() => attach(i)}>
                        {busyUpload ? 'Uploading…' : pending ? 'Saving…' : 'Attach'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {skipped.length > 0 && (
        <p className="t-body" style={{ margin: '16px 0 0', fontSize: 12.5, color: 'var(--ink-faint)' }}>
          {skipped.map((l) => l.full_name).join(', ')} did not shoot, so {skipped.length === 1 ? 'has' : 'have'} no deliverables here.
        </p>
      )}

      <ConfirmDialog open={ask?.kind === 'share'} title={`Share ${sel.length} deliverable${sel.length === 1 ? '' : 's'} with the brand`}
        body={`The brand's team will see ${sel.length === 1 ? 'it' : 'them'} on their Experience page, with the creator's name only, and is told in the app and by email. A newer version replaces the one they have. You can withdraw until they approve.`}
        detail={overAfter || error ? <>
          {overAfter && <div style={{ ...formError, background: '#FCF6E4', color: '#8C6417', border: '1px solid #C89A3C40', marginTop: 10 }}>This shares more videos than the brand bought.</div>}
          {error && <div role="alert" style={{ ...formError, marginTop: 10 }}>{error}</div>}
        </> : undefined}
        confirmLabel="Share" busy={pending}
        onConfirm={() => run(() => releaseItems(experienceId, sel), (d) => { setSelected([]); done(`${(d as { released: number }).released} shared with the brand.`) })}
        onCancel={() => setAsk(null)} />

      <ConfirmDialog open={!!ask && ask.kind !== 'share'} tone={ask?.kind === 'withdraw' ? 'danger' : undefined}
        title={ask && ask.kind !== 'share' ? (ask.kind === 'revision' ? `Ask for changes: ${ask.item.label}` : ask.kind === 'withdraw' ? `Withdraw ${ask.item.label} from the brand` : `The brand's answer on ${ask.item.label}`) : ''}
        body={ask?.kind === 'revision' ? (owner === 'creator' ? 'The creator sees your note and submits a new version.' : 'Recorded for the team. Attach a new version when it is ready.')
          : ask?.kind === 'withdraw' ? 'The brand stops seeing it. The reason is recorded for the team, not shown to the brand.'
          : 'Record what the brand told Guapd. Approval is final for this deliverable.'}
        detail={<div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {ask?.kind === 'decide' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select className="dinput" aria-label="Decision" value={decision} onChange={(e) => setDecision(e.target.value as 'approved' | 'changes_requested')} style={{ flex: 1, minWidth: 160 }}>
                <option value="approved">Approved</option>
                <option value="changes_requested">Asked for changes</option>
              </select>
              <select className="dinput" aria-label="How they told us" value={channel} onChange={(e) => setChannel(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
                {DECISION_CHANNELS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={fieldLabel} htmlFor="deliv-note">{ask?.kind === 'withdraw' ? 'Why' : ask?.kind === 'decide' ? (decision === 'changes_requested' ? 'What they asked to change' : 'Note (optional)') : 'What needs to change'}</label>
            <textarea id="deliv-note" className="dinput" rows={3} maxLength={ask?.kind === 'withdraw' ? 300 : 1000} value={text} onChange={(e) => setText(e.target.value)} style={{ height: 'auto', padding: '10px 12px' }} />
          </div>
          {error && <div role="alert" style={formError}>{error}</div>}
        </div>}
        confirmLabel={ask?.kind === 'withdraw' ? 'Withdraw' : ask?.kind === 'decide' ? 'Record' : 'Send back'} busy={pending}
        onConfirm={() => {
          if (!ask || ask.kind === 'share') return
          const it = ask.item
          if (ask.kind === 'revision') run(() => reviewItem(experienceId, it.id, 'revision', text))
          else if (ask.kind === 'withdraw' && it.release) run(() => withdrawRelease(experienceId, it.release!.id, text))
          else if (ask.kind === 'decide' && it.release) run(() => recordBrandDecision(experienceId, it.release!.id, decision, channel, text || null))
        }}
        onCancel={() => setAsk(null)} />

      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 720px) { .xp-drow { grid-template-columns: 18px minmax(0, 1fr) !important; } .xp-drow > :nth-child(3), .xp-drow > :nth-child(4) { grid-column: 2; justify-content: flex-start !important; } }' }} />
    </section>
  )
}
