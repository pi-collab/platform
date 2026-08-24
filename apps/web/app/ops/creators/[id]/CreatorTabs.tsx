'use client'

import { useState, useEffect } from 'react'
import { QUESTIONS, labelFor } from '@/lib/creator-onboarding-labels'
import { vetCreator, rejectCreator, deleteCreator, addProduct, editProduct, setBrandCreatorRate } from '../../actions'
import { useRouter } from 'next/navigation'
import { PRODUCT_TYPES, PRODUCT_TYPES_BY_PLATFORM } from '@/lib/product-types'
import {
  formatProductPrice, normalizePriceMode,
  PRICE_MODES, PRICE_MODE_LABELS, type PriceMode,
} from '@/lib/product-price'

interface SocialAccount {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
}

interface Product {
  id: string
  platform: string
  handle: string
  product_type: string
  description: string | null
  price_paise: number
  price_mode: string | null
  price_max_paise: number | null
  display_price: boolean
  is_active: boolean
  included_revisions: number
  price_per_extra_revision_paise: number
  created_at: string
}

interface Creator {
  id: string
  full_name: string
  phone: string | null
  niches: string[]
  handle: string | null
  bio: string | null
  profile_photo_url: string | null
  social_accounts: SocialAccount[] | null
  worked_with: string[] | null
  portfolio_links: string[] | null
  rate_card: Record<string, number> | null
  is_vetted: boolean
  is_rejected: boolean
  created_at: string
  updated_at: string
}

interface Deal {
  id: string
  title: string | null
  status: string
  price_paise: number | null
  created_at: string
  brands: unknown
}

interface PairRate {
  id: string
  brand_id: string
  fee_pct: number
  reason: string
  set_by: string
  updated_at: string
  brands: { id: string; name: string; platform_fee_percent: number } | null
}

const TABS = ['Basic Details', 'Social Accounts', 'Products', 'Deals', 'Fee Rates', 'Portfolio & Brands', 'Questionnaire'] as const
type Tab = typeof TABS[number]

export default function CreatorTabs({ onboarding, creator, products, deals, pairRates }: { onboarding: OnboardingResponse | null; creator: Creator; products: Product[]; deals: Deal[]; pairRates: PairRate[] }) {
  const [tab, setTab] = useState<Tab>('Basic Details')
  const router = useRouter()
  const [actionLoading, setActionLoading] = useState(false)

  async function handleVet() {
    setActionLoading(true)
    const res = await vetCreator(creator.id)
    if (res.error) alert(res.error)
    else router.refresh()
    setActionLoading(false)
  }

  async function handleReject() {
    if (!confirm('Reject this creator? (Row kept, marked not vetted.)')) return
    setActionLoading(true)
    const res = await rejectCreator(creator.id)
    if (res.error) alert(res.error)
    else router.refresh()
    setActionLoading(false)
  }

  async function handleDelete() {
    if (!confirm('Permanently delete this creator, their products, and their account? This cannot be undone.')) return
    setActionLoading(true)
    const res = await deleteCreator(creator.id)
    if (res.error) alert(res.error)
    else router.push('/ops/creators')
    setActionLoading(false)
  }

  return (
    <div>
      {/* Vet/Reject actions */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {!creator.is_vetted && (
          <>
            <button onClick={handleVet} disabled={actionLoading} style={{ ...actionBtn, background: '#16a34a', color: '#fff' }}>
              {actionLoading ? '...' : 'Approve'}
            </button>
            <button onClick={handleReject} disabled={actionLoading} style={{ ...actionBtn, background: '#dc2626', color: '#fff' }}>
              {actionLoading ? '...' : 'Reject'}
            </button>
          </>
        )}
        <button onClick={handleDelete} disabled={actionLoading} style={{ ...actionBtn, background: '#fff', color: '#dc2626', border: '1px solid #fca5a5' }}>
          {actionLoading ? '...' : 'Delete'}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e5e5', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.5rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid #111' : '2px solid transparent',
              marginBottom: '-2px',
              fontWeight: tab === t ? 700 : 500,
              fontSize: '0.8125rem',
              color: tab === t ? '#111' : '#888',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Questionnaire' && <Questionnaire response={onboarding} />}
      {tab === 'Basic Details' && <BasicDetails creator={creator} />}
      {tab === 'Social Accounts' && <SocialAccounts accounts={creator.social_accounts} />}
      {tab === 'Products' && <Products creatorId={creator.id} accounts={creator.social_accounts} products={products} />}
      {tab === 'Deals' && <DealsTab deals={deals} />}
      {tab === 'Fee Rates' && <FeeRatesTab creatorId={creator.id} pairRates={pairRates} />}
      {tab === 'Portfolio & Brands' && <PortfolioBrands workedWith={creator.worked_with} portfolioLinks={creator.portfolio_links} />}
    </div>
  )
}

function BasicDetails({ creator }: { creator: Creator }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: 560 }}>
      <DetailField label="Full name" value={creator.full_name} />
      <DetailField label="Handle" value={creator.handle} />
      <span data-ph-mask><DetailField label="Phone" value={creator.phone} /></span>
      <DetailField label="Niches" value={creator.niches.length > 0 ? creator.niches.join(', ') : null} />
      <div style={{ gridColumn: '1 / -1' }}>
        <DetailField label="Bio" value={creator.bio} />
      </div>
      {creator.profile_photo_url && (
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={labelStyle}>Profile photo</p>
          <img
            src={creator.profile_photo_url}
            alt={creator.full_name}
            style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e5e5' }}
          />
        </div>
      )}
      <DetailField label="Created" value={new Date(creator.created_at).toLocaleString()} />
      <DetailField label="Updated" value={new Date(creator.updated_at).toLocaleString()} />
    </div>
  )
}

function SocialAccounts({ accounts }: { accounts: SocialAccount[] | null }) {
  if (!accounts || accounts.length === 0) {
    return <p style={emptyStyle}>No social accounts added yet.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 560 }}>
      {accounts.map((sa, i) => (
        <div key={i} style={{ padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'capitalize' }}>{sa.platform}</span>
            {sa.verified ? (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#dcfce7', color: '#166534' }}>Verified</span>
            ) : (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#f3f4f6', color: '#6b7280' }}>Unverified</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <DetailField label="Handle" value={sa.handle} />
            <DetailField label="Followers" value={sa.follower_count != null ? sa.follower_count.toLocaleString('en-IN') : null} />
            {sa.url && (
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={labelStyle}>URL</p>
                <a href={sa.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: '#2563eb', wordBreak: 'break-all' }}>
                  {sa.url}
                </a>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Products tab ──────────────────────────────────────────────── */

function Products({ creatorId, accounts, products }: { creatorId: string; accounts: SocialAccount[] | null; products: Product[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const activeProducts = products.filter((p) => p.is_active)
  const inactiveProducts = products.filter((p) => !p.is_active)
  const hasAccounts = accounts && accounts.length > 0

  return (
    <div style={{ maxWidth: 640 }}>
      {!hasAccounts && (
        <p style={{ ...emptyStyle, marginBottom: '1rem' }}>Add social accounts first before creating products.</p>
      )}

      {/* Product list */}
      {activeProducts.length === 0 && inactiveProducts.length === 0 && (
        <p style={emptyStyle}>No products yet.</p>
      )}

      {activeProducts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {activeProducts.map((p) => (
            editingId === p.id
              ? <ProductForm key={p.id} creatorId={creatorId} accounts={accounts!} existing={p} onDone={() => { setEditingId(null); router.refresh() }} />
              : <ProductRow key={p.id} product={p} onEdit={() => setEditingId(p.id)} />
          ))}
        </div>
      )}

      {inactiveProducts.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ ...labelStyle, marginBottom: '0.5rem' }}>Inactive</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: 0.6 }}>
            {inactiveProducts.map((p) => (
              editingId === p.id
                ? <ProductForm key={p.id} creatorId={creatorId} accounts={accounts!} existing={p} onDone={() => { setEditingId(null); router.refresh() }} />
                : <ProductRow key={p.id} product={p} onEdit={() => setEditingId(p.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && hasAccounts ? (
        <ProductForm creatorId={creatorId} accounts={accounts!} onDone={() => { setShowForm(false); router.refresh() }} />
      ) : (
        hasAccounts && (
          <button onClick={() => setShowForm(true)} style={addBtnStyle}>+ Add product</button>
        )
      )}
    </div>
  )
}

function ProductRow({ product: p, onEdit }: { product: Product; onEdit: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{p.product_type}</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#f3f4f6', color: '#6b7280', textTransform: 'capitalize' }}>{p.platform}</span>
          {normalizePriceMode(p) !== 'exact' && (
            <span style={{ fontSize: '0.6rem', color: '#888' }}>{PRICE_MODE_LABELS[normalizePriceMode(p)]}</span>
          )}
        </div>
        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
          {p.handle?.startsWith('@') ? p.handle : `@${p.handle}`} &middot; {formatProductPrice(p) ?? 'On request'}
          {p.description && <> &middot; {p.description}</>}
          {' '}&middot; {p.included_revisions} rev incl
          {p.price_per_extra_revision_paise > 0 && <>, ₹{(p.price_per_extra_revision_paise / 100).toLocaleString('en-IN')}/extra</>}
        </p>
      </div>
      <button onClick={onEdit} style={{ background: 'none', border: '1px solid #d5d5d5', borderRadius: 4, padding: '0.25rem 0.625rem', fontSize: '0.75rem', fontWeight: 600, color: '#555', cursor: 'pointer' }}>
        Edit
      </button>
    </div>
  )
}

function ProductForm({ creatorId, accounts, existing, onDone }: {
  creatorId: string
  accounts: SocialAccount[]
  existing?: Product
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // For new products, default to first account
  const [accountIdx, setAccountIdx] = useState(() => {
    if (existing) {
      const idx = accounts.findIndex((a) => a.platform === existing.platform && a.handle === existing.handle)
      return idx >= 0 ? idx : 0
    }
    return 0
  })
  const [productType, setProductType] = useState(existing?.product_type ?? '')

  const selectedPlatform = accounts[accountIdx]?.platform ?? 'other'
  const availableTypes = PRODUCT_TYPES_BY_PLATFORM[selectedPlatform] ?? PRODUCT_TYPES
  const [description, setDescription] = useState(existing?.description ?? '')
  const [priceRupees, setPriceRupees] = useState(existing ? String(existing.price_paise / 100) : '')
  // Mode replaces the old "Show price publicly" checkbox: on_request IS that
  // checkbox unticked, and keeping both would give one fact two controls that
  // could disagree.
  const [priceMode, setPriceMode] = useState<PriceMode>(existing ? normalizePriceMode(existing) : 'exact')
  const [priceMaxRupees, setPriceMaxRupees] = useState(
    existing?.price_max_paise ? String(existing.price_max_paise / 100) : '',
  )
  const [isActive, setIsActive] = useState(existing?.is_active ?? true)
  const [includedRevisions, setIncludedRevisions] = useState(String(existing?.included_revisions ?? 1))
  const [extraRevisionRupees, setExtraRevisionRupees] = useState(existing ? String(existing.price_per_extra_revision_paise / 100) : '0')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // On request stores nothing: 0477 rejects a hidden figure, because read
    // access to this table is wider than the shopfront.
    const paise = priceMode === 'on_request' ? 0 : Math.round(parseFloat(priceRupees) * 100)
    if (isNaN(paise) || paise < 0) {
      setError('Price must be a non-negative number')
      setLoading(false)
      return
    }

    let maxPaise: number | null = null
    if (priceMode === 'range') {
      maxPaise = Math.round(parseFloat(priceMaxRupees) * 100)
      if (isNaN(maxPaise) || maxPaise <= paise) {
        setError('The top of the range must be more than the bottom')
        setLoading(false)
        return
      }
    }

    const parsedIncluded = parseInt(includedRevisions, 10)
    if (isNaN(parsedIncluded) || parsedIncluded < 0) {
      setError('Included revisions must be 0 or more')
      setLoading(false)
      return
    }

    const extraPaise = Math.round(parseFloat(extraRevisionRupees || '0') * 100)
    if (isNaN(extraPaise) || extraPaise < 0) {
      setError('Price per extra revision must be non-negative')
      setLoading(false)
      return
    }

    if (existing) {
      const res = await editProduct({
        id: existing.id,
        creator_id: creatorId,
        product_type: productType,
        description: description || undefined,
        price_paise: paise,
        price_mode: priceMode,
        price_max_paise: priceMode === 'range' ? maxPaise : null,
        is_active: isActive,
        included_revisions: parsedIncluded,
        price_per_extra_revision_paise: extraPaise,
      })
      setLoading(false)
      if (res?.error) setError(res.error)
      else onDone()
    } else {
      const account = accounts[accountIdx]
      const res = await addProduct({
        creator_id: creatorId,
        platform: account.platform,
        handle: account.handle,
        product_type: productType,
        description: description || undefined,
        price_paise: paise,
        price_mode: priceMode,
        price_max_paise: priceMode === 'range' ? maxPaise : null,
        included_revisions: parsedIncluded,
        price_per_extra_revision_paise: extraPaise,
      })
      setLoading(false)
      if (res?.error) setError(res.error)
      else onDone()
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '1rem', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fff', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div style={{ color: '#dc2626', fontSize: '0.8125rem', padding: '0.375rem', background: '#fef2f2', borderRadius: 4 }}>{error}</div>}

      {/* Account selector (only for new products) */}
      {!existing && (
        <label style={formLabelStyle}>
          <span style={formLabelTextStyle}>Social account</span>
          <select style={formInputStyle} value={accountIdx} onChange={(e) => { setAccountIdx(parseInt(e.target.value, 10)); setProductType('') }}>
            {accounts.map((a, i) => (
              <option key={i} value={i}>{a.platform} · {a.handle?.startsWith('@') ? a.handle : `@${a.handle}`}</option>
            ))}
          </select>
        </label>
      )}
      {existing && (
        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
          Account: <strong style={{ textTransform: 'capitalize' }}>{existing.platform}</strong> · {existing.handle?.startsWith('@') ? existing.handle : `@${existing.handle}`}
        </p>
      )}

      <label style={formLabelStyle}>
        <span style={formLabelTextStyle}>Product type</span>
        <select style={formInputStyle} value={productType} onChange={(e) => setProductType(e.target.value)} required>
          <option value="">Select...</option>
          {availableTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>

      <label style={formLabelStyle}>
        <span style={formLabelTextStyle}>Description (optional)</span>
        <input style={formInputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 30s product demo reel" />
      </label>

      <label style={formLabelStyle}>
        <span style={formLabelTextStyle}>Price (₹)</span>
        <input style={formInputStyle} type="number" min="0" step="1" value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} placeholder="e.g. 50000" required />
      </label>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <label style={formLabelStyle}>
          <span style={formLabelTextStyle}>Included revisions</span>
          <input style={{ ...formInputStyle, width: 80 }} type="number" min="0" value={includedRevisions} onChange={(e) => setIncludedRevisions(e.target.value)} />
        </label>
        <label style={formLabelStyle}>
          <span style={formLabelTextStyle}>Per extra revision (₹)</span>
          <input style={{ ...formInputStyle, width: 120 }} type="number" min="0" step="1" value={extraRevisionRupees} onChange={(e) => setExtraRevisionRupees(e.target.value)} placeholder="0" />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
          <select
            style={{ ...formInputStyle, width: 190 }}
            value={priceMode}
            onChange={(e) => setPriceMode(e.target.value as PriceMode)}
          >
            {PRICE_MODES.map((m) => <option key={m} value={m}>{PRICE_MODE_LABELS[m]}</option>)}
          </select>
        </label>
        {priceMode === 'range' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem' }}>
            To (&#8377;)
            <input
              style={{ ...formInputStyle, width: 120 }}
              type="number" min="0" step="1"
              value={priceMaxRupees}
              onChange={(e) => setPriceMaxRupees(e.target.value)}
            />
          </label>
        )}
        {existing && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={loading} style={{ padding: '0.4rem 1rem', background: loading ? '#999' : '#111', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: '0.8125rem', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Saving...' : existing ? 'Save' : 'Add product'}
        </button>
        <button type="button" onClick={onDone} style={{ padding: '0.4rem 1rem', background: '#fff', color: '#555', border: '1px solid #d5d5d5', borderRadius: 4, fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function PortfolioBrands({ workedWith, portfolioLinks }: { workedWith: string[] | null; portfolioLinks: string[] | null }) {
  const hasWorked = workedWith && workedWith.length > 0
  const hasLinks = portfolioLinks && portfolioLinks.length > 0

  if (!hasWorked && !hasLinks) {
    return <p style={emptyStyle}>No portfolio links or brand collaborations added yet.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 560 }}>
      {hasWorked && (
        <div>
          <p style={{ ...labelStyle, marginBottom: '0.5rem' }}>Worked with</p>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {workedWith!.map((brand, i) => (
              <span key={i} style={{ fontSize: '0.8125rem', padding: '0.25rem 0.625rem', borderRadius: 9999, background: '#f3f4f6', border: '1px solid #e5e5e5', fontWeight: 500 }}>
                {brand}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasLinks && (
        <div>
          <p style={{ ...labelStyle, marginBottom: '0.5rem' }}>Portfolio links</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {portfolioLinks!.map((link, i) => (
              <a key={i} href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: '#2563eb', wordBreak: 'break-all' }}>
                {link}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const DEAL_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  negotiating: { bg: '#dbeafe', color: '#1e40af' },
  agreed:      { bg: '#dcfce7', color: '#166534' },
  delivered:   { bg: '#fef9c3', color: '#854d0e' },
  revision:    { bg: '#ffedd5', color: '#9a3412' },
  approved:    { bg: '#dcfce7', color: '#166534' },
  paid:        { bg: '#d1fae5', color: '#065f46' },
  complete:    { bg: '#f3f4f6', color: '#374151' },
  declined:    { bg: '#fee2e2', color: '#991b1b' },
  cancelled:   { bg: '#f3f4f6', color: '#6b7280' },
}

function DealsTab({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return <p style={emptyStyle}>No deals yet.</p>

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontSize: '0.8125rem', color: '#666', marginBottom: '0.75rem' }}>{deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {deals.map((d) => {
          const brand = (d.brands as any)?.name ?? '—'
          const sc = DEAL_STATUS_COLORS[d.status] ?? { bg: '#f3f4f6', color: '#6b7280' }
          return (
            <a
              key={d.id}
              href={`/ops/deals/${d.id}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa', textDecoration: 'none', color: '#111' }}
            >
              <div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{d.title || 'Untitled'}</span>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.1rem 0 0' }}>
                  {brand} &middot; {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {d.price_paise != null && d.price_paise > 0 && (
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'monospace' }}>
                    {'\u20B9'}{(d.price_paise / 100).toLocaleString('en-IN')}
                  </span>
                )}
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                  {d.status}
                </span>
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}

/* ── Fee Rates tab ─────────────────────────────────────────────── */

function FeeRatesTab({ creatorId, pairRates }: { creatorId: string; pairRates: PairRate[] }) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '1rem' }}>
        Brand-creator pair rates override the brand&rsquo;s standard platform fee for this creator&rsquo;s deals with that brand.
        Per-deal overrides (set on the deal detail page) take priority over pair rates.
      </p>

      {pairRates.length === 0 && !showAdd && (
        <p style={emptyStyle}>No pair rates set. This creator uses each brand&rsquo;s standard rate.</p>
      )}

      {pairRates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {pairRates.map((pr) => {
            const brandName = (pr.brands as any)?.name ?? '—'
            const standardRate = (pr.brands as any)?.platform_fee_percent ?? 0

            if (editingId === pr.id) {
              return (
                <PairRateForm
                  key={pr.id}
                  creatorId={creatorId}
                  brandId={pr.brand_id}
                  brandName={brandName}
                  standardRate={standardRate}
                  existing={{ feePct: pr.fee_pct, reason: pr.reason }}
                  onDone={() => { setEditingId(null); router.refresh() }}
                />
              )
            }

            return (
              <div key={pr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{brandName}</span>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>{pr.fee_pct}%</span>
                    <span style={{ fontSize: '0.65rem', color: '#888' }}>
                      (standard: {standardRate}%)
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
                    {pr.reason} &middot; set by {pr.set_by} &middot; {new Date(pr.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button onClick={() => setEditingId(pr.id)} style={{ background: 'none', border: '1px solid #d5d5d5', borderRadius: 4, padding: '0.25rem 0.625rem', fontSize: '0.75rem', fontWeight: 600, color: '#555', cursor: 'pointer' }}>
                  Edit
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showAdd ? (
        <PairRateForm
          creatorId={creatorId}
          brandId=""
          brandName=""
          standardRate={0}
          existing={null}
          onDone={() => { setShowAdd(false); router.refresh() }}
          pickBrand
        />
      ) : (
        <button onClick={() => setShowAdd(true)} style={addBtnStyle}>+ Add pair rate</button>
      )}
    </div>
  )
}

function PairRateForm({ creatorId, brandId: initialBrandId, brandName, standardRate: initialStandardRate, existing, onDone, pickBrand }: {
  creatorId: string
  brandId: string
  brandName: string
  standardRate: number
  existing: { feePct: number; reason: string } | null
  onDone: () => void
  pickBrand?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feePct, setFeePct] = useState(existing ? String(existing.feePct) : '')
  const [reason, setReason] = useState(existing?.reason ?? '')

  // Brand picker state (only used for new pair rates)
  const [brands, setBrands] = useState<{ id: string; name: string; platform_fee_percent: number }[]>([])
  const [selectedBrandId, setSelectedBrandId] = useState(initialBrandId)
  const [brandsLoaded, setBrandsLoaded] = useState(false)

  const effectiveBrandId = pickBrand ? selectedBrandId : initialBrandId
  const selectedBrand = pickBrand ? brands.find((b) => b.id === selectedBrandId) : null
  const standardRate = pickBrand ? (selectedBrand?.platform_fee_percent ?? 0) : initialStandardRate
  const displayBrandName = pickBrand ? (selectedBrand?.name ?? '') : brandName

  // Lazy-load brands list for the picker
  useEffect(() => {
    if (pickBrand) {
      fetch('/ops/api/brands')
        .then((r) => r.json())
        .then((data) => { setBrands(data.brands ?? []); setBrandsLoaded(true) })
        .catch(() => setBrandsLoaded(true))
    }
  }, [pickBrand])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!effectiveBrandId) { setError('Select a brand.'); return }

    const parsedFee = feePct.trim() === '' ? null : parseFloat(feePct)
    if (parsedFee != null && (isNaN(parsedFee) || parsedFee < 0 || parsedFee > 100)) {
      setError('Fee must be between 0 and 100.')
      return
    }
    if (!reason.trim()) { setError('A reason is required.'); return }

    setLoading(true)
    const res = await setBrandCreatorRate(effectiveBrandId, creatorId, parsedFee, reason.trim())
    setLoading(false)

    if ('error' in res && res.error) { setError(res.error); return }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '1rem', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fff', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && <div style={{ color: '#dc2626', fontSize: '0.8125rem', padding: '0.375rem', background: '#fef2f2', borderRadius: 4 }}>{error}</div>}

      {pickBrand ? (
        <label style={formLabelStyle}>
          <span style={formLabelTextStyle}>Brand</span>
          <select style={formInputStyle} value={selectedBrandId} onChange={(e) => setSelectedBrandId(e.target.value)} required>
            <option value="">Select a brand...</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name} (standard: {b.platform_fee_percent}%)</option>
            ))}
          </select>
        </label>
      ) : (
        <p style={{ fontSize: '0.8125rem', margin: 0 }}>
          <strong>{displayBrandName}</strong> · standard rate: <span style={{ fontFamily: 'monospace' }}>{standardRate}%</span>
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <label style={{ ...formLabelStyle, flex: '0 0 120px' }}>
          <span style={formLabelTextStyle}>Pair rate %</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            placeholder={`${standardRate} (standard)`}
            value={feePct}
            onChange={(e) => setFeePct(e.target.value)}
            style={formInputStyle}
          />
        </label>
        <label style={{ ...formLabelStyle, flex: 1 }}>
          <span style={formLabelTextStyle}>Reason (required)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="e.g. Creator introduced this brand to platform"
            style={formInputStyle}
          />
        </label>
      </div>

      {feePct !== '' && !isNaN(parseFloat(feePct)) && (
        <p style={{ fontSize: '0.8125rem', padding: '0.5rem 0.75rem', background: '#eff6ff', borderRadius: 6, margin: 0 }}>
          New deals between <strong>{displayBrandName || '(select brand)'}</strong> and this creator will use <strong>{parseFloat(feePct)}%</strong> instead of the standard {standardRate}%.
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={loading} style={{ padding: '0.4rem 1rem', background: loading ? '#999' : '#111', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, fontSize: '0.8125rem', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Saving...' : feePct.trim() === '' ? 'Remove pair rate' : existing ? 'Update' : 'Set pair rate'}
        </button>
        <button type="button" onClick={onDone} style={{ padding: '0.4rem 1rem', background: '#fff', color: '#555', border: '1px solid #d5d5d5', borderRadius: 4, fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={labelStyle}>{label}</p>
      <p style={{ fontSize: '0.8125rem', color: value ? '#111' : '#ccc', margin: 0 }}>{value || '—'}</p>
    </div>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#888',
  margin: '0 0 0.2rem',
}

const emptyStyle: React.CSSProperties = {
  color: '#999',
  fontSize: '0.8125rem',
}

const actionBtn: React.CSSProperties = {
  border: 'none',
  borderRadius: 6,
  padding: '0.4rem 1rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const addBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px dashed #ccc',
  borderRadius: 4,
  padding: '0.5rem 0.75rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: '#666',
  cursor: 'pointer',
  width: '100%',
}

const formLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

const formLabelTextStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
}

const formInputStyle: React.CSSProperties = {
  padding: '0.5rem 0.625rem',
  border: '1px solid #d5d5d5',
  borderRadius: 4,
  fontSize: '0.875rem',
  outline: 'none',
}

/* ── Questionnaire ─────────────────────────────────────────────────────────── */

interface OnboardingResponse {
  biggest_pain: string
  pain_other: string | null
  deal_handling: string
  monthly_deals: string
  anything_else: string | null
  created_at: string
}

/**
 * What this creator said on the way in.
 *
 * Codes are mapped through the same definitions the form and the aggregate use,
 * so a copy edit changes all three together rather than leaving this one
 * printing `slow_payments` at somebody.
 */
function Questionnaire({ response }: { response: OnboardingResponse | null }) {
  if (!response) {
    return (
      <p style={{ fontSize: '0.8125rem', color: '#888', lineHeight: 1.6 }}>
        No response. Either they were approved before the questions existed, or they have not
        reached their dashboard since being approved.
      </p>
    )
  }

  const rows: [string, string | null][] = [
    [QUESTIONS[0].prompt, labelFor('biggest_pain', response.biggest_pain)],
    ['In their words', response.pain_other],
    [QUESTIONS[1].prompt, labelFor('deal_handling', response.deal_handling)],
    [QUESTIONS[2].prompt, labelFor('monthly_deals', response.monthly_deals)],
    ['Anything else', response.anything_else],
  ]

  return (
    <div>
      <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 1rem' }}>
        Answered {new Date(response.created_at).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
        })}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label}>
            <div style={{
              fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: '#888', marginBottom: 3,
            }}>{label}</div>
            <div style={{ fontSize: '0.875rem', color: '#111', lineHeight: 1.5 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
