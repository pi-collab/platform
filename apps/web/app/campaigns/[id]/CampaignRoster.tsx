'use client'

import { useState } from 'react'
import Link from 'next/link'
import { removeCampaignDraft } from './draft-actions'
import { useRouter } from 'next/navigation'
import DraftPlacementEditor from './DraftPlacementEditor'
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
  creator: {
    id: string
    full_name: string
    handle: string | null
    profile_photo_url: string | null
  }
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

/**
 * Draft is "Ready" when placements are non-empty AND total_price > 0.
 * Otherwise it's "Draft" (added but not priced — NOT sendable in Phase 2b).
 */
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
}: {
  drafts: Draft[]
  productsMap: Record<string, Product[]>  // creatorId → products
  campaignId: string
}) {
  const router = useRouter()
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleRemove(draftId: string) {
    if (!confirm('Remove this creator from the campaign?')) return
    setRemovingId(draftId)
    await removeCampaignDraft(draftId, campaignId)
    setRemovingId(null)
    router.refresh()
  }

  if (drafts.length === 0) {
    return (
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
        No creators added yet. Use &quot;Add creators&quot; to build your campaign roster.
      </p>
    )
  }

  const readyCount = drafts.filter((d) => draftStatus(d) === 'ready').length

  return (
    <div>
      <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.75rem' }}>
        {drafts.length} creator{drafts.length !== 1 ? 's' : ''} · {readyCount} ready
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {drafts.map((d) => {
          const status = draftStatus(d)
          const isEditing = editingDraftId === d.id
          const isRemoving = removingId === d.id
          const sc = status === 'ready'
            ? { bg: '#dcfce7', color: '#166534' }
            : { bg: '#fef9c3', color: '#854d0e' }

          return (
            <div key={d.id}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem 1rem',
                border: `1px solid ${isEditing ? '#111' : 'var(--color-border, #e5e5e5)'}`,
                borderRadius: 'var(--radius-sm, 6px)',
                background: 'var(--glass-bg, #fafafa)',
                gap: '0.75rem',
              }}>
                {/* Creator info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0, flex: 1 }}>
                  {d.creator.profile_photo_url ? (
                    <img src={d.creator.profile_photo_url} alt={d.creator.full_name} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e5e5', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f0f0f0', border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700, color: '#888', flexShrink: 0 }}>
                      {d.creator.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/browse/${d.creator.id}`} style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)', textDecoration: 'none' }}>
                      {d.creator.full_name}
                    </Link>
                    <p style={{ fontSize: '0.7rem', color: '#888', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {placementSummary(d.placements)}
                    </p>
                  </div>
                </div>

                {/* Price + status + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                  {d.total_brand_paise > 0 && (
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)' }}>
                      {formatRupees(d.total_brand_paise)}
                    </span>
                  )}
                  <span style={{
                    fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 9999,
                    background: sc.bg, color: sc.color, textTransform: 'capitalize',
                  }}>
                    {status}
                  </span>
                  <button
                    onClick={() => setEditingDraftId(isEditing ? null : d.id)}
                    style={actionBtn}
                  >
                    {isEditing ? 'Close' : 'Edit'}
                  </button>
                  <button
                    onClick={() => handleRemove(d.id)}
                    disabled={isRemoving}
                    style={{ ...actionBtn, color: '#888' }}
                  >
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
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: 'var(--glass-bg, #fafafa)',
  color: 'var(--color-heading, #111)',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 4,
  fontSize: '0.6875rem',
  fontWeight: 600,
  cursor: 'pointer',
}
