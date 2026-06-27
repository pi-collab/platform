'use client'

import { useState } from 'react'
import { vetCreator, rejectCreator, addProduct, editProduct } from '../../actions'
import { useRouter } from 'next/navigation'
import { PRODUCT_TYPES, PRODUCT_TYPES_BY_PLATFORM } from '@/lib/product-types'

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
  display_price: boolean
  is_active: boolean
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

const TABS = ['Basic Details', 'Social Accounts', 'Products', 'Deals', 'Rate Card (legacy)', 'Portfolio & Brands'] as const
type Tab = typeof TABS[number]

export default function CreatorTabs({ creator, products, deals }: { creator: Creator; products: Product[]; deals: Deal[] }) {
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

  return (
    <div>
      {/* Vet/Reject actions */}
      {!creator.is_vetted && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button onClick={handleVet} disabled={actionLoading} style={{ ...actionBtn, background: '#16a34a', color: '#fff' }}>
            {actionLoading ? '...' : 'Approve'}
          </button>
          <button onClick={handleReject} disabled={actionLoading} style={{ ...actionBtn, background: '#dc2626', color: '#fff' }}>
            {actionLoading ? '...' : 'Reject'}
          </button>
        </div>
      )}

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
      {tab === 'Basic Details' && <BasicDetails creator={creator} />}
      {tab === 'Social Accounts' && <SocialAccounts accounts={creator.social_accounts} />}
      {tab === 'Products' && <Products creatorId={creator.id} accounts={creator.social_accounts} products={products} />}
      {tab === 'Deals' && <DealsTab deals={deals} />}
      {tab === 'Rate Card (legacy)' && <RateCard rateCard={creator.rate_card} />}
      {tab === 'Portfolio & Brands' && <PortfolioBrands workedWith={creator.worked_with} portfolioLinks={creator.portfolio_links} />}
    </div>
  )
}

function BasicDetails({ creator }: { creator: Creator }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxWidth: 560 }}>
      <DetailField label="Full name" value={creator.full_name} />
      <DetailField label="Handle" value={creator.handle} />
      <DetailField label="Phone" value={creator.phone} />
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
          {!p.display_price && <span style={{ fontSize: '0.6rem', color: '#888' }}>Price hidden</span>}
        </div>
        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
          {p.handle?.startsWith('@') ? p.handle : `@${p.handle}`} &middot; ₹{(p.price_paise / 100).toLocaleString('en-IN')}
          {p.description && <> &middot; {p.description}</>}
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
  const [displayPrice, setDisplayPrice] = useState(existing?.display_price ?? true)
  const [isActive, setIsActive] = useState(existing?.is_active ?? true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const paise = Math.round(parseFloat(priceRupees) * 100)
    if (isNaN(paise) || paise < 0) {
      setError('Price must be a non-negative number')
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
        display_price: displayPrice,
        is_active: isActive,
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
        display_price: displayPrice,
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
              <option key={i} value={i}>{a.platform} — {a.handle?.startsWith('@') ? a.handle : `@${a.handle}`}</option>
            ))}
          </select>
        </label>
      )}
      {existing && (
        <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>
          Account: <strong style={{ textTransform: 'capitalize' }}>{existing.platform}</strong> — {existing.handle?.startsWith('@') ? existing.handle : `@${existing.handle}`}
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

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={displayPrice} onChange={(e) => setDisplayPrice(e.target.checked)} />
          Show price publicly
        </label>
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

/* ── Legacy Rate Card tab ──────────────────────────────────────── */

function RateCard({ rateCard }: { rateCard: Record<string, number> | null }) {
  if (!rateCard || Object.keys(rateCard).length === 0) {
    return <p style={emptyStyle}>No rate card set.</p>
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.75rem' }}>Legacy flat rate card. Being replaced by per-account products above.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #e5e5e5', fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Deliverable</th>
            <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', borderBottom: '2px solid #e5e5e5', fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>Rate (₹)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(rateCard).map(([key, paise]) => (
            <tr key={key}>
              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0', textTransform: 'capitalize' }}>{key.replace('_', ' ')}</td>
              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>₹{(paise / 100).toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
