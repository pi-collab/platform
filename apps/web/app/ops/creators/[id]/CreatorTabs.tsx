'use client'

import { useState } from 'react'
import { vetCreator, rejectCreator } from '../../actions'
import { useRouter } from 'next/navigation'

interface SocialAccount {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
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

const TABS = ['Basic Details', 'Social Accounts', 'Rate Card', 'Portfolio & Brands'] as const
type Tab = typeof TABS[number]

export default function CreatorTabs({ creator }: { creator: Creator }) {
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
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e5e5', marginBottom: '1.25rem' }}>
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
      {tab === 'Rate Card' && <RateCard rateCard={creator.rate_card} />}
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

function RateCard({ rateCard }: { rateCard: Record<string, number> | null }) {
  if (!rateCard || Object.keys(rateCard).length === 0) {
    return <p style={emptyStyle}>No rate card set.</p>
  }

  return (
    <div style={{ maxWidth: 400 }}>
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

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={labelStyle}>{label}</p>
      <p style={{ fontSize: '0.8125rem', color: value ? '#111' : '#ccc', margin: 0 }}>{value || '—'}</p>
    </div>
  )
}

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
