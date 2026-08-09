'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { updateProfile, updateAccount } from './actions'
import { createInvite, revokeInvite, removeTeamMember, toggleAdmin } from './team/actions'

/* ── Types ──────────────────────────────────────────────────────── */

interface Member {
  id: string
  email: string
  name: string | null
  isAdmin: boolean
  joinedAt: string
  isCurrentUser: boolean
}

interface PendingInvite {
  id: string
  email: string
  expiresAt: string
}

interface Props {
  brandName: string
  brandCategory: string
  brandWebsite: string
  brandBio: string
  brandLocation: string
  brandContactEmail: string
  brandSocials: Record<string, string>
  userName: string
  userEmail: string
  userPhone: string
  userLanguage: string
  userTimezone: string
  authProvider: string
  authEmail: string
  isAdmin: boolean
  teamMembers: Member[]
  pendingInvites: PendingInvite[]
}

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', prefix: '@', placeholder: 'yourbrand' },
  { key: 'youtube', label: 'YouTube', prefix: '@', placeholder: 'yourchannel' },
  { key: 'linkedin', label: 'LinkedIn', prefix: '', placeholder: 'company/yourbrand' },
  { key: 'twitter', label: 'X (Twitter)', prefix: '@', placeholder: 'yourbrand' },
]

const BRAND_CATEGORIES = ['D2C', 'Fashion', 'Tech & finance', 'Beauty', 'Lifestyle', 'FMCG', 'Fintech', 'Health & fitness', 'Food & beverage', 'Education', 'Gaming', 'Travel', 'Other']

/* ── Section Config ─────────────────────────────────────────────── */

const SECTIONS: { id: string; label: string; icon: string; brandOnly?: boolean }[] = [
  { id: 'profile', label: 'Profile', icon: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'account', label: 'Account', icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' },
  { id: 'payments', label: 'Payments', icon: 'M2 5h20v14H2zM2 10h20' },
  { id: 'team', label: 'Team', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', brandOnly: true },
]

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

/* ── Main Component ─────────────────────────────────────────────── */

export default function SettingsClient({
  brandName: initialBrandName,
  brandCategory: initialCategory,
  brandWebsite: initialWebsite,
  brandBio: initialBio,
  brandLocation: initialLocation,
  brandContactEmail: initialContactEmail,
  brandSocials: initialSocials,
  userName: initialUserName,
  userEmail: initialEmail,
  userPhone: initialPhone,
  userLanguage: initialLanguage,
  userTimezone: initialTimezone,
  authProvider,
  authEmail,
  isAdmin,
  teamMembers,
  pendingInvites,
}: Props) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const validSections = SECTIONS.map(s => s.id)
  const initialSection = tabParam && validSections.includes(tabParam) ? tabParam : 'profile'
  const [section, setSection] = useState(initialSection)

  useEffect(() => {
    if (tabParam && validSections.includes(tabParam)) setSection(tabParam)
  }, [tabParam])
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState('')
  const [saving, startSave] = useTransition()

  // Form state
  const [brandName, setBrandName] = useState(initialBrandName)
  const [category, setCategory] = useState(initialCategory)
  const [website, setWebsite] = useState(initialWebsite)
  const [bio, setBio] = useState(initialBio)
  const [location, setLocation] = useState(initialLocation)
  const [contactEmail, setContactEmail] = useState(initialContactEmail)
  const [socials, setSocials] = useState<Record<string, string>>(initialSocials)
  const [userName, setUserName] = useState(initialUserName)
  const [userEmail, setUserEmail] = useState(initialEmail)
  const [userPhone, setUserPhone] = useState(initialPhone)
  const [language, setLanguage] = useState(initialLanguage)
  const [timezone, setTimezone] = useState(initialTimezone)

  const markDirty = useCallback(() => setDirty(true), [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }, [])

  const handleSave = () => {
    startSave(async () => {
      // Save profile fields
      const profileRes = await updateProfile({
        brandName,
        category,
        website,
        bio,
        location,
        contactEmail,
        socials,
        fullName: userName,
        email: userEmail,
        phone: userPhone,
      })
      if (profileRes.error) {
        showToast(`Error: ${profileRes.error}`)
        return
      }

      // Save account preferences
      const accountRes = await updateAccount({
        email: userEmail,
        phone: userPhone,
        language,
        timezone,
      })
      if (accountRes.error) {
        showToast(`Error: ${accountRes.error}`)
        return
      }

      setDirty(false)
      showToast('Changes saved.')
    })
  }

  const handleDiscard = () => {
    setBrandName(initialBrandName)
    setCategory(initialCategory)
    setWebsite(initialWebsite)
    setBio(initialBio)
    setLocation(initialLocation)
    setContactEmail(initialContactEmail)
    setSocials(initialSocials)
    setUserName(initialUserName)
    setUserEmail(initialEmail)
    setUserPhone(initialPhone)
    setLanguage(initialLanguage)
    setTimezone(initialTimezone)
    setDirty(false)
    showToast('Changes discarded.')
  }

  const updateSocial = (platform: string, handle: string) => {
    setSocials(prev => ({ ...prev, [platform]: handle }))
    markDirty()
  }

  const initials = getInitials(brandName || userName || '?')

  return (
    <div style={{ padding: 'clamp(20px,2.6vw,34px) clamp(22px,4vw,56px) clamp(64px,6vw,110px)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Page header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
            <Link href="/dashboard" style={{ color: 'var(--ink-faint)' }}>Account</Link>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>Settings</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 'clamp(22px,2.4vw,30px)', margin: '10px 0 0', color: 'var(--ink)' }}>Settings</h1>
        </div>

        <div className="set-grid" style={{ display: 'grid', gridTemplateColumns: '232px 1fr', gap: 'clamp(16px,2vw,26px)', alignItems: 'start' }}>

          {/* ═══ SIDEBAR ═══ */}
          <aside className="set-side panel" style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 2, padding: 10, borderRadius: 20, border: '1px solid var(--frost-edge)', background: 'var(--card)', boxShadow: '0 24px 54px -40px rgba(40,45,25,.32), inset 0 1px 0 rgba(255,255,255,.92)' }}>
            {SECTIONS.map(s => {
              if (s.brandOnly && !isAdmin) return null
              const on = section === s.id
              const danger = s.id === 'danger'
              const col = danger ? '#C43D3D' : (on ? 'var(--ink)' : 'var(--ink-soft)')
              return (
                <div
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className="navitem"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 12,
                    fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: on ? 700 : 600,
                    color: col, cursor: 'pointer',
                    background: on ? (danger ? 'rgba(214,64,64,.08)' : 'rgba(232,255,102,.2)') : 'transparent',
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0, color: col,
                    background: on ? (danger ? 'rgba(214,64,64,.12)' : 'rgba(210,240,74,.35)') : 'rgba(40,45,25,.05)',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
                  </span>
                  <span style={{ flex: 1 }}>{s.label}</span>
                  {s.brandOnly && !on && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-faint)', background: 'rgba(40,45,25,.06)', borderRadius: 6, padding: '2px 6px' }}>Brand</span>
                  )}
                </div>
              )
            })}
          </aside>

          {/* ═══ CONTENT ═══ */}
          <div style={{ minWidth: 0 }}>

            {/* ── PROFILE ── */}
            {section === 'profile' && (
              <div className="reveal panel" style={panelStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={h2Style}>Profile</h2>
                    <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '6px 0 0' }}>Your public company profile brands and creators see.</p>
                  </div>
                  <Link href="/browse" className="pill" style={{ ...pillBtn, borderRadius: 'var(--radius-pill)' }}>
                    View company profile
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                  </Link>
                </div>

                {/* Avatar row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 22, paddingBottom: 22, borderBottom: '1px solid var(--border-hairline)' }}>
                  <span style={{
                    width: 72, height: 72, borderRadius: 20, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26,
                    color: 'var(--ink)', background: 'linear-gradient(135deg,var(--sec-2),var(--sec-2))',
                    border: '1px solid var(--frost-edge)', boxShadow: 'inset 0 1px 0 var(--card)',
                  }}>{initials}</span>
                  <div>
                    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                      <span className="pill" onClick={markDirty} style={pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
                        Upload photo
                      </span>
                      <span className="pill" style={{ ...pillBtn, color: 'var(--ink-soft)' }}>Remove</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 8 }}>JPG or PNG, at least 400x400px.</div>
                  </div>
                </div>

                {/* Basic fields */}
                <div className="form-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 22 }}>
                  <FieldInput label="Company name" value={brandName} onChange={v => { setBrandName(v); markDirty() }} />
                  <FieldInput label="Website" value={website} onChange={v => { setWebsite(v); markDirty() }} placeholder="acmebrands.com" />
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={labelStyle}>Bio</label>
                    <textarea
                      className="fld"
                      value={bio}
                      onChange={e => { setBio(e.target.value); markDirty() }}
                      placeholder="Tell creators about your brand..."
                      style={{ ...fldStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.55 }}
                    />
                  </div>
                  <FieldSelect label="Niche / category" value={category} options={BRAND_CATEGORIES} onChange={v => { setCategory(v); markDirty() }} placeholder="Select category" />
                  <FieldInput label="Location" value={location} onChange={v => { setLocation(v); markDirty() }} placeholder="Mumbai, India" />
                  <FieldInput label="Contact email" value={contactEmail} onChange={v => { setContactEmail(v); markDirty() }} placeholder="team@yourbrand.com" />
                  <FieldInput label="Contact person" value={userName} onChange={v => { setUserName(v); markDirty() }} placeholder="Your name" />
                </div>

                {/* Social accounts */}
                <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid var(--border-hairline)' }}>
                  <div style={eyebrowStyle}>Social accounts</div>
                  <div className="form-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
                    {SOCIAL_PLATFORMS.map(p => (
                      <div key={p.key}>
                        <label style={labelStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <SocialIcon platform={p.key} />
                            {p.label}
                          </span>
                        </label>
                        <div style={{ position: 'relative' }}>
                          {p.prefix && (
                            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)', fontSize: 14, fontFamily: 'var(--font-ui)', pointerEvents: 'none' }}>{p.prefix}</span>
                          )}
                          <input
                            className="fld"
                            type="text"
                            value={socials[p.key] || ''}
                            onChange={e => updateSocial(p.key, e.target.value)}
                            placeholder={p.placeholder}
                            style={{ ...fldStyle, paddingLeft: p.prefix ? 28 : 14 }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── ACCOUNT ── */}
            {section === 'account' && (
              <div className="reveal panel" style={panelStyle}>
                <h2 style={h2Style}>Account</h2>
                <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '6px 0 0' }}>Sign-in details and preferences.</p>
                <div className="form-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 22 }}>
                  <FieldInput label="Email" value={userEmail} onChange={v => { setUserEmail(v); markDirty() }} />
                  <FieldInput label="Phone number" value={userPhone} onChange={v => { setUserPhone(v); markDirty() }} placeholder="+91 98765 43210" />
                  <FieldSelect label="Language" value={language} options={['English', 'हिन्दी']} onChange={v => { setLanguage(v); markDirty() }} />
                  <FieldSelect label="Timezone" value={timezone} options={['IST (GMT+5:30)', 'GMT', 'PST']} onChange={v => { setTimezone(v); markDirty() }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
                  {/* Auth row */}
                  <div style={infoRow}>
                    <span style={iconBox}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>Authentication</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>
                        {authProvider === 'google' ? `Signed in with Google · ${authEmail}` : `One-time code via ${authProvider}`}
                      </div>
                    </div>
                    <span className="pill" style={smallPill}>Manage</span>
                  </div>

                  {/* Google row — only show if signed in with Google */}
                  {authProvider === 'google' && (
                    <div style={infoRow}>
                      <span style={iconBox}>
                        <svg width="17" height="17" viewBox="0 0 48 48">
                          <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.8 5.3C42.7 42.2 45 36.7 45 24z" />
                          <path fill="#34A853" d="M24 46c5.9 0 10.8-2 14.4-5.2l-6.8-5.3c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.9-12.5-9.2l-7 5.4C7.9 40.8 15.3 46 24 46z" />
                          <path fill="#FBBC05" d="M11.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7-5.4C3.6 17.1 3 20.5 3 24s.6 6.9 1.5 9.9z" />
                          <path fill="#EA4335" d="M24 10.8c3.2 0 5.4 1.4 6.6 2.5l5.9-5.8C32.8 4.1 28 2 24 2 15.3 2 7.9 7.2 4.5 14.1l7 5.4C13.3 14.7 18.2 10.8 24 10.8z" />
                        </svg>
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>Google</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>Connected · {authEmail}</div>
                      </div>
                      <span className="pill" style={{ ...smallPill, color: 'var(--ink-soft)' }}>Disconnect</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PAYMENTS ── */}
            {section === 'payments' && (
              <div className="reveal panel" style={panelStyle}>
                <h2 style={h2Style}>Payments</h2>
                <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '6px 0 0' }}>How you pay creators, plus tax and invoice details.</p>

                <div style={{ marginTop: 20, padding: 16, borderRadius: 14, border: '1px solid var(--border-hairline)', background: 'rgba(247,250,253,.8)' }}>
                  <div style={eyebrowStyle}>Payment method</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 12 }}>
                    <span style={{ ...iconBox, width: 44, height: 44, borderRadius: 12 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>Razorpay</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 2 }}>Payment links for each deal</div>
                    </div>
                    <span className="pill" onClick={markDirty} style={smallPill}>Edit</span>
                  </div>
                </div>

                <div className="form-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  <FieldSelect label="Billing cycle" value="Monthly" options={['Monthly', 'Weekly', 'On approval']} onChange={markDirty} />
                  <FieldInput label="GST / tax ID" value="" onChange={markDirty} placeholder="27AABCU9603R1ZX" />
                  <div style={{ gridColumn: '1/-1' }}>
                    <FieldInput label="Billing address" value="" onChange={markDirty} placeholder="4th Floor, Acme House, Bandra, Mumbai 400050" />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <FieldSelect label="Invoice preferences" value="Email a PDF on every payment" options={['Email a PDF on every payment', 'Monthly summary only', 'No emails']} onChange={markDirty} />
                  </div>
                </div>
              </div>
            )}

            {/* ── TEAM ── */}
            {section === 'team' && isAdmin && (
              <div className="reveal panel" style={panelStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={h2Style}>Team</h2>
                    <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '6px 0 0' }}>Invite teammates and manage their access.</p>
                  </div>
                  <InviteButton />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
                  {teamMembers.map(m => (
                    <TeamMemberRow key={m.id} member={m} isAdmin={isAdmin} onDirty={markDirty} onToast={showToast} />
                  ))}
                </div>

                {pendingInvites.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ ...eyebrowStyle, marginBottom: 10 }}>Pending invites</div>
                    {pendingInvites.map(inv => (
                      <PendingInviteRow key={inv.id} invite={inv} onToast={showToast} />
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ═══ SAVE / DISCARD BAR ═══ */}
      {dirty && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 80,
          display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px 12px 22px',
          borderRadius: 'var(--radius-pill)', background: 'rgba(24,28,36,.94)',
          boxShadow: '0 24px 50px -18px rgba(0,0,0,.5)', animation: 'barUp .3s cubic-bezier(.22,1,.36,1)',
        }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 500, color: 'var(--card)' }}>You have unsaved changes</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span onClick={handleDiscard} style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)', cursor: 'pointer', padding: '0 6px' }}>Discard</span>
            <span
              onClick={handleSave}
              className="neonbtn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, height: 42, padding: '0 20px',
                borderRadius: 'var(--radius-pill)', background: 'var(--neon)',
                fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)',
                cursor: 'pointer', boxShadow: '0 12px 26px -10px rgba(180,210,60,.9)',
              }}
            >{saving ? 'Saving...' : 'Save changes'}</span>
          </div>
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 90,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(24,28,36,.92)', color: 'var(--card)', borderRadius: 999,
          padding: '12px 20px', boxShadow: '0 20px 44px -18px rgba(0,0,0,.5)',
          animation: 'barUp .3s cubic-bezier(.22,1,.36,1)',
        }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--neon)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#181C24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: 500 }}>{toast}</span>
        </div>
      )}

      {/* Inline CSS for animations + responsive */}
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes barUp { from { opacity: 0; transform: translate(-50%,16px); } to { opacity: 1; transform: translate(-50%,0); } }
        .reveal { animation: fadeUp .4s cubic-bezier(.22,1,.36,1); }
        .navitem { transition: background .14s ease, color .14s ease; }
        .navitem:hover { background: #F1F5FB; }
        .pill { transition: background .16s ease, box-shadow .16s ease, transform .12s ease, color .16s ease; }
        .pill:hover { box-shadow: 0 8px 18px -10px rgba(40,45,25,.4); transform: translateY(-1px); }
        .neonbtn { transition: filter .16s ease, transform .12s ease, box-shadow .16s ease; }
        .neonbtn:hover { filter: brightness(1.03); transform: translateY(-1px); box-shadow: 0 14px 28px -8px rgba(180,210,60,.95); }
        .fld { border: 1px solid var(--hairline, #EAEAE3) !important; transition: border-color .16s ease, box-shadow .16s ease; }
        .fld::placeholder { color: var(--ink-faint); }
        .fld:focus { border-color: var(--neon-deep) !important; box-shadow: 0 0 0 3px rgba(218,254,12,.18) !important; }
        textarea.fld { resize: vertical; min-height: 80px; line-height: 1.55; }
        @media (max-width: 900px) {
          .set-grid { grid-template-columns: 1fr !important; }
          .set-side { position: static !important; flex-direction: row !important; overflow-x: auto; }
        }
        @media (max-width: 560px) { .form-2 { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}

/* ── Shared styles ──────────────────────────────────────────────── */

const panelStyle: React.CSSProperties = {
  padding: 'clamp(20px,2.4vw,30px)', borderRadius: 20,
  border: '1px solid var(--frost-edge)', background: 'var(--card)',
  boxShadow: '0 24px 54px -40px rgba(40,45,25,.32), inset 0 1px 0 rgba(255,255,255,.92)',
}

const h2Style: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 20, margin: 0,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 7,
}

const pillBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px',
  borderRadius: 11, background: 'var(--card)', border: '1px solid var(--frost-edge)',
  fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer',
  boxShadow: '0 6px 16px -12px rgba(40,45,25,.4)',
}

const smallPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 13px',
  borderRadius: 10, background: 'var(--card)', border: '1px solid var(--frost-edge)',
  fontWeight: 600, fontSize: 12, cursor: 'pointer',
}

const infoRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
  borderRadius: 14, border: '1px solid var(--border-hairline)', background: 'rgba(247,250,253,.8)',
}

const iconBox: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 38, height: 38, borderRadius: 11, background: 'var(--card)', border: '1px solid var(--frost-edge)',
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 10.5,
  letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--ink-faint)',
}

const fldStyle: React.CSSProperties = {
  outline: 'none', width: '100%', fontFamily: 'var(--font-ui)', fontSize: 14,
  color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--hairline)',
  borderRadius: 12, padding: '12px 14px', boxShadow: 'inset 0 1px 2px rgba(40,45,25,.04)',
}

/* ── Social Icon ────────────────────────────────────────────────── */

function SocialIcon({ platform }: { platform: string }) {
  const s = { width: 14, height: 14, flexShrink: 0 } as const
  switch (platform) {
    case 'instagram':
      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1.5" fill="var(--ink-soft)" stroke="none" /></svg>
    case 'youtube':
      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" /><path d="m10 15 5-3-5-3z" /></svg>
    case 'linkedin':
      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></svg>
    case 'twitter':
      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l11.7 16h4.3L8.3 4H4z" /><path d="M4 20l6.8-8" /><path d="M20 4l-6.8 8" /></svg>
    default:
      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
  }
}

/* ── Shared field components ────────────────────────────────────── */

function FieldInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="fld" type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={fldStyle} />
    </div>
  )
}

function FieldSelect({ label, value, options, onChange, placeholder }: { label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        className="fld"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          ...fldStyle, appearance: 'none', cursor: 'pointer', paddingRight: 36,
          color: !value && placeholder ? 'var(--ink-faint)' : 'var(--ink)',
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238B90A0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 13px center',
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

/* ── Invite Button ──────────────────────────────────────────────── */

function InviteButton() {
  const [show, setShow] = useState(false)
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ inviteUrl?: string; error?: string; email?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const res = await createInvite(email)
      setResult(res)
    })
  }

  const handleCopy = () => {
    if (result?.inviteUrl) {
      navigator.clipboard.writeText(result.inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      <span className="pill" onClick={() => setShow(true)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px',
        borderRadius: 12, background: 'var(--card)', border: '1px solid var(--frost-edge)',
        fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer',
        boxShadow: '0 6px 16px -12px rgba(40,45,25,.4)',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        Invite teammate
      </span>

      {show && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => { setShow(false); setResult(null); setEmail('') }}>
          <div style={{ ...panelStyle, width: '100%', maxWidth: 480, padding: '1.5rem' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ ...h2Style, fontSize: 18, marginBottom: 8 }}>Invite teammate</h2>
            {!result?.inviteUrl ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '0 0 16px' }}>They&apos;ll get a link to join your brand. The invite expires in 7 days.</p>
                <form onSubmit={handleSubmit}>
                  <input className="fld" type="email" placeholder="colleague@company.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus style={fldStyle} />
                  {result?.error && <p style={{ fontSize: 13, color: '#C43D3D', margin: '8px 0 0' }}>{result.error}</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button type="button" className="pill" style={{ ...pillBtn, border: '1px solid var(--frost-edge)' }} onClick={() => { setShow(false); setResult(null) }}>Cancel</button>
                    <button type="submit" className="neonbtn" disabled={pending} style={{
                      height: 40, padding: '0 18px', borderRadius: 12, background: 'var(--neon)', border: 'none',
                      fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer',
                    }}>{pending ? 'Sending...' : 'Send invite'}</button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, margin: '0 0 12px' }}>Invite created for <strong>{result.email}</strong></p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={result.inviteUrl} style={{ ...fldStyle, flex: 1, fontSize: 12.5, color: 'var(--ink-faint)' }} onFocus={e => e.target.select()} />
                  <span className="neonbtn" onClick={handleCopy} style={{
                    height: 40, padding: '0 18px', borderRadius: 12, background: 'var(--neon)',
                    fontWeight: 700, fontSize: 13, color: 'var(--ink)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center',
                  }}>{copied ? 'Copied!' : 'Copy link'}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: '12px 0 0' }}>Share this link via Slack, WhatsApp, or email.</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                  <span className="pill" onClick={() => { setShow(false); setResult(null); setEmail('') }} style={pillBtn}>Done</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ── Team Member Row ────────────────────────────────────────────── */

function TeamMemberRow({ member, isAdmin, onDirty, onToast }: { member: Member; isAdmin: boolean; onDirty: () => void; onToast: (msg: string) => void }) {
  const [pending, startTransition] = useTransition()

  const handleToggleRole = () => {
    startTransition(async () => {
      const res = await toggleAdmin(member.id)
      if (res.error) onToast(`Error: ${res.error}`)
    })
  }

  const handleRemove = () => {
    if (!confirm(`Remove ${member.name || member.email} from the team?`)) return
    startTransition(async () => {
      const res = await removeTeamMember(member.id)
      if (res.error) onToast(`Error: ${res.error}`)
    })
  }

  const roleTag: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', padding: '4px 11px',
    borderRadius: 'var(--radius-pill)', fontSize: 10.5, fontWeight: 700,
    letterSpacing: '.03em', textTransform: 'uppercase',
    color: 'var(--ink-soft)', background: 'rgba(40,45,25,.06)', border: '1px solid var(--border-hairline)',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 0', borderTop: '1px solid var(--border-hairline)' }}>
      <span style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
        background: 'linear-gradient(135deg,var(--sec-2),var(--sec-2))', border: '1px solid var(--frost-edge)',
      }}>{getInitials(member.name || member.email)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
          {member.name || member.email}
          {member.isCurrentUser && <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}> (You)</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{member.email}</div>
      </div>
      <span style={roleTag}>{member.isAdmin ? 'Admin' : 'Member'}</span>
      {isAdmin && !member.isCurrentUser && (
        <select
          className="fld"
          style={{
            ...fldStyle, width: 'auto', padding: '8px 30px 8px 12px', fontSize: 12.5,
            appearance: 'none', cursor: 'pointer',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238B90A0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
          }}
          value={member.isAdmin ? 'Admin' : 'Member'}
          onChange={e => {
            const newRole = e.target.value
            if ((newRole === 'Admin') !== member.isAdmin) handleToggleRole()
          }}
          disabled={pending}
        >
          <option value="Admin">Admin</option>
          <option value="Member">Member</option>
        </select>
      )}
    </div>
  )
}

/* ── Pending Invite Row ─────────────────────────────────────────── */

function PendingInviteRow({ invite, onToast }: { invite: PendingInvite; onToast: (msg: string) => void }) {
  const [pending, startTransition] = useTransition()
  const [revoked, setRevoked] = useState(false)

  if (revoked) return null

  const daysLeft = Math.ceil((new Date(invite.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0', borderTop: '1px solid var(--border-hairline)' }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{invite.email}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-faint)', marginLeft: 8 }}>expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
      </div>
      <span
        className="pill"
        onClick={() => {
          startTransition(async () => {
            const res = await revokeInvite(invite.id)
            if (res.error) onToast(`Error: ${res.error}`)
            else setRevoked(true)
          })
        }}
        style={{ ...smallPill, opacity: pending ? 0.5 : 1 }}
      >Revoke</span>
    </div>
  )
}
