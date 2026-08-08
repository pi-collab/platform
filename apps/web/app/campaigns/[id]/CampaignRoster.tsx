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

function formatINR(paise: number): string {
  const rupees = Math.round(paise / 100)
  const s = String(rupees)
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
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

const STAGE_DOTS: Record<string, string> = {
  draft: '#D8DACF',
  ready: 'var(--sec-mid-2)',
  sent: 'var(--neon-deep)',
}

export default function CampaignRoster({
  drafts,
  productsMap,
  campaignId,
  campaignDeals,
  briefPitch,
  briefGuidelines,
}: {
  drafts: Draft[]
  productsMap: Record<string, Product[]>
  campaignId: string
  campaignDeals: CampaignDeal[]
  briefPitch: string | null
  briefGuidelines: string | null
}) {
  const router = useRouter()
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showSendModal, setShowSendModal] = useState(false)
  const [bulkRemoving, setBulkRemoving] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [rosterFilter, setRosterFilter] = useState<'all' | 'draft' | 'ready'>('all')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const sentCreatorIds = new Set(campaignDeals.map((d) => d.creatorId))
  const readyDrafts = drafts.filter((d) => draftStatus(d) === 'ready' && !sentCreatorIds.has(d.creator_id))
  const readyIds = new Set(readyDrafts.map((d) => d.id))
  const selectableDrafts = drafts.filter((d) => !sentCreatorIds.has(d.creator_id))
  const selectableIds = new Set(selectableDrafts.map((d) => d.id))
  const readyCount = readyDrafts.length
  const draftCount = drafts.filter((d) => draftStatus(d) === 'draft').length
  const sentCount = campaignDeals.length
  const totalRows = drafts.length + campaignDeals.length

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === selectableDrafts.length && selectableDrafts.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableIds))
    }
  }

  async function handleRemove(draftId: string) {
    if (!confirm('Remove this creator from the campaign?')) return
    setRemovingId(draftId)
    await removeCampaignDraft(draftId, campaignId)
    setRemovingId(null)
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(draftId); return next })
    setOpenMenuId(null)
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

  if (totalRows === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px 10px' }}>
        <div style={{ position: 'relative', width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px dashed var(--lime-200)' }} />
        </div>
        <p className="t-body" style={{ color: 'var(--ink-2)', margin: '18px 0 0', maxWidth: 320 }}>
          No creators added yet. Use &quot;Add creators&quot; to build your roster.
        </p>
      </div>
    )
  }

  const selectedDrafts = drafts.filter((d) => selectedIds.has(d.id))
  const allSelected = selectableDrafts.length > 0 && selectableDrafts.every((r) => selectedIds.has(r.id))

  // Filter rows
  const filteredDrafts = rosterFilter === 'all' ? drafts
    : rosterFilter === 'draft' ? drafts.filter((d) => draftStatus(d) === 'draft')
    : drafts.filter((d) => draftStatus(d) === 'ready' && !sentCreatorIds.has(d.creator_id))
  const filteredDeals = rosterFilter === 'all' ? campaignDeals : []

  return (
    <div>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        {(['all', 'draft', 'ready'] as const).map((f) => {
          const active = rosterFilter === f
          const count = f === 'all' ? totalRows : f === 'draft' ? draftCount : readyCount
          return (
            <span
              key={f}
              onClick={() => setRosterFilter(f)}
              style={{
                padding: '7px 15px', borderRadius: 999, cursor: 'pointer',
                background: active ? 'var(--ink)' : 'none',
                color: active ? '#FFFFFF' : 'var(--ink-2)',
                border: `1px solid ${active ? 'var(--ink)' : 'var(--hairline)'}`,
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5,
                transition: 'background .15s, color .15s',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} · {count}
            </span>
          )
        })}
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          marginTop: 14, padding: '14px 18px', borderRadius: 14,
          background: 'var(--lime-50)', border: '1px solid var(--lime-200)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setSelectedIds(new Set())}
              title="Clear selection"
              style={{
                width: 22, height: 22, borderRadius: 6, background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
            <span className="t-meta" style={{ color: 'var(--ink)' }}>{selectedIds.size} selected</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="pill"
              onClick={handleBulkRemove}
              disabled={bulkRemoving}
              style={{
                height: 36, padding: '0 16px', borderRadius: 10,
                background: '#FFFFFF', border: '1px solid var(--hairline)',
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer',
              }}
            >
              {bulkRemoving ? 'Removing...' : 'Remove'}
            </button>
            <button
              className="neonbtn"
              onClick={() => setShowSendModal(true)}
              style={{
                height: 36, padding: '0 18px', borderRadius: 10,
                background: 'var(--neon)', border: 'none',
                boxShadow: '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Send proposals
            </button>
          </div>
        </div>
      )}

      {/* Column header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '20px 40px 1.6fr 1.3fr 110px 110px 34px',
        gap: 16, alignItems: 'center', padding: '0 4px 12px', marginTop: 20,
        borderBottom: '1px solid var(--hairline)',
      }}>
        <button
          onClick={toggleSelectAll}
          title={allSelected ? 'Deselect all' : 'Select all ready'}
          style={{
            width: 20, height: 20, borderRadius: 6,
            background: allSelected ? 'var(--neon)' : '#FFFFFF',
            border: `1.5px solid ${allSelected ? 'var(--neon-deep)' : 'var(--ink-faint)'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
        >
          {allSelected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          )}
        </button>
        <span />
        <span className="t-meta">Creator</span>
        <span className="t-meta">Deal</span>
        <span className="t-meta">Stage</span>
        <span className="t-meta" style={{ textAlign: 'right' }}>Price</span>
        <span />
      </div>

      {/* Rows */}
      <div>
        {/* Sent deal rows */}
        {filteredDeals.map((deal) => {
          const isMenuOpen = openMenuId === `deal-${deal.dealId}`
          return (
            <div key={`deal-${deal.dealId}`} style={{ borderTop: '1px solid var(--hairline)' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '20px 40px 1.6fr 1.3fr 110px 110px 34px',
                gap: 16, alignItems: 'center', padding: '20px 4px',
              }}>
                {/* Checkbox disabled for sent */}
                <button
                  disabled
                  style={{
                    width: 20, height: 20, borderRadius: 6,
                    background: '#FFFFFF', border: '1.5px solid var(--ink-faint)',
                    cursor: 'not-allowed', opacity: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}
                />

                {/* Avatar */}
                <span style={{ position: 'relative', flexShrink: 0 }}>
                  {deal.creatorPhoto ? (
                    <img src={deal.creatorPhoto} alt={deal.creatorName} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{
                      width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--sec-ink, var(--ink-soft))', background: '#F7F4FB',
                    }}>
                      {getInitials(deal.creatorName)}
                    </span>
                  )}
                  <span style={{
                    position: 'absolute', right: -1, bottom: -1, width: 11, height: 11,
                    borderRadius: '50%', background: STAGE_DOTS.sent, border: '2px solid #fff',
                  }} />
                </span>

                {/* Creator info */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {deal.creatorName}
                    </span>
                    <span style={{ color: 'var(--ink-faint)', fontSize: 14 }}>·</span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 12, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
                      {deal.statusLabel}
                    </span>
                  </div>
                </div>

                {/* Deal / deliverables */}
                <div className="t-body" style={{ fontSize: 13.5, color: 'var(--ink-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {deal.deliverables || '—'}
                </div>

                {/* Stage */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STAGE_DOTS.sent, flexShrink: 0 }} />
                  <span className="t-meta" style={{ color: 'var(--ink-2)', fontSize: 11 }}>Sent</span>
                </div>

                {/* Price */}
                <span className="t-figure-sm" style={{ fontSize: 16, textAlign: 'right', color: 'var(--ink)' }}>
                  {formatINR(deal.brandPaysPaise)}
                </span>

                {/* Kebab menu */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setOpenMenuId(isMenuOpen ? null : `deal-${deal.dealId}`)}
                    title="Actions"
                    style={{
                      width: 34, height: 34, borderRadius: 9,
                      background: isMenuOpen ? 'var(--sec-2)' : 'transparent',
                      border: 'none', cursor: 'pointer', color: 'var(--ink)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                  </button>
                  {isMenuOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 150,
                      borderRadius: 12, background: '#FFFFFF',
                      boxShadow: '0 4px 16px rgba(22,23,15,.12)', border: '1px solid var(--hairline)',
                      padding: 6, zIndex: 10,
                    }}>
                      <Link
                        href={`/deals/${deal.dealId}`}
                        onClick={() => setOpenMenuId(null)}
                        style={{
                          display: 'block', padding: '8px 12px', borderRadius: 8, textDecoration: 'none',
                          fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 13, color: 'var(--ink)',
                        }}
                      >
                        View deal
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Draft rows */}
        {filteredDrafts.map((d) => {
          const status = draftStatus(d)
          const isReady = status === 'ready'
          const isDraft = status === 'draft'
          const isEditing = editingDraftId === d.id
          const isRemoving = removingId === d.id
          const isSelected = selectedIds.has(d.id)
          const isSent = sentCreatorIds.has(d.creator_id)
          const isMenuOpen = openMenuId === `draft-${d.id}`
          const stageDot = isSent ? STAGE_DOTS.sent : isReady ? STAGE_DOTS.ready : STAGE_DOTS.draft
          const stageLabel = isSent ? 'Sent' : isReady ? 'Ready' : 'Draft'

          const fee = calculateFee(d.total_price_paise, d.fee_percent, d.fee_mode)

          return (
            <div key={d.id}>
              <div style={{
                borderTop: '1px solid var(--hairline)',
                borderRadius: isSelected ? 14 : 0,
                boxShadow: isSelected ? 'inset 0 0 0 1.5px var(--neon-deep)' : 'none',
                margin: isSelected ? '4px -4px' : 0,
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '20px 40px 1.6fr 1.3fr 110px 110px 34px',
                  gap: 16, alignItems: 'center', padding: '20px 4px',
                }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => !isSent && toggleSelect(d.id)}
                    disabled={isSent}
                    title={isSent ? 'Already sent' : undefined}
                    style={{
                      width: 20, height: 20, borderRadius: 6,
                      background: isSelected ? 'var(--neon)' : '#FFFFFF',
                      border: `1.5px solid ${isSelected ? 'var(--neon-deep)' : 'var(--ink-faint)'}`,
                      cursor: !isSent ? 'pointer' : 'not-allowed',
                      opacity: !isSent ? 1 : 0.3,
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </button>

                  {/* Avatar */}
                  <span style={{ position: 'relative', flexShrink: 0 }}>
                    {d.creator.profile_photo_url ? (
                      <img src={d.creator.profile_photo_url} alt={d.creator.full_name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{
                        width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--sec-ink, var(--ink-soft))', background: '#F7F4FB',
                      }}>
                        {getInitials(d.creator.full_name)}
                      </span>
                    )}
                    <span style={{
                      position: 'absolute', right: -1, bottom: -1, width: 11, height: 11,
                      borderRadius: '50%', background: stageDot, border: '2px solid #fff',
                    }} />
                  </span>

                  {/* Creator info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.creator.full_name}
                      </span>
                      <span style={{ color: 'var(--ink-faint)', fontSize: 14 }}>·</span>
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 12, color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isDraft ? 'Set terms' : 'Ready to send'}
                      </span>
                    </div>
                    {d.creator.handle && (
                      <div style={{ marginTop: 6, fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 11.5, color: 'var(--ink-faint)' }}>
                        @{d.creator.handle.replace(/^@/, '')}
                      </div>
                    )}
                  </div>

                  {/* Deal / placements */}
                  <div className="t-body" style={{ fontSize: 13.5, color: 'var(--ink-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {placementSummary(d.placements)}
                  </div>

                  {/* Stage */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: stageDot, flexShrink: 0 }} />
                    <span className="t-meta" style={{ color: 'var(--ink-2)', fontSize: 11 }}>{stageLabel}</span>
                  </div>

                  {/* Price */}
                  {isDraft ? (
                    <div style={{ textAlign: 'right' }}>
                      <button
                        className="pill"
                        onClick={() => setEditingDraftId(isEditing ? null : d.id)}
                        style={{
                          height: 30, padding: '0 12px', borderRadius: 9,
                          background: '#FFFFFF', border: '1px solid var(--hairline)',
                          fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11.5, color: 'var(--ink)',
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        Set terms →
                      </button>
                    </div>
                  ) : (
                    <span className="t-figure-sm" style={{ fontSize: 16, textAlign: 'right', color: 'var(--ink)' }}>
                      {formatINR(d.total_brand_paise)}
                    </span>
                  )}

                  {/* Kebab menu */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setOpenMenuId(isMenuOpen ? null : `draft-${d.id}`)}
                      title="Actions"
                      style={{
                        width: 34, height: 34, borderRadius: 9,
                        background: isMenuOpen ? 'var(--sec-2)' : 'transparent',
                        border: 'none', cursor: 'pointer', color: 'var(--ink)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                    </button>
                    {isMenuOpen && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 160,
                        borderRadius: 12, background: '#FFFFFF',
                        boxShadow: '0 4px 16px rgba(22,23,15,.12)', border: '1px solid var(--hairline)',
                        padding: 6, zIndex: 10,
                      }}>
                        <button
                          onClick={() => { setEditingDraftId(isEditing ? null : d.id); setOpenMenuId(null) }}
                          style={{
                            display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, textAlign: 'left',
                            background: 'none', border: 'none',
                            fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 13, color: 'var(--ink)', cursor: 'pointer',
                          }}
                        >
                          {isEditing ? 'Close editor' : 'Edit terms'}
                        </button>
                        <Link
                          href={`/browse/${d.creator.id}`}
                          onClick={() => setOpenMenuId(null)}
                          style={{
                            display: 'block', padding: '8px 12px', borderRadius: 8, textDecoration: 'none',
                            fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 13, color: 'var(--ink)',
                          }}
                        >
                          View profile
                        </Link>
                        <button
                          onClick={() => { setOpenMenuId(null); handleRemove(d.id) }}
                          disabled={isRemoving}
                          style={{
                            display: 'block', width: '100%', padding: '8px 12px', borderRadius: 8, textAlign: 'left',
                            background: 'none', border: 'none',
                            fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 13, color: '#dc2626', cursor: 'pointer',
                          }}
                        >
                          {isRemoving ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    )}
                  </div>
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
          briefPitch={briefPitch}
          briefGuidelines={briefGuidelines}
          onClose={() => { setShowSendModal(false); setSelectedIds(new Set()) }}
        />
      )}
    </div>
  )
}
