/**
 * Styles for the Guapd Experiences console, transcribed from the brand
 * portal (app/deals/page.tsx hero/counters, DealForm field labels, the neon
 * CTA and hairline pill buttons). One place so the console's pages match each
 * other and the portal, and so Chan can restyle them together.
 */
import type React from 'react'

export const container: React.CSSProperties = {
  position: 'relative', zIndex: 1,
  padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)',
  maxWidth: 1200, margin: '0 auto', boxSizing: 'content-box',
}
export const heroCard: React.CSSProperties = {
  borderRadius: 24, background: 'var(--card)',
  padding: 'clamp(26px, 3vw, 40px) clamp(24px, 3vw, 40px) clamp(28px, 3.4vw, 40px)',
}
export const h1: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1,
  fontSize: 'clamp(34px, 4.4vw, 44px)', margin: 0, color: 'var(--ink)',
}
export const serifAccent: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: '1.05em', letterSpacing: 0 }
export const lede: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--wg-600)', margin: '8px 0 0' }
export const card: React.CSSProperties = { padding: 'clamp(20px, 2.4vw, 28px)' }
export const fieldLabel: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.04em',
  marginBottom: 8, display: 'block', fontFamily: 'var(--font-ui)',
}
export const kpiLabel: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wg-500)',
}
export const neonBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 22px', borderRadius: 999,
  background: 'var(--lime-400)', color: 'var(--lime-950)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
  textDecoration: 'none', whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', flexShrink: 0,
  boxShadow: '0 8px 16px -8px rgba(180,215,50,.55)',
}
export const pillBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 999,
  border: '1px solid #EAEAE3', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'var(--font-ui)',
  fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
}
export const formError: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 12, background: '#FDF0F0', border: '1px solid #C4494F30',
  color: '#9C4147', fontFamily: 'var(--font-ui)', fontSize: 13,
}
