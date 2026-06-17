import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { BrowseCreator } from '../page'

interface SocialAccount {
  platform: string
  handle: string
  url: string | null
  follower_count: number | null
  verified: boolean
}

export default async function CreatorProfilePage({ params }: { params: { id: string } }) {
  await verifyApprovedBrand()

  const supabase = createClient()
  const { data: creator, error } = await supabase
    .from('creators')
    .select('id, full_name, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !creator) notFound()

  const c = creator as BrowseCreator & { portfolio_links: string[] | null }
  const socials = (c.social_accounts ?? []) as SocialAccount[]

  return (
    <section style={{ padding: '2.5rem var(--container-pad)', maxWidth: 'var(--container-width)', margin: '0 auto' }}>
      {/* Back link */}
      <Link href="/browse" style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
        &larr; Back to browse
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '2rem' }}>
        {c.profile_photo_url ? (
          <img src={c.profile_photo_url} alt={c.full_name} style={avatarImg} />
        ) : (
          <div style={avatarFallback}>
            {c.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
        )}
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-heading)', margin: '0 0 0.25rem' }}>
            {c.full_name}
          </h1>
          {(c.niches ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {(c.niches as string[]).map((n) => <span key={n} style={nicheBadge}>{n}</span>)}
            </div>
          )}
          {c.bio && <p style={{ fontSize: '0.875rem', color: 'var(--color-body)', margin: '0.75rem 0 0', lineHeight: 1.5, maxWidth: 560 }}>{c.bio}</p>}
        </div>
      </div>

      {/* CTA */}
      <Link
        href={`/deals/new?creator=${c.id}`}
        style={ctaBtn}
      >
        Start a deal with {c.full_name.split(' ')[0]}
      </Link>

      {/* Sections grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '2.5rem' }}>
        {/* Social Accounts */}
        {socials.length > 0 && (
          <div>
            <h2 style={sectionTitle}>Social Accounts</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {socials.map((sa, i) => (
                <div key={i} style={socialCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'capitalize' }}>{sa.platform}</span>
                    {sa.verified && (
                      <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#dcfce7', color: '#166534' }}>Verified</span>
                    )}
                  </div>
                  {sa.handle && <p style={metaText}>@{sa.handle}</p>}
                  {sa.follower_count != null && sa.follower_count > 0 && (
                    <p style={metaText}>{formatFollowers(sa.follower_count)} followers</p>
                  )}
                  {sa.url && (
                    <a href={sa.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: '#2563eb', wordBreak: 'break-all' }}>
                      {sa.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rate Card */}
        {c.rate_card && Object.keys(c.rate_card).length > 0 && (
          <div>
            <h2 style={sectionTitle}>Rate Card</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Deliverable</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(c.rate_card).map(([key, paise]) => (
                  <tr key={key}>
                    <td style={tdStyle}>{key.replace(/_/g, ' ')}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                      ₹{(paise / 100).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Worked With */}
        {c.worked_with && c.worked_with.length > 0 && (
          <div>
            <h2 style={sectionTitle}>Worked With</h2>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {c.worked_with.map((brand, i) => (
                <span key={i} style={brandPill}>{brand}</span>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio Links */}
        {c.portfolio_links && c.portfolio_links.length > 0 && (
          <div>
            <h2 style={sectionTitle}>Portfolio</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {c.portfolio_links.map((link, i) => (
                <a key={i} href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: '#2563eb', wordBreak: 'break-all' }}>
                  {link}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function formatFollowers(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return n.toLocaleString('en-IN')
}

/* ── Styles ─────────────────────────────────────────────────────── */

const avatarImg: React.CSSProperties = {
  width: 80,
  height: 80,
  borderRadius: 'var(--radius-md)',
  objectFit: 'cover',
  border: '1px solid var(--color-border)',
  flexShrink: 0,
}

const avatarFallback: React.CSSProperties = {
  width: 80,
  height: 80,
  borderRadius: 'var(--radius-md)',
  background: 'var(--section-bg-alt)',
  border: '1px solid var(--color-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: '1.25rem',
  color: 'var(--color-muted)',
  fontFamily: 'var(--font-heading)',
  flexShrink: 0,
}

const nicheBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '0.6875rem',
  fontWeight: 600,
  padding: '0.125rem 0.5rem',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--section-bg-alt)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-body)',
}

const ctaBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.625rem 1.5rem',
  background: 'var(--color-heading)',
  color: '#fff',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 700,
  fontSize: '0.875rem',
  textDecoration: 'none',
  fontFamily: 'var(--font-heading)',
}

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: '0.9375rem',
  fontWeight: 700,
  color: 'var(--color-heading)',
  margin: '0 0 0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
}

const socialCard: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: '#fff',
}

const metaText: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: 'var(--color-muted)',
  margin: '0.125rem 0 0',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  borderBottom: '2px solid var(--color-border)',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
}

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid var(--color-border)',
  textTransform: 'capitalize',
}

const brandPill: React.CSSProperties = {
  fontSize: '0.8125rem',
  padding: '0.25rem 0.625rem',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--section-bg-alt)',
  border: '1px solid var(--color-border)',
  fontWeight: 500,
}
