'use client'

import { useState } from 'react'
import Link from 'next/link'
import { removeCampaignDraft, updateCampaignDraftNote, updateDealInternalNote } from './draft-actions'
import { useRouter } from 'next/navigation'
import DraftPlacementEditor from './DraftPlacementEditor'
import SendProposalsModal from './SendProposalsModal'
import { calculateFee } from '@/lib/fee'
import type { DraftPlacement } from './draft-actions'

interface Product {
  id: string
  platform: string
  handle: string
  product_type: string
  description: string | null
  price_paise: number
  display_price: boolean
  is_active: boolean
}

interface Draft {
  id: string
  campaign_id: string
  creator_id: string
  placements: DraftPlacement[]
  total_price_paise: number
  fee_percent: number
  fee_mode: 'on_top' | 'deducted'
  total_brand_paise: number
  note: string | null
  creator: {
    id: string
    full_name: string
    handle: string | null
    profile_photo_url: string | null
    niches: string[] | null
  }
}

interface CampaignDeal {
  dealId: string
  creatorId: string
  creatorName: string
  creatorPhoto: string | null
  deliverables: string
  pricePaise: number
  brandPaysPaise: number
  creatorReceivesPaise: number
  statusLabel: string
  statusColor: { bg: string; color: string }
  isPosted: boolean
  isPostable: boolean
  internalNote: string | null
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

function draftStatus(d: Draft): 'ready' | 'draft' {
  if (d.placements.length > 0 && d.total_price_paise > 0) return 'ready'
  return 'draft'
}

function placementSummary(placements: DraftPlacement[]): string {
  if (placements.length === 0) return 'No placements set'
  const counts = new Map<string, number>()
  for (const p of placements) {
    const h = p.handle ?? ''
    const key = `${p.label} (${p.platform} ${h.startsWith('@') ? h : `@${h}`})`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([k, n]) => (n > 1 ? `${n}× ${k}` : k))
    .join(' + ')
}

export default function CampaignRoster({
  drafts,
  productsMap,
  campaignId,
  campaignDeals,
}: {
  drafts: Draft[]
  productsMap: Record<string, Product[]>
  campaignId: string
  campaignDeals: CampaignDeal[]
}) {
  const router = useRouter()
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showSendModal, setShowSendModal] = useState(false)
  const [bulkRemoving, setBulkRemoving] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null) // "draft:{id}" or "deal:{id}"
  const [noteValue, setNoteValue] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Build set of creator IDs that already have deals in this campaign
  const sentCreatorIds = new Set(campaignDeals.map((d) => d.creatorId))

  const readyDrafts = drafts.filter((d) => draftStatus(d) === 'ready' && !sentCreatorIds.has(d.creator_id))
  const readyIds = new Set(readyDrafts.map((d) => d.id))
  const readyCount = readyDrafts.length
  const draftCount = drafts.filter((d) => draftStatus(d) === 'draft').length
  const sentCount = campaignDeals.length

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === readyCount) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(readyIds))
    }
  }

  async function handleRemove(draftId: string) {
    if (!confirm('Remove this creator from the campaign?')) return
    setRemovingId(draftId)
    await removeCampaignDraft(draftId, campaignId)
    setRemovingId(null)
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(draftId); return next })
    router.refresh()
  }

  async function handleBulkRemove() {
    if (selectedIds.size === 0) return
    if (!confirm(`Remove ${selectedIds.size} creator${selectedIds.size !== 1 ? 's' : ''} from the campaign?`)) return
    setBulkRemoving(true)
    for (const id of Array.from(selectedIds)) {
      await removeCampaignDraft(id, campaignId)
    }
    setSelectedIds(new Set())
    setBulkRemoving(false)
    router.refresh()
  }

  async function handleSaveNote(noteId: string) {
    setSavingNote(true)
    if (noteId.startsWith('deal:')) {
      await updateDealInternalNote(noteId.slice(5), noteValue)
    } else {
      await updateCampaignDraftNote(noteId.slice(6), noteValue)
    }
    setSavingNote(false)
    setEditingNoteId(null)
    router.refresh()
  }

  const totalRows = drafts.length + campaignDeals.length
  if (totalRows === 0) {
    return (
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
        No creators added yet. Use &quot;Add creators&quot; to build your campaign roster.
      </p>
    )
  }

  const selectedDrafts = drafts.filter((d) => selectedIds.has(d.id))

  return (
    <div>
      {/* Header: select-all + stage counts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
        {readyCount > 0 && (
          <input
            type="checkbox"
            checked={selectedIds.size === readyCount && readyCount > 0}
            onChange={toggleSelectAll}
            title={selectedIds.size === readyCount ? 'Deselect all' : 'Select all ready'}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#111' }}
          />
        )}
        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
          {totalRows} creator{totalRows !== 1 ? 's' : ''}
          {sentCount > 0 && ` · ${sentCount} sent`}
          {readyCount > 0 && ` · ${readyCount} ready`}
          {draftCount > 0 && ` · ${draftCount} draft`}
        </p>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.5rem 0.75rem', marginBottom: '0.5rem',
          background: '#f0f0f0', borderRadius: 6, border: '1px solid #e5e5e5',
        }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)' }}>
            {selectedIds.size} selected
          </span>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button onClick={handleBulkRemove} disabled={bulkRemoving} style={{ ...actionBtn, color: '#888' }}>
              {bulkRemoving ? 'Removing...' : 'Remove'}
            </button>
            <button onClick={() => setShowSendModal(true)} style={{ ...actionBtn, background: '#111', color: '#fff', border: '1px solid #111' }}>
              Send proposals
            </button>
          </div>
        </div>
      )}

      {/* Column header */}
      <div style={{ ...rowStyle, background: 'transparent', border: 'none', padding: '0 1rem 0.25rem', fontSize: '0.625rem', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        <div style={{ width: 16, flexShrink: 0 }} />
        <div style={{ flex: 2, minWidth: 0 }}>Creator</div>
        <div style={{ flex: 2, minWidth: 0 }}>Placements</div>
        <div style={{ width: 80, textAlign: 'center', flexShrink: 0 }}>Stage</div>
        <div style={{ width: 70, textAlign: 'right', flexShrink: 0 }}>Price</div>
        <div style={{ width: 80, textAlign: 'right', flexShrink: 0 }}>Brand pays</div>
        <div style={{ flex: 1, minWidth: 60 }}>Note</div>
        <div style={{ width: 90, textAlign: 'right', flexShrink: 0 }}>Actions</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {/* ── Sent deal rows (top) ── */}
        {campaignDeals.map((deal) => (
          <div key={`deal-${deal.dealId}`} style={{ ...rowStyle, border: '1px solid var(--color-border, #e5e5e5)', background: 'var(--glass-bg, #fafafa)' }}>
            {/* Checkbox — disabled for sent */}
            <input type="checkbox" disabled style={{ width: 16, height: 16, opacity: 0.2, flexShrink: 0 }} />

            {/* Creator */}
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              {deal.creatorPhoto ? (
                <img src={deal.creatorPhoto} alt={deal.creatorName} style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e5e5', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 30, height: 30, borderRadius: 6, background: '#f0f0f0', border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5625rem', fontWeight: 700, color: '#888', flexShrink: 0 }}>
                  {deal.creatorName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <Link href={`/browse/${deal.creatorId}`} style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {deal.creatorName}
                </Link>
              </div>
            </div>

            {/* Placements / deliverables */}
            <div style={{ flex: 2, minWidth: 0, fontSize: '0.75rem', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deal.deliverables || '—'}
            </div>

            {/* Stage — real deal status, linked to deal */}
            <div style={{ width: 80, textAlign: 'center', flexShrink: 0 }}>
              <Link href={`/deals/${deal.dealId}`} style={{ textDecoration: 'none' }}>
                <span style={{ ...badgeStyle, background: deal.statusColor.bg, color: deal.statusColor.color }}>
                  {deal.statusLabel}
                </span>
              </Link>
              {deal.isPostable && (
                <span style={{ ...badgeStyle, marginLeft: 3, fontSize: '0.5rem', background: deal.isPosted ? '#dcfce7' : '#fef9c3', color: deal.isPosted ? '#166534' : '#854d0e' }}>
                  {deal.isPosted ? 'Posted' : 'Awaiting'}
                </span>
              )}
            </div>

            {/* Price (creator receives) */}
            <div style={{ width: 70, textAlign: 'right', flexShrink: 0 }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#555' }}>
                {formatRupees(deal.creatorReceivesPaise)}
              </span>
            </div>

            {/* Brand pays */}
            <div style={{ width: 80, textAlign: 'right', flexShrink: 0 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)' }}>
                {formatRupees(deal.brandPaysPaise)}
              </span>
            </div>

            {/* Note (internal, brand-only) */}
            <div style={{ flex: 1, minWidth: 60 }}>
              {editingNoteId === `deal:${deal.dealId}` ? (
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <input
                    value={noteValue}
                    onChange={(e) => setNoteValue(e.target.value)}
                    placeholder="Internal note..."
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNote(`deal:${deal.dealId}`); if (e.key === 'Escape') setEditingNoteId(null) }}
                    style={{ flex: 1, fontSize: '0.6875rem', padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: 3, outline: 'none', minWidth: 0 }}
                  />
                  <button onClick={() => handleSaveNote(`deal:${deal.dealId}`)} disabled={savingNote} style={{ ...actionBtn, fontSize: '0.5625rem', padding: '0.15rem 0.3rem' }}>
                    {savingNote ? '...' : 'Save'}
                  </button>
                </div>
              ) : (
                <span
                  onClick={() => { setEditingNoteId(`deal:${deal.dealId}`); setNoteValue(deal.internalNote ?? '') }}
                  title="Click to add/edit note"
                  style={{ fontSize: '0.6875rem', color: deal.internalNote ? '#666' : '#ccc', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                >
                  {deal.internalNote || '+ note'}
                </span>
              )}
            </div>

            {/* Actions — link to deal */}
            <div style={{ width: 90, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <Link href={`/deals/${deal.dealId}`} style={{ ...actionBtn, textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}>
                View deal
              </Link>
            </div>
          </div>
        ))}

        {/* ── Draft rows ── */}
        {drafts.map((d) => {
          const status = draftStatus(d)
          const isReady = status === 'ready'
          const isEditing = editingDraftId === d.id
          const isRemoving = removingId === d.id
          const isSelected = selectedIds.has(d.id)
          const isSent = sentCreatorIds.has(d.creator_id)

          const fee = calculateFee(d.total_price_paise, d.fee_percent, d.fee_mode)

          let stageLabel: string
          let stageSc: { bg: string; color: string }
          if (isSent) {
            stageLabel = 'sent'
            stageSc = { bg: '#dbeafe', color: '#1e40af' }
          } else if (isReady) {
            stageLabel = 'ready'
            stageSc = { bg: '#dcfce7', color: '#166534' }
          } else {
            stageLabel = 'draft'
            stageSc = { bg: '#fef9c3', color: '#854d0e' }
          }

          const creatorDesc = [
            d.creator.handle ? (d.creator.handle.startsWith('@') ? d.creator.handle : `@${d.creator.handle}`) : null,
            d.creator.niches?.length ? d.creator.niches.slice(0, 2).join(', ') : null,
          ].filter(Boolean).join(' · ') || null

          const isEditingNote = editingNoteId === `draft:${d.id}`

          return (
            <div key={d.id}>
              <div style={{
                ...rowStyle,
                border: `1px solid ${isEditing ? '#111' : isSelected ? '#111' : 'var(--color-border, #e5e5e5)'}`,
                background: isSelected ? '#f8f8f8' : 'var(--glass-bg, #fafafa)',
              }}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!isReady || isSent}
                  onChange={() => toggleSelect(d.id)}
                  title={isSent ? 'Already sent' : isReady ? undefined : 'Set placements & price first'}
                  style={{ width: 16, height: 16, cursor: isReady && !isSent ? 'pointer' : 'not-allowed', accentColor: '#111', opacity: isReady && !isSent ? 1 : 0.35, flexShrink: 0 }}
                />

                {/* Creator */}
                <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  {d.creator.profile_photo_url ? (
                    <img src={d.creator.profile_photo_url} alt={d.creator.full_name} style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e5e5', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: '#f0f0f0', border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5625rem', fontWeight: 700, color: '#888', flexShrink: 0 }}>
                      {d.creator.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/browse/${d.creator.id}`} style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.creator.full_name}
                    </Link>
                    {creatorDesc && (
                      <p style={{ fontSize: '0.6875rem', color: '#999', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {creatorDesc}
                      </p>
                    )}
                  </div>
                </div>

                {/* Placements */}
                <div style={{ flex: 2, minWidth: 0, fontSize: '0.75rem', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {placementSummary(d.placements)}
                </div>

                {/* Stage */}
                <div style={{ width: 80, textAlign: 'center', flexShrink: 0 }}>
                  <span style={{ ...badgeStyle, background: stageSc.bg, color: stageSc.color }}>
                    {stageLabel}
                  </span>
                </div>

                {/* Price (creator receives) */}
                <div style={{ width: 70, textAlign: 'right', flexShrink: 0 }}>
                  {d.total_price_paise > 0 ? (
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#555' }}>
                      {formatRupees(fee.creator_receives_paise)}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem', color: '#ccc' }}>—</span>
                  )}
                </div>

                {/* Brand pays */}
                <div style={{ width: 80, textAlign: 'right', flexShrink: 0 }}>
                  {d.total_brand_paise > 0 ? (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)' }}>
                      {formatRupees(d.total_brand_paise)}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem', color: '#ccc' }}>—</span>
                  )}
                </div>

                {/* Note (internal, brand-only) */}
                <div style={{ flex: 1, minWidth: 60 }}>
                  {isEditingNote ? (
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <input
                        value={noteValue}
                        onChange={(e) => setNoteValue(e.target.value)}
                        placeholder="Internal note..."
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNote(`draft:${d.id}`); if (e.key === 'Escape') setEditingNoteId(null) }}
                        style={{ flex: 1, fontSize: '0.6875rem', padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: 3, outline: 'none', minWidth: 0 }}
                      />
                      <button onClick={() => handleSaveNote(`draft:${d.id}`)} disabled={savingNote} style={{ ...actionBtn, fontSize: '0.5625rem', padding: '0.15rem 0.3rem' }}>
                        {savingNote ? '...' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => { setEditingNoteId(`draft:${d.id}`); setNoteValue(d.note ?? '') }}
                      title="Click to add/edit note"
                      style={{ fontSize: '0.6875rem', color: d.note ? '#666' : '#ccc', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                    >
                      {d.note || '+ note'}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ width: 90, display: 'flex', justifyContent: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
                  <button onClick={() => setEditingDraftId(isEditing ? null : d.id)} style={actionBtn}>
                    {isEditing ? 'Close' : 'Edit'}
                  </button>
                  <button onClick={() => handleRemove(d.id)} disabled={isRemoving} style={{ ...actionBtn, color: '#888' }}>
                    {isRemoving ? '...' : 'Remove'}
                  </button>
                </div>
              </div>

              {/* Inline placement editor */}
              {isEditing && (
                <DraftPlacementEditor
                  draftId={d.id}
                  creatorName={d.creator.full_name}
                  products={productsMap[d.creator_id] ?? []}
                  initialPlacements={d.placements}
                  feePercent={d.fee_percent}
                  feeMode={d.fee_mode}
                  onClose={() => setEditingDraftId(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Send proposals modal */}
      {showSendModal && selectedDrafts.length > 0 && (
        <SendProposalsModal
          campaignId={campaignId}
          drafts={selectedDrafts}
          onClose={() => { setShowSendModal(false); setSelectedIds(new Set()) }}
        />
      )}
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.625rem',
  padding: '0.625rem 1rem',
  borderRadius: 'var(--radius-sm, 6px)',
}

const badgeStyle: React.CSSProperties = {
  fontSize: '0.5625rem',
  fontWeight: 600,
  padding: '0.1rem 0.4rem',
  borderRadius: 9999,
  textTransform: 'capitalize',
  whiteSpace: 'nowrap',
}

const actionBtn: React.CSSProperties = {
  padding: '0.2rem 0.4rem',
  background: 'var(--glass-bg, #fafafa)',
  color: 'var(--color-heading, #111)',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 4,
  fontSize: '0.625rem',
  fontWeight: 600,
  cursor: 'pointer',
}
