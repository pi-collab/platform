'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { PRODUCT_TYPES_BY_PLATFORM, PRODUCT_TYPES, type ProductType } from '@/lib/product-types'
import {
  OFFERED_PRICE_MODES, PRICE_MODE_LABELS, PRICE_MODE_HINTS,
  formatProductPrice, normalizePriceMode, type PriceMode,
} from '@/lib/product-price'
import { savePackage, deletePackage, saveAddonRates } from './actions'
import { percentToBasisPoints } from '@/lib/addons'
import './packages.css'

export interface Channel { platform: string; handle: string }

/**
 * Handles are not stored consistently.
 *
 * 23 of 25 rows on staging keep the leading "@" that a creator typed, while
 * social_accounts is written stripped. Comparing them raw matched NOTHING —
 * every package would have been invisible on this screen while sitting happily
 * in the table. Both sides go through here before they are compared.
 */
function sameHandle(a: string, b: string) {
  return a.trim().replace(/^@/, '').toLowerCase() === b.trim().replace(/^@/, '').toLowerCase()
}

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
/* ── Collab and Boosting, per channel ─────────────────────────────────────────
   Optional extras a brand can add to any deliverable on THIS channel. Kept
   beside the packages rather than on a settings screen, because they are part
   of what the channel costs.

   Percent is typed as a person writes it ("10", "10.5") and converted to basis
   points before it leaves the browser — the column and every calculation are
   integers, and the conversion has exactly one home.
   ────────────────────────────────────────────────────────────────────────── */
function AddonRatesEditor({ platform, handle, initial }: {
  platform: string
  handle: string
  initial?: AddonRateRow
}) {
  const [open, setOpen] = useState(false)
  /* Fixed is the default for a channel with nothing set yet — it is what most
     creators mean by a collab rate, and opening on "Not offered" made the
     common case a two-step. An existing rate always wins over the default. */
  const [mode, setMode] = useState<'none' | 'percent' | 'fixed'>(
    initial?.collab_rate_type ?? 'fixed',
  )
  const [collab, setCollab] = useState(() => {
    if (initial?.collab_rate_value == null) return ''
    return initial.collab_rate_type === 'percent'
      ? String(initial.collab_rate_value / 100)
      : String(Math.round(initial.collab_rate_value / 100))
  })
  const [boost, setBoost] = useState(
    initial?.boosting_30day_paise != null ? String(Math.round(initial.boosting_30day_paise / 100)) : '',
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const configured = (initial?.collab_rate_type != null) || (initial?.boosting_30day_paise != null)

  async function save() {
    setBusy(true); setMsg(null)
    /* An empty box means "not offered", not an error.
       Now that a mode is pre-selected, a creator who only wants to set a
       boosting rate would otherwise be blocked by a collab field they never
       touched. Typing something invalid is still worth saying out loud. */
    const blank = collab.trim() === ''
    let value: number | null = null
    let effectiveMode: 'fixed' | 'percent' | null = mode === 'none' || blank ? null : mode
    if (effectiveMode === 'percent') {
      value = percentToBasisPoints(collab)
      if (value == null) { setBusy(false); setMsg({ ok: false, text: 'Enter a percentage between 0 and 100.' }); return }
    } else if (effectiveMode === 'fixed') {
      const rupees = Number.parseInt(collab.replace(/[^0-9]/g, ''), 10)
      if (!Number.isFinite(rupees)) { setBusy(false); setMsg({ ok: false, text: 'Enter a collab amount.' }); return }
      value = rupees * 100
    }
    const boostRupees = boost.trim() ? Number.parseInt(boost.replace(/[^0-9]/g, ''), 10) : null
    if (boost.trim() && !Number.isFinite(boostRupees as number)) {
      setBusy(false); setMsg({ ok: false, text: 'Enter a boosting rate.' }); return
    }

    const res = await saveAddonRates({
      platform,
      handle,
      collabRateType: effectiveMode,
      collabRateValue: effectiveMode == null ? null : value,
      boostingThirtyDayPaise: boostRupees == null ? null : boostRupees * 100,
    })
    setBusy(false)
    setMsg(res.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: res.message })
  }

  // What a brand will actually be charged per day, shown so the creator is
  // never surprised by it. Display only — the charge is (rate x days / 30).
  const perDay = boost.trim() && Number.isFinite(Number(boost))
    ? Math.round((Number(boost) * 100) / 30)
    : null

  return (
    <div className="pk-addons">
      <button type="button" className="pk-addons-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pk-addons-title">Collab &amp; boosting</span>
        <span className="pk-addons-state">{configured ? 'Set' : 'Not set'}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="pk-addons-body">
          <p className="pk-addons-note">
            Optional extras a brand can add to any deliverable on this channel. Leave blank and the option
            simply is not offered.
          </p>

          <div className="pk-field">
            <label className="pk-label">Collab rate</label>
            <div className="pk-addons-modes">
              {([['none', 'Not offered'], ['percent', 'Percentage'], ['fixed', 'Fixed amount']] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  className={`pk-chip${mode === m ? ' pk-chip-on' : ''}`}
                  onClick={() => setMode(m)}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode !== 'none' && (
              <div className="pk-addons-input">
                <span className="pk-addons-prefix">{mode === 'percent' ? '%' : '\u20B9'}</span>
                <input
                  inputMode="decimal"
                  value={collab}
                  onChange={e => setCollab(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={mode === 'percent' ? '10' : '5,000'}
                />
              </div>
            )}
            {mode === 'percent' && (
              <span className="pk-hint">Charged on each deliverable&apos;s own price — 10% is &#8377;6,000 on a &#8377;60,000 Reel.</span>
            )}
          </div>

          <div className="pk-field">
            <label className="pk-label">Boosting &mdash; 30 day rate</label>
            <div className="pk-addons-input">
              <span className="pk-addons-prefix">&#8377;</span>
              <input
                inputMode="numeric"
                value={boost}
                onChange={e => setBoost(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="10,000"
              />
            </div>
            <span className="pk-hint">
              {perDay != null && perDay > 0
                ? `About \u20B9${(perDay / 100).toFixed(2)} a day. A brand picks the number of days and is charged for exactly those.`
                : 'Your rate for 30 days. A brand picks the number of days and is charged pro rata.'}
            </span>
          </div>

          {msg && <p className={msg.ok ? 'pk-saved' : 'pk-error'}>{msg.text}</p>}

          <button type="button" className="pk-btn pk-btn-primary" disabled={busy} onClick={save}>
            {busy ? 'Saving\u2026' : 'Save rates'}
          </button>
        </div>
      )}
    </div>
  )
}

export interface AddonRateRow {
  platform: string
  handle: string
  collab_rate_type: 'fixed' | 'percent' | null
  collab_rate_value: number | null
  boosting_30day_paise: number | null
}

export default function PackagesClient({
  channels,
  addonRates = [],
  packages,
}: {
  channels: Channel[]
  addonRates?: AddonRateRow[]
  packages: PackageRow[]
}) {
  const [editing, setEditing] = useState<PackageRow | 'new' | null>(null)
  const orphans = packages.filter(
    (p) => !channels.some((ch) => p.platform.trim().toLowerCase() === ch.platform && sameHandle(p.handle, ch.handle)),
  )
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
          (p) => p.platform.trim().toLowerCase() === ch.platform && sameHandle(p.handle, ch.handle),
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

            <AddonRatesEditor
              platform={ch.platform}
              handle={ch.handle}
              initial={addonRates.find(
                r => r.platform?.trim().toLowerCase() === ch.platform && sameHandle(r.handle, ch.handle),
              )}
            />
          </section>
        )
      })}

      {/* A package whose channel is no longer connected — the creator removed
          the handle, or it was filed under a different one by ops. It still
          shows on the shopfront, so hiding it here would leave something a
          creator cannot see or remove. */}
      {orphans.length > 0 && (
        <section className="pk-channel">
          <div className="pk-channel-head">
            <span className="pk-channel-handle">Not on a connected channel</span>
            <span className="pk-channel-count">{orphans.length}</span>
          </div>
          <div className="pk-card">
            {orphans.map((row, i) => (
              <div key={row.id} className="pk-row" style={{ borderTop: i === 0 ? 'none' : undefined }}>
                <div className="pk-row-main">
                  <div className="pk-row-type">{row.product_type}</div>
                  <div className="pk-row-desc">
                    {row.platform} &middot; @{row.handle.replace(/^@/, '')}
                    {row.description ? ` — ${row.description}` : ''}
                  </div>
                </div>
                <div className="pk-row-price">
                  {formatProductPrice(row) ?? <span className="pk-onreq">On request</span>}
                </div>
                <div className="pk-row-actions">
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
      )}

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
  const [channelKey, setChannelKey] = useState(() => {
    // Matched against the creator's own channels rather than trusted as stored:
    // a row holding "@handle" would otherwise build a key no <option> carries,
    // and the select would silently show the first channel instead.
    const own = existing && channels.find(
      (c) => c.platform === existing.platform.trim().toLowerCase() && sameHandle(c.handle, existing.handle),
    )
    const c = own ?? channels[0]
    return `${c.platform}/${c.handle}`
  })
  const [platform, handle] = splitKey(channelKey)

  const offered = PRODUCT_TYPES_BY_PLATFORM[platform] ?? PRODUCT_TYPES
  // A package created before the deliverable list changed holds a type that is
  // no longer offered. Without it in the options the select falls to the first
  // entry, and saving would silently retype someone's package — so it is kept
  // as a choice for as long as it is the current one.
  const typesForPlatform = existing && !offered.includes(existing.product_type as ProductType)
    ? [existing.product_type as ProductType, ...offered]
    : offered
  const [productType, setProductType] = useState<string>(
    existing?.product_type ?? typesForPlatform[0],
  )
  const [description, setDescription] = useState(existing?.description ?? '')
  const [mode, setMode] = useState<PriceMode>(existing ? normalizePriceMode(existing) : 'from')

  // 'exact' and 'range' are no longer offered. A package priced under them keeps
  // its mode as a choice for as long as it holds it — otherwise the buttons
  // show nothing selected, and saving would silently reprice it.
  const modeChoices: readonly PriceMode[] =
    existing && !OFFERED_PRICE_MODES.includes(mode as 'from' | 'on_request')
      ? [mode, ...OFFERED_PRICE_MODES]
      : OFFERED_PRICE_MODES
  const [price, setPrice] = useState(
    existing && existing.price_paise > 0 ? String(Math.round(existing.price_paise / 100)) : '',
  )
  const [priceMax, setPriceMax] = useState(
    existing?.price_max_paise ? String(Math.round(existing.price_max_paise / 100)) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // document.body does not exist during the server render, so the portal waits
  // for the client rather than throwing on the way in.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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

  // Portalled to <body>. The creator layout renders pages inside
  // <main style={{ position: 'relative', zIndex: 1 }}>, and the tab bar is a
  // SIBLING of that main at z-index 10000. A stacking context caps everything
  // inside it, so the sheet could ask for any z-index it liked and still be
  // painted under the tab bar — which is exactly what buried Save.
  if (!mounted) return null

  return createPortal(
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
              {modeChoices.map((m) => (
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
    </div>,
    document.body,
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
