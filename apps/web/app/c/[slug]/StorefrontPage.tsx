'use client'

import { useState, useEffect } from 'react'
import type { StorefrontData } from './actions'
import PitchPanel from './PitchPanel'
import { trackEvent } from '@/lib/analytics'

const PLATFORM_ICONS: Record<string, string> = {
  instagram: 'IG',
  youtube: 'YT',
  twitter: 'X',
  linkedin: 'in',
  tiktok: 'TT',
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatPaise(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100_000) return `${(rupees / 100_000).toFixed(1)}L`
  if (rupees >= 1_000) return `${(rupees / 1_000).toFixed(0)}K`
  return `${rupees.toLocaleString('en-IN')}`
}

export default function StorefrontPage({ data }: { data: StorefrontData }) {
  const [showPitch, setShowPitch] = useState(false)
  const [pitchDeliverables, setPitchDeliverables] = useState('')

  useEffect(() => {
    trackEvent('storefront_viewed', { slug: data.slug })
  }, [data.slug])

  function openPitch() {
    trackEvent('pitch_started', { slug: data.slug })
    setShowPitch(true)
  }

  function openPitchWithPackage(pkg: { platform: string; product_type: string; price_paise: number }) {
    trackEvent('pitch_started', { slug: data.slug, package: pkg.product_type })
    setPitchDeliverables(`1 ${pkg.platform} ${pkg.product_type} · ₹${formatPaise(pkg.price_paise)}`)
    setShowPitch(true)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f0fdf4 0%, #fdf2f8 35%, #f5f3ff 65%, #fff7ed 100%)',
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(16px,3vw,32px)' }}>
        {/* Header */}
        <div
          className="glass"
          style={{ padding: 'clamp(24px,3vw,40px)', borderRadius: 24, marginBottom: 24 }}
        >
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Portrait */}
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 20,
                background: data.portrait_path
                  ? `url(${data.portrait_path}) center/cover`
                  : 'linear-gradient(135deg, #a3e635, #22d3ee)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 32,
                fontWeight: 700,
                fontFamily: 'var(--font-display, Sora, sans-serif)',
              }}
            >
              {!data.portrait_path && data.display_name.slice(0, 2).toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <h1
                style={{
                  fontFamily: 'var(--font-display, Sora, sans-serif)',
                  fontWeight: 700,
                  fontSize: 'clamp(24px, 3.5vw, 36px)',
                  letterSpacing: '-0.02em',
                  color: 'var(--ink, #181C24)',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {data.display_name}
              </h1>
              {data.headline && (
                <p style={{ color: 'var(--ink-soft, #555)', fontSize: 16, marginTop: 6, lineHeight: 1.5 }}>
                  {data.headline}
                </p>
              )}

              {/* Categories */}
              {data.categories.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {data.categories.map((cat) => (
                    <span
                      key={cat}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 999,
                        background: 'rgba(218,254,12,.15)',
                        color: 'var(--ink, #181C24)',
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Pitch CTA */}
            <button
              onClick={openPitch}
              style={{
                padding: '12px 28px',
                borderRadius: 999,
                background: 'var(--neon, #DAFE0C)',
                color: 'var(--ink, #181C24)',
                fontWeight: 700,
                fontSize: 15,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui, Inter, sans-serif)',
                whiteSpace: 'nowrap',
              }}
            >
              Send a pitch
            </button>
          </div>

          {/* Stats */}
          {(data.stats.followers || data.stats.avg_views || data.stats.engagement_rate != null) && (
            <div style={{ display: 'flex', gap: 32, marginTop: 24, flexWrap: 'wrap' }}>
              {data.stats.followers != null && (
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>
                    {formatFollowers(data.stats.followers)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Followers</div>
                </div>
              )}
              {data.stats.avg_views != null && (
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>
                    {formatFollowers(data.stats.avg_views)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Avg. views</div>
                </div>
              )}
              {data.stats.engagement_rate != null && (
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>
                    {data.stats.engagement_rate.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Engagement</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bio */}
        {data.bio && (
          <div className="glass" style={{ padding: 'clamp(20px,2.5vw,32px)', borderRadius: 20, marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 12, color: 'var(--ink)' }}>
              About
            </h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {data.bio}
            </p>
          </div>
        )}

        {/* Platform Links */}
        {data.platform_links.length > 0 && (
          <div className="glass" style={{ padding: 'clamp(20px,2.5vw,32px)', borderRadius: 20, marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 12, color: 'var(--ink)' }}>
              Platforms
            </h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {data.platform_links.map((pl) => (
                <a
                  key={`${pl.platform}-${pl.handle}`}
                  href={pl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,.7)',
                    border: '1px solid var(--frost-edge, rgba(255,255,255,.85))',
                    textDecoration: 'none',
                    color: 'var(--ink)',
                    fontSize: 14,
                    fontWeight: 500,
                    transition: 'transform .15s',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 12, opacity: .6 }}>
                    {PLATFORM_ICONS[pl.platform.toLowerCase()] ?? pl.platform.slice(0, 2).toUpperCase()}
                  </span>
                  {pl.handle}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Packages / Rates */}
        {data.packages && data.packages.length > 0 && (
          <div className="glass" style={{ padding: 'clamp(20px,2.5vw,32px)', borderRadius: 20, marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 16, color: 'var(--ink)' }}>
              Packages
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {data.packages.map((pkg, i) => (
                <div
                  key={i}
                  style={{
                    padding: 20,
                    borderRadius: 16,
                    background: '#fff',
                    border: '1px solid var(--frost-edge)',
                    position: 'relative',
                  }}
                >
                  <div style={{ fontSize: 13, color: 'var(--ink-faint)', fontWeight: 500, marginBottom: 4 }}>
                    {pkg.platform} &middot; {pkg.product_type}
                  </div>
                  {pkg.description && (
                    <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 8 }}>
                      {pkg.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20 }}>
                      &#8377;{formatPaise(pkg.price_paise)}
                    </div>
                    <button
                      onClick={() => openPitchWithPackage(pkg)}
                      aria-label={`Add ${pkg.platform} ${pkg.product_type} to pitch`}
                      title="Add to pitch"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        background: 'var(--neon, #DAFE0C)',
                        color: 'var(--ink, #181C24)',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        fontWeight: 700,
                        lineHeight: 1,
                        flexShrink: 0,
                        transition: 'transform .15s',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content Items */}
        {data.content_items.length > 0 && (
          <div className="glass" style={{ padding: 'clamp(20px,2.5vw,32px)', borderRadius: 20, marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 16, color: 'var(--ink)' }}>
              Work
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {data.content_items.map((item, i) => (
                <a
                  key={i}
                  href={item.link || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#fff',
                    border: '1px solid var(--frost-edge)',
                    textDecoration: 'none',
                    color: 'var(--ink)',
                    transition: 'transform .15s',
                  }}
                >
                  {item.image_path && (
                    <div
                      style={{
                        width: '100%',
                        paddingBottom: '56.25%',
                        background: `url(${item.image_path}) center/cover`,
                      }}
                    />
                  )}
                  <div style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>
                    {item.title}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Past Collabs */}
        {data.past_collabs && data.past_collabs.length > 0 && (
          <div className="glass" style={{ padding: 'clamp(20px,2.5vw,32px)', borderRadius: 20, marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, marginBottom: 12, color: 'var(--ink)' }}>
              Worked with
            </h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {data.past_collabs.map((c) => (
                <span
                  key={c.brand_name}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,.8)',
                    border: '1px solid var(--frost-edge)',
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {c.brand_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Creator CTA */}
        <div
          className="glass"
          style={{
            padding: 'clamp(20px,2.5vw,32px)',
            borderRadius: 20,
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 12 }}>
            Are you a creator? Get your own page and let brands find you.
          </p>
          <a
            href="/creator/storefront"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              borderRadius: 999,
              background: 'var(--neon, #DAFE0C)',
              color: 'var(--ink, #181C24)',
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
              fontFamily: 'var(--font-ui, Inter, sans-serif)',
            }}
          >
            Create your shopfront
          </a>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-faint)', fontSize: 13 }}>
          Powered by <strong>Guapd</strong>
        </div>
      </div>

      {/* Pitch Panel */}
      <PitchPanel
        open={showPitch}
        onClose={() => { setShowPitch(false); setPitchDeliverables('') }}
        slug={data.slug}
        creatorName={data.display_name}
        initialDeliverables={pitchDeliverables}
      />
    </div>
  )
}
