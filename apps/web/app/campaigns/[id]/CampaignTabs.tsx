'use client'

import { useState } from 'react'

export default function CampaignTabs({
  briefTab,
  collaborationsTab,
}: {
  briefTab: React.ReactNode
  collaborationsTab: React.ReactNode
}) {
  const [activeTab, setActiveTab] = useState<'collaborations' | 'brief'>('collaborations')

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e5e5', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('collaborations')}
          style={activeTab === 'collaborations' ? activeTabStyle : inactiveTabStyle}
        >
          Collaborations
        </button>
        <button
          onClick={() => setActiveTab('brief')}
          style={activeTab === 'brief' ? activeTabStyle : inactiveTabStyle}
        >
          Brief
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'collaborations' ? collaborationsTab : briefTab}
    </div>
  )
}

const baseTabStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  marginBottom: '-1px',
}

const activeTabStyle: React.CSSProperties = {
  ...baseTabStyle,
  color: 'var(--color-heading, #111)',
  borderBottomColor: '#111',
}

const inactiveTabStyle: React.CSSProperties = {
  ...baseTabStyle,
  color: '#888',
}
