'use client'

import Link from 'next/link'
import { useState } from 'react'

/**
 * The shopfront link, once one exists.
 *
 * Two actions on one row: copy the link, or open it. Copying is the common one
 * — the reason a creator comes here is to paste the link into a DM or a bio —
 * so it gets the wider target and the arrow stays a plain link.
 */
export default function ShopfrontLinkRow({ slug }: { slug: string | null }) {
  const [copied, setCopied] = useState(false)

  // Built from the browser's own origin rather than a hardcoded domain, so the
  // link a creator copies on staging points at staging.
  const url = slug
    ? `${typeof window === 'undefined' ? 'https://www.guapd.com' : window.location.origin}/c/${slug}`
    : null

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      // Long enough to read, short enough that the row does not sit in a state
      // that no longer reflects anything.
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused — over plain http, or by permission.
      // Selecting the text is the honest fallback; claiming success is not.
      setCopied(false)
    }
  }

  return (
    <div className="sr msurface" style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--wg-400)' }}>
            YOUR SHOPFRONT
          </div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--ink)',
              marginTop: 2,
              // A slug can be long; truncating beats wrapping a URL onto two
              // lines in a row this height.
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {slug ? `/c/${slug}` : 'Not published yet'}
          </div>
        </div>

        {slug && (
          <>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy shopfront link"
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                minHeight: 36,
                padding: '0 12px',
                borderRadius: 999,
                border: 'none',
                background: copied ? 'rgba(22,101,52,.10)' : 'var(--neon)',
                color: copied ? '#166534' : 'var(--lime-950)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                fontSize: 11.5,
                cursor: 'pointer',
              }}
            >
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              {/* Label hidden on the narrowest screens: three controls and a
                  slug do not fit a 390px row with words on all of them. The
                  icon and aria-label carry it. */}
              <span className="sfl-copy-label">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Editing was missing entirely: the row offered copy and open, and
                the only way back to the editor was the dashboard or the shopfront
                tab. A pencil beside the two it already had costs one control and
                closes that. */}
            <Link
              href="/creator/storefront"
              aria-label="Edit shopfront"
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid var(--line)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink)"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </Link>

            <Link
              href={`/c/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open shopfront"
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid var(--line)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)"
                   strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </>
        )}

        {/* No slug means a draft: nothing to copy or open, so the row becomes a
            way back into the editor instead. */}
        {!slug && (
          <Link
            href="/creator/storefront"
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 999,
              background: 'var(--neon)', color: 'var(--lime-950)',
              fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 11.5,
              textDecoration: 'none',
            }}
          >
            Finish it
          </Link>
        )}
      </div>
    </div>
  )
}
