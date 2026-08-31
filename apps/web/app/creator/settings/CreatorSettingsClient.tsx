'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { updateCreatorProfile, updateCreatorAccount } from './actions'
import CreatorPageHeader from '@/components/creator/CreatorPageHeader'
import AvatarUpload from '@/components/AvatarUpload'

/* ── Types ──────────────────────────────────────────────────────── */

import ConnectedAccounts from './ConnectedAccounts'
import type { IgConnectionView } from '@/lib/instagram-sync'
import './connected-accounts.css'

interface SocialEntry {
  platform: string
  handle: string
}

interface Props {
  creatorName: string
  creatorHandle: string
  creatorBio: string
  creatorNiche: string
  creatorLocation: string
  creatorPrimaryPlatform: string
  creatorContactEmail: string
  creatorSocials: SocialEntry[]
  instagramConnection: IgConnectionView
  /** Current profile photo, so the uploader can show it and offer Remove. */
  creatorPhotoUrl: string | null
  userEmail: string
  userPhone: string
  userLanguage: string
  userTimezone: string
  authProvider: string
  authEmail: string
}

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', prefix: '@', placeholder: 'yourbrand' },
  { key: 'youtube', label: 'YouTube', prefix: '@', placeholder: 'yourchannel' },
  { key: 'linkedin', label: 'LinkedIn', prefix: '', placeholder: 'in/yourname' },
  { key: 'twitter', label: 'X (Twitter)', prefix: '@', placeholder: 'yourhandle' },
]

const NICHE_OPTIONS = ['Tech & finance', 'Fashion', 'Beauty', 'Lifestyle', 'Food', 'Travel', 'Fitness', 'Education', 'Gaming', 'Other']
const PLATFORM_OPTIONS = ['Instagram', 'YouTube', 'X', 'LinkedIn', 'TikTok']

/* ── Section Config ─────────────────────────────────────────────── */

const SECTIONS: { id: string; label: string; icon: string }[] = [
  { id: 'profile', label: 'Profile', icon: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'connected', label: 'Connected accounts', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
  { id: 'account', label: 'Account', icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' },
]

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

/* ── Main Component ─────────────────────────────────────────────── */

export default function CreatorSettingsClient({
  creatorName: initialName,
  creatorHandle: initialHandle,
  creatorBio: initialBio,
  creatorNiche: initialNiche,
  creatorLocation: initialLocation,
  creatorPrimaryPlatform: initialPlatform,
  creatorContactEmail: initialContactEmail,
  creatorPhotoUrl,
  creatorSocials: initialSocials,
  instagramConnection,
  userEmail: initialEmail,
  userPhone: initialPhone,
  userLanguage: initialLanguage,
  userTimezone: initialTimezone,
  authProvider,
  authEmail,
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

  // Profile form state
  const [name, setName] = useState(initialName)
  const [handle, setHandle] = useState(initialHandle)
  const [bio, setBio] = useState(initialBio)
  const [niche, setNiche] = useState(initialNiche)
  const [location, setLocation] = useState(initialLocation)
  const [platform, setPlatform] = useState(initialPlatform)
  const [contactEmail, setContactEmail] = useState(initialContactEmail)

  // Social accounts — convert array to a map for easy editing
  const socialsToMap = (arr: SocialEntry[]): Record<string, string> => {
    const m: Record<string, string> = {}
    for (const s of arr) m[s.platform] = s.handle
    return m
  }
  const [socials, setSocials] = useState<Record<string, string>>(socialsToMap(initialSocials))

  // Account form state
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
      // Convert socials map back to array
      const socialArr = Object.entries(socials)
        .filter(([, h]) => h.trim())
        .map(([p, h]) => ({ platform: p, handle: h }))

      const profileRes = await updateCreatorProfile({
        fullName: name,
        handle,
        bio,
        niche,
        location,
        primaryPlatform: platform,
        contactEmail,
        socials: socialArr,
      })
      if (profileRes.error) {
        showToast(`Error: ${profileRes.error}`)
        return
      }

      const accountRes = await updateCreatorAccount({
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
    setName(initialName)
    setHandle(initialHandle)
    setBio(initialBio)
    setNiche(initialNiche)
    setLocation(initialLocation)
    setPlatform(initialPlatform)
    setContactEmail(initialContactEmail)
    setSocials(socialsToMap(initialSocials))
    setUserEmail(initialEmail)
    setUserPhone(initialPhone)
    setLanguage(initialLanguage)
    setTimezone(initialTimezone)
    setDirty(false)
    showToast('Changes discarded.')
  }

  const updateSocial = (p: string, h: string) => {
    setSocials(prev => ({ ...prev, [p]: h }))
    markDirty()
  }

  const initials = getInitials(name || '?')

  return (
    <div className="set-page" style={{ padding: 'clamp(20px,2.6vw,34px) clamp(22px,4vw,56px) clamp(64px,6vw,110px)' }}>

      {/* On a phone this is one screen, not a tabbed page: the side nav is
          hidden and the section comes from ?tab=, so "Edit profile" and
          "Settings" are two destinations rather than one page with a strip of
          tabs on top of the tab bar. Back goes to the profile tab it was
          opened from — the desktop breadcrumb's /creator/dashboard would drop
          a creator somewhere they never were. */}
      <div className="set-mobile-head">
        <CreatorPageHeader
          title={section === 'account' ? 'Settings' : 'Edit profile'}
          backHref="/creator/profile"
        />
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Page header */}
        <div className="set-desktop-head" style={{ marginBottom: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-faint)' }}>
            <Link href="/creator/dashboard" style={{ color: 'var(--ink-faint)' }}>Account</Link>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>Settings</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em', fontSize: 'clamp(22px,2.4vw,30px)', margin: '10px 0 0', color: 'var(--ink)' }}>Settings</h1>
        </div>

        <div className="set-grid" style={{ display: 'grid', gridTemplateColumns: '232px 1fr', gap: 'clamp(16px,2vw,26px)', alignItems: 'start' }}>

          {/* ═══ SIDE NAV ═══ */}
          <aside className="set-side panel" style={{ position: 'sticky', top: 88, display: 'flex', flexDirection: 'column', gap: 2, padding: 10, borderRadius: 20, border: '1px solid var(--frost-edge)', background: 'var(--card)', boxShadow: '0 24px 54px -40px rgba(40,45,25,.32), inset 0 1px 0 rgba(255,255,255,.92)' }}>
            {SECTIONS.map(s => {
              const on = section === s.id
              return (
                <div
                  key={s.id}
                  className="navitem"
                  onClick={() => setSection(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px',
                    borderRadius: 12, fontFamily: 'var(--font-ui)', fontSize: 13.5,
                    fontWeight: on ? 700 : 600, color: on ? 'var(--ink)' : 'var(--ink-soft)',
                    background: on ? 'rgba(232,255,102,.2)' : 'transparent', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    color: on ? 'var(--ink)' : 'var(--ink-soft)',
                    background: on ? 'rgba(210,240,74,.35)' : 'rgba(40,45,25,.05)',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
                  </span>
                  <span style={{ flex: 1 }}>{s.label}</span>
                </div>
              )
            })}
          </aside>

          {/* ═══ SECTION CONTENT ═══ */}
          <div style={{ minWidth: 0 }}>

            {/* ── PROFILE ── */}
            {section === 'profile' && (
              <div className="reveal panel" style={panelStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={h2Style}>Profile</h2>
                    <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: '6px 0 0' }}>Your public creator profile brands see.</p>
                  </div>
                  <Link href="/creator/storefront" className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 'var(--radius-pill)', background: 'var(--card)', border: '1px solid var(--frost-edge)', fontWeight: 600, fontSize: 12.5, color: 'var(--ink)', boxShadow: '0 6px 16px -12px rgba(40,45,25,.4)' }}>
                    View shopfront
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
                  </Link>
                </div>

                {/* Avatar. These were two inert <span>s — a creator could tap
                    "Upload photo" and "Remove" forever and nothing happened.
                    The real uploader existed but was rendered nowhere. */}
                <div style={{ marginTop: 22, paddingBottom: 22, borderBottom: '1px solid var(--border-hairline)' }}>
                  <AvatarUpload currentUrl={creatorPhotoUrl} name={name} />
                </div>

                {/* Profile fields */}
                <div className="form-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 22 }}>
                  <FieldInput label="Full name" value={name} onChange={v => { setName(v); markDirty() }} />
                  <FieldInput label="Handle" value={handle} onChange={v => { setHandle(v); markDirty() }} placeholder="@maya.money" />
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={labelStyle}>Bio</label>
                    <textarea
                      className="fld"
                      value={bio}
                      onChange={e => { setBio(e.target.value); markDirty() }}
                      placeholder="Tell brands about yourself..."
                      style={{ ...fldStyle, minHeight: 80, resize: 'vertical' }}
                    />
                  </div>
                  <FieldSelect label="Niche / category" value={niche} options={NICHE_OPTIONS} onChange={v => { setNiche(v); markDirty() }} placeholder="Select niche" />
                  <FieldInput label="Location" value={location} onChange={v => { setLocation(v); markDirty() }} placeholder="Mumbai, India" />
                  <FieldSelect label="Primary platform" value={platform} options={PLATFORM_OPTIONS} onChange={v => { setPlatform(v); markDirty() }} placeholder="Select platform" />
                  <FieldInput label="Contact email" value={contactEmail} onChange={v => { setContactEmail(v); markDirty() }} placeholder="you@email.com" />
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
            {section === 'connected' && (
              <div className="set-panel">
                <div style={{ marginBottom: 16 }}>
                  <h2 style={h2Style}>Connected accounts</h2>
                  <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)' }}>
                    Link a platform so brands see figures verified from the source, not typed in.
                  </p>
                </div>
                <ConnectedAccounts connection={instagramConnection} />
              </div>
            )}

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
        .set-mobile-head { display: none; }
        @media (max-width: 767.98px) {
          /* Full-bleed header, so it matches deals/payments/notifications
             rather than sitting inset inside the page padding. */
          .set-page { padding: 0 16px 24px !important; }
          .set-mobile-head { display: block; margin: 0 -16px 6px; }
          .set-desktop-head { display: none !important; }
          .set-side { display: none !important; }
          /* 16px, or Safari zooms on focus and pans to keep the caret visible —
             which reads to a creator as the screen sliding sideways the moment
             the keyboard opens. */
          .set-page input, .set-page select, .set-page textarea { font-size: 16px !important; }
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
