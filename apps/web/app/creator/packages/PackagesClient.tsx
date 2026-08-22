'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PRODUCT_TYPES_BY_PLATFORM, PRODUCT_TYPES, type ProductType } from '@/lib/product-types'
import {
  PRICE_MODES, PRICE_MODE_LABELS, PRICE_MODE_HINTS,
  formatProductPrice, normalizePriceMode, type PriceMode,
} from '@/lib/product-price'
import { savePackage, deletePackage } from './actions'
import './packages.css'

export interface Channel { platform: string; handle: string }

export interface PackageRow {
  id: string
  platform: string
  handle: string
  product_type: string
  description: string | null
  price_paise: number
  price_mode: string | null
  price_max_paise: number | null
  display_price: boolean | null
}

/**
 * The creator's rate card.
 *
 * Packages were previously enterable once, at signup, and after that only by
 * ops. This is the self-serve editor.
 *
 * Grouped by channel because that is how the table is keyed: a package belongs
 * to one platform + handle, so a creator with Instagram and YouTube genuinely
 * has two rate cards, not one list with a column.
 */
export default function PackagesClient({
  channels,
  packages,
}: {
  channels: Channel[]
  packages: PackageRow[]
}) {
  const [editing, setEditing] = useState<PackageRow | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function remove(row: PackageRow) {
    setBusyId(row.id)
    setError('')
    const res = await deletePackage(row.id)
    setBusyId(null)
    if (!res.ok) setError(res.message)
  }

  // No channel means nothing to price. Sending them to add one is the only
  // useful screen — an empty package form would fail validation on save.
  if (channels.length === 0) {
    return (
      <div className="pk-wrap">
        <div className="pk-card pk-empty">
          <h2 className="pk-empty-title">Add a channel first</h2>
          <p className="pk-empty-body">
            A package is priced for one channel — a Reel on your Instagram, a video on
            your YouTube. Connect a channel and your rate card opens up.
          </p>
          <Link href="/creator/settings?tab=profile" className="pk-btn pk-btn-primary">
            Add your channels
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="pk-wrap">
      <p className="pk-intro">
        What you offer and what it costs. Brands see this on your shopfront, and it
        pre-fills the offer when they send you one.
      </p>

      {error && <p role="alert" className="pk-error">{error}</p>}

      {channels.map((ch) => {
        const rows = packages.filter(
          (p) => p.platform === ch.platform && p.handle.toLowerCase() === ch.handle.toLowerCase(),
        )
        return (
          <section key={`${ch.platform}/${ch.handle}`} className="pk-channel">
            <div className="pk-channel-head">
              <PlatformIcon platform={ch.platform} />
              <span className="pk-channel-handle">@{ch.handle}</span>
              <span className="pk-channel-count">
                {rows.length === 0 ? 'No packages' : `${rows.length} package${rows.length === 1 ? '' : 's'}`}
              </span>
            </div>

            <div className="pk-card">
              {rows.length === 0 && (
                <p className="pk-none">Nothing priced for this channel yet.</p>
              )}

              {rows.map((row, i) => (
                <div key={row.id} className="pk-row" style={{ borderTop: i === 0 ? 'none' : undefined }}>
                  <div className="pk-row-main">
                    <div className="pk-row-type">{row.product_type}</div>
                    {row.description && <div className="pk-row-desc">{row.description}</div>}
                  </div>
                  <div className="pk-row-price">
                    {formatProductPrice(row) ?? <span className="pk-onreq">On request</span>}
                  </div>
                  <div className="pk-row-actions">
                    <button type="button" className="pk-mini" onClick={() => setEditing(row)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="pk-mini pk-mini-danger"
                      disabled={busyId === row.id}
                      onClick={() => remove(row)}
                    >
                      {busyId === row.id ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}

      <button type="button" className="pk-btn pk-btn-primary pk-add" onClick={() => setEditing('new')}>
        + Add a package
      </button>

      {editing && (
        <PackageForm
          channels={channels}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/* ── The form ─────────────────────────────────────────────────────────────── */

function PackageForm({
  channels,
  existing,
  onClose,
}: {
  channels: Channel[]
  existing: PackageRow | null
  onClose: () => void
}) {
  const [channelKey, setChannelKey] = useState(
    existing ? `${existing.platform}/${existing.handle}` : `${channels[0].platform}/${channels[0].handle}`,
  )
  const [platform, handle] = splitKey(channelKey)

  const typesForPlatform = PRODUCT_TYPES_BY_PLATFORM[platform] ?? PRODUCT_TYPES
  const [productType, setProductType] = useState<string>(
    existing?.product_type ?? typesForPlatform[0],
  )
  const [description, setDescription] = useState(existing?.description ?? '')
  const [mode, setMode] = useState<PriceMode>(existing ? normalizePriceMode(existing) : 'exact')
  const [price, setPrice] = useState(
    existing && existing.price_paise > 0 ? String(Math.round(existing.price_paise / 100)) : '',
  )
  const [priceMax, setPriceMax] = useState(
    existing?.price_max_paise ? String(Math.round(existing.price_max_paise / 100)) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function pickChannel(key: string) {
    setChannelKey(key)
    // The deliverable list is per platform, so a type from the old channel may
    // not exist on the new one. Keeping it would submit something the platform
    // does not offer.
    const [p] = splitKey(key)
    const types = PRODUCT_TYPES_BY_PLATFORM[p] ?? PRODUCT_TYPES
    if (!types.includes(productType as ProductType)) setProductType(types[0])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const res = await savePackage({
      id: existing?.id,
      platform,
      handle,
      productType,
      description,
      priceMode: mode,
      priceRupees: Number(price || 0),
      priceMaxRupees: mode === 'range' ? Number(priceMax || 0) : null,
    })
    setBusy(false)
    if (!res.ok) { setError(res.message); return }
    onClose()
  }

  return (
    <div className="pk-sheet-scrim" role="dialog" aria-modal="true" aria-label={existing ? 'Edit package' : 'Add a package'}>
      <form className="pk-sheet" onSubmit={submit}>
        <div className="pk-sheet-head">
          <h2 className="pk-sheet-title">{existing ? 'Edit package' : 'Add a package'}</h2>
          <button type="button" className="pk-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="pk-sheet-body">
          {channels.length > 1 && (
            <label className="pk-field">
              <span className="pk-label">Channel</span>
              <select className="pk-input" value={channelKey} onChange={(e) => pickChannel(e.target.value)}>
                {channels.map((c) => (
                  <option key={`${c.platform}/${c.handle}`} value={`${c.platform}/${c.handle}`}>
                    {titleCase(c.platform)} · @{c.handle}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="pk-field">
            <span className="pk-label">Deliverable</span>
            <select className="pk-input" value={productType} onChange={(e) => setProductType(e.target.value)}>
              {typesForPlatform.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="pk-field">
            <span className="pk-label">
              What&rsquo;s included <span className="pk-optional">optional</span>
            </span>
            <textarea
              className="pk-input pk-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="1 Reel, 1 Story frame, 2 revisions, 30-day usage."
              maxLength={300}
              rows={2}
            />
          </label>

          <div className="pk-field">
            <span className="pk-label">How to show the price</span>
            <div className="pk-modes">
              {PRICE_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`pk-mode${mode === m ? ' pk-mode-on' : ''}`}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {PRICE_MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="pk-hint">{PRICE_MODE_HINTS[mode]}</p>
          </div>

          {mode !== 'on_request' && (
            <div className="pk-prices">
              <label className="pk-field pk-field-grow">
                <span className="pk-label">
                  {mode === 'range' ? 'From (₹)' : mode === 'from' ? 'Minimum (₹)' : 'Price (₹)'}
                </span>
                <input
                  className="pk-input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder="60000"
                />
              </label>
              {mode === 'range' && (
                <label className="pk-field pk-field-grow">
                  <span className="pk-label">To (₹)</span>
                  <input
                    className="pk-input"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    placeholder="90000"
                  />
                </label>
              )}
            </div>
          )}

          <div className="pk-preview">
            <span className="pk-preview-label">Brands will see</span>
            <span className="pk-preview-value">
              {previewText(mode, price, priceMax)}
            </span>
          </div>

          {error && <p role="alert" className="pk-error">{error}</p>}
        </div>

        <div className="pk-sheet-foot">
          <button type="submit" className="pk-btn pk-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Add package'}
          </button>
          <button type="button" className="pk-btn pk-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function splitKey(key: string): [string, string] {
  const i = key.indexOf('/')
  return [key.slice(0, i), key.slice(i + 1)]
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * The live line, so a creator sees the sentence a brand reads rather than
 * guessing what "Starting from" turns into.
 */
function previewText(mode: PriceMode, price: string, priceMax: string): string {
  if (mode === 'on_request') return 'On request'
  const n = Number(price)
  if (!n) return '—'
  const fmt = (v: number) => `₹${v.toLocaleString('en-IN')}`
  if (mode === 'from') return `From ${fmt(n)}`
  if (mode === 'range') {
    const m = Number(priceMax)
    return m > n ? `${fmt(n)}–${fmt(m)}` : '—'
  }
  return fmt(n)
}

function PlatformIcon({ platform }: { platform: string }) {
  const common = {
    width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  if (platform === 'youtube') {
    return <svg {...common} aria-hidden="true"><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" /></svg>
  }
  return (
    <svg {...common} aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}
