'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip, { type ChipTone } from '@/components/StatusChip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatRupees } from '@/lib/experience-request'
import type { ConsoleInvoice, ConsoleInvoices } from '@/lib/experience-console-server'
import {
  createInvoicePdf, discardInvoice, draftInvoice, editInvoice, issueInvoice, recordInvoicePayment,
  reverseInvoicePaymentAction, saveBrandBilling, saveFinanceSettings, voidInvoice,
  type InvoiceForm,
} from '../actions'
import { openFinanceFileInTab, uploadFinanceFile } from './finance-upload'
import { card, fieldLabel, formError, kpiLabel, neonBtn, pillBtn } from '../ui'

/**
 * Brand invoices (staff console, FINANCIAL access only: an invoice is the
 * brand price). Rendered only for finance, and fed only by
 * experience_console_invoices, which checks financial access again (0540).
 *
 * One clean service price per invoice: no platform fee, no creator rates, no
 * per-video breakdown. GST is entered, never computed; when Guapd is not
 * GST-registered there is no GST and the PDF says so. Draft → Issued (numbered
 * GPD/<FY>/<n>, frozen, PDF stored, brand told) → Paid (payments recorded
 * offline with reference, TDS and proof, until the total is met). A void needs
 * a reason and keeps its number.
 */
const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  draft:  { label: 'Draft', tone: 'neutral' },
  issued: { label: 'Issued · due', tone: 'amber' },
  paid:   { label: 'Paid', tone: 'green' },
  void:   { label: 'Void', tone: 'red' },
}
const METHOD: Record<string, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', cash: 'Cash', other: 'Other' }
const r2 = (p: number | null | undefined) => (p == null ? '' : String(p / 100))
const fmtDate = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)

type Ask =
  | { kind: 'issue'; inv: ConsoleInvoice }
  | { kind: 'discard'; inv: ConsoleInvoice }
  | { kind: 'void'; inv: ConsoleInvoice }
  | { kind: 'reverse'; paymentId: string }

export default function InvoicesPanel({ data }: { data: ConsoleInvoices }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [paying, setPaying] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(!data.settings)
  const [billingOpen, setBillingOpen] = useState(!data.billing)

  const { settings, billing, invoices } = data
  const open = ['rostering', 'confirmed', 'shoot_scheduled', 'shoot_done', 'delivering'].includes(data.status)
  const registered = settings?.gst_registered === true
  const live = invoices.filter((i) => i.status === 'issued' || i.status === 'paid')
  const invoiced = live.reduce((t, i) => t + Number(i.subtotal_paise), 0)

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (d: unknown) => void) => {
    setError(null); setNotice(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) { setError(r.error ?? 'Something went wrong'); return }
      after?.(r.data); router.refresh()
    })
  }

  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Invoices</h2>
          <div className="sect-rule" />
        </div>
        <span style={{ ...kpiLabel, fontSize: 10.5 }}>Finance only</span>
      </div>
      <p className="t-body" style={{ margin: '10px 0 0', fontSize: 13.5 }}>
        Invoiced {formatRupees(invoiced)} before GST
        {data.agreed_paise != null && <> of {formatRupees(data.agreed_paise)} agreed</>}.
        {data.agreed_paise != null && live.length > 0 && invoiced !== Number(data.agreed_paise) && (
          <span style={{ color: '#8C6417' }}> The invoiced total differs from the agreed price.</span>
        )}
      </p>

      {/* ── Billing details: Guapd (supplier) and the brand (recipient) ── */}
      <div className="xp-inv-bill" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
        <BillingBox title="From: Guapd" summary={settings ? [settings.legal_name, settings.state, settings.gstin ? `GSTIN ${settings.gstin}${settings.gst_registered ? '' : ' (provisional)'}` : null, settings.gst_registered ? 'GST-registered' : 'Not GST-registered: no GST on invoices'] : null}
          open={settingsOpen} onToggle={() => setSettingsOpen((v) => !v)}>
          <SettingsForm initial={settings} busy={pending} onSave={(f) => run(() => saveFinanceSettings(data.experience_id, f), () => setSettingsOpen(false))} />
        </BillingBox>
        <BillingBox title={`To: ${data.brand_name}`} summary={billing ? [billing.legal_name, billing.state, billing.gstin ? `GSTIN ${billing.gstin}` : 'No GSTIN', billing.pan ? `PAN ${billing.pan}` : null] : null}
          open={billingOpen} onToggle={() => setBillingOpen((v) => !v)}
          extra={billing?.has_certificate ? <button type="button" style={linkBtn} onClick={async () => { const e = await openFinanceFileInTab('brand-certificate', data.brand_id); if (e) setError(e) }}>GST certificate</button> : null}>
          <BrandBillingForm brandId={data.brand_id} initial={billing} busy={pending}
            onSave={(f) => run(() => saveBrandBilling(data.experience_id, data.brand_id, f), () => setBillingOpen(false))} onError={setError} />
        </BillingBox>
      </div>

      {/* ── The invoices ── */}
      <div style={{ marginTop: 18 }}>
        {invoices.length === 0 && <p className="t-body" style={{ margin: 0, color: 'var(--ink-soft)' }}>No invoices yet.</p>}
        {invoices.map((inv) => {
          const st = STATUS[inv.status]
          const gst = Number(inv.cgst_paise ?? 0) + Number(inv.sgst_paise ?? 0) + Number(inv.igst_paise ?? 0)
          return (
            <div key={inv.id} style={{ borderTop: '1px solid var(--hairline)', padding: '14px 0' }}>
              <div className="xp-inv-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr) 260px', gap: 14, alignItems: 'start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                    {inv.number ?? 'Draft'} <span style={{ fontWeight: 500, color: 'var(--ink-soft)', fontSize: 12.5 }}>· {inv.kind === 'initial' ? 'Service invoice' : `Additional (${inv.source === 'new_shoot' ? 'new shoot' : 'existing footage'})`}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)', marginTop: 4 }}>{inv.description}</div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink-faint)', marginTop: 4 }}>
                    {inv.issue_date ? `Issued ${fmtDate(inv.issue_date)}` : 'Not issued'} · Due {inv.due_date ? fmtDate(inv.due_date) : 'on receipt'}
                    {inv.status === 'void' && inv.void_reason ? ` · Voided: ${inv.void_reason}` : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{formatRupees(inv.total_paise)}</div>
                  <div style={{ color: 'var(--ink-faint)', fontSize: 12 }}>{formatRupees(inv.subtotal_paise)}{gst ? ` + ${formatRupees(gst)} GST` : ' · no GST'}</div>
                  {(inv.status === 'issued' || inv.status === 'paid') && (
                    <div style={{ color: inv.outstanding_paise > 0 ? '#8C6417' : 'var(--ink-soft)', fontSize: 12 }}>
                      Received {formatRupees(inv.paid_paise)} · due {formatRupees(inv.outstanding_paise)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <StatusChip label={st.label} tone={st.tone} />
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {inv.status === 'draft' && open && <>
                      <button type="button" style={smallBtn} onClick={() => { setError(null); setEditing(inv.id) }}>Edit</button>
                      <button type="button" style={{ ...smallBtn, background: 'var(--lime-400)', borderColor: 'var(--lime-400)' }} onClick={() => setAsk({ kind: 'issue', inv })}>Issue</button>
                      <button type="button" style={{ ...smallBtn, color: '#9C4147' }} onClick={() => setAsk({ kind: 'discard', inv })}>Discard</button>
                    </>}
                    {inv.status === 'issued' && open && <>
                      <button type="button" style={{ ...smallBtn, background: 'var(--lime-400)', borderColor: 'var(--lime-400)' }} onClick={() => { setError(null); setPaying(inv.id) }}>Record payment</button>
                      {inv.payments.every((p) => p.reversed_at) && <button type="button" style={{ ...smallBtn, color: '#9C4147' }} onClick={() => { setReason(''); setAsk({ kind: 'void', inv }) }}>Void</button>}
                    </>}
                    {inv.status !== 'draft' && (inv.has_pdf
                      ? <button type="button" style={smallBtn} onClick={async () => { const e = await openFinanceFileInTab('invoice-pdf', inv.id); if (e) setError(e) }}>PDF</button>
                      : inv.status !== 'void' && <button type="button" style={smallBtn} disabled={pending} onClick={() => run(() => createInvoicePdf(data.experience_id, inv.id), () => setNotice('PDF stored and the brand told.'))}>Create PDF</button>)}
                  </div>
                </div>
              </div>

              {inv.payments.length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  {inv.payments.map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontFamily: 'var(--font-ui)', fontSize: 12.5,
                      color: p.reversed_at ? 'var(--ink-faint)' : 'var(--ink)', textDecoration: p.reversed_at ? 'line-through' : 'none', padding: '6px 10px', borderRadius: 10, background: '#F7F7F3' }}>
                      <span>{fmtDate(p.received_on)} · {METHOD[p.method] ?? p.method} · ref {p.reference} · {formatRupees(p.amount_paise)}{Number(p.tds_paise) ? ` + TDS ${formatRupees(p.tds_paise)}` : ''}</span>
                      <span style={{ display: 'flex', gap: 10, textDecoration: 'none' }}>
                        <button type="button" style={linkBtn} onClick={async () => { const e = await openFinanceFileInTab('invoice-payment', p.id); if (e) setError(e) }}>Proof</button>
                        {!p.reversed_at && open && <button type="button" style={{ ...linkBtn, color: '#9C4147' }} onClick={() => { setReason(''); setAsk({ kind: 'reverse', paymentId: p.id }) }}>Reverse</button>}
                        {p.reversed_at && <span>Reversed: {p.reversed_reason}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {editing === inv.id && (
                <InvoiceEditor initial={inv} registered={registered} busy={pending} onCancel={() => setEditing(null)}
                  onSave={(f) => run(() => editInvoice(data.experience_id, inv.id, f), () => setEditing(null))} />
              )}
              {paying === inv.id && (
                <PaymentEditor invoiceId={inv.id} outstanding={inv.outstanding_paise} busy={pending} onCancel={() => setPaying(null)} onError={setError}
                  onSave={(f) => run(() => recordInvoicePayment(data.experience_id, inv.id, f), (d) => { setPaying(null); setNotice((d as { settled: boolean }).settled ? `${inv.number} is now paid in full.` : 'Payment recorded.') })} />
              )}
            </div>
          )
        })}
      </div>

      {open && (editing === 'new'
        ? <InvoiceEditor registered={registered} busy={pending} onCancel={() => setEditing(null)}
            defaults={{ description: `UGC content production: ${data.title}`, amount: live.length === 0 ? r2(data.agreed_paise) : '' }}
            onSave={(f) => run(() => draftInvoice(data.experience_id, f), () => setEditing(null))} />
        : <div style={{ marginTop: 14 }}>
            <button type="button" style={pillBtn} disabled={!settings} onClick={() => { setError(null); setEditing('new') }}
              title={settings ? undefined : "Add Guapd's billing details first"}>New invoice</button>
          </div>)}
      {!open && data.status !== 'complete' && <p className="t-body" style={{ margin: '14px 0 0', color: 'var(--ink-soft)' }}>Invoices are raised once the price is agreed.</p>}

      {notice && <p className="t-body" style={{ margin: '12px 0 0', color: '#3F6212' }}>{notice}</p>}
      {error && <div role="alert" style={{ ...formError, marginTop: 12 }}>{error}</div>}

      <ConfirmDialog open={ask?.kind === 'issue'} title={`Issue this invoice for ${ask?.kind === 'issue' ? formatRupees(ask.inv.total_paise) : ''}`}
        body={`It gets the next invoice number, is frozen as it is, and its PDF is stored. ${data.brand_name}'s team is told in-app and by email. To change it afterwards you void it and issue a new one.`}
        confirmLabel="Issue invoice" busy={pending}
        onConfirm={() => ask?.kind === 'issue' && run(() => issueInvoice(data.experience_id, ask.inv.id), (d) => {
          setAsk(null)
          const x = d as { number: string; pdf: boolean; pdfError?: string }
          if (x.pdf) setNotice(`Issued ${x.number}. The PDF is stored and the brand has been told.`)
          else setError(x.pdfError ?? `Issued ${x.number}, but the PDF was not stored.`)
        })}
        onCancel={() => setAsk(null)} />
      <ConfirmDialog open={ask?.kind === 'discard'} title="Discard this draft" tone="danger" body="The draft is deleted. It never had a number, so nothing is skipped."
        confirmLabel="Discard draft" busy={pending}
        onConfirm={() => ask?.kind === 'discard' && run(() => discardInvoice(data.experience_id, ask.inv.id), () => setAsk(null))} onCancel={() => setAsk(null)} />
      <ConfirmDialog open={ask?.kind === 'void'} title={`Void ${ask?.kind === 'void' ? ask.inv.number : ''}`} tone="danger"
        body="It stops counting as revenue and the brand no longer sees it. Its number is kept and never reused. Void is final."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="inv-why">Why</label>
          <input id="inv-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong amount; reissued as the next number" /></div>}
        confirmLabel="Void invoice" busy={pending}
        onConfirm={() => ask?.kind === 'void' && run(() => voidInvoice(data.experience_id, ask.inv.id, reason), () => setAsk(null))} onCancel={() => setAsk(null)} />
      <ConfirmDialog open={ask?.kind === 'reverse'} title="Reverse this payment" tone="danger"
        body="It stops counting toward the invoice (a paid invoice goes back to due). The record is kept with your reason."
        detail={<div style={{ marginTop: 12 }}><label style={fieldLabel} htmlFor="pay-why">Why</label>
          <input id="pay-why" className="dinput" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded on the wrong invoice" /></div>}
        confirmLabel="Reverse payment" busy={pending}
        onConfirm={() => ask?.kind === 'reverse' && run(() => reverseInvoicePaymentAction(data.experience_id, ask.paymentId, reason), () => setAsk(null))} onCancel={() => setAsk(null)} />

      <style dangerouslySetInnerHTML={{ __html: `@media (max-width: 860px) { .xp-inv-bill, .xp-inv-row, .xp-inv-form { grid-template-columns: 1fr !important; } .xp-inv-row > :last-child { align-items: flex-start !important; } }` }} />
    </section>
  )
}

const smallBtn: React.CSSProperties = { ...pillBtn, height: 30, padding: '0 12px', fontSize: 12 }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'underline' }

function BillingBox({ title, summary, open, onToggle, extra, children }: { title: string; summary: (string | null)[] | null; open: boolean; onToggle: () => void; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 14, padding: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span style={kpiLabel}>{title}</span>
        <span style={{ display: 'flex', gap: 10 }}>{extra}<button type="button" style={linkBtn} onClick={onToggle}>{open ? 'Close' : summary ? 'Edit' : 'Add'}</button></span>
      </div>
      {!open && (summary
        ? <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink)', marginTop: 8, display: 'grid', gap: 2 }}>{summary.filter(Boolean).map((l) => <span key={l as string}>{l}</span>)}</div>
        : <p className="t-body" style={{ margin: '8px 0 0', color: '#8C6417', fontSize: 13 }}>Needed before an invoice can be issued.</p>)}
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block', minWidth: 0 }}><span style={fieldLabel}>{label}</span>{children}</label>
}

function SettingsForm({ initial, busy, onSave }: { initial: ConsoleInvoices['settings']; busy: boolean; onSave: (f: Parameters<typeof saveFinanceSettings>[1]) => void }) {
  const [f, setF] = useState({ legalName: initial?.legal_name ?? '', address: initial?.address ?? '', state: initial?.state ?? '', gstin: initial?.gstin ?? '',
    gstRegistered: initial?.gst_registered ?? false, pan: initial?.pan ?? '', paymentInstructions: initial?.payment_instructions ?? '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Field label="Legal name"><input className="dinput" value={f.legalName} onChange={set('legalName')} /></Field>
      <Field label="Address"><textarea className="dinput" rows={2} value={f.address} onChange={set('address')} /></Field>
      <Field label="State"><input className="dinput" value={f.state} onChange={set('state')} placeholder="Maharashtra" /></Field>
      <Field label="GSTIN (provisional is fine)"><input className="dinput" value={f.gstin} onChange={set('gstin')} maxLength={15} /></Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
        <input type="checkbox" checked={f.gstRegistered} onChange={(e) => setF({ ...f, gstRegistered: e.target.checked })} /> Guapd is GST-registered (invoices may carry GST)
      </label>
      <Field label="PAN"><input className="dinput" value={f.pan} onChange={set('pan')} maxLength={10} /></Field>
      <Field label="How to pay (on the invoice)"><textarea className="dinput" rows={3} value={f.paymentInstructions} onChange={set('paymentInstructions')} placeholder="Account name, number, IFSC, or UPI ID" /></Field>
      <div><button type="button" style={neonBtn} disabled={busy} onClick={() => onSave(f)}>Save Guapd's details</button></div>
    </div>
  )
}

function BrandBillingForm({ brandId, initial, busy, onSave, onError }: { brandId: string; initial: ConsoleInvoices['billing']; busy: boolean; onSave: (f: Parameters<typeof saveBrandBilling>[2]) => void; onError: (e: string) => void }) {
  const [f, setF] = useState({ legalName: initial?.legal_name ?? '', address: initial?.address ?? '', state: initial?.state ?? '', gstin: initial?.gstin ?? '', pan: initial?.pan ?? '' })
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    let certificatePath: string | null = null
    if (file) {
      setUploading(true)
      const up = await uploadFinanceFile('brand-certificate', brandId, file)
      setUploading(false)
      if (!up.ok) { onError(up.error); return }
      certificatePath = up.path
    }
    onSave({ ...f, certificatePath })
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Field label="Legal name"><input className="dinput" value={f.legalName} onChange={set('legalName')} /></Field>
      <Field label="Billing address"><textarea className="dinput" rows={2} value={f.address} onChange={set('address')} /></Field>
      <Field label="State (place of supply)"><input className="dinput" value={f.state} onChange={set('state')} /></Field>
      <Field label="GSTIN (optional)"><input className="dinput" value={f.gstin} onChange={set('gstin')} maxLength={15} /></Field>
      <Field label="PAN (optional)"><input className="dinput" value={f.pan} onChange={set('pan')} maxLength={10} /></Field>
      <Field label="GST certificate (optional, PDF or image)"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)' }}>Never bank details: Guapd does not collect them from brands.</p>
      <div><button type="button" style={neonBtn} disabled={busy || uploading} onClick={save}>{uploading ? 'Uploading…' : "Save the brand's details"}</button></div>
    </div>
  )
}

function InvoiceEditor({ initial, defaults, registered, busy, onSave, onCancel }: {
  initial?: ConsoleInvoice; defaults?: { description: string; amount: string }; registered: boolean; busy: boolean
  onSave: (f: InvoiceForm) => void; onCancel: () => void
}) {
  const [f, setF] = useState<InvoiceForm>({
    kind: initial?.kind === 'additional' ? 'additional' : 'initial', source: initial?.source ?? null,
    description: initial?.description ?? defaults?.description ?? '', amount: initial ? r2(initial.subtotal_paise) : defaults?.amount ?? '',
    gstMode: initial?.igst_paise ? 'igst' : initial?.cgst_paise ? 'cgst_sgst' : registered ? 'igst' : 'none',
    gstRatePct: initial?.gst_rate_pct != null ? String(initial.gst_rate_pct) : registered ? '18' : '',
    cgst: r2(initial?.cgst_paise), sgst: r2(initial?.sgst_paise), igst: r2(initial?.igst_paise), dueDate: initial?.due_date ?? '',
  })
  const set = (k: keyof InvoiceForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value } as InvoiceForm)
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: '#F7F7F3', display: 'grid', gap: 10 }}>
      <div className="xp-inv-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Type">
          <select className="dinput" value={f.kind} onChange={set('kind')}>
            <option value="initial">Service invoice</option>
            <option value="additional">Additional (more videos later)</option>
          </select>
        </Field>
        {f.kind === 'additional'
          ? <Field label="Additional for"><select className="dinput" value={f.source ?? ''} onChange={(e) => setF({ ...f, source: e.target.value || null })}>
              <option value="">Pick one</option><option value="existing_footage">Existing footage</option><option value="new_shoot">A new shoot</option></select></Field>
          : <Field label="Due date (optional)"><input className="dinput" type="date" min={today()} value={f.dueDate} onChange={set('dueDate')} /></Field>}
      </div>
      <Field label="Description (one line, the brand sees it)"><input className="dinput" maxLength={300} value={f.description} onChange={set('description')} /></Field>
      <Field label="Amount before GST (₹)"><input className="dinput" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
      {registered ? (
        <div className="xp-inv-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="GST">
            <select className="dinput" value={f.gstMode} onChange={set('gstMode')}>
              <option value="igst">IGST (other state)</option><option value="cgst_sgst">CGST + SGST (same state)</option><option value="none">No GST</option>
            </select>
          </Field>
          {f.gstMode !== 'none' && <Field label="Rate (%)"><input className="dinput" inputMode="decimal" value={f.gstRatePct} onChange={set('gstRatePct')} /></Field>}
          {f.gstMode === 'igst' && <Field label="IGST amount (₹, entered, not calculated)"><input className="dinput" inputMode="decimal" value={f.igst} onChange={set('igst')} /></Field>}
          {f.gstMode === 'cgst_sgst' && <>
            <Field label="CGST (₹)"><input className="dinput" inputMode="decimal" value={f.cgst} onChange={set('cgst')} /></Field>
            <Field label="SGST (₹)"><input className="dinput" inputMode="decimal" value={f.sgst} onChange={set('sgst')} /></Field>
          </>}
        </div>
      ) : (
        <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>Guapd is not GST-registered, so this invoice carries no GST and says so.</p>
      )}
      {f.kind === 'additional' && <Field label="Due date (optional)"><input className="dinput" type="date" min={today()} value={f.dueDate} onChange={set('dueDate')} /></Field>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={neonBtn} disabled={busy} onClick={() => onSave(registered ? f : { ...f, gstMode: 'none' })}>{initial ? 'Save draft' : 'Save as draft'}</button>
        <button type="button" style={pillBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function PaymentEditor({ invoiceId, outstanding, busy, onSave, onCancel, onError }: {
  invoiceId: string; outstanding: number; busy: boolean
  onSave: (f: { amount: string; tds: string; receivedOn: string; method: string; reference: string; proofPath: string }) => void
  onCancel: () => void; onError: (e: string) => void
}) {
  const [f, setF] = useState({ amount: r2(outstanding), tds: '0', receivedOn: today(), method: 'bank_transfer', reference: '' })
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    if (!file) { onError('Attach the payment proof (a screenshot or PDF of the transfer).'); return }
    setUploading(true)
    const up = await uploadFinanceFile('invoice-payment', invoiceId, file)
    setUploading(false)
    if (!up.ok) { onError(up.error); return }
    onSave({ ...f, proofPath: up.path })
  }
  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: '#F7F7F3', display: 'grid', gap: 10 }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--ink-soft)' }}>Paid outside the app. Due on this invoice: {formatRupees(outstanding)}.</div>
      <div className="xp-inv-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Amount received (₹)"><input className="dinput" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="TDS the brand withheld (₹)"><input className="dinput" inputMode="decimal" value={f.tds} onChange={set('tds')} /></Field>
        <Field label="Received on"><input className="dinput" type="date" max={today()} value={f.receivedOn} onChange={set('receivedOn')} /></Field>
        <Field label="Method">
          <select className="dinput" value={f.method} onChange={set('method')}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Reference (UTR / cheque no.)"><input className="dinput" maxLength={100} value={f.reference} onChange={set('reference')} /></Field>
        <Field label="Proof (PDF or image)"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={neonBtn} disabled={busy || uploading} onClick={save}>{uploading ? 'Uploading…' : 'Record payment'}</button>
        <button type="button" style={pillBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
