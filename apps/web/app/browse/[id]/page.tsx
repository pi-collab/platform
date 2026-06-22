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

export default async function CreatorProfilePage({ params }: { params: { id: string } }) {
  await verifyApprovedBrand()

  const supabase = createClient()

  const [{ data: creator, error }, { data: products }] = await Promise.all([
    supabase
      .from('creators')
      .select('id, full_name, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('creator_products')
      .select('id, platform, handle, product_type, description, price_paise, display_price, is_active')
      .eq('creator_id', params.id),
  ])

  if (error || !creator) notFound()

  const c = creator as BrowseCreator & { portfolio_links: string[] | null }
  const socials = (c.social_accounts ?? []) as SocialAccount[]
  const activeProducts = (products ?? []).filter((p) => p.is_active)

  // Group products by platform+handle
  const productsByAccount = new Map<string, Product[]>()
  for (const p of activeProducts) {
    const key = `${p.platform}::${p.handle}`
    if (!productsByAccount.has(key)) productsByAccount.set(key, [])
    productsByAccount.get(key)!.push(p)
  }

  // Match social account info for each product group
  function findSocial(platform: string, handle: string): SocialAccount | undefined {
    return socials.find((sa) => sa.platform === platform && sa.handle === handle)
  }

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
      <Link href={`/deals/new?creator=${c.id}`} style={ctaBtn}>
        Start a deal with {c.full_name.split(' ')[0]}
      </Link>

      {/* ── Products storefront ────────────────────────────────── */}
      {productsByAccount.size > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <h2 style={sectionTitle}>Products</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {Array.from(productsByAccount.entries()).map(([key, prods]) => {
              const [platform, handle] = key.split('::')
              const sa = findSocial(platform, handle)
              return (
                <div key={key}>
                  {/* Account header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
                    <span style={platformBadge}>{platform}</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)' }}>@{handle}</span>
                    {sa?.follower_count != null && sa.follower_count > 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                        {formatFollowers(sa.follower_count)} followers
                      </span>
                    )}
                    {sa?.verified && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: 9999, background: '#dcfce7', color: '#166534' }}>Verified</span>
                    )}
                  </div>
                  {/* Product rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {prods.map((p) => (
                      <div key={p.id} style={productRow}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-heading)', margin: 0 }}>
                            {p.product_type}
                          </p>
                          {p.description && (
                            <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: '0.15rem 0 0' }}>
                              {p.description}
                            </p>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          {p.display_price ? (
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)' }}>
                              {formatRupees(p.price_paise)}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                              Price on request
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Details sections ───────────────────────────────────── */}
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
                    <a href={sa.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: 'var(--color-heading)', wordBreak: 'break-all' }}>
                      {sa.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
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
                <a key={i} href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: 'var(--color-heading)', wordBreak: 'break-all' }}>
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

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
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
  background: 'var(--accent)',
  color: 'var(--accent-text)',
  borderRadius: 'var(--radius-lg)',
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

const platformBadge: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'capitalize',
  padding: '0.15rem 0.5rem',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--section-bg-alt)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-heading)',
}

const productRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.75rem 1rem',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--glass-bg)',
  gap: '1rem',
}

const socialCard: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--glass-bg)',
}

const metaText: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: 'var(--color-muted)',
  margin: '0.125rem 0 0',
}

const brandPill: React.CSSProperties = {
  fontSize: '0.8125rem',
  padding: '0.25rem 0.625rem',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--section-bg-alt)',
  border: '1px solid var(--color-border)',
  fontWeight: 500,
}
